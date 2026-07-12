import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Centralized request validation. Pass zod schemas for any of
 * body / query / params; parsed (and coerced) values replace the originals.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (schemas[key]) {
        const parsed = schemas[key].parse(req[key]);
        if (key === 'query') Object.assign(req.query, parsed);
        else req[key] = parsed;
      }
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const fields = {};
      for (const issue of err.issues) {
        const path = issue.path.join('.') || '_';
        if (!fields[path]) fields[path] = issue.message;
      }
      return next(ApiError.badRequest('Validation failed', fields));
    }
    next(err);
  }
};
