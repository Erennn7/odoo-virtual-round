import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { MANAGERS } from '../constants/roles.js';
import { logActivity } from '../services/activityLog.js';
import { notifyUser, notifyManagers } from '../services/notificationService.js';
import { lockAsset, changeAssetStatus } from '../services/assetLifecycle.js';

const router = Router();
router.use(requireAuth);

/** GET /api/audits — list with progress stats */
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT au.id, au.name, au.description, au.status, au.due_date AS "dueDate",
            au.started_at AS "startedAt", au.closed_at AS "closedAt", au.created_at AS "createdAt",
            d.name AS "departmentName", c.name AS "categoryName",
            asg.full_name AS "assignedToName", asg.avatar_color AS "assignedToColor",
            cr.full_name AS "createdByName",
            COUNT(ai.id) AS "totalItems",
            COUNT(ai.id) FILTER (WHERE ai.verification = 'VERIFIED') AS "verifiedCount",
            COUNT(ai.id) FILTER (WHERE ai.verification = 'MISSING') AS "missingCount",
            COUNT(ai.id) FILTER (WHERE ai.verification = 'DAMAGED') AS "damagedCount",
            COUNT(ai.id) FILTER (WHERE ai.verification = 'PENDING') AS "pendingCount"
     FROM audits au
     LEFT JOIN departments d ON d.id = au.department_id
     LEFT JOIN asset_categories c ON c.id = au.category_id
     LEFT JOIN users asg ON asg.id = au.assigned_to
     LEFT JOIN users cr ON cr.id = au.created_by
     LEFT JOIN audit_items ai ON ai.audit_id = au.id
     GROUP BY au.id, d.name, c.name, asg.full_name, asg.avatar_color, cr.full_name
     ORDER BY au.created_at DESC`
  );
  res.json({ success: true, data: rows });
}));

/** GET /api/audits/:id — audit detail with all items */
router.get('/:id', asyncHandler(async (req, res) => {
  const audit = await query(
    `SELECT au.*, d.name AS department_name, c.name AS category_name,
            asg.full_name AS assigned_to_name, cr.full_name AS created_by_name
     FROM audits au
     LEFT JOIN departments d ON d.id = au.department_id
     LEFT JOIN asset_categories c ON c.id = au.category_id
     LEFT JOIN users asg ON asg.id = au.assigned_to
     LEFT JOIN users cr ON cr.id = au.created_by
     WHERE au.id = $1`,
    [req.params.id]
  );
  if (!audit.rows[0]) throw ApiError.notFound('Audit not found');

  const items = await query(
    `SELECT ai.id, ai.verification, ai.remarks, ai.verified_at AS "verifiedAt",
            a.id AS "assetId", a.name AS "assetName", a.asset_tag AS "assetTag",
            a.status AS "assetStatus", a.location, a.serial_number AS "serialNumber",
            c.name AS "categoryName", v.full_name AS "verifiedByName"
     FROM audit_items ai
     JOIN assets a ON a.id = ai.asset_id
     JOIN asset_categories c ON c.id = a.category_id
     LEFT JOIN users v ON v.id = ai.verified_by
     WHERE ai.audit_id = $1 ORDER BY a.asset_tag`,
    [req.params.id]
  );
  const a = audit.rows[0];
  res.json({
    success: true,
    data: {
      id: a.id, name: a.name, description: a.description, status: a.status,
      dueDate: a.due_date, startedAt: a.started_at, closedAt: a.closed_at, createdAt: a.created_at,
      departmentName: a.department_name, categoryName: a.category_name,
      assignedToName: a.assigned_to_name, assignedToId: a.assigned_to, createdByName: a.created_by_name,
      items: items.rows,
    },
  });
}));

/**
 * POST /api/audits — create a cycle (Admin / Asset Manager).
 * Snapshot of in-scope assets becomes the audit checklist.
 */
router.post('/',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      name: z.string().trim().min(3).max(150),
      description: z.string().trim().max(2000).nullable().optional(),
      departmentId: z.string().uuid().nullable().optional(),
      categoryId: z.string().uuid().nullable().optional(),
      assignedTo: z.string().uuid('Assign an auditor'),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { name, description, departmentId, categoryId, assignedTo, dueDate } = req.body;
    const audit = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO audits (name, description, department_id, category_id, status, assigned_to, created_by, due_date, started_at)
         VALUES ($1,$2,$3,$4,'IN_PROGRESS',$5,$6,$7, now()) RETURNING *`,
        [name, description ?? null, departmentId ?? null, categoryId ?? null, assignedTo, req.user.id, dueDate ?? null]
      );
      const auditId = rows[0].id;

      const scoped = await c.query(
        `INSERT INTO audit_items (audit_id, asset_id)
         SELECT $1, a.id FROM assets a
         WHERE a.status NOT IN ('DISPOSED')
           AND ($2::uuid IS NULL OR a.department_id = $2 OR a.department_id IN (SELECT id FROM departments WHERE parent_id = $2))
           AND ($3::uuid IS NULL OR a.category_id = $3)
         RETURNING id`,
        [auditId, departmentId ?? null, categoryId ?? null]
      );
      if (scoped.rowCount === 0) throw ApiError.badRequest('No assets match the selected scope');

      await logActivity(c, {
        actor: req.user, action: 'AUDIT_CREATED', entityType: 'audit', entityId: auditId,
        newState: { name, scopeAssets: scoped.rowCount },
        details: `Audit "${name}" started with ${scoped.rowCount} assets in scope`,
      });
      await notifyUser(c, assignedTo, {
        type: 'AUDIT', title: 'Audit assigned to you',
        message: `You are the auditor for "${name}" (${scoped.rowCount} assets${dueDate ? `, due ${dueDate}` : ''}).`,
        link: '/audits',
      });
      return { ...rows[0], totalItems: scoped.rowCount };
    });
    res.status(201).json({ success: true, data: audit });
  })
);

