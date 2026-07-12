import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Verifies the Bearer token and attaches the fresh user record to req.user.
 * Reading the user on every request means role changes / deactivation
 * take effect immediately instead of waiting for token expiry.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Session expired or invalid. Please sign in again.');
  }

  const { rows } = await query(
    `SELECT u.id, u.employee_code, u.full_name, u.email, u.role, u.department_id,
            u.designation, u.avatar_color, u.is_active, d.name AS department_name
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id = $1`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw ApiError.unauthorized('Account is inactive or no longer exists');

  req.user = user;
  next();
});

/** Role gate. Usage: authorize('ADMIN', 'ASSET_MANAGER') or authorize(...MANAGERS). */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};
