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

const MAINTENANCE_COLS = `
  m.id, m.title, m.description, m.type, m.priority, m.status,
         m.technician_name AS "technicianName", m.scheduled_date AS "scheduledDate",
         m.decision_notes AS "decisionNotes", m.resolution_notes AS "resolutionNotes", m.cost,
         m.created_at AS "createdAt", m.decided_at AS "decidedAt", m.resolved_at AS "resolvedAt",
         a.id AS "assetId", a.name AS "assetName", a.asset_tag AS "assetTag", a.status AS "assetStatus",
         rq.full_name AS "requestedByName", rq.avatar_color AS "requestedByColor",
         db.full_name AS "decidedByName"`;

const MAINTENANCE_FROM = `
  FROM maintenance_requests m
  JOIN assets a ON a.id = m.asset_id
  LEFT JOIN users rq ON rq.id = m.requested_by
  LEFT JOIN users db ON db.id = m.decided_by`;

/** GET /api/maintenance */
router.get('/', asyncHandler(async (req, res) => {
  const pg = getPagination(req.query);
  const wb = new WhereBuilder();
  if (!LEADERSHIP.includes(req.user.role)) wb.add(`m.requested_by = ?`, req.user.id);
  if (req.query.status) wb.add(`m.status = ?`, req.query.status);
  if (req.query.priority) wb.add(`m.priority = ?`, req.query.priority);
  if (req.query.search) wb.add(`(m.title ILIKE ? OR a.name ILIKE ? OR a.asset_tag ILIKE ?)`,
    ...Array(3).fill(`%${req.query.search}%`));
  const { rows } = await query(
    `SELECT ${MAINTENANCE_COLS}, COUNT(*) OVER() AS total ${MAINTENANCE_FROM}
     ${wb.clause} ORDER BY m.created_at DESC LIMIT ${wb.next(pg.limit)} OFFSET ${wb.next(pg.offset)}`,
    wb.params
  );
  res.json(paginated(rows.map(({ total, ...r }) => r), rows[0]?.total ?? 0, pg));
}));