/** PATCH /api/audits/:id/items/:itemId — record a verification (auditor or managers) */
router.patch('/:id/items/:itemId',
  validate({
    body: z.object({
      verification: z.enum(['VERIFIED', 'MISSING', 'DAMAGED', 'PENDING']),
      remarks: z.string().trim().max(1000).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await withTransaction(async (c) => {
      const audit = await c.query(`SELECT * FROM audits WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!audit.rows[0]) throw ApiError.notFound('Audit not found');
      if (audit.rows[0].status === 'CLOSED') throw ApiError.badRequest('This audit is closed');
      const isAuditor = audit.rows[0].assigned_to === req.user.id;
      if (!isAuditor && !MANAGERS.includes(req.user.role)) throw ApiError.forbidden('Only the assigned auditor can verify items');

      const { rows } = await c.query(
        `UPDATE audit_items SET verification = $1, remarks = $2,
           verified_by = CASE WHEN $1 = 'PENDING' THEN NULL ELSE $3::uuid END,
           verified_at = CASE WHEN $1 = 'PENDING' THEN NULL ELSE now() END
         WHERE id = $4 AND audit_id = $5 RETURNING *`,
        [req.body.verification, req.body.remarks ?? null, req.user.id, req.params.itemId, req.params.id]
      );
      if (!rows[0]) throw ApiError.notFound('Audit item not found');

      if (['MISSING', 'DAMAGED'].includes(req.body.verification)) {
        const asset = await c.query(`SELECT name, asset_tag FROM assets WHERE id = $1`, [rows[0].asset_id]);
        await notifyManagers(c, {
          type: 'AUDIT', title: `Audit discrepancy: asset ${req.body.verification.toLowerCase()}`,
          message: `${asset.rows[0].name} (${asset.rows[0].asset_tag}) marked ${req.body.verification.toLowerCase()} in "${audit.rows[0].name}".`,
          link: '/audits',
        });
      }
      return rows[0];
    });
    res.json({ success: true, data: item });
  })
);

/**
 * POST /api/audits/:id/close — close the cycle (Admin / Asset Manager).
 * Confirmed-missing assets become LOST (their active allocation is closed);
 * damaged assets get condition DAMAGED. A discrepancy summary is logged.
 */
router.post('/:id/close', authorize(...MANAGERS), asyncHandler(async (req, res) => {
  const summary = await withTransaction(async (c) => {
    const audit = await c.query(`SELECT * FROM audits WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const au = audit.rows[0];
    if (!au) throw ApiError.notFound('Audit not found');
    if (au.status === 'CLOSED') throw ApiError.badRequest('This audit is already closed');

    const pending = await c.query(
      `SELECT COUNT(*) FROM audit_items WHERE audit_id = $1 AND verification = 'PENDING'`, [req.params.id]
    );
    if (Number(pending.rows[0].count) > 0) {
      throw ApiError.badRequest(`${pending.rows[0].count} item(s) are still unverified. Verify all items before closing.`);
    }

    const missing = await c.query(
      `SELECT ai.asset_id, a.name, a.asset_tag FROM audit_items ai JOIN assets a ON a.id = ai.asset_id
       WHERE ai.audit_id = $1 AND ai.verification = 'MISSING'`, [req.params.id]
    );
    for (const row of missing.rows) {
      const asset = await lockAsset(c, row.asset_id);
      if (!['LOST', 'RETIRED', 'DISPOSED'].includes(asset.status)) {
        await c.query(
          `UPDATE allocations SET status = 'RETURNED', returned_at = now(), return_notes = 'Confirmed missing during audit'
           WHERE asset_id = $1 AND status = 'ACTIVE'`, [row.asset_id]
        );
        await changeAssetStatus(c, { asset, toStatus: 'LOST', actor: req.user, reason: `Confirmed missing in audit "${au.name}"` });
      }
    }
    const damaged = await c.query(
      `UPDATE assets SET condition = 'DAMAGED'
       WHERE id IN (SELECT asset_id FROM audit_items WHERE audit_id = $1 AND verification = 'DAMAGED')
       RETURNING id`, [req.params.id]
    );

    const counts = await c.query(
      `SELECT COUNT(*) FILTER (WHERE verification = 'VERIFIED') AS verified,
              COUNT(*) FILTER (WHERE verification = 'MISSING') AS missing,
              COUNT(*) FILTER (WHERE verification = 'DAMAGED') AS damaged,
              COUNT(*) AS total
       FROM audit_items WHERE audit_id = $1`, [req.params.id]
    );
    await c.query(`UPDATE audits SET status = 'CLOSED', closed_at = now() WHERE id = $1`, [req.params.id]);

    const s = counts.rows[0];
    await logActivity(c, {
      actor: req.user, action: 'AUDIT_CLOSED', entityType: 'audit', entityId: req.params.id,
      previousState: { status: au.status }, newState: { status: 'CLOSED', ...s },
      details: `Audit "${au.name}" closed — ${s.verified}/${s.total} verified, ${s.missing} missing (marked lost), ${s.damaged} damaged`,
    });
    await notifyManagers(c, {
      type: 'AUDIT', title: 'Audit closed',
      message: `"${au.name}" closed: ${s.verified} verified, ${s.missing} missing, ${s.damaged} damaged of ${s.total} assets.`,
      link: '/audits',
    });
    return { ...s, markedLost: missing.rows.length, markedDamaged: damaged.rowCount };
  });
  res.json({ success: true, data: summary });
}));

export default router;
