import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { MANAGERS } from '../constants/roles.js';
import { getPagination, getSort, WhereBuilder, paginated } from '../utils/queryHelpers.js';
import { logActivity } from '../services/activityLog.js';
import { lockAsset, changeAssetStatus } from '../services/assetLifecycle.js';

const router = Router();
router.use(requireAuth);

const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];

const assetBody = z.object({
  name: z.string().trim().min(2).max(150),
  categoryId: z.string().uuid('Select a category'),
  departmentId: z.string().uuid().nullable().optional(),
  serialNumber: z.string().trim().max(100).nullable().optional().transform((s) => s || null),
  model: z.string().trim().max(120).nullable().optional(),
  manufacturer: z.string().trim().max(120).nullable().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  purchaseCost: z.coerce.number().nonnegative().nullable().optional(),
  warrantyExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  condition: z.enum(CONDITIONS).optional(),
  location: z.string().trim().max(150).nullable().optional(),
  imageUrl: z.string().trim().url().nullable().optional().or(z.literal('').transform(() => null)),
  notes: z.string().trim().max(4000).nullable().optional(),
  isBookable: z.boolean().optional(),
});

const ASSET_SELECT = `
  SELECT a.id, a.asset_tag AS "assetTag", a.name, a.serial_number AS "serialNumber",
         a.model, a.manufacturer, a.purchase_date AS "purchaseDate", a.purchase_cost AS "purchaseCost",
         a.warranty_expiry AS "warrantyExpiry", a.condition, a.status, a.location,
         a.image_url AS "imageUrl", a.notes, a.is_bookable AS "isBookable",
         a.category_id AS "categoryId", c.name AS "categoryName",
         a.department_id AS "departmentId", d.name AS "departmentName",
         a.created_at AS "createdAt",
         holder.full_name AS "currentHolder", holder.id AS "currentHolderId",
         act.due_date AS "currentDueDate"
  FROM assets a
  JOIN asset_categories c ON c.id = a.category_id
  LEFT JOIN departments d ON d.id = a.department_id
  LEFT JOIN allocations act ON act.asset_id = a.id AND act.status = 'ACTIVE'
  LEFT JOIN users holder ON holder.id = act.allocated_to`;

/** GET /api/assets — directory with search / filter / sort / pagination */
router.get('/', asyncHandler(async (req, res) => {
  const pg = getPagination(req.query);
  const wb = new WhereBuilder();
  if (req.query.search) wb.add(
    `(a.name ILIKE ? OR a.asset_tag ILIKE ? OR a.serial_number ILIKE ? OR a.model ILIKE ?)`,
    ...Array(4).fill(`%${req.query.search}%`)
  );
  if (req.query.status) wb.add(`a.status = ?`, req.query.status);
  if (req.query.categoryId) wb.add(`a.category_id = ?`, req.query.categoryId);
  if (req.query.departmentId) wb.add(`a.department_id = ?`, req.query.departmentId);
  if (req.query.bookable === 'true') wb.add(`a.is_bookable = TRUE`);
  if (req.query.condition) wb.add(`a.condition = ?`, req.query.condition);

  const orderBy = getSort(req.query, {
    name: 'a.name', tag: 'a.asset_tag', status: 'a.status', category: 'c.name',
    cost: 'a.purchase_cost', purchased: 'a.purchase_date', created: 'a.created_at',
  }, 'created');

  const { rows } = await query(
    `${ASSET_SELECT}, COUNT(*) OVER() AS total
     ${wb.clause} ORDER BY ${orderBy} NULLS LAST LIMIT ${wb.next(pg.limit)} OFFSET ${wb.next(pg.offset)}`,
    wb.params
  );
  res.json(paginated(rows.map(({ total, ...r }) => r), rows[0]?.total ?? 0, pg));
}));

