import { Sex, UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
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

let residentSequence = 0;

function createResident(
  session: TestSession,
  overrides: Record<string, unknown> = {},
) {
  residentSequence += 1;
  return session.agent
    .post('/api/residents')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      firstName: 'Concurrent',
      middleName: null,
      lastName: `Resident${String.fromCharCode(65 + (residentSequence % 26))}`,
      suffix: null,
      birthDate: `1988-02-${String((residentSequence % 27) + 1).padStart(2, '0')}`,
      sex: Sex.MALE,
      contactNumber: '09171234567',
      residencyStatus: 'ACTIVE',
      recordSource: 'WALK_IN',
      sourceReference: null,
      sourceReferenceUnavailableReason: null,
      ...overrides,
    });
}

function createPurok(
  session: TestSession,
  code: string,
  name: string,
) {
  return session.agent
    .post('/api/puroks')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code, name });
}

function createHousehold(
  session: TestSession,
  purokId: string,
  overrides: Record<string, unknown> = {},
) {
  return session.agent
    .post('/api/households')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      purokId,
      addressLine: '45 Concurrent Lane',
      landmark: null,
      ...overrides,
    });
}

describe('household concurrency controls', () => {
  it('allocates unique sequential household numbers under parallel creation', async () => {
    const secretary = await signIn(
      'secretary.household.parallel-number',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.parallel-number',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        createHousehold(encoder, purok.body.id),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const numbers = responses.map(
      (response) => response.body.householdNumber as string,
    );
    expect(new Set(numbers).size).toBe(8);
    for (const number of numbers) {
      expect(number).toMatch(/^HH-\d{4}-\d{6}$/);
    }
    const sequence = await prisma.householdNumberSequence.findFirst();
    expect(sequence?.lastNumber).toBe(8);
  });

  it('accepts only one of two concurrent head changes for the same version', async () => {
    const secretary = await signIn(
      'secretary.household.parallel-head',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.parallel-head',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const firstHead = await createResident(encoder).expect(201);
    const secondHead = await createResident(encoder).expect(201);
    const created = await createHousehold(encoder, purok.body.id).expect(201);
    await encoder.agent
      .post(`/api/households/${created.body.id}/members`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ residentId: firstHead.body.id })
      .expect(201);
    const added = await encoder.agent
      .post(`/api/households/${created.body.id}/members`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ residentId: secondHead.body.id })
      .expect(201);

    const payloadFor = (residentId: string) => ({
      residentId,
      reason: 'Concurrent head assignment test',
      version: added.body.version,
    });
    const responses = await Promise.all([
      secretary.agent
        .patch(`/api/households/${created.body.id}/head`)
        .set('X-CSRF-Token', secretary.csrfToken)
        .send(payloadFor(firstHead.body.id)),
      secretary.agent
        .patch(`/api/households/${created.body.id}/head`)
        .set('X-CSRF-Token', secretary.csrfToken)
        .send(payloadFor(secondHead.body.id)),
    ]);

    const successes = responses.filter((response) => response.status === 200);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect([
      'STALE_HOUSEHOLD',
      'CONCURRENT_MODIFICATION',
    ]).toContain(conflicts[0].body.error.code);

    const persisted = await prisma.household.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect([firstHead.body.id, secondHead.body.id]).toContain(
      persisted.headResidentId,
    );
    const changes = await prisma.householdChange.count({
      where: {
        householdId: created.body.id,
        action: 'HEAD_CHANGED',
      },
    });
    expect(changes).toBe(1);
  });

  it('transfers a membership to only one target under concurrent requests', async () => {
    const secretary = await signIn(
      'secretary.household.parallel-transfer',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.parallel-transfer',
      UserRole.BARANGAY_ENCODER,
    );
    const purokOne = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const purokTwo = await createPurok(secretary, 'P-02', 'Purok 2').expect(201);
    const sourceHead = await createResident(encoder).expect(201);
    const mover = await createResident(encoder).expect(201);
    const source = await createHousehold(encoder, purokOne.body.id, {
      headResidentId: sourceHead.body.id,
    }).expect(201);
    const targetOne = await createHousehold(encoder, purokTwo.body.id).expect(
      201,
    );
    const targetTwo = await createHousehold(encoder, purokOne.body.id).expect(
      201,
    );
    const added = await encoder.agent
      .post(`/api/households/${source.body.id}/members`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ residentId: mover.body.id, relationship: 'Sibling' })
      .expect(201);
    const membership = added.body.members.find(
      (current: { residentId: string }) => current.residentId === mover.body.id,
    );

    const payloadFor = (targetHouseholdId: string) => ({
      targetHouseholdId,
      relationship: 'Sibling',
      reason: 'Concurrent transfer target test',
      version: membership.version,
    });
    const responses = await Promise.all([
      encoder.agent
        .post(
          `/api/households/${source.body.id}/members/${membership.id}/transfer`,
        )
        .set('X-CSRF-Token', encoder.csrfToken)
        .send(payloadFor(targetOne.body.id)),
      encoder.agent
        .post(
          `/api/households/${source.body.id}/members/${membership.id}/transfer`,
        )
        .set('X-CSRF-Token', encoder.csrfToken)
        .send(payloadFor(targetTwo.body.id)),
    ]);

    const successes = responses.filter((response) => response.status === 200);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect([
      'CONCURRENT_MODIFICATION',
      'MEMBERSHIP_ALREADY_ENDED',
    ]).toContain(conflicts[0].body.error.code);

    const active = await prisma.householdMembership.findMany({
      where: {
        residentId: mover.body.id,
        status: 'ACTIVE',
      },
    });
    expect(active).toHaveLength(1);
    expect([targetOne.body.id, targetTwo.body.id]).toContain(
      active[0].householdId,
    );
    const ended = await prisma.householdMembership.findMany({
      where: {
        residentId: mover.body.id,
        status: 'ENDED',
      },
    });
    expect(ended).toHaveLength(1);
    expect(ended[0].endReason).toBe('TRANSFERRED');
  });

  it('serializes terminal resident status changes and household cleanup', async () => {
    const secretary = await signIn(
      'secretary.household.parallel-status',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.parallel-status',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const resident = await createResident(encoder).expect(201);
    const household = await createHousehold(encoder, purok.body.id, {
      headResidentId: resident.body.id,
    }).expect(201);

    const payloadFor = (status: 'MOVED_OUT' | 'DECEASED') => ({
      status,
      reason: 'Concurrent terminal status test',
      version: resident.body.version,
    });
    const responses = await Promise.all([
      encoder.agent
        .patch(`/api/residents/${resident.body.id}/status`)
        .set('X-CSRF-Token', encoder.csrfToken)
        .send(payloadFor('MOVED_OUT')),
      encoder.agent
        .patch(`/api/residents/${resident.body.id}/status`)
        .set('X-CSRF-Token', encoder.csrfToken)
        .send(payloadFor('DECEASED')),
    ]);

    const successes = responses.filter((response) => response.status === 200);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect([
      'STALE_RESIDENT',
      'CONCURRENT_MODIFICATION',
    ]).toContain(conflicts[0].body.error.code);

    const persistedResident = await prisma.resident.findUniqueOrThrow({
      where: { id: resident.body.id },
    });
    const persistedHousehold = await prisma.household.findUniqueOrThrow({
      where: { id: household.body.id },
    });
    expect(['MOVED_OUT', 'DECEASED']).toContain(
      persistedResident.residencyStatus,
    );
    expect(persistedHousehold.headResidentId).toBeNull();
    const activeMemberships = await prisma.householdMembership.count({
      where: { householdId: household.body.id, status: 'ACTIVE' },
    });
    expect(activeMemberships).toBe(0);

    const memberships = await prisma.householdMembership.findMany({
      where: { residentId: resident.body.id },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].status).toBe('ENDED');
    expect(memberships[0].endReason).toBe(persistedResident.residencyStatus);
  });
});
