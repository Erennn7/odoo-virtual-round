import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { MANAGERS, LEADERSHIP } from '../constants/roles.js';
import { getPagination, WhereBuilder, paginated } from '../utils/queryHelpers.js';
import { logActivity } from '../services/activityLog.js';
import { notifyUser } from '../services/notificationService.js';
import { lockAsset, changeAssetStatus } from '../services/assetLifecycle.js';

const router = Router();
router.use(requireAuth);

const ALLOCATION_COLS = `
  al.id, al.status, al.purpose, al.allocated_at AS "allocatedAt", al.due_date AS "dueDate",
         al.returned_at AS "returnedAt", al.return_condition AS "returnCondition", al.return_notes AS "returnNotes",
         (al.status = 'ACTIVE' AND al.due_date < CURRENT_DATE) AS "isOverdue",
         a.id AS "assetId", a.name AS "assetName", a.asset_tag AS "assetTag", a.status AS "assetStatus",
         c.name AS "categoryName",
         tu.id AS "allocatedToId", tu.full_name AS "allocatedToName", tu.avatar_color AS "allocatedToColor",
         d.name AS "allocatedToDepartment", by_u.full_name AS "allocatedByName"`;

const ALLOCATION_FROM = `
  FROM allocations al
  JOIN assets a ON a.id = al.asset_id
  JOIN asset_categories c ON c.id = a.category_id
  JOIN users tu ON tu.id = al.allocated_to
  LEFT JOIN departments d ON d.id = tu.department_id
  LEFT JOIN users by_u ON by_u.id = al.allocated_by`;

/** GET /api/allocations — leadership sees all; ?mine=true for own holdings (any role) */
router.get('/', asyncHandler(async (req, res) => {
  const mine = req.query.mine === 'true' || !LEADERSHIP.includes(req.user.role);
  const pg = getPagination(req.query);
  const wb = new WhereBuilder();
  if (mine) wb.add(`al.allocated_to = ?`, req.user.id);
  if (req.query.status) wb.add(`al.status = ?`, req.query.status);
  if (req.query.overdue === 'true') wb.add(`al.status = 'ACTIVE' AND al.due_date < CURRENT_DATE`);
  if (req.query.search) wb.add(
    `(a.name ILIKE ? OR a.asset_tag ILIKE ? OR tu.full_name ILIKE ?)`,
    ...Array(3).fill(`%${req.query.search}%`)
  );
  const { rows } = await query(
    `SELECT ${ALLOCATION_COLS}, COUNT(*) OVER() AS total ${ALLOCATION_FROM}
     ${wb.clause} ORDER BY al.allocated_at DESC LIMIT ${wb.next(pg.limit)} OFFSET ${wb.next(pg.offset)}`,
    wb.params
  );
  res.json(paginated(rows.map(({ total, ...r }) => r), rows[0]?.total ?? 0, pg));
}));

/**
 * POST /api/allocations — allocate an asset (Admin / Asset Manager).
 * Double allocation is impossible: the asset row is locked, the status must be
 * AVAILABLE/RESERVED, and a partial unique index enforces one ACTIVE allocation per asset.
 */