/** GET /api/assets/:id — detail with allocation, maintenance and status history */
router.get('/:id', asyncHandler(async (req, res) => {
  const asset = await query(`${ASSET_SELECT} WHERE a.id = $1`, [req.params.id]);
  if (!asset.rows[0]) throw ApiError.notFound('Asset not found');

  const [allocationHistory, maintenanceHistory, statusHistory] = await Promise.all([
    query(
      `SELECT al.id, al.status, al.purpose, al.allocated_at AS "allocatedAt", al.due_date AS "dueDate",
              al.returned_at AS "returnedAt", al.return_condition AS "returnCondition", al.return_notes AS "returnNotes",
              tu.full_name AS "allocatedToName", tu.avatar_color AS "allocatedToColor", by_u.full_name AS "allocatedByName"
       FROM allocations al
       JOIN users tu ON tu.id = al.allocated_to
       LEFT JOIN users by_u ON by_u.id = al.allocated_by
       WHERE al.asset_id = $1 ORDER BY al.allocated_at DESC`,
      [req.params.id]
    ),
    query(
      `SELECT m.id, m.title, m.type, m.priority, m.status, m.technician_name AS "technicianName",
              m.cost, m.created_at AS "createdAt", m.resolved_at AS "resolvedAt", u.full_name AS "requestedByName"
       FROM maintenance_requests m LEFT JOIN users u ON u.id = m.requested_by
       WHERE m.asset_id = $1 ORDER BY m.created_at DESC`,
      [req.params.id]
    ),
    query(
      `SELECT h.from_status AS "fromStatus", h.to_status AS "toStatus", h.reason, h.created_at AS "createdAt",
              u.full_name AS "changedByName"
       FROM asset_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.asset_id = $1 ORDER BY h.created_at DESC LIMIT 50`,
      [req.params.id]
    ),
  ]);

  res.json({
    success: true,
    data: {
      ...asset.rows[0],
      allocationHistory: allocationHistory.rows,
      maintenanceHistory: maintenanceHistory.rows,
      statusHistory: statusHistory.rows,
    },
  });
}));

