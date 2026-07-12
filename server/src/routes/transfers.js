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
import { notifyUser, notifyManagers } from '../services/notificationService.js';
import { lockAsset, changeAssetStatus } from '../services/assetLifecycle.js';

const router = Router();
router.use(requireAuth);

const TRANSFER_COLS = `
  t.id, t.status, t.reason, t.decision_notes AS "decisionNotes", t.created_at AS "createdAt",
         t.decided_at AS "decidedAt", t.completed_at AS "completedAt",
         a.id AS "assetId", a.name AS "assetName", a.asset_tag AS "assetTag",
         fu.full_name AS "fromUserName", fu.avatar_color AS "fromUserColor",
         tu.id AS "toUserId", tu.full_name AS "toUserName", tu.avatar_color AS "toUserColor",
         fd.name AS "fromDepartmentName", td.name AS "toDepartmentName",
         rq.full_name AS "requestedByName", db.full_name AS "decidedByName"`;

const TRANSFER_FROM = `
  FROM transfers t
  JOIN assets a ON a.id = t.asset_id
  LEFT JOIN users fu ON fu.id = t.from_user_id
  JOIN users tu ON tu.id = t.to_user_id
  LEFT JOIN departments fd ON fd.id = t.from_department_id
  LEFT JOIN departments td ON td.id = t.to_department_id
  LEFT JOIN users rq ON rq.id = t.requested_by
  LEFT JOIN users db ON db.id = t.decided_by`;

/** GET /api/transfers — leadership sees all; others see transfers they're part of */
router.get('/', asyncHandler(async (req, res) => {
  const pg = getPagination(req.query);
  const wb = new WhereBuilder();
  if (!LEADERSHIP.includes(req.user.role)) {
    wb.add(`(t.requested_by = ? OR t.from_user_id = ? OR t.to_user_id = ?)`, req.user.id, req.user.id, req.user.id);
  }
  if (req.query.status) wb.add(`t.status = ?`, req.query.status);
  if (req.query.search) wb.add(`(a.name ILIKE ? OR a.asset_tag ILIKE ?)`, `%${req.query.search}%`, `%${req.query.search}%`);
  const { rows } = await query(
    `SELECT ${TRANSFER_COLS}, COUNT(*) OVER() AS total ${TRANSFER_FROM}
     ${wb.clause} ORDER BY t.created_at DESC LIMIT ${wb.next(pg.limit)} OFFSET ${wb.next(pg.offset)}`,
    wb.params
  );
  res.json(paginated(rows.map(({ total, ...r }) => r), rows[0]?.total ?? 0, pg));
}));

/**
 * POST /api/transfers — request a transfer (any authenticated user).
 * Transfers are the ONLY way to move an allocated asset; the current holder
 * is captured automatically from the active allocation.
 */
