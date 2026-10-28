import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const skip = (): boolean => env.RATE_LIMIT_DISABLED;

const rateLimitedBody = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please wait a moment and try again.',
  },
};

/**
 * Coarse protection for the whole API. The in-memory store is fine for a
 * single-instance barangay deployment; move to a shared store if the API is
 * ever scaled horizontally.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: rateLimitedBody,
});

/** Stricter limit for credential endpoints to slow down online guessing. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: rateLimitedBody,
});