router.post('/',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      assetId: z.string().uuid('Select an asset'),
      allocatedTo: z.string().uuid('Select an employee'),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      purpose: z.string().trim().max(1000).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { assetId, allocatedTo, dueDate, purpose } = req.body;
    if (dueDate && new Date(dueDate) < new Date(new Date().toDateString())) {
      throw ApiError.badRequest('Due date cannot be in the past');
    }

    const allocation = await withTransaction(async (c) => {
      const asset = await lockAsset(c, assetId);
      if (!['AVAILABLE', 'RESERVED'].includes(asset.status)) {
        const holder = await c.query(
          `SELECT u.full_name FROM allocations al JOIN users u ON u.id = al.allocated_to
           WHERE al.asset_id = $1 AND al.status = 'ACTIVE'`, [assetId]);
        const holderName = holder.rows[0]?.full_name;
        throw ApiError.conflict(
          holderName
            ? `This asset is currently held by ${holderName}. Request a transfer instead of reallocating.`
            : `This asset cannot be allocated while its status is ${asset.status.replaceAll('_', ' ').toLowerCase()}.`
        );
      }
      const target = await c.query(`SELECT full_name, is_active FROM users WHERE id = $1`, [allocatedTo]);
      if (!target.rows[0]) throw ApiError.badRequest('Selected employee does not exist');
      if (!target.rows[0].is_active) throw ApiError.badRequest('Cannot allocate to a deactivated employee');

      const { rows } = await c.query(
        `INSERT INTO allocations (asset_id, allocated_to, allocated_by, due_date, purpose)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [assetId, allocatedTo, req.user.id, dueDate ?? null, purpose ?? null]
      );
      await changeAssetStatus(c, { asset, toStatus: 'ALLOCATED', actor: req.user, reason: `Allocated to ${target.rows[0].full_name}` });
      await logActivity(c, {
        actor: req.user, action: 'ASSET_ALLOCATED', entityType: 'allocation', entityId: rows[0].id,
        previousState: { assetStatus: asset.status }, newState: { assetStatus: 'ALLOCATED', allocatedTo },
        details: `${asset.name} (${asset.asset_tag}) allocated to ${target.rows[0].full_name}`,
      });
      await notifyUser(c, allocatedTo, {
        type: 'ASSIGNMENT', title: 'Asset allocated to you',
        message: `${asset.name} (${asset.asset_tag}) has been allocated to you${dueDate ? `, due back ${dueDate}` : ''}.`,
        link: '/my-assets',
      });
      return rows[0];
    });
    res.status(201).json({ success: true, data: allocation });
  })
);

/** POST /api/allocations/:id/return — record a return; asset goes back to AVAILABLE */
router.post('/:id/return',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      returnCondition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']),
      returnNotes: z.string().trim().max(1000).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await withTransaction(async (c) => {
      const found = await c.query(`SELECT * FROM allocations WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const allocation = found.rows[0];
      if (!allocation) throw ApiError.notFound('Allocation not found');
      if (allocation.status !== 'ACTIVE') throw ApiError.badRequest('This allocation is already closed');

      const asset = await lockAsset(c, allocation.asset_id);
      if (asset.status === 'UNDER_MAINTENANCE') {
        throw ApiError.badRequest('Asset is under maintenance. Resolve the maintenance request first.');
      }

      const { rows } = await c.query(
        `UPDATE allocations SET status = 'RETURNED', returned_at = now(),
           return_condition = $1, return_notes = $2, received_by = $3
         WHERE id = $4 RETURNING *`,
        [req.body.returnCondition, req.body.returnNotes ?? null, req.user.id, req.params.id]
      );
      await c.query(`UPDATE assets SET condition = $1 WHERE id = $2`, [req.body.returnCondition, asset.id]);
      await changeAssetStatus(c, { asset, toStatus: 'AVAILABLE', actor: req.user, reason: 'Returned by holder' });
      await logActivity(c, {
        actor: req.user, action: 'ASSET_RETURNED', entityType: 'allocation', entityId: req.params.id,
        previousState: { assetStatus: 'ALLOCATED' },
        newState: { assetStatus: 'AVAILABLE', condition: req.body.returnCondition },
        details: `${asset.name} (${asset.asset_tag}) returned in ${req.body.returnCondition.toLowerCase()} condition`,
      });
      await notifyUser(c, allocation.allocated_to, {
        type: 'RETURN', title: 'Return recorded',
        message: `Your return of ${asset.name} (${asset.asset_tag}) has been recorded. Thank you!`,
        link: '/my-assets',
      });
      return rows[0];
    });
    res.json({ success: true, data: result });
  })
);

export default router;
