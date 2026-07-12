import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activityLog.js';

const router = Router();

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

const publicUser = (u) => ({
  id: u.id, employeeCode: u.employee_code, fullName: u.full_name, email: u.email,
  role: u.role, departmentId: u.department_id, departmentName: u.department_name ?? null,
  designation: u.designation, avatarColor: u.avatar_color,
});

/**
 * POST /api/auth/signup
 * SECURITY: always creates an EMPLOYEE. Role is never accepted from the client;
 * only an Admin can promote a user later from the Employee Directory.
 */
router.post('/signup',
  validate({
    body: z.object({
      fullName: z.string().trim().min(2, 'Full name is required').max(150),
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      password: passwordSchema,
      departmentId: z.string().uuid().optional().nullable(),
      designation: z.string().trim().max(100).optional().nullable(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { fullName, email, password, departmentId, designation } = req.body;

    if (departmentId) {
      const dep = await query(`SELECT is_active FROM departments WHERE id = $1`, [departmentId]);
      if (!dep.rows[0]) throw ApiError.badRequest('Selected department does not exist');
      if (!dep.rows[0].is_active) throw ApiError.badRequest('Cannot join an inactive department');
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await withTransaction(async (c) => {
      const seq = await c.query(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '\\D', '', 'g'), '')::int), 0) + 1 AS next FROM users`
      );
      const code = `EMP-${String(seq.rows[0].next).padStart(4, '0')}`;
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const { rows } = await c.query(
        `INSERT INTO users (employee_code, full_name, email, password_hash, role, department_id, designation, avatar_color)
         VALUES ($1,$2,$3,$4,'EMPLOYEE',$5,$6,$7) RETURNING *`,
        [code, fullName, email, hash, departmentId ?? null, designation ?? null, color]
      );
      await logActivity(c, {
        actor: { id: rows[0].id, role: 'EMPLOYEE' },
        action: 'USER_SIGNUP', entityType: 'user', entityId: rows[0].id,
        details: `${fullName} signed up`,
      });
      return rows[0];
    });

    res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
  })
);

/** POST /api/auth/login */
router.post('/login',
  validate({
    body: z.object({
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      password: z.string().min(1, 'Password is required'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query(
      `SELECT u.*, d.name AS department_name FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE LOWER(u.email) = $1`,
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw ApiError.unauthorized('Invalid email or password');
    }
    if (!user.is_active) throw ApiError.forbidden('Your account has been deactivated. Contact your administrator.');

    await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
    res.json({ success: true, token: signToken(user), user: publicUser(user) });
  })
);

/**
 * POST /api/auth/forgot-password
 * Demo mode: returns the reset token in the response (no SMTP configured).
 * In production this token would be emailed instead.
 */
router.post('/forgot-password',
  validate({ body: z.object({ email: z.string().trim().toLowerCase().email() }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT id FROM users WHERE LOWER(email) = $1 AND is_active`, [req.body.email]);
    // Do not leak whether the account exists.
    if (!rows[0]) {
      return res.json({ success: true, message: 'If an account exists for this email, a reset link has been generated.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '30 minutes')`,
      [rows[0].id, tokenHash]
    );
    res.json({
      success: true,
      message: 'Reset token generated. (Demo mode: token returned directly instead of emailed.)',
      resetToken: token,
    });
  })
);

/** POST /api/auth/reset-password */
router.post('/reset-password',
  validate({ body: z.object({ token: z.string().min(10), password: passwordSchema }) }),
  asyncHandler(async (req, res) => {
    const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const { rows } = await query(
      `SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [tokenHash]
    );
    if (!rows[0]) throw ApiError.badRequest('This reset link is invalid or has expired');

    const hash = await bcrypt.hash(req.body.password, 10);
    await withTransaction(async (c) => {
      await c.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, rows[0].user_id]);
      await c.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [rows[0].id]);
      await logActivity(c, {
        actor: { id: rows[0].user_id, role: null },
        action: 'PASSWORD_RESET', entityType: 'user', entityId: rows[0].user_id,
        details: 'Password reset via recovery token',
      });
    });
    res.json({ success: true, message: 'Password updated. You can now sign in.' });
  })
);

/** GET /api/auth/me */
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

/** PATCH /api/auth/me — profile + password change */
router.patch('/me',
  requireAuth,
  validate({
    body: z.object({
      fullName: z.string().trim().min(2).max(150).optional(),
      phone: z.string().trim().max(30).optional().nullable(),
      currentPassword: z.string().optional(),
      newPassword: passwordSchema.optional(),
    }).refine((b) => !b.newPassword || b.currentPassword, {
      message: 'Current password is required to set a new password', path: ['currentPassword'],
    }),
  }),
  asyncHandler(async (req, res) => {
    const { fullName, phone, currentPassword, newPassword } = req.body;
    if (newPassword) {
      const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
      if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
        throw ApiError.badRequest('Current password is incorrect');
      }
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [await bcrypt.hash(newPassword, 10), req.user.id]);
    }
    if (fullName || phone !== undefined) {
      await query(
        `UPDATE users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone) WHERE id = $3`,
        [fullName ?? null, phone ?? null, req.user.id]
      );
    }
    res.json({ success: true, message: 'Profile updated' });
  })
);

export default router;
