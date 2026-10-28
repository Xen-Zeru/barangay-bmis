import {
  ResidencyStatus,
  Sex,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signIn(
  username: string,
  role: UserRole,
  firstName = 'Test',
): Promise<TestSession> {
  const user = await createTestUser({ username, role, firstName });
  const agent = request.agent(app);
  const result = await loginAgent(agent, username);
  expect(result.status).toBe(200);
  return { agent, csrfToken: result.csrfToken, userId: user.id };
}

function residentPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Juan',
    middleName: 'Dela Cruz',
    lastName: 'Santos',
    suffix: null,
    birthDate: '1985-03-14',
    sex: Sex.MALE,
    contactNumber: '09171234567',
    residencyStatus: ResidencyStatus.ACTIVE,
    recordSource: 'WALK_IN',
    sourceReference: null,
    sourceReferenceUnavailableReason: null,
    ...overrides,
  };
}

function createResident(
  session: TestSession,
  overrides: Record<string, unknown> = {},
) {
  return session.agent
    .post('/api/residents')
    .set('X-CSRF-Token', session.csrfToken)
    .send(residentPayload(overrides));
}

describe('resident records', () => {
  it('creates a resident, allocates a number, and records transactional audit/history', async () => {
    const encoder = await signIn('encoder.create', UserRole.BARANGAY_ENCODER);

    const response = await createResident(encoder).expect(201);

    expect(response.body.residentNumber).toMatch(/^RES-\d{4}-000001$/);
    expect(response.body.fullName).toBe('Juan Dela Cruz Santos');
    expect(response.body.contactNumber).toBe('09171234567');
    expect(response.body.verificationStatus).toBe(VerificationStatus.UNVERIFIED);
    expect(response.body.household).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.RESIDENT_CREATED,
        entityId: response.body.id,
      },
    });
    expect(audit?.actorUserId).toBe(encoder.userId);
    expect(audit?.metadata).toContain('WALK_IN');

    const history = await encoder.agent
      .get(`/api/residents/${response.body.id}/history`)
      .expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].action).toBe('CREATED');
  });

  it('keeps directory reads and limited lookup free of full-profile audit', async () => {
    const encoder = await signIn('encoder.directory', UserRole.BARANGAY_ENCODER);
    const created = await createResident(encoder).expect(201);

    await encoder.agent.get('/api/residents').expect(200);

    const captain = await signIn('captain.lookup', UserRole.BARANGAY_CAPTAIN);
    const lookup = await captain.agent
      .get('/api/residents/lookup?q=Juan')
      .expect(200);

    expect(lookup.body).toHaveLength(1);
    expect(lookup.body[0]).toMatchObject({
      id: created.body.id,
      residentNumber: created.body.residentNumber,
      fullName: 'Juan Dela Cruz Santos',
      birthYear: 1985,
      residencyStatus: 'ACTIVE',
    });
    expect(lookup.body[0]).not.toHaveProperty('contactNumber');
    expect(lookup.body[0]).not.toHaveProperty('birthDate');

    const profileAudit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.RESIDENT_PROFILE_VIEWED },
    });
    expect(profileAudit).toBeNull();
  });

  it('limits the captain to lookup and rejects profile/list reads', async () => {
    const encoder = await signIn('encoder.captain', UserRole.BARANGAY_ENCODER);
    const created = await createResident(encoder).expect(201);
    const captain = await signIn('captain.read', UserRole.BARANGAY_CAPTAIN);

    await captain.agent.get('/api/residents').expect(403);
    await captain.agent.get(`/api/residents/${created.body.id}`).expect(403);
  });

  it('enforces source-reference and provisional sex rules', async () => {
    const encoder = await signIn('encoder.rules', UserRole.BARANGAY_ENCODER);

    const notRecordedWalkIn = await createResident(encoder, {
      sex: Sex.NOT_RECORDED,
    }).expect(400);
    expect(notRecordedWalkIn.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'sex' })]),
    );

    const missingSource = await createResident(encoder, {
      recordSource: 'EXISTING_RECORD',
    }).expect(400);
    expect(missingSource.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'sourceReference' }),
      ]),
    );

    const secretary = await signIn(
      'secretary.rules',
      UserRole.BARANGAY_SECRETARY,
    );
    const allowed = await createResident(secretary, {
      sex: Sex.NOT_RECORDED,
      recordSource: 'EXISTING_RECORD',
      sourceReference: 'Legacy masterlist page 8',
    }).expect(201);
    expect(allowed.body.sex).toBe(Sex.NOT_RECORDED);

    const future = await createResident(encoder, {
      birthDate: '2999-01-01',
    }).expect(400);
    expect(future.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('prevents duplicate creation and returns candidates without contact details', async () => {
    const encoder = await signIn('encoder.duplicate', UserRole.BARANGAY_ENCODER);
    await createResident(encoder).expect(201);

    const duplicate = await createResident(encoder).expect(409);
    expect(duplicate.body.error.code).toBe('POSSIBLE_DUPLICATE');
    const candidates = duplicate.body.error.details.candidates as Array<
      Record<string, unknown>
    >;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fullName: 'Juan Dela Cruz Santos',
      matchType: 'EXACT',
    });
    expect(candidates[0]).not.toHaveProperty('contactNumber');
  });

  it('supports status changes, verification, stale-version rejection, and deceased terminal state', async () => {
    const encoder = await signIn('encoder.status', UserRole.BARANGAY_ENCODER);
    const created = await createResident(encoder).expect(201);
    const residentId = created.body.id as string;

    const deceased = await encoder.agent
      .patch(`/api/residents/${residentId}/status`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        status: 'DECEASED',
        reason: 'Death certificate presented',
        version: created.body.version,
      })
      .expect(200);
    expect(deceased.body.residencyStatus).toBe('DECEASED');

    const reopen = await encoder.agent
      .patch(`/api/residents/${residentId}/status`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        status: 'ACTIVE',
        reason: 'Attempted normal reversal',
        version: deceased.body.version,
      })
      .expect(409);
    expect(reopen.body.error.code).toBe('CORRECTION_REQUIRED');

    const secretary = await signIn(
      'secretary.verify',
      UserRole.BARANGAY_SECRETARY,
    );
    const verified = await secretary.agent
      .post(`/api/residents/${residentId}/verify`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({ version: deceased.body.version })
      .expect(200);
    expect(verified.body.verificationStatus).toBe(VerificationStatus.VERIFIED);

    const encoderVerify = await encoder.agent
      .post(`/api/residents/${residentId}/verify`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({ version: verified.body.version })
      .expect(403);
    expect(encoderVerify.body.error.code).toBe('FORBIDDEN');

    const stale = await encoder.agent
      .patch(`/api/residents/${residentId}/status`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        status: 'INACTIVE',
        reason: 'Stale version attempt',
        version: deceased.body.version,
      })
      .expect(409);
    expect(stale.body.error.code).toBe('STALE_RESIDENT');
  });

  it('requires a documented Secretary override when an edit would create a duplicate', async () => {
    const encoder = await signIn('encoder.override', UserRole.BARANGAY_ENCODER);
    const first = await createResident(encoder).expect(201);
    const second = await createResident(encoder, {
      firstName: 'Pedro',
      middleName: 'Penduko',
      lastName: 'Garcia',
      birthDate: '1978-11-02',
    }).expect(201);

    const blocked = await encoder.agent
      .patch(`/api/residents/${second.body.id}`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        firstName: 'Juan',
        middleName: 'Dela Cruz',
        lastName: 'Santos',
        birthDate: '1985-03-14',
        version: second.body.version,
      })
      .expect(409);
    expect(blocked.body.error.code).toBe('POSSIBLE_DUPLICATE');

    const unauthorized = await encoder.agent
      .patch(`/api/residents/${second.body.id}`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        firstName: 'Juan',
        middleName: 'Dela Cruz',
        lastName: 'Santos',
        birthDate: '1985-03-14',
        version: second.body.version,
        duplicateReason: 'Confirmed distinct person after counter-check.',
      })
      .expect(403);
    expect(unauthorized.body.error.code).toBe('FORBIDDEN');

    const secretary = await signIn(
      'secretary.override',
      UserRole.BARANGAY_SECRETARY,
    );
    const allowed = await secretary.agent
      .patch(`/api/residents/${second.body.id}`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        firstName: 'Juan',
        middleName: 'Dela Cruz',
        lastName: 'Santos',
        birthDate: '1985-03-14',
        version: second.body.version,
        duplicateReason: 'Confirmed distinct person after counter-check.',
      })
      .expect(200);
    expect(allowed.body.id).not.toBe(first.body.id);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.RESIDENT_UPDATED,
        entityId: second.body.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toContain('"duplicateOverride":true');
  });
});

