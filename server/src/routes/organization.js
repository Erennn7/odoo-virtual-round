import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';
import { logActivity } from '../services/activityLog.js';

const router = Router();
router.use(requireAuth);

/** GET /api/organization */
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT name, legal_name AS "legalName", email, phone, address, city, country,
            timezone, currency, logo_url AS "logoUrl", asset_tag_prefix AS "assetTagPrefix"
     FROM organization WHERE id = 1`
  );
  res.json({ success: true, data: rows[0] ?? null });
}));

/** PUT /api/organization — Admin only (upsert single row) */
router.put('/',
  authorize(ROLES.ADMIN),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(150),
      legalName: z.string().trim().max(200).nullable().optional(),
      email: z.string().trim().email().nullable().optional().or(z.literal('').transform(() => null)),
      phone: z.string().trim().max(30).nullable().optional(),
      address: z.string().trim().max(500).nullable().optional(),
      city: z.string().trim().max(100).nullable().optional(),
      country: z.string().trim().max(100).nullable().optional(),
      timezone: z.string().trim().max(60).optional(),
      currency: z.string().trim().max(10).optional(),
      assetTagPrefix: z.string().trim().min(1).max(10).transform((s) => s.toUpperCase()).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const org = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO organization (id, name, legal_name, email, phone, address, city, country, timezone, currency, asset_tag_prefix)
         VALUES (1,$1,$2,$3,$4,$5,$6,$7,COALESCE($8,'UTC'),COALESCE($9,'USD'),COALESCE($10,'AST'))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, legal_name = EXCLUDED.legal_name, email = EXCLUDED.email,
           phone = EXCLUDED.phone, address = EXCLUDED.address, city = EXCLUDED.city,
           country = EXCLUDED.country, timezone = EXCLUDED.timezone, currency = EXCLUDED.currency,
           asset_tag_prefix = EXCLUDED.asset_tag_prefix
         RETURNING *`,
        [b.name, b.legalName ?? null, b.email ?? null, b.phone ?? null, b.address ?? null,
         b.city ?? null, b.country ?? null, b.timezone ?? null, b.currency ?? null, b.assetTagPrefix ?? null]
      );
      await logActivity(c, {
        actor: req.user, action: 'ORG_UPDATED', entityType: 'organization', entityId: '1',
        newState: { name: b.name }, details: 'Organization profile updated',
      });
      return rows[0];
    });
    res.json({ success: true, data: org });
  })
);

export default router;
