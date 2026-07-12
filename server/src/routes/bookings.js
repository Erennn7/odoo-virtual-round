import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { MANAGERS, LEADERSHIP } from '../constants/roles.js';
import { getPagination, WhereBuilder, paginated } from '../utils/queryHelpers.js';
import { logActivity } from '../services/activityLog.js';
import { notifyUser } from '../services/notificationService.js';
import { runScheduledJobs } from '../services/scheduler.js';

const router = Router();
router.use(requireAuth);

const bookingTimes = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
}).refine((b) => b.endTime > b.startTime, { message: 'End time must be after start time', path: ['endTime'] });

const BOOKING_COLS = `
  b.id, b.purpose, b.start_time AS "startTime", b.end_time AS "endTime", b.status,
         b.attendees, b.cancel_reason AS "cancelReason", b.created_at AS "createdAt",
         a.id AS "assetId", a.name AS "assetName", a.asset_tag AS "assetTag", a.location,
         c.name AS "categoryName",
         u.id AS "bookedById", u.full_name AS "bookedByName", u.avatar_color AS "bookedByColor"`;

const BOOKING_FROM = `
  FROM bookings b
  JOIN assets a ON a.id = b.asset_id
  JOIN asset_categories c ON c.id = a.category_id
  JOIN users u ON u.id = b.booked_by`;

/** GET /api/bookings — list (mine by default for employees; all for leadership) */
router.get('/', asyncHandler(async (req, res) => {
  await runScheduledJobs(); // keep statuses fresh on read
  const pg = getPagination(req.query, { limit: 20 });
  const wb = new WhereBuilder();
  const mine = req.query.mine === 'true' || !LEADERSHIP.includes(req.user.role) && req.query.assetId === undefined;
  if (mine && !req.query.assetId) wb.add(`b.booked_by = ?`, req.user.id);
  if (req.query.assetId) wb.add(`b.asset_id = ?`, req.query.assetId);
  if (req.query.status) wb.add(`b.status = ?`, req.query.status);
  if (req.query.from) wb.add(`b.end_time >= ?`, new Date(req.query.from));
  if (req.query.to) wb.add(`b.start_time <= ?`, new Date(req.query.to));
  if (req.query.search) wb.add(`(a.name ILIKE ? OR b.purpose ILIKE ?)`, `%${req.query.search}%`, `%${req.query.search}%`);

  const { rows } = await query(
    `SELECT ${BOOKING_COLS}, COUNT(*) OVER() AS total ${BOOKING_FROM}
     ${wb.clause} ORDER BY b.start_time ${req.query.from || req.query.assetId ? 'ASC' : 'DESC'}
     LIMIT ${wb.next(pg.limit)} OFFSET ${wb.next(pg.offset)}`,
    wb.params
  );
  res.json(paginated(rows.map(({ total, ...r }) => r), rows[0]?.total ?? 0, pg));
}));

