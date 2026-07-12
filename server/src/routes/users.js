import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { ROLES, LEADERSHIP } from '../constants/roles.js';
import { getPagination, getSort, WhereBuilder, paginated } from '../utils/queryHelpers.js';
import { logActivity } from '../services/activityLog.js';
import { notifyUser } from '../services/notificationService.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/users/options — lightweight picker list (any authenticated user).
 * Used by transfer/booking forms; exposes only id, name, department.
 */
router.get('/options', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.full_name AS "fullName", u.avatar_color AS "avatarColor",
            u.role, d.name AS "departmentName"
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.is_active ORDER BY u.full_name`
  );
  res.json({ success: true, data: rows });
}));

/** GET /api/users — Employee Directory (leadership only) */
router.get('/', authorize(...LEADERSHIP), asyncHandler(async (req, res) => {
  const pg = getPagination(req.query);
  const wb = new WhereBuilder();
  if (req.query.search) wb.add(`(u.full_name ILIKE ? OR u.email ILIKE ? OR u.employee_code ILIKE ?)`,
    `%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  if (req.query.role) wb.add(`u.role = ?`, req.query.role);
  if (req.query.departmentId) wb.add(`u.department_id = ?`, req.query.departmentId);
  if (req.query.status === 'active') wb.add(`u.is_active = TRUE`);
  if (req.query.status === 'inactive') wb.add(`u.is_active = FALSE`);

  const orderBy = getSort(req.query, {
    name: 'u.full_name', email: 'u.email', role: 'u.role', code: 'u.employee_code', created: 'u.created_at',
  }, 'name');

  const { rows } = await query(
    `SELECT u.id, u.employee_code AS "employeeCode", u.full_name AS "fullName", u.email, u.role,
            u.designation, u.avatar_color AS "avatarColor", u.is_active AS "isActive",
            u.department_id AS "departmentId", d.name AS "departmentName",
            u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
            (SELECT COUNT(*) FROM allocations al WHERE al.allocated_to = u.id AND al.status = 'ACTIVE') AS "activeAssets",
            COUNT(*) OVER() AS total
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     ${wb.clause} ORDER BY ${orderBy} LIMIT ${wb.next(pg.limit)} OFFSET ${wb.next(pg.offset)}`,
    wb.params
  );
  res.json(paginated(rows.map(({ total, ...r }) => r), rows[0]?.total ?? 0, pg));
}));

/** GET /api/users/:id — profile with current holdings (leadership, or self) */
router.get('/:id', asyncHandler(async (req, res) => {
  if (req.user.id !== req.params.id && !LEADERSHIP.includes(req.user.role)) throw ApiError.forbidden();
  const { rows } = await query(
    `SELECT u.id, u.employee_code AS "employeeCode", u.full_name AS "fullName", u.email, u.role,
            u.designation, u.phone, u.avatar_color AS "avatarColor", u.is_active AS "isActive",
            u.department_id AS "departmentId", d.name AS "departmentName", u.created_at AS "createdAt"
     FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw ApiError.notFound('User not found');

  const holdings = await query(
    `SELECT al.id, al.allocated_at AS "allocatedAt", al.due_date AS "dueDate",
            a.id AS "assetId", a.name AS "assetName", a.asset_tag AS "assetTag", a.status
     FROM allocations al JOIN assets a ON a.id = al.asset_id
     WHERE al.allocated_to = $1 AND al.status = 'ACTIVE' ORDER BY al.allocated_at DESC`,
    [req.params.id]
  );
  res.json({ success: true, data: { ...rows[0], holdings: holdings.rows } });
}));

/**
 * PATCH /api/users/:id/role — Admin only. The ONLY privilege-escalation path.
 */
router.patch('/:id/role',
  authorize(ROLES.ADMIN),
  validate({ body: z.object({ role: z.enum(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE']) }) }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot change your own role');
    const result = await withTransaction(async (c) => {
      const prev = await c.query(`SELECT id, full_name, role FROM users WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!prev.rows[0]) throw ApiError.notFound('User not found');
      const { rows } = await c.query(`UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, role`, [req.body.role, req.params.id]);
      await logActivity(c, {
        actor: req.user, action: 'ROLE_CHANGED', entityType: 'user', entityId: req.params.id,
        previousState: { role: prev.rows[0].role }, newState: { role: req.body.role },
        details: `${prev.rows[0].full_name}: ${prev.rows[0].role} → ${req.body.role}`,
      });
      await notifyUser(c, req.params.id, {
        type: 'SYSTEM', title: 'Your role has changed',
        message: `An administrator updated your role to ${req.body.role.replace('_', ' ').toLowerCase()}.`,
        link: '/dashboard',
      });
      return rows[0];
    });
    res.json({ success: true, data: result });
  })
);

/** PATCH /api/users/:id — Admin edits department / designation / active flag */
router.patch('/:id',
  authorize(ROLES.ADMIN),
  validate({
    body: z.object({
      departmentId: z.string().uuid().nullable().optional(),
      designation: z.string().trim().max(100).nullable().optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { departmentId, designation, isActive } = req.body;
    if (isActive === false && req.params.id === req.user.id) throw ApiError.badRequest('You cannot deactivate your own account');
    if (departmentId) {
      const dep = await query(`SELECT is_active FROM departments WHERE id = $1`, [departmentId]);
      if (!dep.rows[0]) throw ApiError.badRequest('Department does not exist');
      if (!dep.rows[0].is_active) throw ApiError.badRequest('Cannot assign a user to an inactive department');
    }
    const result = await withTransaction(async (c) => {
      const prev = await c.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!prev.rows[0]) throw ApiError.notFound('User not found');
      const { rows } = await c.query(
        `UPDATE users SET
           department_id = CASE WHEN $1 THEN $2::uuid ELSE department_id END,
           designation   = CASE WHEN $3 THEN $4 ELSE designation END,
           is_active     = COALESCE($5, is_active)
         WHERE id = $6 RETURNING id, full_name, department_id, designation, is_active`,
        [departmentId !== undefined, departmentId ?? null, designation !== undefined, designation ?? null, isActive ?? null, req.params.id]
      );
      await logActivity(c, {
        actor: req.user, action: 'USER_UPDATED', entityType: 'user', entityId: req.params.id,
        previousState: { departmentId: prev.rows[0].department_id, designation: prev.rows[0].designation, isActive: prev.rows[0].is_active },
        newState: { departmentId: rows[0].department_id, designation: rows[0].designation, isActive: rows[0].is_active },
        details: `Updated ${prev.rows[0].full_name}`,
      });
      return rows[0];
    });
    res.json({ success: true, data: result });
  })
);

export default router;
