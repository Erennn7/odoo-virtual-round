import { ApiError } from '../utils/ApiError.js';

/** Maps PostgreSQL constraint names to human-readable messages. */
const CONSTRAINT_MESSAGES = {
  uq_users_email: 'An account with this email already exists',
  uq_users_employee_code: 'This employee code is already in use',
  uq_departments_name: 'A department with this name already exists',
  uq_departments_code: 'A department with this code already exists',
  uq_categories_name: 'A category with this name already exists',
  uq_categories_code: 'A category with this code already exists',
  uq_assets_tag: 'An asset with this tag already exists',
  uq_assets_serial: 'An asset with this serial number already exists',
  uq_allocations_one_active: 'This asset is already allocated. Request a transfer instead.',
  uq_transfers_one_open: 'There is already an open transfer request for this asset',
  excl_booking_overlap: 'This time slot conflicts with an existing booking for this resource',
  uq_audit_items: 'This asset is already part of the audit',
};

export function notFoundHandler(_req, _res, next) {
  next(ApiError.notFound('API route not found'));
}

/** Central error handler: translates operational + database errors to consistent JSON. */
export function errorHandler(err, _req, res, _next) {
  // PostgreSQL error translation
  if (err.code === '23505' || err.code === '23P01') {
    const message = CONSTRAINT_MESSAGES[err.constraint] || 'A record with these details already exists';
    return res.status(409).json({ success: false, message });
  }
  if (err.code === '23503') {
    return res.status(409).json({ success: false, message: 'Operation blocked: related records depend on this item' });
  }
  if (err.code === '23514' || (err.code === '23000' && err.message?.includes('transition'))) {
    return res.status(422).json({ success: false, message: err.message?.split('\n')[0] || 'Invalid state transition' });
  }
  if (err.isOperational) {
    return res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
}