describe('duplicate review workflow', () => {
  it('enforces self-approval separation and creates the resident on approval', async () => {
    const encoder = await signIn('encoder.review', UserRole.BARANGAY_ENCODER);
    await createResident(encoder).expect(201);

    const requester = await signIn(
      'secretary.requester',
      UserRole.BARANGAY_SECRETARY,
    );
    const review = await requester.agent
      .post('/api/residents/duplicate-reviews')
      .set('X-CSRF-Token', requester.csrfToken)
      .send({ ...residentPayload(), reason: 'Same name and birth date.' })
      .expect(201);
    expect(review.body.status).toBe('PENDING');
    expect(review.body.candidateCount).toBe(1);

    const detail = await requester.agent
      .get(`/api/residents/duplicate-reviews/${review.body.id}`)
      .expect(200);
    expect(detail.body.draft.fullName).toBeUndefined();
    expect(detail.body.draft).toMatchObject({
      firstName: 'Juan',
      lastName: 'Santos',
    });
    expect(detail.body.candidates).toHaveLength(1);

    const selfApproval = await requester.agent
      .post(`/api/residents/duplicate-reviews/${review.body.id}/approve`)
      .set('X-CSRF-Token', requester.csrfToken)
      .send({
        note: 'I reviewed my own request.',
        version: review.body.version,
      })
      .expect(409);
    expect(selfApproval.body.error.code).toBe('DUPLICATE_SELF_APPROVAL');

    const approver = await signIn(
      'secretary.approver',
      UserRole.BARANGAY_SECRETARY,
    );
    const approved = await approver.agent
      .post(`/api/residents/duplicate-reviews/${review.body.id}/approve`)
      .set('X-CSRF-Token', approver.csrfToken)
      .send({
        note: 'Verified as a distinct person.',
        version: review.body.version,
      })
      .expect(200);
    expect(approved.body.residentNumber).toMatch(/^RES-\d{4}-000002$/);

    const stored = await prisma.residentDuplicateReview.findUniqueOrThrow({
      where: { id: review.body.id },
    });
    expect(stored.status).toBe('APPROVED');
    expect(stored.draftData).toBeNull();
    expect(stored.activeIdentityKey).toBeNull();
    expect(stored.createdResidentId).toBe(approved.body.id);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.DUPLICATE_REVIEW_APPROVED,
        entityId: review.body.id,
      },
    });
    expect(audit?.actorUserId).toBe(approver.userId);
  });

  it('lets the requester cancel and blocks another encoder from approving', async () => {
    const encoder = await signIn('encoder.cancel', UserRole.BARANGAY_ENCODER);
    await createResident(encoder).expect(201);

    const requester = await signIn(
      'secretary.cancel.one',
      UserRole.BARANGAY_SECRETARY,
    );
    const review = await requester.agent
      .post('/api/residents/duplicate-reviews')
      .set('X-CSRF-Token', requester.csrfToken)
      .send({ ...residentPayload(), reason: 'Possible duplicate record.' })
      .expect(201);

    const otherEncoder = await signIn(
      'encoder.cancel.two',
      UserRole.BARANGAY_ENCODER,
    );
    const otherCancel = await otherEncoder.agent
      .post(`/api/residents/duplicate-reviews/${review.body.id}/cancel`)
      .set('X-CSRF-Token', otherEncoder.csrfToken)
      .send({ note: 'Not mine to cancel.' })
      .expect(403);
    expect(otherCancel.body.error.code).toBe('FORBIDDEN');

    const cancelled = await requester.agent
      .post(`/api/residents/duplicate-reviews/${review.body.id}/cancel`)
      .set('X-CSRF-Token', requester.csrfToken)
      .send({ note: 'Duplicate confirmed as a different person.' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.DUPLICATE_REVIEW_CANCELLED,
        entityId: review.body.id,
      },
    });
    expect(audit).not.toBeNull();
  });
});