/** POST /api/maintenance — anyone can report an issue */
router.post('/',
  validate({
    body: z.object({
      assetId: z.string().uuid('Select an asset'),
      title: z.string().trim().min(3, 'Give the issue a short title').max(200),
      description: z.string().trim().max(4000).nullable().optional(),
      type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'INSPECTION']).optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { assetId, title, description, type, priority } = req.body;
    const request = await withTransaction(async (c) => {
      const asset = await lockAsset(c, assetId);
      if (['RETIRED', 'DISPOSED', 'LOST'].includes(asset.status)) {
        throw ApiError.badRequest(`Cannot raise maintenance for a ${asset.status.toLowerCase()} asset`);
      }
      const open = await c.query(
        `SELECT 1 FROM maintenance_requests WHERE asset_id = $1 AND status IN ('PENDING','APPROVED','ASSIGNED','IN_PROGRESS')`,
        [assetId]
      );
      if (open.rows[0]) throw ApiError.conflict('An open maintenance request already exists for this asset');

      const { rows } = await c.query(
        `INSERT INTO maintenance_requests (asset_id, requested_by, title, description, type, priority)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [assetId, req.user.id, title, description ?? null, type ?? 'CORRECTIVE', priority ?? 'MEDIUM']
      );
      await logActivity(c, {
        actor: req.user, action: 'MAINTENANCE_REQUESTED', entityType: 'maintenance', entityId: rows[0].id,
        newState: { status: 'PENDING', title },
        details: `${title} — ${asset.name} (${asset.asset_tag})`,
      });
      await notifyManagers(c, {
        type: 'MAINTENANCE', title: 'New maintenance request',
        message: `${req.user.full_name} reported "${title}" on ${asset.name} (${asset.asset_tag}).`,
        link: '/maintenance',
      });
      return rows[0];
    });
    res.status(201).json({ success: true, data: request });
  })
);

/**
 * POST /api/maintenance/:id/decide — approve/reject (Admin / Asset Manager).
 * Approval automatically moves the asset to UNDER_MAINTENANCE.
 */
router.post('/:id/decide',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      notes: z.string().trim().max(1000).nullable().optional(),
      technicianName: z.string().trim().max(150).nullable().optional(),
      scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { decision, notes, technicianName, scheduledDate } = req.body;
    const request = await withTransaction(async (c) => {
      const found = await c.query(`SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const m = found.rows[0];
      if (!m) throw ApiError.notFound('Maintenance request not found');
      if (m.status !== 'PENDING') throw ApiError.badRequest(`This request is already ${m.status.toLowerCase()}`);

      const asset = await lockAsset(c, m.asset_id);
      let newStatus = decision;
      if (decision === 'APPROVED') {
        await changeAssetStatus(c, { asset, toStatus: 'UNDER_MAINTENANCE', actor: req.user, reason: `Maintenance approved: ${m.title}` });
        if (technicianName) newStatus = 'ASSIGNED';
      }
      const { rows } = await c.query(
        `UPDATE maintenance_requests SET status = $1, decided_by = $2, decided_at = now(), decision_notes = $3,
           technician_name = $4, assigned_at = CASE WHEN $4 IS NULL THEN assigned_at ELSE now() END,
           scheduled_date = $5
         WHERE id = $6 RETURNING *`,
        [newStatus, req.user.id, notes ?? null, technicianName ?? null, scheduledDate ?? null, req.params.id]
      );
      await logActivity(c, {
        actor: req.user, action: `MAINTENANCE_${decision}`, entityType: 'maintenance', entityId: req.params.id,
        previousState: { status: 'PENDING', assetStatus: asset.status },
        newState: { status: newStatus, assetStatus: decision === 'APPROVED' ? 'UNDER_MAINTENANCE' : asset.status },
        details: `"${m.title}" ${decision.toLowerCase()}${technicianName ? `, assigned to ${technicianName}` : ''}`,
      });
      await notifyUser(c, m.requested_by, {
        type: 'MAINTENANCE', title: `Maintenance ${decision.toLowerCase()}`,
        message: `Your request "${m.title}" was ${decision.toLowerCase()}${notes ? `: ${notes}` : '.'}`,
        link: '/maintenance',
      });
      return rows[0];
    });
    res.json({ success: true, data: request });
  })
);

/** POST /api/maintenance/:id/assign — assign/replace technician (moves APPROVED → ASSIGNED) */
router.post('/:id/assign',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      technicianName: z.string().trim().min(2, 'Technician name is required').max(150),
      scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const request = await withTransaction(async (c) => {
      const found = await c.query(`SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const m = found.rows[0];
      if (!m) throw ApiError.notFound('Maintenance request not found');
      if (!['APPROVED', 'ASSIGNED'].includes(m.status)) {
        throw ApiError.badRequest('A technician can only be assigned after approval');
      }
      const { rows } = await c.query(
        `UPDATE maintenance_requests SET status = 'ASSIGNED', technician_name = $1, assigned_at = now(),
           scheduled_date = COALESCE($2, scheduled_date)
         WHERE id = $3 RETURNING *`,
        [req.body.technicianName, req.body.scheduledDate ?? null, req.params.id]
      );
      await logActivity(c, {
        actor: req.user, action: 'MAINTENANCE_ASSIGNED', entityType: 'maintenance', entityId: req.params.id,
        previousState: { status: m.status }, newState: { status: 'ASSIGNED', technician: req.body.technicianName },
        details: `Technician ${req.body.technicianName} assigned to "${m.title}"`,
      });
      return rows[0];
    });
    res.json({ success: true, data: request });
  })
);

/** POST /api/maintenance/:id/start — ASSIGNED → IN_PROGRESS */
router.post('/:id/start', authorize(...MANAGERS), asyncHandler(async (req, res) => {
  const request = await withTransaction(async (c) => {
    const found = await c.query(`SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const m = found.rows[0];
    if (!m) throw ApiError.notFound('Maintenance request not found');
    if (m.status !== 'ASSIGNED') throw ApiError.badRequest('Work can only start once a technician is assigned');
    const { rows } = await c.query(
      `UPDATE maintenance_requests SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    await logActivity(c, {
      actor: req.user, action: 'MAINTENANCE_STARTED', entityType: 'maintenance', entityId: req.params.id,
      previousState: { status: 'ASSIGNED' }, newState: { status: 'IN_PROGRESS' },
      details: `Work started on "${m.title}"`,
    });
    return rows[0];
  });
  res.json({ success: true, data: request });
}));

/**
 * POST /api/maintenance/:id/resolve — completes the workflow.
 * Restores the asset to ALLOCATED if it still has an active allocation, otherwise AVAILABLE.
 */
router.post('/:id/resolve',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      resolutionNotes: z.string().trim().min(3, 'Describe what was done').max(4000),
      cost: z.coerce.number().nonnegative().nullable().optional(),
      condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const request = await withTransaction(async (c) => {
      const found = await c.query(`SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const m = found.rows[0];
      if (!m) throw ApiError.notFound('Maintenance request not found');
      if (!['IN_PROGRESS', 'ASSIGNED', 'APPROVED'].includes(m.status)) {
        throw ApiError.badRequest('Only approved or in-progress maintenance can be resolved');
      }
      const asset = await lockAsset(c, m.asset_id);
      const activeAllocation = await c.query(
        `SELECT allocated_to FROM allocations WHERE asset_id = $1 AND status = 'ACTIVE'`, [m.asset_id]
      );
      const restoreTo = activeAllocation.rows[0] ? 'ALLOCATED' : 'AVAILABLE';

      const { rows } = await c.query(
        `UPDATE maintenance_requests SET status = 'RESOLVED', resolved_at = now(),
           resolution_notes = $1, cost = $2 WHERE id = $3 RETURNING *`,
        [req.body.resolutionNotes, req.body.cost ?? null, req.params.id]
      );
      if (req.body.condition) {
        await c.query(`UPDATE assets SET condition = $1 WHERE id = $2`, [req.body.condition, m.asset_id]);
      }
      if (asset.status === 'UNDER_MAINTENANCE') {
        await changeAssetStatus(c, { asset, toStatus: restoreTo, actor: req.user, reason: `Maintenance resolved: ${m.title}` });
      }
      await logActivity(c, {
        actor: req.user, action: 'MAINTENANCE_RESOLVED', entityType: 'maintenance', entityId: req.params.id,
        previousState: { status: m.status, assetStatus: asset.status },
        newState: { status: 'RESOLVED', assetStatus: restoreTo },
        details: `"${m.title}" resolved — ${asset.name} (${asset.asset_tag}) back to ${restoreTo.toLowerCase()}`,
      });
      await notifyUser(c, m.requested_by, {
        type: 'MAINTENANCE', title: 'Maintenance completed',
        message: `"${m.title}" on ${asset.name} (${asset.asset_tag}) has been resolved.`,
        link: '/maintenance',
      });
      return rows[0];
    });
    res.json({ success: true, data: request });
  })
);

export default router;
