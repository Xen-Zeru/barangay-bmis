import session from 'express-session';
import type { SessionData } from 'express-session';
import { prisma } from '../lib/prisma';

type StoreGetCallback = (err: unknown, session?: SessionData | null) => void;
type StoreCallback = (err?: unknown) => void;

/**
 * Database-backed session store so sessions survive API restarts and can be
 * revoked centrally. Expired rows are pruned by a scheduled job in server.ts.
 */
export class PrismaSessionStore extends session.Store {
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number) {
    super();
    this.defaultTtlMs = defaultTtlMs;
  }

  override get(sid: string, callback: StoreGetCallback): void {
    void (async () => {
      try {
        const record = await prisma.session.findUnique({ where: { sid } });

        if (!record) {
          callback(null, null);
          return;
        }

        if (record.expiresAt.getTime() <= Date.now()) {
          await prisma.session.deleteMany({ where: { sid } });
          callback(null, null);
          return;
        }

        callback(null, JSON.parse(record.data) as SessionData);
      } catch (error) {
        callback(error);
      }
    })();
  }

  override set(sid: string, sessionData: SessionData, callback?: StoreCallback): void {
    const expiresAt = this.resolveExpiry(sessionData);
    const data = JSON.stringify(sessionData);

    void prisma.session
      .upsert({
        where: { sid },
        create: { sid, data, expiresAt },
        update: { data, expiresAt },
      })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override destroy(sid: string, callback?: StoreCallback): void {
    void prisma.session
      .deleteMany({ where: { sid } })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override touch(sid: string, sessionData: SessionData, callback?: () => void): void {
    const expiresAt = this.resolveExpiry(sessionData);

    void prisma.session
      .updateMany({ where: { sid }, data: { expiresAt } })
      .then(() => callback?.())
      .catch(() => callback?.());
  }

  async pruneExpired(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  private resolveExpiry(sessionData: SessionData): Date {
    const cookieExpires = sessionData.cookie?.expires;
    if (cookieExpires) {
      return new Date(cookieExpires);
    }

    const maxAge = sessionData.cookie?.originalMaxAge;
    const ttlMs = typeof maxAge === 'number' ? maxAge : this.defaultTtlMs;
    return new Date(Date.now() + ttlMs);
  }
}
