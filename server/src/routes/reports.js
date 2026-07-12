import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, authorize } from '../middleware/auth.js';
import { LEADERSHIP } from '../constants/roles.js';

const router = Router();
router.use(requireAuth, authorize(...LEADERSHIP));

/** Convert a result set to CSV for export. */
function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

/** Wraps a report query: JSON by default, CSV when ?format=csv. */
const report = (name, sql, params = []) => asyncHandler(async (req, res) => {
  const { rows } = await query(sql, params);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(toCsv(rows));
  }
  res.json({ success: true, data: rows });
});

/** Utilization: allocation rate per category. */
router.get('/utilization', report('utilization',
  `SELECT c.name AS category,
          COUNT(a.id)::int AS total,
          COUNT(a.id) FILTER (WHERE a.status = 'ALLOCATED')::int AS allocated,
          COUNT(a.id) FILTER (WHERE a.status = 'AVAILABLE')::int AS available,
          COUNT(a.id) FILTER (WHERE a.status = 'UNDER_MAINTENANCE')::int AS "underMaintenance",
          ROUND(100.0 * COUNT(a.id) FILTER (WHERE a.status = 'ALLOCATED') / NULLIF(COUNT(a.id), 0), 1)::float AS "utilizationPct"
   FROM asset_categories c LEFT JOIN assets a ON a.category_id = c.id
   GROUP BY c.name HAVING COUNT(a.id) > 0 ORDER BY "utilizationPct" DESC NULLS LAST`));

/** Most used assets: allocation + booking counts. */
router.get('/most-used', report('most-used-assets',
  `SELECT a.name, a.asset_tag AS "assetTag", c.name AS category,
          (SELECT COUNT(*) FROM allocations al WHERE al.asset_id = a.id)::int AS "allocationCount",
          (SELECT COUNT(*) FROM bookings b WHERE b.asset_id = a.id AND b.status <> 'CANCELLED')::int AS "bookingCount",
          (SELECT COUNT(*) FROM allocations al WHERE al.asset_id = a.id)
            + (SELECT COUNT(*) FROM bookings b WHERE b.asset_id = a.id AND b.status <> 'CANCELLED') AS "totalUsage"
   FROM assets a JOIN asset_categories c ON c.id = a.category_id
   ORDER BY "totalUsage" DESC LIMIT 15`));

/** Idle assets: available and never/rarely used recently. */
router.get('/idle', report('idle-assets',
  `SELECT a.name, a.asset_tag AS "assetTag", c.name AS category, a.status, a.location,
          COALESCE(MAX(al.returned_at)::text, 'never used') AS "lastUsed",
          EXTRACT(DAY FROM now() - COALESCE(MAX(al.returned_at), a.created_at))::int AS "idleDays"
   FROM assets a JOIN asset_categories c ON c.id = a.category_id
   LEFT JOIN allocations al ON al.asset_id = a.id
   WHERE a.status = 'AVAILABLE'
   GROUP BY a.id, c.name
   HAVING NOT EXISTS (SELECT 1 FROM allocations x WHERE x.asset_id = a.id AND x.status = 'ACTIVE')
   ORDER BY "idleDays" DESC LIMIT 20`));

/** Maintenance frequency + cost per asset. */
router.get('/maintenance-frequency', report('maintenance-frequency',
  `SELECT a.name, a.asset_tag AS "assetTag", c.name AS category,
          COUNT(m.id)::int AS "requestCount",
          COUNT(m.id) FILTER (WHERE m.status = 'RESOLVED')::int AS resolved,
          COALESCE(SUM(m.cost), 0)::float AS "totalCost"
   FROM assets a JOIN asset_categories c ON c.id = a.category_id
   JOIN maintenance_requests m ON m.asset_id = a.id
   GROUP BY a.id, c.name ORDER BY "requestCount" DESC, "totalCost" DESC LIMIT 15`));

