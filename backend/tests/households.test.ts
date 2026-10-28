import { Sex, UserRole } from '@prisma/client';
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
  code: string,
  name: string,
) {
  return session.agent
    .post('/api/puroks')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code, name });
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
      firstName: 'Resident',
      middleName: null,
      lastName: 'Household',
      suffix: null,
      birthDate: `1990-01-${String((residentSequence % 27) + 1).padStart(2, '0')}`,
      sex: Sex.FEMALE,
      contactNumber: '09171234567',
      residencyStatus: 'ACTIVE',
      recordSource: 'WALK_IN',
      sourceReference: null,
      sourceReferenceUnavailableReason: null,
      ...overrides,
    });
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
      addressLine: '123 Synthetic Street',
      landmark: 'Blue gate beside the covered court',
      ...overrides,
    });
}

describe('household records', () => {
  it('creates a numbered household with a head membership and transactional audit', async () => {
    const secretary = await signIn(
      'secretary.household.create',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.create',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const resident = await createResident(encoder).expect(201);

    const created = await createHousehold(encoder, purok.body.id, {
      headResidentId: resident.body.id,
    }).expect(201);

    expect(created.body.householdNumber).toMatch(/^HH-\d{4}-000001$/);
    expect(created.body).toMatchObject({
      status: 'ACTIVE',
      verificationStatus: 'UNVERIFIED',
      version: 1,
      activeMemberCount: 1,
      purok: { code: 'P-01', name: 'Purok 1' },
      head: {
        id: resident.body.id,
        residentNumber: resident.body.residentNumber,
      },
    });
    expect(created.body.members).toHaveLength(1);
    expect(created.body.members[0]).toMatchObject({
      residentId: resident.body.id,
      relationship: 'Head',
      contactNumber: '09171234567',
    });

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.HOUSEHOLD_CREATED,
        entityId: created.body.id,
      },
    });
    expect(audit?.actorUserId).toBe(encoder.userId);
    expect(audit?.metadata).toContain(created.body.householdNumber);

    const memberAudit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_ADDED,
        entityId: created.body.id,
      },
    });
    expect(memberAudit?.actorUserId).toBe(encoder.userId);

    const history = await secretary.agent
      .get(`/api/households/${created.body.id}/history`)
      .expect(200);
    expect(history.body.items.map((item: { action: string }) => item.action)).toEqual(
      expect.arrayContaining(['CREATED', 'MEMBER_ADDED']),
    );
  });

  it('adds members, verifies, changes the head, and resets verification', async () => {
    const secretary = await signIn(
      'secretary.household.roster',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.roster',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const head = await createResident(encoder).expect(201);
    const member = await createResident(encoder).expect(201);

    const created = await createHousehold(encoder, purok.body.id, {
      headResidentId: head.body.id,
      landmark: 'Green roof',
    }).expect(201);

    const added = await encoder.agent
      .post(`/api/households/${created.body.id}/members`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ residentId: member.body.id, relationship: 'Spouse' })
      .expect(201);
    expect(added.body.activeMemberCount).toBe(2);
    expect(added.body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ residentId: member.body.id, relationship: 'Spouse' }),
      ]),
    );

    const forbiddenVerify = await encoder.agent
      .post(`/api/households/${created.body.id}/verify`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ version: added.body.version })
      .expect(403);
    expect(forbiddenVerify.body.error.code).toBe('FORBIDDEN');

    const verified = await secretary.agent
      .post(`/api/households/${created.body.id}/verify`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({ version: added.body.version })
      .expect(200);
    expect(verified.body.verificationStatus).toBe('VERIFIED');
    expect(verified.body.verifiedAt).toBeTruthy();

    const changed = await secretary.agent
      .patch(`/api/households/${created.body.id}/head`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        residentId: member.body.id,
        reason: 'Household agreed to change the recorded head',
        version: verified.body.version,
      })
      .expect(200);
    expect(changed.body.head.id).toBe(member.body.id);
    expect(changed.body.verificationStatus).toBe('UNVERIFIED');

    const stale = await secretary.agent
      .patch(`/api/households/${created.body.id}/head`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        residentId: head.body.id,
        reason: 'Stale attempt after a concurrent change',
        version: verified.body.version,
      })
      .expect(409);
    expect(stale.body.error.code).toBe('STALE_HOUSEHOLD');
  });

  it('limits captain household views and blocks history access', async () => {
    const secretary = await signIn(
      'secretary.household.privacy',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.privacy',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const head = await createResident(encoder, {
      birthDate: '1984-06-15',
    }).expect(201);
    const created = await createHousehold(encoder, purok.body.id, {
      headResidentId: head.body.id,
      landmark: 'Sensitive landmark',
    }).expect(201);

    const captain = await signIn(
      'captain.household.privacy',
      UserRole.BARANGAY_CAPTAIN,
    );
    const list = await captain.agent.get('/api/households').expect(200);
    expect(list.body.items[0]).toMatchObject({
      id: created.body.id,
      addressLine: '123 Synthetic Street',
      landmark: null,
      activeMemberCount: 1,
    });

    const detail = await captain.agent
      .get(`/api/households/${created.body.id}`)
      .expect(200);
    expect(detail.body.landmark).toBeNull();
    expect(detail.body.verifiedAt).toBeNull();
    expect(detail.body.members[0]).toMatchObject({
      fullName: head.body.fullName,
      birthYear: 1984,
      birthDate: null,
      contactNumber: null,
      verificationStatus: null,
    });

    await captain.agent
      .get(`/api/households/${created.body.id}/history`)
      .expect(403);
    const admin = await signIn(
      'admin.household.privacy',
      UserRole.SYSTEM_ADMIN,
    );
    await admin.agent.get('/api/households').expect(403);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.HOUSEHOLD_PROFILE_VIEWED,
        entityId: created.body.id,
      },
    });
    expect(audit?.metadata).toContain('limited');
  });

  it('ends memberships, clears the head, and enforces deactivation rules', async () => {
    const secretary = await signIn(
      'secretary.household.end',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.end',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const head = await createResident(encoder).expect(201);
    const created = await createHousehold(encoder, purok.body.id, {
      headResidentId: head.body.id,
    }).expect(201);
    const membershipId = created.body.members[0].id as string;

    const blocked = await secretary.agent
      .patch(`/api/households/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'INACTIVE',
        reason: 'Testing active member protection',
        version: created.body.version,
      })
      .expect(409);
    expect(blocked.body.error.code).toBe('HOUSEHOLD_HAS_ACTIVE_MEMBERS');

    const ended = await encoder.agent
      .post(`/api/households/${created.body.id}/members/${membershipId}/end`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        reason: 'LEFT_HOUSEHOLD',
        note: 'Moved to another barangay',
        version: created.body.members[0].version,
      })
      .expect(200);
    expect(ended.body).toMatchObject({
      head: null,
      activeMemberCount: 0,
      members: [],
    });

    const inactive = await secretary.agent
      .patch(`/api/households/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'INACTIVE',
        reason: 'No residents remain in this household',
        version: ended.body.version,
      })
      .expect(200);
    expect(inactive.body.status).toBe('INACTIVE');

    const active = await secretary.agent
      .patch(`/api/households/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'ACTIVE',
        reason: 'Household is occupied again',
        version: inactive.body.version,
      })
      .expect(200);
    expect(active.body.status).toBe('ACTIVE');
  });

  it('transfers a member atomically and preserves membership history', async () => {
    const secretary = await signIn(
      'secretary.household.transfer',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.transfer',
      UserRole.BARANGAY_ENCODER,
    );
    const purokOne = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const purokTwo = await createPurok(secretary, 'P-02', 'Purok 2').expect(201);
    const sourceHead = await createResident(encoder).expect(201);
    const mover = await createResident(encoder).expect(201);

    const source = await createHousehold(encoder, purokOne.body.id, {
      headResidentId: sourceHead.body.id,
    }).expect(201);
    const target = await createHousehold(encoder, purokTwo.body.id).expect(201);

    const added = await encoder.agent
      .post(`/api/households/${source.body.id}/members`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ residentId: mover.body.id, relationship: 'Cousin' })
      .expect(201);
    const sourceMembership = added.body.members.find(
      (member: { residentId: string }) => member.residentId === mover.body.id,
    );

    const transferred = await encoder.agent
      .post(
        `/api/households/${source.body.id}/members/${sourceMembership.id}/transfer`,
      )
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        targetHouseholdId: target.body.id,
        relationship: 'Cousin',
        reason: 'Resident now lives with the target household',
        version: sourceMembership.version,
      })
      .expect(200);
    expect(transferred.body.activeMemberCount).toBe(1);
    expect(transferred.body.members).toHaveLength(1);

    const targetDetail = await secretary.agent
      .get(`/api/households/${target.body.id}`)
      .expect(200);
    expect(targetDetail.body.activeMemberCount).toBe(1);
    expect(targetDetail.body.members[0]).toMatchObject({
      residentId: mover.body.id,
      relationship: 'Cousin',
    });

    const duplicateAdd = await encoder.agent
      .post(`/api/households/${target.body.id}/members`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ residentId: mover.body.id })
      .expect(409);
    expect(duplicateAdd.body.error.code).toBe('RESIDENT_ALREADY_IN_HOUSEHOLD');

    const sourceHistory = await secretary.agent
      .get(`/api/households/${source.body.id}/history`)
      .expect(200);
    expect(
      sourceHistory.body.items.map((item: { action: string }) => item.action),
    ).toEqual(expect.arrayContaining(['MEMBER_ADDED', 'MEMBER_TRANSFERRED']));

    const targetHistory = await secretary.agent
      .get(`/api/households/${target.body.id}/history`)
      .expect(200);
    expect(
      targetHistory.body.items.map((item: { action: string }) => item.action),
    ).toContain('MEMBER_TRANSFERRED');

    const endedMemberships = await prisma.householdMembership.findMany({
      where: { residentId: mover.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(endedMemberships).toHaveLength(2);
    expect(endedMemberships[0]).toMatchObject({
      status: 'ENDED',
      endReason: 'TRANSFERRED',
    });
    expect(endedMemberships[1].status).toBe('ACTIVE');
  });

  it('keeps household links through resident inactive status and ends them on moved-out', async () => {
    const secretary = await signIn(
      'secretary.household.resident-status',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.resident-status',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const resident = await createResident(encoder).expect(201);
    const household = await createHousehold(encoder, purok.body.id, {
      headResidentId: resident.body.id,
    }).expect(201);

    const verified = await secretary.agent
      .post(`/api/households/${household.body.id}/verify`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({ version: household.body.version })
      .expect(200);
    expect(verified.body.verificationStatus).toBe('VERIFIED');

    const inactive = await encoder.agent
      .patch(`/api/residents/${resident.body.id}/status`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        status: 'INACTIVE',
        reason: 'Resident is temporarily away',
        version: resident.body.version,
      })
      .expect(200);
    expect(inactive.body.household).toMatchObject({
      id: household.body.id,
      isHead: true,
    });

    const afterInactive = await secretary.agent
      .get(`/api/households/${household.body.id}`)
      .expect(200);
    expect(afterInactive.body).toMatchObject({
      verificationStatus: 'UNVERIFIED',
      activeMemberCount: 1,
    });
    expect(afterInactive.body.head.id).toBe(resident.body.id);

    const reactivatedResident = await encoder.agent
      .patch(`/api/residents/${resident.body.id}/status`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        status: 'ACTIVE',
        reason: 'Resident returned to the barangay',
        version: inactive.body.version,
      })
      .expect(200);

    const reverified = await secretary.agent
      .post(`/api/households/${household.body.id}/verify`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({ version: afterInactive.body.version })
      .expect(200);

    const movedOut = await encoder.agent
      .patch(`/api/residents/${resident.body.id}/status`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        status: 'MOVED_OUT',
        reason: 'Resident transferred to another municipality',
        version: reactivatedResident.body.version,
      })
      .expect(200);
    expect(movedOut.body.household).toBeNull();

    const afterMovedOut = await secretary.agent
      .get(`/api/households/${household.body.id}`)
      .expect(200);
    expect(afterMovedOut.body).toMatchObject({
      head: null,
      activeMemberCount: 0,
      members: [],
      verificationStatus: 'UNVERIFIED',
      version: reverified.body.version + 1,
    });

    const ended = await prisma.householdMembership.findFirst({
      where: { residentId: resident.body.id },
    });
    expect(ended).toMatchObject({
      status: 'ENDED',
      endReason: 'MOVED_OUT',
    });
  });

  it('rejects inactive Puroks, inactive residents, and duplicate heads', async () => {
    const secretary = await signIn(
      'secretary.household.rules',
      UserRole.BARANGAY_SECRETARY,
    );
    const encoder = await signIn(
      'encoder.household.rules',
      UserRole.BARANGAY_ENCODER,
    );
    const purok = await createPurok(secretary, 'P-01', 'Purok 1').expect(201);
    const resident = await createResident(encoder).expect(201);
    await createHousehold(encoder, purok.body.id, {
      headResidentId: resident.body.id,
    }).expect(201);

    const alreadyAssigned = await createHousehold(encoder, purok.body.id, {
      headResidentId: resident.body.id,
    }).expect(409);
    expect(alreadyAssigned.body.error.code).toBe(
      'RESIDENT_ALREADY_IN_HOUSEHOLD',
    );

    const inactiveResident = await createResident(encoder, {
      residencyStatus: 'INACTIVE',
    }).expect(201);
    const inactiveMember = await createHousehold(encoder, purok.body.id, {
      headResidentId: inactiveResident.body.id,
    }).expect(409);
    expect(inactiveMember.body.error.code).toBe('RESIDENT_NOT_ACTIVE');

    await secretary.agent
      .patch(`/api/puroks/${purok.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'INACTIVE',
        reason: 'Testing inactive Purok protection',
        version: purok.body.version,
      })
      .expect(409);

    await prisma.purok.update({
      where: { id: purok.body.id },
      data: { status: 'INACTIVE' },
    });
    const inactivePurok = await createHousehold(encoder, purok.body.id).expect(
      409,
    );
    expect(inactivePurok.body.error.code).toBe('PUROK_INACTIVE');
  });
});
