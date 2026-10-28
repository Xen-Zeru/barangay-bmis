import type { SessionData } from 'express-session';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { sessionStore } from '../src/middleware/session';
import { resetDatabase } from './helpers';

function sessionData(ttlMs = 60_000): SessionData {
  return {
    cookie: {
      originalMaxAge: ttlMs,
      expires: new Date(Date.now() + ttlMs),
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    },
    userId: 'test-user-id',
    csrfToken: 'test-csrf-token',
  };
}

function storeGet(sid: string): Promise<SessionData | null> {
  return new Promise((resolve, reject) => {
    sessionStore.get(sid, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data ?? null);
    });
  });
}

function storeSet(sid: string, data: SessionData): Promise<void> {
  return new Promise((resolve, reject) => {
    sessionStore.set(sid, data, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function storeDestroy(sid: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sessionStore.destroy(sid, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PrismaSessionStore', () => {
  it('persists, reads, and destroys a session', async () => {
    const sid = 'session-round-trip';

    await storeSet(sid, sessionData());
    const loaded = await storeGet(sid);

    expect(loaded?.userId).toBe('test-user-id');
    expect(loaded?.csrfToken).toBe('test-csrf-token');

    await storeDestroy(sid);
    expect(await storeGet(sid)).toBeNull();
  });

  it('ignores and removes an expired session', async () => {
    const sid = 'session-expired';
    await storeSet(sid, sessionData());

    await prisma.session.update({
      where: { sid },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect(await storeGet(sid)).toBeNull();

    const row = await prisma.session.findUnique({ where: { sid } });
    expect(row).toBeNull();
  });

  it('prunes expired sessions', async () => {
    await storeSet('session-live', sessionData());
    await storeSet('session-stale', sessionData());

    await prisma.session.update({
      where: { sid: 'session-stale' },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const pruned = await sessionStore.pruneExpired();
    expect(pruned).toBe(1);

    const remaining = await prisma.session.findMany();
    expect(remaining.map((row) => row.sid)).toEqual(['session-live']);
  });
});
