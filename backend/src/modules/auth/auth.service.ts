import { UserStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';

export type AuthFailureReason = 'invalid_credentials' | 'inactive' | 'locked';

export type AuthenticateResult =
  | { ok: true; user: User }
  | {
      ok: false;
      reason: AuthFailureReason;
      user: User | null;
      attempts?: number;
      justLocked?: boolean;
      retryAfterSeconds?: number;
    };

let dummyPasswordHash: string | undefined;

/**
 * A valid hash used for missing accounts so the response time of an unknown
 * username is comparable to a wrong password. This reduces username
 * enumeration through timing.
 */
function getDummyPasswordHash(): string {
  dummyPasswordHash ??= bcrypt.hashSync('bmis-dummy-password', env.BCRYPT_ROUNDS);
  return dummyPasswordHash;
}

export async function authenticate(
  username: string,
  password: string,
): Promise<AuthenticateResult> {
  const normalizedUsername = username.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });

  if (!user) {
    await bcrypt.compare(password, getDummyPasswordHash());
    return { ok: false, reason: 'invalid_credentials', user: null };
  }

  const now = new Date();

  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: 'locked',
      user,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    const lockExpired =
      user.lockedUntil !== null && user.lockedUntil.getTime() <= now.getTime();
    const previousAttempts = lockExpired ? 0 : user.failedLoginAttempts;
    const attempts = previousAttempts + 1;
    const justLocked = attempts >= env.LOGIN_MAX_ATTEMPTS;
    const lockedUntil = justLocked
      ? new Date(now.getTime() + env.LOGIN_LOCK_MINUTES * 60_000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });

    return {
      ok: false,
      reason: 'invalid_credentials',
      user,
      attempts,
      justLocked,
    };
  }

  if (user.status !== UserStatus.ACTIVE) {
    return { ok: false, reason: 'inactive', user };
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
    },
  });

  return { ok: true, user: updatedUser };
}
