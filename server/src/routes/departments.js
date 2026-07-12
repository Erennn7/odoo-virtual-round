import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';
import { logActivity } from '../services/activityLog.js';

const router = Router();
router.use(requireAuth);

const departmentBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  description: z.string().trim().max(2000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  headId: z.string().uuid().nullable().optional(),
});

/** GET /api/departments — full tree-ready list with stats (any authenticated user) */
router.get('/', asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const { rows } = await query(
    `SELECT d.id, d.name, d.code, d.description, d.parent_id AS "parentId", d.is_active AS "isActive",
            d.head_id AS "headId", h.full_name AS "headName", h.avatar_color AS "headAvatarColor",
            p.name AS "parentName", d.created_at AS "createdAt",
            (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.is_active) AS "memberCount",
            (SELECT COUNT(*) FROM assets a WHERE a.department_id = d.id) AS "assetCount"
     FROM departments d
     LEFT JOIN users h ON h.id = d.head_id
     LEFT JOIN departments p ON p.id = d.parent_id
     ${includeInactive ? '' : 'WHERE d.is_active'}
     ORDER BY d.name`
  );
  res.json({ success: true, data: rows });
}));

/** POST /api/departments — Admin */
router.post('/', authorize(ROLES.ADMIN), validate({ body: departmentBody }), asyncHandler(async (req, res) => {
  const { name, code, description, parentId, headId } = req.body;
  const dept = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO departments (name, code, description, parent_id, head_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, code, description ?? null, parentId ?? null, headId ?? null]
    );
    await logActivity(c, {
      actor: req.user, action: 'DEPARTMENT_CREATED', entityType: 'department', entityId: rows[0].id,
      newState: { name, code, parentId }, details: `Department "${name}" created`,
    });
    return rows[0];
  });
  res.status(201).json({ success: true, data: dept });
}));

/** Detect whether making `parentId` the parent of `id` creates a cycle. */
async function createsCycle(id, parentId) {
  let cursor = parentId;
  for (let depth = 0; cursor && depth < 50; depth += 1) {
    if (cursor === id) return true;
    const { rows } = await query(`SELECT parent_id FROM departments WHERE id = $1`, [cursor]);
    cursor = rows[0]?.parent_id ?? null;
  }
  return false;
}

/** PATCH /api/departments/:id — Admin (rename, re-parent, set head, toggle active) */
router.patch('/:id',
  authorize(ROLES.ADMIN),
  validate({ body: departmentBody.partial().extend({ isActive: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, code, description, parentId, headId, isActive } = req.body;

    if (parentId) {
      if (parentId === id) throw ApiError.badRequest('A department cannot be its own parent');
      if (await createsCycle(id, parentId)) throw ApiError.badRequest('This parent assignment would create a cycle in the hierarchy');
    }

    const dept = await withTransaction(async (c) => {
      const prev = await c.query(`SELECT * FROM departments WHERE id = $1 FOR UPDATE`, [id]);
      if (!prev.rows[0]) throw ApiError.notFound('Department not found');

      if (isActive === false) {
        const kids = await c.query(`SELECT COUNT(*) FROM departments WHERE parent_id = $1 AND is_active`, [id]);
        if (Number(kids.rows[0].count) > 0) throw ApiError.badRequest('Deactivate or move child departments first');
      }

      const { rows } = await c.query(
        `UPDATE departments SET
           name = COALESCE($1, name), code = COALESCE($2, code),
           description = CASE WHEN $3 THEN $4 ELSE description END,
           parent_id = CASE WHEN $5 THEN $6::uuid ELSE parent_id END,
           head_id = CASE WHEN $7 THEN $8::uuid ELSE head_id END,
           is_active = COALESCE($9, is_active)
         WHERE id = $10 RETURNING *`,
        [name ?? null, code ?? null, description !== undefined, description ?? null,
         parentId !== undefined, parentId ?? null, headId !== undefined, headId ?? null,
         isActive ?? null, id]
      );
      await logActivity(c, {
        actor: req.user, action: isActive === false ? 'DEPARTMENT_DEACTIVATED' : 'DEPARTMENT_UPDATED',
        entityType: 'department', entityId: id,
        previousState: { name: prev.rows[0].name, isActive: prev.rows[0].is_active, parentId: prev.rows[0].parent_id },
        newState: { name: rows[0].name, isActive: rows[0].is_active, parentId: rows[0].parent_id },
        details: `Department "${rows[0].name}" updated`,
      });
      return rows[0];
    });
    res.json({ success: true, data: dept });
  })
);

export default router;
