import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/** GET /api/notifications — own notifications, newest first */
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const [list, unread] = await Promise.all([
    query(
      `SELECT id, type, title, message, link, is_read AS "isRead", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.user.id, limit]
    ),
    query(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND NOT is_read`, [req.user.id]),
  ]);
  res.json({ success: true, data: list.rows, unreadCount: unread.rows[0].count });
}));

/** PATCH /api/notifications/:id/read */
router.patch('/:id/read', asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
  res.json({ success: true });
}));

/** PATCH /api/notifications/read-all */
router.patch('/read-all', asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read`, [req.user.id]);
  res.json({ success: true });
}));

export default router;
