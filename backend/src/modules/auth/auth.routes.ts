import { Router } from 'express';
import { env } from '../../config/env';
import { AUDIT_ACTIONS, auditContext, recordAudit } from '../../lib/audit';
import { AppError, ERROR_CODES } from '../../lib/errors';
import {
  destroySession,
  regenerateSession,
  saveSession,
} from '../../lib/session-helpers';
import { requireAuth, requireUser } from '../../middleware/auth';
import { loginRateLimiter } from '../../middleware/rate-limit';
import { validateBody } from '../../middleware/validate';
import { ensureCsrfToken } from '../../security/csrf';
import { authenticate } from './auth.service';
import { loginSchema } from './auth.schemas';
import type { LoginInput } from './auth.schemas';
import { toUserDto } from './auth.types';

export const authRouter = Router();

authRouter.get('/csrf', (req, res) => {
  res.json({ csrfToken: ensureCsrfToken(req) });
});

authRouter.post(
  '/login',
  loginRateLimiter,
  validateBody(loginSchema),
  async (req, res) => {
    const { username, password } = req.body as LoginInput;
    const context = auditContext(req);
    const result = await authenticate(username, password);

    if (!result.ok) {
      const targetUserId = result.user?.id ?? null;

      if (result.reason === 'locked') {
        await recordAudit({
          action: AUDIT_ACTIONS.LOGIN_BLOCKED_LOCKED,
          targetUserId,
          metadata: { username: username.trim().toLowerCase() },
          ...context,
        });

        throw new AppError(
          423,
          ERROR_CODES.ACCOUNT_LOCKED,
          'This account is temporarily locked after repeated failed sign-in attempts. Please try again later or contact the system administrator.',
          { retryAfterSeconds: result.retryAfterSeconds },
        );
      }

      if (result.reason === 'inactive') {
        await recordAudit({
          action: AUDIT_ACTIONS.LOGIN_BLOCKED_INACTIVE,
          targetUserId,
          metadata: { username: username.trim().toLowerCase() },
          ...context,
        });

        throw new AppError(
          403,
          ERROR_CODES.ACCOUNT_INACTIVE,
          'This account is inactive. Please contact the system administrator.',
        );
      }

      await recordAudit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        targetUserId,
        metadata: {
          username: username.trim().toLowerCase(),
          reason: 'invalid_credentials',
          attempts: result.attempts ?? null,
          accountLocked: result.justLocked ?? false,
        },
        ...context,
      });

      throw new AppError(
        401,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid username or password.',
      );
    }

    const user = result.user;

    await regenerateSession(req);
    req.session.userId = user.id;
    const csrfToken = ensureCsrfToken(req);
    await saveSession(req);

    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      actorUserId: user.id,
      targetUserId: user.id,
      ...context,
    });

    res.json({ user: toUserDto(user), csrfToken });
  },
);

authRouter.post('/logout', async (req, res) => {
  const userId = req.session.userId ?? null;
  const context = auditContext(req);

  if (userId) {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGOUT,
      actorUserId: userId,
      targetUserId: userId,
      ...context,
    });
  }

  await destroySession(req);
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: 'lax',
    path: '/',
  });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = requireUser(req);
  res.json({ user, csrfToken: ensureCsrfToken(req) });
});
