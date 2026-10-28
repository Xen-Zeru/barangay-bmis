import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ERROR_CODES, AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_TOKEN_BYTES = 32;

/**
 * Returns the session-bound CSRF token, creating it on first use.
 * A token is never placed in a cookie, so a cross-site attacker cannot read it
 * even if the session cookie is sent automatically.
 */
export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
  }
  return req.session.csrfToken;
}

function tokensMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Double-check enforcer for state-changing requests. The browser client sends
 * the token in the X-CSRF-Token header; cross-site forms cannot set it.
 */
export const csrfProtection: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const provided = req.get('x-csrf-token');
  const expected = req.session.csrfToken;

  if (!provided || !expected || !tokensMatch(provided, expected)) {
    next(
      new AppError(
        403,
        ERROR_CODES.CSRF_TOKEN_INVALID,
        'Your security token is missing or expired. Refresh the page and try again.',
      ),
    );
    return;
  }

  next();
};