/** Department allocation summary. */
router.get('/department-summary', report('department-summary',
  `SELECT d.name AS department,
          COUNT(DISTINCT a.id)::int AS "totalAssets",
          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'ALLOCATED')::int AS allocated,
          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'AVAILABLE')::int AS available,
          COUNT(DISTINCT u.id)::int AS employees,
          COALESCE(SUM(a.purchase_cost), 0)::float AS "totalValue"
   FROM departments d
   LEFT JOIN assets a ON a.department_id = d.id
   LEFT JOIN users u ON u.department_id = d.id AND u.is_active
   WHERE d.is_active
   GROUP BY d.name ORDER BY "totalAssets" DESC`));

/** Booking heatmap: bookings per weekday × hour over the last 90 days + future. */
router.get('/booking-heatmap', report('booking-heatmap',
  `SELECT EXTRACT(ISODOW FROM start_time)::int AS weekday,
          EXTRACT(HOUR FROM start_time)::int AS hour,
          COUNT(*)::int AS bookings
   FROM bookings
   WHERE status <> 'CANCELLED' AND start_time > now() - interval '90 days'
   GROUP BY 1, 2 ORDER BY 1, 2`));

/** Assets nearing retirement (>= 80% of category expected lifespan elapsed). */
router.get('/nearing-retirement', report('nearing-retirement',
  `SELECT a.name, a.asset_tag AS "assetTag", c.name AS category, a.purchase_date AS "purchaseDate",
          c.expected_lifespan_months AS "lifespanMonths",
          ROUND(EXTRACT(EPOCH FROM (now() - a.purchase_date::timestamptz)) / 2629800)::int AS "ageMonths",
          ROUND(100.0 * EXTRACT(EPOCH FROM (now() - a.purchase_date::timestamptz)) / 2629800 / c.expected_lifespan_months, 1)::float AS "lifeUsedPct"
   FROM assets a JOIN asset_categories c ON c.id = a.category_id
   WHERE a.purchase_date IS NOT NULL AND c.expected_lifespan_months IS NOT NULL
     AND a.status NOT IN ('RETIRED','DISPOSED')
     AND EXTRACT(EPOCH FROM (now() - a.purchase_date::timestamptz)) / 2629800 >= 0.8 * c.expected_lifespan_months
   ORDER BY "lifeUsedPct" DESC`));

/** Assets due for maintenance (open requests + warranty expiring within 60 days). */
router.get('/maintenance-due', report('maintenance-due',
  `SELECT a.name, a.asset_tag AS "assetTag", m.title, m.priority, m.status,
          m.scheduled_date AS "scheduledDate", m.technician_name AS "technicianName"
   FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
   WHERE m.status IN ('PENDING','APPROVED','ASSIGNED','IN_PROGRESS')
   ORDER BY CASE m.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`));

/** Overdue returns. */
router.get('/overdue-returns', report('overdue-returns',
  `SELECT a.name AS asset, a.asset_tag AS "assetTag", u.full_name AS holder, d.name AS department,
          al.due_date AS "dueDate", (CURRENT_DATE - al.due_date)::int AS "daysOverdue"
   FROM allocations al
   JOIN assets a ON a.id = al.asset_id
   JOIN users u ON u.id = al.allocated_to
   LEFT JOIN departments d ON d.id = u.department_id
   WHERE al.status = 'ACTIVE' AND al.due_date < CURRENT_DATE
   ORDER BY "daysOverdue" DESC`));

/** Audit summary across cycles. */
router.get('/audit-summary', report('audit-summary',
  `SELECT au.name, au.status, au.closed_at AS "closedAt",
          COUNT(ai.id)::int AS "totalItems",
          COUNT(ai.id) FILTER (WHERE ai.verification = 'VERIFIED')::int AS verified,
          COUNT(ai.id) FILTER (WHERE ai.verification = 'MISSING')::int AS missing,
          COUNT(ai.id) FILTER (WHERE ai.verification = 'DAMAGED')::int AS damaged,
          ROUND(100.0 * COUNT(ai.id) FILTER (WHERE ai.verification = 'VERIFIED') / NULLIF(COUNT(ai.id), 0), 1)::float AS "verifiedPct"
   FROM audits au LEFT JOIN audit_items ai ON ai.audit_id = au.id
   GROUP BY au.id ORDER BY au.created_at DESC`));

export default router;