/** POST /api/assets — register (Admin / Asset Manager). Asset tag auto-generated. */
router.post('/', authorize(...MANAGERS), validate({ body: assetBody }), asyncHandler(async (req, res) => {
  const b = req.body;
  const cat = await query(`SELECT is_active, is_bookable_default FROM asset_categories WHERE id = $1`, [b.categoryId]);
  if (!cat.rows[0]) throw ApiError.badRequest('Category does not exist');
  if (!cat.rows[0].is_active) throw ApiError.badRequest('Cannot register an asset under an inactive category');
  if (b.departmentId) {
    const dep = await query(`SELECT is_active FROM departments WHERE id = $1`, [b.departmentId]);
    if (!dep.rows[0]?.is_active) throw ApiError.badRequest('Cannot assign an asset to an inactive department');
  }

  const asset = await withTransaction(async (c) => {
    const org = await c.query(`SELECT asset_tag_prefix FROM organization WHERE id = 1`);
    const prefix = org.rows[0]?.asset_tag_prefix || 'AST';
    const seq = await c.query(`SELECT nextval('asset_tag_seq') AS n`);
    const tag = `${prefix}-${seq.rows[0].n}`;

    const { rows } = await c.query(
      `INSERT INTO assets (asset_tag, name, category_id, department_id, serial_number, model, manufacturer,
         purchase_date, purchase_cost, warranty_expiry, condition, location, image_url, notes, is_bookable, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [tag, b.name, b.categoryId, b.departmentId ?? null, b.serialNumber ?? null, b.model ?? null,
       b.manufacturer ?? null, b.purchaseDate ?? null, b.purchaseCost ?? null, b.warrantyExpiry ?? null,
       b.condition ?? 'GOOD', b.location ?? null, b.imageUrl ?? null, b.notes ?? null,
       b.isBookable ?? cat.rows[0].is_bookable_default, req.user.id]
    );
    await c.query(
      `INSERT INTO asset_status_history (asset_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, 'AVAILABLE', $2, 'Asset registered')`,
      [rows[0].id, req.user.id]
    );
    await logActivity(c, {
      actor: req.user, action: 'ASSET_REGISTERED', entityType: 'asset', entityId: rows[0].id,
      newState: { assetTag: tag, name: b.name, status: 'AVAILABLE' },
      details: `Registered ${b.name} (${tag})`,
    });
    return rows[0];
  });
  res.status(201).json({ success: true, data: asset });
}));

/** PATCH /api/assets/:id — edit details (not status) */
router.patch('/:id', authorize(...MANAGERS), validate({ body: assetBody.partial() }), asyncHandler(async (req, res) => {
  const b = req.body;
  const asset = await withTransaction(async (c) => {
    const prev = await lockAsset(c, req.params.id);
    const { rows } = await c.query(
      `UPDATE assets SET
         name = COALESCE($1, name),
         category_id = COALESCE($2, category_id),
         department_id = CASE WHEN $3 THEN $4::uuid ELSE department_id END,
         serial_number = CASE WHEN $5 THEN $6 ELSE serial_number END,
         model = CASE WHEN $7 THEN $8 ELSE model END,
         manufacturer = CASE WHEN $9 THEN $10 ELSE manufacturer END,
         purchase_date = CASE WHEN $11 THEN $12::date ELSE purchase_date END,
         purchase_cost = CASE WHEN $13 THEN $14::numeric ELSE purchase_cost END,
         warranty_expiry = CASE WHEN $15 THEN $16::date ELSE warranty_expiry END,
         condition = COALESCE($17, condition),
         location = CASE WHEN $18 THEN $19 ELSE location END,
         image_url = CASE WHEN $20 THEN $21 ELSE image_url END,
         notes = CASE WHEN $22 THEN $23 ELSE notes END,
         is_bookable = COALESCE($24, is_bookable)
       WHERE id = $25 RETURNING *`,
      [b.name ?? null, b.categoryId ?? null,
       b.departmentId !== undefined, b.departmentId ?? null,
       b.serialNumber !== undefined, b.serialNumber ?? null,
       b.model !== undefined, b.model ?? null,
       b.manufacturer !== undefined, b.manufacturer ?? null,
       b.purchaseDate !== undefined, b.purchaseDate ?? null,
       b.purchaseCost !== undefined, b.purchaseCost ?? null,
       b.warrantyExpiry !== undefined, b.warrantyExpiry ?? null,
       b.condition ?? null,
       b.location !== undefined, b.location ?? null,
       b.imageUrl !== undefined, b.imageUrl ?? null,
       b.notes !== undefined, b.notes ?? null,
       b.isBookable ?? null, req.params.id]
    );
    await logActivity(c, {
      actor: req.user, action: 'ASSET_UPDATED', entityType: 'asset', entityId: req.params.id,
      previousState: { name: prev.name, condition: prev.condition },
      newState: { name: rows[0].name, condition: rows[0].condition },
      details: `Updated ${rows[0].name} (${rows[0].asset_tag})`,
    });
    return rows[0];
  });
  res.json({ success: true, data: asset });
}));

/**
 * POST /api/assets/:id/status — explicit lifecycle action (mark lost / retire / dispose / found).
 * Allocation/maintenance flows manage their own transitions; this endpoint only accepts
 * the manual states so workflows cannot be bypassed.
 */
router.post('/:id/status',
  authorize(...MANAGERS),
  validate({
    body: z.object({
      status: z.enum(['AVAILABLE', 'LOST', 'RETIRED', 'DISPOSED']),
      reason: z.string().trim().min(3, 'A reason is required').max(1000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const updated = await withTransaction(async (c) => {
      const asset = await lockAsset(c, req.params.id);

      if (req.body.status === 'LOST' && asset.status === 'ALLOCATED') {
        // Close the active allocation when the asset is declared lost.
        await c.query(
          `UPDATE allocations SET status = 'RETURNED', returned_at = now(), return_notes = 'Asset declared lost', received_by = $2
           WHERE asset_id = $1 AND status = 'ACTIVE'`,
          [asset.id, req.user.id]
        );
      }
      const result = await changeAssetStatus(c, { asset, toStatus: req.body.status, actor: req.user, reason: req.body.reason });
      await logActivity(c, {
        actor: req.user, action: `ASSET_${req.body.status}`, entityType: 'asset', entityId: asset.id,
        previousState: { status: asset.status }, newState: { status: req.body.status },
        details: `${asset.name} (${asset.asset_tag}): ${req.body.reason}`,
      });
      return result;
    });
    res.json({ success: true, data: updated });
  })
);

export default router;
