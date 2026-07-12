import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { LEADERSHIP } from '../constants/roles.js';
import { runScheduledJobs } from '../services/scheduler.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/dashboard — role-aware, real-time KPIs in a single round trip.
 * Employees see personal stats; leadership sees organization-wide numbers.
 */
router.get('/', asyncHandler(async (req, res) => {
  await runScheduledJobs();
  const isLeadership = LEADERSHIP.includes(req.user.role);
  const uid = req.user.id;

  const kpiSql = isLeadership
    ? `SELECT
         (SELECT COUNT(*) FROM assets WHERE status = 'AVAILABLE') AS "assetsAvailable",
         (SELECT COUNT(*) FROM assets WHERE status = 'ALLOCATED') AS "assetsAllocated",
         (SELECT COUNT(*) FROM assets WHERE status = 'UNDER_MAINTENANCE') AS "underMaintenance",
         (SELECT COUNT(*) FROM assets) AS "totalAssets",
         (SELECT COUNT(*) FROM bookings WHERE status IN ('UPCOMING','ONGOING')) AS "activeBookings",
         (SELECT COUNT(*) FROM transfers WHERE status = 'REQUESTED') AS "pendingTransfers",
         (SELECT COUNT(*) FROM allocations WHERE status = 'ACTIVE' AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + 7) AS "upcomingReturns",
         (SELECT COUNT(*) FROM allocations WHERE status = 'ACTIVE' AND due_date < CURRENT_DATE) AS "overdueReturns",
         (SELECT COUNT(*) FROM maintenance_requests WHERE status IN ('APPROVED','ASSIGNED','IN_PROGRESS') AND (scheduled_date = CURRENT_DATE OR scheduled_date IS NULL)) AS "maintenanceToday",
         (SELECT COUNT(*) FROM maintenance_requests WHERE status = 'PENDING') AS "pendingMaintenance",
         (SELECT COUNT(*) FROM audits WHERE status = 'IN_PROGRESS') AS "openAudits"`
    : `SELECT
         (SELECT COUNT(*) FROM allocations WHERE allocated_to = $1 AND status = 'ACTIVE') AS "myAssets",
         (SELECT COUNT(*) FROM allocations WHERE allocated_to = $1 AND status = 'ACTIVE' AND due_date < CURRENT_DATE) AS "overdueReturns",
         (SELECT COUNT(*) FROM allocations WHERE allocated_to = $1 AND status = 'ACTIVE' AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + 7) AS "upcomingReturns",
         (SELECT COUNT(*) FROM bookings WHERE booked_by = $1 AND status IN ('UPCOMING','ONGOING')) AS "activeBookings",
         (SELECT COUNT(*) FROM maintenance_requests WHERE requested_by = $1 AND status NOT IN ('RESOLVED','REJECTED')) AS "openMaintenance",
         (SELECT COUNT(*) FROM transfers WHERE (requested_by = $1 OR to_user_id = $1 OR from_user_id = $1) AND status = 'REQUESTED') AS "pendingTransfers"`;

  const [kpis, recentActivity, pendingRequests, statusBreakdown, upcomingBookings] = await Promise.all([
    query(kpiSql, isLeadership ? [] : [uid]),
    query(
      isLeadership
        ? `SELECT al.action, al.entity_type AS "entityType", al.details, al.created_at AS "createdAt",
                  u.full_name AS "actorName", u.avatar_color AS "actorColor", al.actor_role AS "actorRole"
           FROM activity_logs al LEFT JOIN users u ON u.id = al.actor_id
           ORDER BY al.created_at DESC LIMIT 8`
        : `SELECT al.action, al.entity_type AS "entityType", al.details, al.created_at AS "createdAt",
                  u.full_name AS "actorName", u.avatar_color AS "actorColor", al.actor_role AS "actorRole"
           FROM activity_logs al LEFT JOIN users u ON u.id = al.actor_id
           WHERE al.actor_id = $1 ORDER BY al.created_at DESC LIMIT 8`,
      isLeadership ? [] : [uid]
    ),
    isLeadership
      ? query(
          `SELECT 'transfer' AS kind, t.id, a.name AS title, 'Transfer: ' || fu.full_name || ' → ' || tu.full_name AS subtitle, t.created_at AS "createdAt"
           FROM transfers t JOIN assets a ON a.id = t.asset_id
           LEFT JOIN users fu ON fu.id = t.from_user_id JOIN users tu ON tu.id = t.to_user_id
           WHERE t.status = 'REQUESTED'
           UNION ALL
           SELECT 'maintenance', m.id, a.name, 'Maintenance: ' || m.title, m.created_at
           FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id WHERE m.status = 'PENDING'
           ORDER BY "createdAt" DESC LIMIT 6`)
      : query(
          `SELECT 'maintenance' AS kind, m.id, a.name AS title, 'Your request: ' || m.title AS subtitle, m.created_at AS "createdAt"
           FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
           WHERE m.requested_by = $1 AND m.status = 'PENDING'
           ORDER BY m.created_at DESC LIMIT 6`, [uid]),
    isLeadership
      ? query(`SELECT status, COUNT(*)::int AS count FROM assets GROUP BY status ORDER BY count DESC`)
      : Promise.resolve({ rows: [] }),
    query(
      `SELECT b.id, b.purpose, b.start_time AS "startTime", b.end_time AS "endTime",
              a.name AS "assetName", u.full_name AS "bookedByName"
       FROM bookings b JOIN assets a ON a.id = b.asset_id JOIN users u ON u.id = b.booked_by
       WHERE b.status = 'UPCOMING' ${isLeadership ? '' : 'AND b.booked_by = $1'}
       ORDER BY b.start_time ASC LIMIT 5`,
      isLeadership ? [] : [uid]
    ),
  ]);

  res.json({
    success: true,
    data: {
      role: req.user.role,
      kpis: kpis.rows[0],
      recentActivity: recentActivity.rows,
      pendingRequests: pendingRequests.rows,
      statusBreakdown: statusBreakdown.rows,
      upcomingBookings: upcomingBookings.rows,
    },
  });
}));

export default router;
