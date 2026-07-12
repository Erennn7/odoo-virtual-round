import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { LEADERSHIP } from '../constants/roles.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/search?q= — global search across assets, people, bookings, maintenance.
 * People results are limited to leadership roles.
 */
router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, data: { assets: [], users: [], maintenance: [] } });
  const like = `%${q}%`;

  const [assets, users, maintenance] = await Promise.all([
    query(
      `SELECT a.id, a.name, a.asset_tag AS "assetTag", a.status, c.name AS "categoryName"
       FROM assets a JOIN asset_categories c ON c.id = a.category_id
       WHERE a.name ILIKE $1 OR a.asset_tag ILIKE $1 OR a.serial_number ILIKE $1 OR a.model ILIKE $1
       ORDER BY a.name LIMIT 6`, [like]),
    LEADERSHIP.includes(req.user.role)
      ? query(
          `SELECT u.id, u.full_name AS "fullName", u.email, u.role, u.avatar_color AS "avatarColor",
                  d.name AS "departmentName"
           FROM users u LEFT JOIN departments d ON d.id = u.department_id
           WHERE u.full_name ILIKE $1 OR u.email ILIKE $1 OR u.employee_code ILIKE $1
           ORDER BY u.full_name LIMIT 5`, [like])
      : Promise.resolve({ rows: [] }),
    query(
      `SELECT m.id, m.title, m.status, a.name AS "assetName"
       FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
       WHERE (m.title ILIKE $1 OR a.name ILIKE $1) ${LEADERSHIP.includes(req.user.role) ? '' : 'AND m.requested_by = $2'}
       ORDER BY m.created_at DESC LIMIT 4`,
      LEADERSHIP.includes(req.user.role) ? [like] : [like, req.user.id]),
  ]);

  res.json({ success: true, data: { assets: assets.rows, users: users.rows, maintenance: maintenance.rows } });
}));

export default router;