describe('deceased status correction workflow', () => {
  it('requires Captain approval and records history and audit', async () => {
    const encoder = await signIn('encoder.correction', UserRole.BARANGAY_ENCODER);
    const created = await createResident(encoder).expect(201);

    const deceased = await encoder.agent
      .patch(`/api/residents/${created.body.id}/status`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        status: 'DECEASED',
        reason: 'Initial death report',
        version: created.body.version,
      })
      .expect(200);

    const secretary = await signIn(
      'secretary.correction',
      UserRole.BARANGAY_SECRETARY,
    );
    const encodedRequest = await encoder.agent
      .post(`/api/residents/${created.body.id}/corrections`)
      .set('X-CSRF-Token', encoder.csrfToken)
      .send({
        toStatus: 'ACTIVE',
        reason: 'Death report was for a different person.',
        evidenceReference: 'Barangay incident log 2026-014',
      })
      .expect(403);
    expect(encodedRequest.body.error.code).toBe('FORBIDDEN');

    const request = await secretary.agent
      .post(`/api/residents/${created.body.id}/corrections`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        toStatus: 'ACTIVE',
        reason: 'Death report was for a different person.',
        evidenceReference: 'Barangay incident log 2026-014',
      })
      .expect(201);
    expect(request.body.status).toBe('PENDING');
    expect(request.body.fromStatus).toBe('DECEASED');
    expect(request.body.toStatus).toBe('ACTIVE');

    const pending = await secretary.agent
      .post(`/api/residents/${created.body.id}/corrections`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        toStatus: 'INACTIVE',
        reason: 'A second correction should be rejected.',
        evidenceReference: 'Duplicate request',
      })
      .expect(409);
    expect(pending.body.error.code).toBe('CORRECTION_PENDING');

    const captain = await signIn(
      'captain.correction',
      UserRole.BARANGAY_CAPTAIN,
    );
    const detail = await captain.agent
      .get(`/api/residents/corrections/${request.body.id}`)
      .expect(200);
    expect(detail.body.evidenceReference).toBe('Barangay incident log 2026-014');

    const approved = await captain.agent
      .post(`/api/residents/corrections/${request.body.id}/approve`)
      .set('X-CSRF-Token', captain.csrfToken)
      .send({
        note: 'Evidence checked with the barangay record book.',
        version: request.body.version,
      })
      .expect(200);
    expect(approved.body.residencyStatus).toBe('ACTIVE');

    const stored = await prisma.residentCorrection.findUniqueOrThrow({
      where: { id: request.body.id },
    });
    expect(stored.status).toBe('APPROVED');
    expect(stored.activeResidentId).toBeNull();

    const history = await secretary.agent
      .get(`/api/residents/${created.body.id}/history`)
      .expect(200);
    expect(
      history.body.items.some(
        (item: { action: string }) => item.action === 'STATUS_CORRECTED',
      ),
    ).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.CORRECTION_APPROVED,
        entityId: request.body.id,
      },
    });
    expect(audit?.actorUserId).toBe(captain.userId);
    expect(deceased.body.version).toBeLessThan(approved.body.version);
  });

  it('rejects normal status changes on a deceased record even for the Secretary', async () => {
    const secretary = await signIn(
      'secretary.deceased',
      UserRole.BARANGAY_SECRETARY,
    );
    const created = await createResident(secretary).expect(201);
    const deceased = await secretary.agent
      .patch(`/api/residents/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'DECEASED',
        reason: 'Death certificate presented',
        version: created.body.version,
      })
      .expect(200);

    const rejected = await secretary.agent
      .patch(`/api/residents/${created.body.id}/status`)
      .set('X-CSRF-Token', secretary.csrfToken)
      .send({
        status: 'ACTIVE',
        reason: 'Normal reversal attempt',
        version: deceased.body.version,
      })
      .expect(409);
    expect(rejected.body.error.code).toBe('CORRECTION_REQUIRED');
  });

  it('allocates unique resident numbers under parallel registration', async () => {
    const encoder = await signIn(
      'encoder.numbering',
      UserRole.BARANGAY_ENCODER,
    );
    const letters = 'ABCDEFGH';

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createResident(encoder, {
          firstName: `Parallel${letters[index]}`,
          lastName: 'Resident',
          birthDate: `1990-04-${String(index + 1).padStart(2, '0')}`,
        }),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const numbers = responses.map(
      (response) => response.body.residentNumber as string,
    );
    expect(new Set(numbers).size).toBe(8);
    for (const number of numbers) {
      expect(number).toMatch(/^RES-\d{4}-\d{6}$/);
    }
    const sequence = await prisma.residentNumberSequence.findFirst();
    expect(sequence?.lastNumber).toBe(8);
  });
});

describe('sensitive read auditing', () => {
  it('fails closed when the profile-read audit cannot be written', async () => {
    const encoder = await signIn('encoder.audit', UserRole.BARANGAY_ENCODER);
    const created = await createResident(encoder).expect(201);

    vi.spyOn(prisma.auditLog, 'create').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );

    const response = await encoder.agent
      .get(`/api/residents/${created.body.id}`)
      .expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toHaveProperty('contactNumber');
  });

  it('writes a profile-view audit for full profile reads', async () => {
    const encoder = await signIn('encoder.profile', UserRole.BARANGAY_ENCODER);
    const created = await createResident(encoder).expect(201);

    await encoder.agent
      .get(`/api/residents/${created.body.id}`)
      .expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.RESIDENT_PROFILE_VIEWED,
        entityId: created.body.id,
      },
    });
    expect(audit?.actorUserId).toBe(encoder.userId);
    expect(audit?.metadata).not.toContain('09171234567');
  });
});
