import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AUDIT_ACTIONS } from '../src/lib/audit';
import { prisma } from '../src/lib/prisma';
import {
  createTestUser,
  fetchCsrfToken,
  loginAgent,
  resetDatabase,
  TEST_PASSWORD,
} from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function getCookieHeader(response: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  if (Array.isArray(header)) {
    return header.join('; ');
  }
  return String(header ?? '');
}

describe('GET /api/health', () => {
  it('reports API and database health with security headers', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('up');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CSRF protection', () => {
  it('issues a session-bound token and reuses it within the session', async () => {
    const agent = request.agent(app);

    const first = await agent.get('/api/auth/csrf').expect(200);
    const second = await agent.get('/api/auth/csrf').expect(200);

    expect(first.body.csrfToken).toEqual(expect.any(String));
    expect(first.body.csrfToken.length).toBeGreaterThanOrEqual(32);
    expect(second.body.csrfToken).toBe(first.body.csrfToken);
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'whatever' })
      .expect(403);

    expect(response.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in an active user and returns a safe user DTO', async () => {
    const user = await createTestUser({
      username: 'secretary.one',
      role: UserRole.BARANGAY_SECRETARY,
    });
    const agent = request.agent(app);

    const csrfToken = await fetchCsrfToken(agent);
    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'SECRETARY.ONE', password: TEST_PASSWORD })
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: user.id,
      username: 'secretary.one',
      role: UserRole.BARANGAY_SECRETARY,
      fullName: 'Test User',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.csrfToken).not.toBe(csrfToken);

    const cookie = getCookieHeader(response);
    expect(cookie).toContain('bmis.sid=');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.username).toBe('secretary.one');
    expect(me.body.csrfToken).toEqual(expect.any(String));

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.LOGIN_SUCCESS, actorUserId: user.id },
    });
    expect(audit).not.toBeNull();

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(refreshed.lastLoginAt).not.toBeNull();
    expect(refreshed.failedLoginAttempts).toBe(0);
  });

  it('rejects a wrong password and records the failure', async () => {
    const user = await createTestUser({ username: 'encoder.one' });
    const agent = request.agent(app);

    const result = await loginAgent(agent, 'encoder.one', 'WrongPassword!2026');

    expect(result.status).toBe(401);
    expect(result.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password.',
    });

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(refreshed.failedLoginAttempts).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.LOGIN_FAILED, targetUserId: user.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toContain('invalid_credentials');
  });

  it('does not reveal whether a username exists', async () => {
    const agent = request.agent(app);

    const unknown = await loginAgent(agent, 'ghost.user', 'WrongPassword!2026');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error?.code).toBe('INVALID_CREDENTIALS');

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.LOGIN_FAILED },
    });
    expect(audit?.targetUserId).toBeNull();
  });

  it('refuses an inactive account even with the correct password', async () => {
    await createTestUser({
      username: 'inactive.one',
      status: UserStatus.INACTIVE,
    });
    const agent = request.agent(app);

    const result = await loginAgent(agent, 'inactive.one');

    expect(result.status).toBe(403);
    expect(result.body.error?.code).toBe('ACCOUNT_INACTIVE');

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.LOGIN_BLOCKED_INACTIVE },
    });
    expect(audit).not.toBeNull();
  });

  it('validates the request body', async () => {
    const agent = request.agent(app);
    const csrfToken = await fetchCsrfToken(agent);

    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'someone' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'password' }),
      ]),
    );
  });

  it('locks an account after the configured number of failures', async () => {
    const user = await createTestUser({ username: 'lockout.one' });
    const agent = request.agent(app);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await loginAgent(
        agent,
        'lockout.one',
        'WrongPassword!2026',
      );
      expect(result.status).toBe(401);
    }

    const locked = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(locked.failedLoginAttempts).toBe(3);
    expect(locked.lockedUntil).not.toBeNull();

    const blocked = await loginAgent(agent, 'lockout.one');
    expect(blocked.status).toBe(423);
    expect(blocked.body.error?.code).toBe('ACCOUNT_LOCKED');
    const lockDetails = blocked.body.error?.details as {
      retryAfterSeconds: number;
    };
    expect(lockDetails.retryAfterSeconds).toBeGreaterThan(0);

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.LOGIN_BLOCKED_LOCKED },
    });
    expect(audit).not.toBeNull();
  });

  it('signs in after an expired lock and clears the failure counters', async () => {
    const user = await createTestUser({ username: 'expired.lock' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 3,
        lockedUntil: new Date(Date.now() - 60_000),
      },
    });

    const agent = request.agent(app);
    const result = await loginAgent(agent, 'expired.lock');

    expect(result.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(refreshed.failedLoginAttempts).toBe(0);
    expect(refreshed.lockedUntil).toBeNull();
  });
});

describe('POST /api/auth/logout', () => {
  it('rotates the CSRF token at login and invalidates the previous token', async () => {
    await createTestUser({ username: 'rotate.one' });
    const agent = request.agent(app);

    const preLoginToken = await fetchCsrfToken(agent);
    const login = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', preLoginToken)
      .send({ username: 'rotate.one', password: TEST_PASSWORD })
      .expect(200);

    const postLoginToken = login.body.csrfToken as string;
    expect(postLoginToken).not.toBe(preLoginToken);

    await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', preLoginToken)
      .expect(403);

    await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', postLoginToken)
      .expect(204);

    await agent.get('/api/auth/me').expect(401);

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.LOGOUT },
    });
    expect(audit).not.toBeNull();
  });

  it('returns 204 for an anonymous session', async () => {
    const agent = request.agent(app);
    const csrfToken = await fetchCsrfToken(agent);

    await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', csrfToken)
      .expect(204);
  });
});

describe('session invalidation', () => {
  it('rejects a session whose account has been deactivated', async () => {
    const user = await createTestUser({ username: 'deactivate.me' });
    const agent = request.agent(app);

    await loginAgent(agent, 'deactivate.me');
    await agent.get('/api/auth/me').expect(200);

    await prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.INACTIVE },
    });

    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/dashboard').expect(401);
  });
});

describe('unknown routes', () => {
  it('returns a structured 404 for unknown API routes', async () => {
    const response = await request(app).get('/api/not-a-route').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