/** GET /api/bookings/resources — bookable assets with their next bookings (for the calendar) */
router.get('/resources', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.name, a.asset_tag AS "assetTag", a.location, c.name AS "categoryName", a.status,
            (SELECT COUNT(*) FROM bookings b WHERE b.asset_id = a.id AND b.status IN ('UPCOMING','ONGOING')) AS "upcomingCount"
     FROM assets a JOIN asset_categories c ON c.id = a.category_id
     WHERE a.is_bookable AND a.status NOT IN ('RETIRED','DISPOSED','LOST')
     ORDER BY c.name, a.name`
  );
  res.json({ success: true, data: rows });
}));

/**
 * POST /api/bookings — create. Overlaps rejected (DB exclusion constraint is the
 * final arbiter); adjacent bookings allowed via half-open ranges.
 */
router.post('/',
  validate({
    body: z.object({
      assetId: z.string().uuid('Select a resource'),
      purpose: z.string().trim().min(3, 'Purpose is required').max(500),
      attendees: z.coerce.number().int().positive().nullable().optional(),
    }).and(bookingTimes),
  }),
  asyncHandler(async (req, res) => {
    const { assetId, purpose, startTime, endTime, attendees } = req.body;
    if (startTime < new Date()) throw ApiError.badRequest('Bookings cannot start in the past');

    const booking = await withTransaction(async (c) => {
      const asset = await c.query(`SELECT * FROM assets WHERE id = $1 FOR UPDATE`, [assetId]);
      if (!asset.rows[0]) throw ApiError.notFound('Resource not found');
      if (!asset.rows[0].is_bookable) throw ApiError.badRequest('This asset is not a bookable resource');
      if (['RETIRED', 'DISPOSED', 'LOST'].includes(asset.rows[0].status)) {
        throw ApiError.badRequest('This resource is no longer available for booking');
      }

      // Friendly pre-check (the exclusion constraint still guarantees correctness under races).
      const clash = await c.query(
        `SELECT b.start_time, b.end_time, u.full_name FROM bookings b JOIN users u ON u.id = b.booked_by
         WHERE b.asset_id = $1 AND b.status <> 'CANCELLED'
           AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange($2, $3, '[)')
         LIMIT 1`,
        [assetId, startTime, endTime]
      );
      if (clash.rows[0]) {
        throw ApiError.conflict(
          `Conflicts with ${clash.rows[0].full_name}'s booking (${new Date(clash.rows[0].start_time).toLocaleString()} – ${new Date(clash.rows[0].end_time).toLocaleTimeString()})`
        );
      }

      const { rows } = await c.query(
        `INSERT INTO bookings (asset_id, booked_by, purpose, start_time, end_time, attendees)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [assetId, req.user.id, purpose, startTime, endTime, attendees ?? null]
      );
      await logActivity(c, {
        actor: req.user, action: 'BOOKING_CREATED', entityType: 'booking', entityId: rows[0].id,
        newState: { asset: asset.rows[0].name, startTime, endTime },
        details: `Booked ${asset.rows[0].name} (${asset.rows[0].asset_tag})`,
      });
      await notifyUser(c, req.user.id, {
        type: 'BOOKING', title: 'Booking confirmed',
        message: `${asset.rows[0].name} is booked for you on ${startTime.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`,
        link: '/bookings',
      });
      return rows[0];
    });
    res.status(201).json({ success: true, data: booking });
  })
);

/** PATCH /api/bookings/:id — reschedule (owner or managers), revalidates overlap */
router.patch('/:id',
  validate({ body: bookingTimes.and(z.object({ purpose: z.string().trim().min(3).max(500).optional() })) }),
  asyncHandler(async (req, res) => {
    const { startTime, endTime, purpose } = req.body;
    const booking = await withTransaction(async (c) => {
      const found = await c.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const b = found.rows[0];
      if (!b) throw ApiError.notFound('Booking not found');
      if (b.booked_by !== req.user.id && !MANAGERS.includes(req.user.role)) throw ApiError.forbidden();
      if (!['UPCOMING'].includes(b.status)) throw ApiError.badRequest('Only upcoming bookings can be rescheduled');
      if (startTime < new Date()) throw ApiError.badRequest('Bookings cannot start in the past');

      const { rows } = await c.query(
        `UPDATE bookings SET start_time = $1, end_time = $2, purpose = COALESCE($3, purpose), reminder_sent = FALSE
         WHERE id = $4 RETURNING *`,
        [startTime, endTime, purpose ?? null, req.params.id]
      );
      await logActivity(c, {
        actor: req.user, action: 'BOOKING_RESCHEDULED', entityType: 'booking', entityId: req.params.id,
        previousState: { startTime: b.start_time, endTime: b.end_time },
        newState: { startTime, endTime },
        details: 'Booking rescheduled',
      });
      return rows[0];
    });
    res.json({ success: true, data: booking });
  })
);

/** POST /api/bookings/:id/cancel — owner or managers */
router.post('/:id/cancel',
  validate({ body: z.object({ reason: z.string().trim().max(500).nullable().optional() }) }),
  asyncHandler(async (req, res) => {
    const booking = await withTransaction(async (c) => {
      const found = await c.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const b = found.rows[0];
      if (!b) throw ApiError.notFound('Booking not found');
      if (b.booked_by !== req.user.id && !MANAGERS.includes(req.user.role)) throw ApiError.forbidden();
      if (!['UPCOMING', 'ONGOING'].includes(b.status)) throw ApiError.badRequest('This booking cannot be cancelled');

      const { rows } = await c.query(
        `UPDATE bookings SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = $1
         WHERE id = $2 RETURNING *`,
        [req.body.reason ?? null, req.params.id]
      );
      await logActivity(c, {
        actor: req.user, action: 'BOOKING_CANCELLED', entityType: 'booking', entityId: req.params.id,
        previousState: { status: b.status }, newState: { status: 'CANCELLED' },
        details: req.body.reason ?? 'Booking cancelled',
      });
      if (b.booked_by !== req.user.id) {
        await notifyUser(c, b.booked_by, {
          type: 'BOOKING', title: 'Booking cancelled',
          message: `Your booking was cancelled by ${req.user.full_name}${req.body.reason ? `: ${req.body.reason}` : '.'}`,
          link: '/bookings',
        });
      }
      return rows[0];
    });
    res.json({ success: true, data: booking });
  })
);

export default router;