router.post('/',
  validate({
    body: z.object({
      assetId: z.string().uuid('Select an asset'),
      toUserId: z.string().uuid('Select the receiving employee'),
      toDepartmentId: z.string().uuid().nullable().optional(),
      reason: z.string().trim().min(5, 'Explain why this transfer is needed').max(1000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { assetId, toUserId, toDepartmentId, reason } = req.body;
    const transfer = await withTransaction(async (c) => {
      const asset = await lockAsset(c, assetId);
      if (asset.status !== 'ALLOCATED') {
        throw ApiError.badRequest('Only allocated assets can be transferred. Available assets can be allocated directly.');
      }
      const holder = await c.query(
        `SELECT al.allocated_to, u.full_name, u.department_id FROM allocations al
         JOIN users u ON u.id = al.allocated_to WHERE al.asset_id = $1 AND al.status = 'ACTIVE'`,
        [assetId]
      );
      const current = holder.rows[0];
      if (!current) throw ApiError.conflict('No active allocation found for this asset');
      if (current.allocated_to === toUserId) throw ApiError.badRequest(`${current.full_name} already holds this asset`);

      const target = await c.query(`SELECT full_name, is_active, department_id FROM users WHERE id = $1`, [toUserId]);
      if (!target.rows[0]?.is_active) throw ApiError.badRequest('Receiving employee does not exist or is inactive');

      const { rows } = await c.query(
        `INSERT INTO transfers (asset_id, from_user_id, to_user_id, from_department_id, to_department_id, requested_by, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [assetId, current.allocated_to, toUserId, current.department_id ?? null,
         toDepartmentId ?? target.rows[0].department_id ?? null, req.user.id, reason]
      );
      await logActivity(c, {
        actor: req.user, action: 'TRANSFER_REQUESTED', entityType: 'transfer', entityId: rows[0].id,
        newState: { status: 'REQUESTED', from: current.full_name, to: target.rows[0].full_name },
        details: `Transfer of ${asset.name} (${asset.asset_tag}): ${current.full_name} → ${target.rows[0].full_name}`,
      });
      await notifyManagers(c, {
        type: 'TRANSFER', title: 'Transfer request awaiting approval',
        message: `${req.user.full_name} requested transferring ${asset.name} (${asset.asset_tag}) from ${current.full_name} to ${target.rows[0].full_name}.`,
        link: '/transfers',
      });
      return rows[0];
    });
    res.status(201).json({ success: true, data: transfer });
  })
);

/** POST /api/transfers/:id/decide — approve or reject (Admin / Asset Manager) */
router.post('/:id/decide',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      notes: z.string().trim().max(1000).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const transfer = await withTransaction(async (c) => {
      const found = await c.query(`SELECT ${TRANSFER_COLS} ${TRANSFER_FROM} WHERE t.id = $1 FOR UPDATE OF t`, [req.params.id]);
      const t = found.rows[0];
      if (!t) throw ApiError.notFound('Transfer not found');
      if (t.status !== 'REQUESTED') throw ApiError.badRequest(`This transfer is already ${t.status.toLowerCase()}`);

      const { rows } = await c.query(
        `UPDATE transfers SET status = $1, decided_by = $2, decided_at = now(), decision_notes = $3
         WHERE id = $4 RETURNING *`,
        [req.body.decision, req.user.id, req.body.notes ?? null, req.params.id]
      );
      await logActivity(c, {
        actor: req.user, action: `TRANSFER_${req.body.decision}`, entityType: 'transfer', entityId: req.params.id,
        previousState: { status: 'REQUESTED' }, newState: { status: req.body.decision },
        details: `Transfer of ${t.assetName} (${t.assetTag}) ${req.body.decision.toLowerCase()}`,
      });
      const verdict = req.body.decision === 'APPROVED'
        ? 'approved — reallocation will follow'
        : `rejected${req.body.notes ? `: ${req.body.notes}` : ''}`;
      await notifyUser(c, t.toUserId, {
        type: 'TRANSFER', title: `Transfer ${req.body.decision.toLowerCase()}`,
        message: `Transfer of ${t.assetName} (${t.assetTag}) to you was ${verdict}.`,
        link: '/transfers',
      });
      return rows[0];
    });
    res.json({ success: true, data: transfer });
  })
);

/**
 * POST /api/transfers/:id/complete — execute the reallocation (Admin / Asset Manager).
 * Atomically closes the old allocation as TRANSFERRED and opens a new ACTIVE one,
 * preserving the full chain of custody.
 */
router.post('/:id/complete', authorize(...MANAGERS), asyncHandler(async (req, res) => {
  const transfer = await withTransaction(async (c) => {
    const found = await c.query(`SELECT * FROM transfers WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const t = found.rows[0];
    if (!t) throw ApiError.notFound('Transfer not found');
    if (t.status !== 'APPROVED') throw ApiError.badRequest('Only approved transfers can be completed');

    const asset = await lockAsset(c, t.asset_id);
    await c.query(
      `UPDATE allocations SET status = 'TRANSFERRED', returned_at = now(), received_by = $2
       WHERE asset_id = $1 AND status = 'ACTIVE'`,
      [t.asset_id, req.user.id]
    );
    await c.query(
      `INSERT INTO allocations (asset_id, allocated_to, allocated_by, purpose)
       VALUES ($1,$2,$3,$4)`,
      [t.asset_id, t.to_user_id, req.user.id, `Transferred in (transfer ${t.id.slice(0, 8)})`]
    );
    if (t.to_department_id) {
      await c.query(`UPDATE assets SET department_id = $1 WHERE id = $2`, [t.to_department_id, t.asset_id]);
    }
    const { rows } = await c.query(
      `UPDATE transfers SET status = 'COMPLETED', completed_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    await c.query(
      `INSERT INTO asset_status_history (asset_id, from_status, to_status, changed_by, reason)
       VALUES ($1,'ALLOCATED','ALLOCATED',$2,'Reallocated via approved transfer')`,
      [t.asset_id, req.user.id]
    );
    const names = await c.query(`SELECT id, full_name FROM users WHERE id IN ($1, $2)`, [t.from_user_id, t.to_user_id]);
    const nameOf = (id) => names.rows.find((r) => r.id === id)?.full_name ?? 'previous holder';
    await logActivity(c, {
      actor: req.user, action: 'TRANSFER_COMPLETED', entityType: 'transfer', entityId: req.params.id,
      previousState: { holder: nameOf(t.from_user_id) }, newState: { holder: nameOf(t.to_user_id) },
      details: `${asset.name} (${asset.asset_tag}) reallocated: ${nameOf(t.from_user_id)} → ${nameOf(t.to_user_id)}`,
    });
    await notifyUser(c, t.to_user_id, {
      type: 'ASSIGNMENT', title: 'Asset transferred to you',
      message: `${asset.name} (${asset.asset_tag}) is now allocated to you.`, link: '/my-assets',
    });
    await notifyUser(c, t.from_user_id, {
      type: 'TRANSFER', title: 'Asset transferred out',
      message: `${asset.name} (${asset.asset_tag}) has been transferred to ${nameOf(t.to_user_id)}.`, link: '/transfers',
    });
    return rows[0];
  });
  res.json({ success: true, data: transfer });
}));

/** POST /api/transfers/:id/cancel — requester withdraws a pending request */
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const transfer = await withTransaction(async (c) => {
    const found = await c.query(`SELECT * FROM transfers WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const t = found.rows[0];
    if (!t) throw ApiError.notFound('Transfer not found');
    if (t.requested_by !== req.user.id && !MANAGERS.includes(req.user.role)) throw ApiError.forbidden();
    if (t.status !== 'REQUESTED') throw ApiError.badRequest('Only pending requests can be cancelled');
    const { rows } = await c.query(`UPDATE transfers SET status = 'CANCELLED' WHERE id = $1 RETURNING *`, [req.params.id]);
    await logActivity(c, {
      actor: req.user, action: 'TRANSFER_CANCELLED', entityType: 'transfer', entityId: req.params.id,
      previousState: { status: 'REQUESTED' }, newState: { status: 'CANCELLED' },
      details: 'Transfer request withdrawn',
    });
    return rows[0];
  });
  res.json({ success: true, data: transfer });
}));

export default router;
