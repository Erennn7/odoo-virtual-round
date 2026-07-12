import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { MANAGERS } from '../constants/roles.js';
import { logActivity } from '../services/activityLog.js';

const router = Router();
router.use(requireAuth);

const categoryBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  description: z.string().trim().max(2000).nullable().optional(),
  expectedLifespanMonths: z.coerce.number().int().positive().nullable().optional(),
  isBookableDefault: z.boolean().optional(),
});

/** GET /api/categories */
router.get('/', asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const { rows } = await query(
    `SELECT c.id, c.name, c.code, c.description, c.is_active AS "isActive",
            c.expected_lifespan_months AS "expectedLifespanMonths",
            c.is_bookable_default AS "isBookableDefault", c.created_at AS "createdAt",
            COUNT(a.id) AS "assetCount",
            COUNT(a.id) FILTER (WHERE a.status = 'AVAILABLE') AS "availableCount"
     FROM asset_categories c LEFT JOIN assets a ON a.category_id = c.id
     ${includeInactive ? '' : 'WHERE c.is_active'}
     GROUP BY c.id ORDER BY c.name`
  );
  res.json({ success: true, data: rows });
}));

/** POST /api/categories — Admin / Asset Manager */
router.post('/', authorize(...MANAGERS), validate({ body: categoryBody }), asyncHandler(async (req, res) => {
  const { name, code, description, expectedLifespanMonths, isBookableDefault } = req.body;
  const cat = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO asset_categories (name, code, description, expected_lifespan_months, is_bookable_default)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, code, description ?? null, expectedLifespanMonths ?? null, isBookableDefault ?? false]
    );
    await logActivity(c, {
      actor: req.user, action: 'CATEGORY_CREATED', entityType: 'category', entityId: rows[0].id,
      newState: { name, code }, details: `Category "${name}" created`,
    });
    return rows[0];
  });
  res.status(201).json({ success: true, data: cat });
}));

/** PATCH /api/categories/:id — Admin / Asset Manager */
router.patch('/:id',
  authorize(...MANAGERS),
  validate({ body: categoryBody.partial().extend({ isActive: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const { name, code, description, expectedLifespanMonths, isBookableDefault, isActive } = req.body;
    const cat = await withTransaction(async (c) => {
      const prev = await c.query(`SELECT * FROM asset_categories WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!prev.rows[0]) throw ApiError.notFound('Category not found');
      const { rows } = await c.query(
        `UPDATE asset_categories SET
           name = COALESCE($1, name), code = COALESCE($2, code),
           description = CASE WHEN $3 THEN $4 ELSE description END,
           expected_lifespan_months = CASE WHEN $5 THEN $6 ELSE expected_lifespan_months END,
           is_bookable_default = COALESCE($7, is_bookable_default),
           is_active = COALESCE($8, is_active)
         WHERE id = $9 RETURNING *`,
        [name ?? null, code ?? null, description !== undefined, description ?? null,
         expectedLifespanMonths !== undefined, expectedLifespanMonths ?? null,
         isBookableDefault ?? null, isActive ?? null, req.params.id]
      );
      await logActivity(c, {
        actor: req.user, action: 'CATEGORY_UPDATED', entityType: 'category', entityId: req.params.id,
        previousState: { name: prev.rows[0].name, isActive: prev.rows[0].is_active },
        newState: { name: rows[0].name, isActive: rows[0].is_active },
        details: `Category "${rows[0].name}" updated`,
      });
      return rows[0];
    });
    res.json({ success: true, data: cat });
  })
);

export default router;
