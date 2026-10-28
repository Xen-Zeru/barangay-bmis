import { UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AUDIT_ACTIONS } from '../src/lib/audit';
import { prisma } from '../src/lib/prisma';
import {
  createTestUser,
  loginAgent,
  resetDatabase,
} from './helpers';
import type { Agent } from './helpers';

const app = createApp();

interface TestSession {
  agent: Agent;
  csrfToken: string;
  userId: string;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signIn(username: string, role: UserRole): Promise<TestSession> {
  const user = await createTestUser({ username, role });
  const agent = request.agent(app);
  const result = await loginAgent(agent, username);
  expect(result.status).toBe(200);
  return { agent, csrfToken: result.csrfToken, userId: user.id };
}

function createPurok(
  session: TestSession,
  overrides: Record<string, unknown> = {},
) {
  return session.agent
    .post('/api/puroks')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: 'P-01', name: 'Purok 1', ...overrides });
}

describe('Purok management', () => {
  it('creates Puroks, normalizes identity fields, and records audit', async () => {
    const secretary = await signIn(
      'secretary.purok.create',
      UserRole.BARANGAY_SECRETARY,
    );

    const created = await createPurok(secretary, {
      code: 'p-01',
      name: '  Purok   One  ',
    }).expect(201);

    expect(created.body).toMatchObject({
      code: 'P-01',
      name: 'Purok One',
      status: 'ACTIVE',
      version: 1,
      householdCount: 0,
      activeHouseholdCount: 0,
    });

    const second = await createPurok(secretary, {
      code: 'P-02',
      name: 'Purok Two',
    }).expect(201);

    const list = await secretary.agent.get('/api/puroks').expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.map((item: { code: string }) => item.code)).toEqual([
      'P-01',
      'P-02',
    ]);

    const detail = await secretary.agent
      .get(`/api/puroks/${second.body.id}`)
      .expect(200);
    expect(detail.body.name).toBe('Purok Two');

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.PUROK_CREATED,
        entityId: created.body.id,
      },
    });
    expect(audit?.actorUserId).toBe(secretary.userId);
  });

  it('enforces unique codes and normalized names', async () => {
    const secretary = await signIn(
      'secretary.purok.unique',
      UserRole.BARANGAY_SECRETARY,
    );
    await createPurok(secretary).expect(201);

    const duplicateCode = await createPurok(secretary, {
      code: 'P-01',
      name: 'Different Name',
    }).expect(409);
    expect(duplicateCode.body.error.code).toBe('PUROK_CODE_TAKEN');

    const duplicateName = await createPurok(secretary, {
      code: 'P-02',
      name: 'purok   1',
    }).expect(409);
    expect(duplicateName.body.error.code).toBe('PUROK_NAME_TAKEN');
  });

  it('updates with optimistic versions and rejects stale writes', async () => {
    const secretary = await signIn(
      'secretary.purok.update',
      UserRole.BARANGAY_SECRETARY,
    );
    const created = await createPurok(secretary).expect(201);

    const updated = await secretary.agent
      .patch(`/api/puroks/${created.body.id}`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({ name: 'Purok Uno', version: created.body.version })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Purok Uno', version: 2 });

    const stale = await secretary.agent
      .patch(`/api/puroks/${created.body.id}`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({ name: 'Purok One Again', version: created.body.version })
      .expect(409);
    expect(stale.body.error.code).toBe('STALE_PUROK');

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.PUROK_UPDATED,
        entityId: created.body.id,
      },
    });
    expect(audit?.metadata).toContain('Purok Uno');
  });

  it('blocks deactivation while active households remain and supports reactivation', async () => {
    const secretary = await signIn(
      'secretary.purok.status',
      UserRole.BARANGAY_SECRETARY,
    );
    const created = await createPurok(secretary).expect(201);

    await prisma.household.create({
      data: {
        householdNumber: 'HH-2026-000001',
        purokId: created.body.id,
        addressLine: 'Synthetic address',
      },
    });

    const blocked = await secretary.agent
      .patch(`/api/puroks/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'INACTIVE',
        reason: 'Testing active household protection',
        version: created.body.version,
      })
      .expect(409);
    expect(blocked.body.error.code).toBe('PUROK_IN_USE');

    await prisma.household.updateMany({
      where: { purokId: created.body.id },
      data: { status: 'INACTIVE', statusChangedAt: new Date() },
    });

    const inactive = await secretary.agent
      .patch(`/api/puroks/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'INACTIVE',
        reason: 'No active households remain',
        version: created.body.version,
      })
      .expect(200);
    expect(inactive.body).toMatchObject({ status: 'INACTIVE', version: 2 });

    const active = await secretary.agent
      .patch(`/api/puroks/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'ACTIVE',
        reason: 'Purok is needed again',
        version: inactive.body.version,
      })
      .expect(200);
    expect(active.body).toMatchObject({ status: 'ACTIVE', version: 3 });
  });

  it('applies the Purok role matrix', async () => {
    const secretary = await signIn(
      'secretary.purok.rbac',
      UserRole.BARANGAY_SECRETARY,
    );
    const created = await createPurok(secretary).expect(201);

    const encoder = await signIn('encoder.purok', UserRole.BARANGAY_ENCODER);
    await encoder.agent.get('/api/puroks').expect(200);
    await createPurok(encoder, { code: 'P-02', name: 'Purok 2' }).expect(403);

    const captain = await signIn('captain.purok', UserRole.BARANGAY_CAPTAIN);
    await captain.agent.get('/api/puroks').expect(200);
    await captain.agent
      .patch(`/api/puroks/${created.body.id}`)
      .set('X-CSRF-Token', captain.csrfToken)
      .send({ name: 'Captain Rename', version: created.body.version })
      .expect(403);

    const admin = await signIn('admin.purok', UserRole.SYSTEM_ADMIN);
    await admin.agent.get('/api/puroks').expect(403);

    await request(app).get('/api/puroks').expect(401);
  });
});
