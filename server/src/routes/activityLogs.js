import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { LEADERSHIP } from '../constants/roles.js';
import { getPagination, WhereBuilder, paginated } from '../utils/queryHelpers.js';

const router = Router();
router.use(requireAuth, authorize(...LEADERSHIP));

/** GET /api/activity-logs — immutable trail with filters */
router.get('/', asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { limit: 25 });
  const wb = new WhereBuilder();
  if (req.query.entityType) wb.add(`al.entity_type = ?`, req.query.entityType);
  if (req.query.action) wb.add(`al.action = ?`, req.query.action);
  if (req.query.actorId) wb.add(`al.actor_id = ?`, req.query.actorId);
  if (req.query.search) wb.add(`(al.details ILIKE ? OR al.action ILIKE ?)`, `%${req.query.search}%`, `%${req.query.search}%`);
  if (req.query.from) wb.add(`al.created_at >= ?`, new Date(req.query.from));
  if (req.query.to) wb.add(`al.created_at <= ?`, new Date(`${req.query.to}T23:59:59`));

  const { rows } = await query(
    `SELECT al.id, al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
            al.previous_state AS "previousState", al.new_state AS "newState",
            al.details, al.actor_role AS "actorRole", al.created_at AS "createdAt",
            u.full_name AS "actorName", u.avatar_color AS "actorColor",
            COUNT(*) OVER() AS total
     FROM activity_logs al LEFT JOIN users u ON u.id = al.actor_id
     ${wb.clause} ORDER BY al.created_at DESC LIMIT ${wb.next(pg.limit)} OFFSET ${wb.next(pg.offset)}`,
    wb.params
  );
  res.json(paginated(rows.map(({ total, ...r }) => r), rows[0]?.total ?? 0, pg));
}));

export default router;
