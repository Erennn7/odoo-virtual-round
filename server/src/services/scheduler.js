import { pool } from '../config/db.js';

/**
 * Lightweight background jobs (run at boot and every 5 minutes):
 * 1. Advance booking statuses (UPCOMING → ONGOING → COMPLETED) by clock time.
 * 2. Send booking reminders ~60 minutes before start.
 * 3. Detect overdue returns and notify holder + managers exactly once.
 */
export async function runScheduledJobs() {
  try {
    await pool.query(
      `UPDATE bookings SET status = 'ONGOING'
       WHERE status = 'UPCOMING' AND start_time <= now() AND end_time > now()`
    );
    await pool.query(
      `UPDATE bookings SET status = 'COMPLETED'
       WHERE status IN ('UPCOMING','ONGOING') AND end_time <= now()`
    );

    await pool.query(
      `WITH due AS (
         SELECT b.id, b.booked_by, a.name AS asset_name, b.start_time
         FROM bookings b JOIN assets a ON a.id = b.asset_id
         WHERE b.status = 'UPCOMING' AND NOT b.reminder_sent
           AND b.start_time <= now() + interval '60 minutes' AND b.start_time > now()
       ), marked AS (
         UPDATE bookings SET reminder_sent = TRUE WHERE id IN (SELECT id FROM due) RETURNING id
       )
       INSERT INTO notifications (user_id, type, title, message, link)
       SELECT booked_by, 'BOOKING', 'Upcoming booking reminder',
              asset_name || ' is booked at ' || to_char(start_time, 'HH24:MI') || ' — starting soon.',
              '/bookings'
       FROM due`
    );

    await pool.query(
      `WITH overdue AS (
         SELECT al.id, al.allocated_to, u.full_name, a.name AS asset_name, a.asset_tag, al.due_date
         FROM allocations al
         JOIN assets a ON a.id = al.asset_id
         JOIN users u ON u.id = al.allocated_to
         WHERE al.status = 'ACTIVE' AND al.due_date < CURRENT_DATE AND NOT al.overdue_notified
       ), marked AS (
         UPDATE allocations SET overdue_notified = TRUE WHERE id IN (SELECT id FROM overdue) RETURNING id
       ), holder_note AS (
         INSERT INTO notifications (user_id, type, title, message, link)
         SELECT allocated_to, 'OVERDUE', 'Return overdue',
                'Your return of ' || asset_name || ' (' || asset_tag || ') was due on ' || to_char(due_date, 'DD Mon YYYY') || '.',
                '/my-assets'
         FROM overdue RETURNING id
       )
       INSERT INTO notifications (user_id, type, title, message, link)
       SELECT u.id, 'OVERDUE', 'Overdue return detected',
              o.asset_name || ' (' || o.asset_tag || ') held by ' || o.full_name || ' is overdue since ' || to_char(o.due_date, 'DD Mon YYYY') || '.',
              '/allocations'
       FROM overdue o CROSS JOIN users u
       WHERE u.role IN ('ADMIN','ASSET_MANAGER') AND u.is_active`
    );
  } catch (err) {
    console.error('Scheduled job error:', err.message);
  }
}

export function startScheduler() {
  runScheduledJobs();
  setInterval(runScheduledJobs, 5 * 60 * 1000).unref();
}
