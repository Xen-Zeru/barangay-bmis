import {
  HouseholdChangeAction,
  HouseholdMembershipStatus,
  MembershipEndReason,
  Prisma,
  RecordSource,
  ResidentChangeAction,
  ResidencyStatus,
  Sex,
  VerificationStatus,
} from '@prisma/client';
import type { Resident } from '@prisma/client';
import { AUDIT_ACTIONS, recordSensitiveReadAudit, writeAudit } from '../../lib/audit';
import type { AuditContext } from '../../lib/audit';
import { AppError, ERROR_CODES } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  hasPermission,
  PERMISSIONS,
} from '../../security/permissions';
import type { AuthUser } from '../auth/auth.types';
import {
  allocateResidentNumber,
  lockIdentity,
  lockResidentRow,
  withTransactionRetry,
} from './resident-locking';
import type { TransactionClient } from './resident-locking';
import {
  canUseNotRecorded,
  changeEntries,
  formatBirthDate,
  fullNameOfUser,
  identityKeyFor,
  maskContact,
  normalizedFullName,
  normalizedNameKey,
  parseBirthDate,
  parseChangePayload,
  residentDraftFromInput,
  sourceReferenceProblem,
  toResidentDetail,
  toResidentLookup,
  toResidentSummary,
} from './resident-utils';
import type {
  ResidentCandidateDto,
  ResidentChangeDto,
  ResidentChangeItem,
  ResidentDraftInput,
  ResidentHouseholdDto,
  ResidentLookupDto,
  ResidentSummaryDto,
} from './resident-utils';

function validationError(field: string, message: string): AppError {
  return new AppError(
    400,
    ERROR_CODES.VALIDATION_ERROR,
    'Please correct the highlighted fields.',
    [{ field, message }],
  );
}

function assertSourceRules(input: ResidentDraftInput): void {
  const problem = sourceReferenceProblem(input);
  if (problem) {
    throw validationError(problem.field, problem.message);
  }
}

function assertSexRules(
  input: Pick<ResidentDraftInput, 'sex' | 'recordSource'>,
  actor: AuthUser,
  previousSex?: Sex,
): void {
  if (input.sex !== Sex.NOT_RECORDED || previousSex === Sex.NOT_RECORDED) {
    return;
  }
  if (canUseNotRecorded(actor, input.recordSource)) {
    return;
  }
  throw validationError(
    'sex',
    'NOT_RECORDED is only allowed for legacy/imported records or an authorized Secretary exception.',
  );
}

export function validateDraftRules(
  input: ResidentDraftInput,
  actor: AuthUser,
  previousSex?: Sex,
): void {
  assertSourceRules(input);
  assertSexRules(input, actor, previousSex);
}

function maskedChanges(changes: ResidentChangeItem[]): ResidentChangeItem[] {
  return changes.map((change) => {
    if (change.field !== 'contactNumber') {
      return change;
    }
    return {
      field: change.field,
      before: maskContact(
        typeof change.before === 'string' ? change.before : null,
      ),
      after: maskContact(typeof change.after === 'string' ? change.after : null),
    };
  });
}

export async function createResidentChange(
  tx: TransactionClient,
  residentId: string,
  actorUserId: string,
  action: ResidentChangeAction,
  changes: ResidentChangeItem[] | null,
  reason: string | null,
): Promise<void> {
  await tx.residentChange.create({
    data: {
      residentId,
      actorUserId,
      action,
      changes:
        changes && changes.length > 0
          ? JSON.stringify(maskedChanges(changes))
          : null,
      reason,
    },
  });
}

function toCreateData(
  input: ResidentDraftInput,
  actorUserId: string,
): Prisma.ResidentCreateInput {
  return {
    residentNumber: '',
    firstName: input.firstName,
    middleName: input.middleName ?? null,
    lastName: input.lastName,
    suffix: input.suffix ?? null,
    nameNormalized: normalizedFullName(input),
    nameKey: normalizedNameKey(input),
    birthDate: parseBirthDate(input.birthDate),
    sex: input.sex,
    contactNumber: input.contactNumber ?? null,
    residencyStatus: input.residencyStatus,
    statusChangedAt: new Date(),
    recordSource: input.recordSource,
    sourceReference: input.sourceReference ?? null,
    sourceReferenceUnavailableReason:
      input.sourceReferenceUnavailableReason ?? null,
    createdBy: { connect: { id: actorUserId } },
    updatedBy: { connect: { id: actorUserId } },
  };
}

export interface InsertResidentOptions {
  reason?: string | null;
  metadata?: Record<string, unknown>;
  context?: AuditContext;
}

export async function insertResidentInTransaction(
  tx: TransactionClient,
  input: ResidentDraftInput,
  actor: AuthUser,
  options: InsertResidentOptions = {},
): Promise<Resident> {
  validateDraftRules(input, actor);

  const residentNumber = await allocateResidentNumber(tx);
  const data = toCreateData(input, actor.id);
  data.residentNumber = residentNumber;

  const resident = await tx.resident.create({ data });
  await createResidentChange(
    tx,
    resident.id,
    actor.id,
    'CREATED',
    null,
    options.reason ?? null,
  );
  await writeAudit(tx, {
    action: AUDIT_ACTIONS.RESIDENT_CREATED,
    actorUserId: actor.id,
    entityType: 'Resident',
    entityId: resident.id,
    metadata: {
      residentNumber: resident.residentNumber,
      recordSource: resident.recordSource,
      ...options.metadata,
    },
    ...(options.context ?? {}),
  });
  return resident;
}

export async function findDuplicateCandidates(
  tx: TransactionClient | typeof prisma,
  input: ResidentDraftInput,
  excludeResidentId?: string,
): Promise<ResidentCandidateDto[]> {
  const exactName = normalizedFullName(input);
  const broadKey = normalizedNameKey(input);
  const birthDate = parseBirthDate(input.birthDate);

  const candidates = await tx.resident.findMany({
    where: {
      birthDate,
      ...(excludeResidentId ? { id: { not: excludeResidentId } } : {}),
      OR: [{ nameNormalized: exactName }, { nameKey: broadKey }],
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  return candidates.map((candidate) => ({
    id: candidate.id,
    residentNumber: candidate.residentNumber,
    fullName: [
      candidate.firstName,
      candidate.middleName,
      candidate.lastName,
      candidate.suffix,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' '),
    birthDate: formatBirthDate(candidate.birthDate),
    sex: candidate.sex,
    residencyStatus: candidate.residencyStatus,
    verificationStatus: candidate.verificationStatus,
    matchType:
      candidate.nameNormalized === exactName &&
      formatBirthDate(candidate.birthDate) === input.birthDate
        ? 'EXACT'
        : 'BROAD',
  }));
}

export interface ResidentListQueryResult {
  items: ResidentSummaryDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export async function listResidents(query: {
  q?: string;
  status?: ResidencyStatus;
  verificationStatus?: VerificationStatus;
  sex?: Sex;
  source?: RecordSource;
  sort:
    | 'name_asc'
    | 'name_desc'
    | 'residentNumber_asc'
    | 'createdAt_desc'
    | 'updatedAt_desc';
  page: number;
  pageSize: number;
}): Promise<ResidentListQueryResult> {
  const search = query.q?.trim() ?? '';
  const normalizedSearch = search ? normalizedFullName({
    firstName: search,
    lastName: '',
  }) : '';
  const where: Prisma.ResidentWhereInput = {
    ...(query.status ? { residencyStatus: query.status } : {}),
    ...(query.verificationStatus
      ? { verificationStatus: query.verificationStatus }
      : {}),
    ...(query.sex ? { sex: query.sex } : {}),
    ...(query.source ? { recordSource: query.source } : {}),
  };

  if (search) {
    const or: Prisma.ResidentWhereInput[] = [
      { residentNumber: { contains: search } },
    ];
    if (normalizedSearch) {
      or.push(
        { nameNormalized: { contains: normalizedSearch } },
        { nameKey: { contains: normalizedSearch } },
      );
    }
    where.OR = or;
  }

  const orderBy: Prisma.ResidentOrderByWithRelationInput[] = (() => {
    switch (query.sort) {
      case 'name_desc':
        return [
          { lastName: 'desc' },
          { firstName: 'desc' },
          { middleName: 'desc' },
        ];
      case 'residentNumber_asc':
        return [{ residentNumber: 'asc' }];
      case 'createdAt_desc':
        return [{ createdAt: 'desc' }];
      case 'updatedAt_desc':
        return [{ updatedAt: 'desc' }];
      case 'name_asc':
      default:
        return [
          { lastName: 'asc' },
          { firstName: 'asc' },
          { middleName: 'asc' },
        ];
    }
  })();

  const [items, total] = await Promise.all([
    prisma.resident.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.resident.count({ where }),
  ]);

  return {
    items: items.map(toResidentSummary),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function lookupResidents(
  query: { q: string; limit: number },
): Promise<ResidentLookupDto[]> {
  const search = query.q.trim();
  const normalizedSearch = normalizedFullName({
    firstName: search,
    lastName: '',
  });

  const residents = await prisma.resident.findMany({
    where: {
      OR: [
        { residentNumber: { contains: search } },
        ...(normalizedSearch
          ? [
              { nameNormalized: { contains: normalizedSearch } },
              { nameKey: { contains: normalizedSearch } },
            ]
          : []),
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: query.limit,
  });

  return residents.map(toResidentLookup);
}

export async function findResidentOrThrow(
  residentId: string,
  tx: TransactionClient | typeof prisma = prisma,
): Promise<Resident> {
  const resident = await tx.resident.findUnique({ where: { id: residentId } });
  if (!resident) {
    throw new AppError(
      404,
      ERROR_CODES.RESIDENT_NOT_FOUND,
      'The resident record could not be found.',
    );
  }
  return resident;
}

export async function loadResidentDetail(
  resident: Resident,
): Promise<ReturnType<typeof toResidentDetail>> {
  const membership = await prisma.householdMembership.findUnique({
    where: { activeResidentId: resident.id },
    include: {
      household: {
        include: { purok: true },
      },
    },
  });

  const household: ResidentHouseholdDto | null = membership
    ? {
        id: membership.household.id,
        householdNumber: membership.household.householdNumber,
        purok: {
          id: membership.household.purok.id,
          code: membership.household.purok.code,
          name: membership.household.purok.name,
        },
        addressLine: membership.household.addressLine,
        relationship: membership.relationship,
        isHead: membership.household.headResidentId === resident.id,
        status: membership.household.status,
        verificationStatus: membership.household.verificationStatus,
      }
    : null;

  return toResidentDetail(resident, household);
}

export async function getResident(
  residentId: string,
  actor: AuthUser,
  context: AuditContext,
) {
  const resident = await findResidentOrThrow(residentId);
  await recordSensitiveReadAudit({
    action: AUDIT_ACTIONS.RESIDENT_PROFILE_VIEWED,
    actorUserId: actor.id,
    entityType: 'Resident',
    entityId: resident.id,
    metadata: {
      residentNumber: resident.residentNumber,
      resource: 'profile',
    },
    ...context,
  });
  return loadResidentDetail(resident);
}

export async function getResidentHistory(
  residentId: string,
  actor: AuthUser,
  query: { page: number; pageSize: number },
  context: AuditContext,
): Promise<{
  items: ResidentChangeDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const resident = await findResidentOrThrow(residentId);
  await recordSensitiveReadAudit({
    action: AUDIT_ACTIONS.RESIDENT_HISTORY_VIEWED,
    actorUserId: actor.id,
    entityType: 'Resident',
    entityId: resident.id,
    metadata: {
      residentNumber: resident.residentNumber,
      resource: 'history',
    },
    ...context,
  });

  const [items, total] = await Promise.all([
    prisma.residentChange.findMany({
      where: { residentId },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.residentChange.count({ where: { residentId } }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      action: item.action,
      changes: parseChangePayload(item.changes),
      reason: item.reason,
      actor: item.actor
        ? { id: item.actor.id, fullName: fullNameOfUser(item.actor) }
        : null,
      createdAt: item.createdAt.toISOString(),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function createResident(
  input: ResidentDraftInput,
  actor: AuthUser,
  context?: AuditContext,
) {
  const identityKey = identityKeyFor(input, input.birthDate);

  const resident = await withTransactionRetry(async (tx) => {
    await lockIdentity(tx, identityKey);
    const candidates = await findDuplicateCandidates(tx, input);
    if (candidates.length > 0) {
      throw new AppError(
        409,
        ERROR_CODES.POSSIBLE_DUPLICATE,
        'A possible duplicate resident was found. Submit a duplicate review for approval.',
        { candidates },
      );
    }
    return insertResidentInTransaction(tx, input, actor, { context });
  });

  return loadResidentDetail(resident);
}

function mergeUpdate(
  existing: Resident,
  input: {
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    suffix?: string | null;
    birthDate?: string;
    sex?: Sex;
    contactNumber?: string | null;
    recordSource?: ResidentDraftInput['recordSource'];
    sourceReference?: string | null;
    sourceReferenceUnavailableReason?: string | null;
  },
): ResidentDraftInput {
  return {
    firstName: input.firstName ?? existing.firstName,
    middleName:
      input.middleName !== undefined ? input.middleName : existing.middleName,
    lastName: input.lastName ?? existing.lastName,
    suffix: input.suffix !== undefined ? input.suffix : existing.suffix,
    birthDate: input.birthDate ?? formatBirthDate(existing.birthDate),
    sex: input.sex ?? existing.sex,
    contactNumber:
      input.contactNumber !== undefined
        ? input.contactNumber
        : existing.contactNumber,
    residencyStatus: existing.residencyStatus,
    recordSource: input.recordSource ?? existing.recordSource,
    sourceReference:
      input.sourceReference !== undefined
        ? input.sourceReference
        : existing.sourceReference,
    sourceReferenceUnavailableReason:
      input.sourceReferenceUnavailableReason !== undefined
        ? input.sourceReferenceUnavailableReason
        : existing.sourceReferenceUnavailableReason,
  };
}

export async function updateResident(
  residentId: string,
  input: {
    version: number;
    duplicateReason?: string | null;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    suffix?: string | null;
    birthDate?: string;
    sex?: Sex;
    contactNumber?: string | null;
    recordSource?: ResidentDraftInput['recordSource'];
    sourceReference?: string | null;
    sourceReferenceUnavailableReason?: string | null;
  },
  actor: AuthUser,
  context: AuditContext,
) {
  const result = await withTransactionRetry(async (tx) => {
    await lockResidentRow(tx, residentId);
    const existing = await findResidentOrThrow(residentId, tx);

    if (existing.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.STALE_RESIDENT,
        'This resident record changed since you opened it. Reload and try again.',
        { currentVersion: existing.version },
      );
    }

    const merged = mergeUpdate(existing, input);
    assertSourceRules(merged);
    assertSexRules(merged, actor, existing.sex);

    const identityChanged =
      existing.firstName !== merged.firstName ||
      existing.middleName !== (merged.middleName ?? null) ||
      existing.lastName !== merged.lastName ||
      existing.suffix !== (merged.suffix ?? null) ||
      formatBirthDate(existing.birthDate) !== merged.birthDate ||
      existing.sex !== merged.sex;

    let duplicateOverride = false;
    if (identityChanged) {
      await lockIdentity(tx, identityKeyFor(merged, merged.birthDate));
      const candidates = await findDuplicateCandidates(tx, merged, residentId);
      if (candidates.length > 0) {
        duplicateOverride = true;
        if (!input.duplicateReason) {
          throw new AppError(
            409,
            ERROR_CODES.POSSIBLE_DUPLICATE,
            'This change would create a possible duplicate. A Secretary must document an override reason.',
            { candidates },
          );
        }
        if (!hasPermission(actor.role, PERMISSIONS.RESIDENTS_VERIFY)) {
          throw new AppError(
            403,
            ERROR_CODES.FORBIDDEN,
            'Only the Barangay Secretary may override a possible duplicate on an existing record.',
          );
        }
      }
    }

    const before: Record<string, unknown> = {
      firstName: existing.firstName,
      middleName: existing.middleName,
      lastName: existing.lastName,
      suffix: existing.suffix,
      birthDate: formatBirthDate(existing.birthDate),
      sex: existing.sex,
      contactNumber: existing.contactNumber,
      recordSource: existing.recordSource,
      sourceReference: existing.sourceReference,
      sourceReferenceUnavailableReason:
        existing.sourceReferenceUnavailableReason,
    };
    const after: Record<string, unknown> = {
      firstName: merged.firstName,
      middleName: merged.middleName ?? null,
      lastName: merged.lastName,
      suffix: merged.suffix ?? null,
      birthDate: merged.birthDate,
      sex: merged.sex,
      contactNumber: merged.contactNumber ?? null,
      recordSource: merged.recordSource,
      sourceReference: merged.sourceReference ?? null,
      sourceReferenceUnavailableReason:
        merged.sourceReferenceUnavailableReason ?? null,
    };
    const fields = Object.keys(before);
    const changes = changeEntries(before, after, fields);
    const resetVerification =
      identityChanged &&
      existing.verificationStatus === VerificationStatus.VERIFIED;

    if (resetVerification) {
      changes.push({
        field: 'verificationStatus',
        before: VerificationStatus.VERIFIED,
        after: VerificationStatus.UNVERIFIED,
      });
    }

    if (changes.length === 0) {
      throw validationError('firstName', 'Provide at least one changed field.');
    }

    const updated = await tx.resident.updateMany({
      where: { id: residentId, version: input.version },
      data: {
        firstName: merged.firstName,
        middleName: merged.middleName ?? null,
        lastName: merged.lastName,
        suffix: merged.suffix ?? null,
        nameNormalized: normalizedFullName(merged),
        nameKey: normalizedNameKey(merged),
        birthDate: parseBirthDate(merged.birthDate),
        sex: merged.sex,
        contactNumber: merged.contactNumber ?? null,
        recordSource: merged.recordSource,
        sourceReference: merged.sourceReference ?? null,
        sourceReferenceUnavailableReason:
          merged.sourceReferenceUnavailableReason ?? null,
        ...(resetVerification
          ? {
              verificationStatus: VerificationStatus.UNVERIFIED,
              verifiedAt: null,
              verifiedByUserId: null,
            }
          : {}),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.STALE_RESIDENT,
        'This resident record changed since you opened it. Reload and try again.',
      );
    }

    const resident = await findResidentOrThrow(residentId, tx);
    await createResidentChange(
      tx,
      residentId,
      actor.id,
      'UPDATED',
      changes,
      input.duplicateReason ?? null,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.RESIDENT_UPDATED,
      actorUserId: actor.id,
      entityType: 'Resident',
      entityId: residentId,
      metadata: {
        residentNumber: resident.residentNumber,
        changedFields: changes.map((change) => change.field),
        identityChanged,
        duplicateOverride,
      },
      ...context,
    });
    return resident;
  });

  return loadResidentDetail(result);
}

const ALLOWED_TRANSITIONS: Record<
  ResidencyStatus,
  readonly ResidencyStatus[]
> = {
  [ResidencyStatus.ACTIVE]: [
    ResidencyStatus.MOVED_OUT,
    ResidencyStatus.DECEASED,
    ResidencyStatus.INACTIVE,
  ],
  [ResidencyStatus.MOVED_OUT]: [
    ResidencyStatus.ACTIVE,
    ResidencyStatus.DECEASED,
    ResidencyStatus.INACTIVE,
  ],
  [ResidencyStatus.INACTIVE]: [
    ResidencyStatus.ACTIVE,
    ResidencyStatus.MOVED_OUT,
    ResidencyStatus.DECEASED,
  ],
  [ResidencyStatus.DECEASED]: [],
};

export async function changeResidentStatus(
  residentId: string,
  input: { status: ResidencyStatus; reason: string; version: number },
  actor: AuthUser,
  context?: AuditContext,
) {
  const resident = await withTransactionRetry(async (tx) => {
    const initialMembership = await tx.householdMembership.findUnique({
      where: { activeResidentId: residentId },
    });
    const initialHousehold = initialMembership
      ? await tx.household.findUnique({
          where: { id: initialMembership.householdId },
        })
      : null;
    if (initialHousehold) {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM puroks WHERE id = ${initialHousehold.purokId} FOR UPDATE
      `);
    }

    await lockResidentRow(tx, residentId);
    const existing = await findResidentOrThrow(residentId, tx);

    if (existing.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.STALE_RESIDENT,
        'This resident record changed since you opened it. Reload and try again.',
        { currentVersion: existing.version },
      );
    }

    if (existing.residencyStatus === ResidencyStatus.DECEASED) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_REQUIRED,
        'A deceased status can only be reversed through the documented correction workflow.',
      );
    }

    if (existing.residencyStatus === input.status) {
      throw new AppError(
        409,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        'The resident already has that residency status.',
      );
    }

    if (!ALLOWED_TRANSITIONS[existing.residencyStatus].includes(input.status)) {
      throw new AppError(
        409,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        'That residency status transition is not allowed.',
      );
    }

    const membership = await tx.householdMembership.findUnique({
      where: { activeResidentId: residentId },
    });
    let household = null;
    if (membership) {
      household = await tx.household.findUnique({
        where: { id: membership.householdId },
      });
      if (
        !initialMembership ||
        !initialHousehold ||
        !household ||
        membership.id !== initialMembership.id ||
        household.purokId !== initialHousehold.purokId
      ) {
        throw new AppError(
          409,
          ERROR_CODES.CONCURRENT_MODIFICATION,
          'This resident household changed while the status update was being processed. Reload and try again.',
        );
      }
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM households WHERE id = ${membership.householdId} FOR UPDATE
      `);
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM household_memberships WHERE id = ${membership.id} FOR UPDATE
      `);
      const currentMembership = await tx.householdMembership.findUnique({
        where: { id: membership.id },
      });
      if (
        !currentMembership ||
        currentMembership.activeResidentId !== residentId
      ) {
        throw new AppError(
          409,
          ERROR_CODES.CONCURRENT_MODIFICATION,
          'This resident household changed while the status update was being processed. Reload and try again.',
        );
      }
    }

    const updated = await tx.resident.updateMany({
      where: { id: residentId, version: input.version },
      data: {
        residencyStatus: input.status,
        statusChangedAt: new Date(),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.STALE_RESIDENT,
        'This resident record changed since you opened it. Reload and try again.',
      );
    }

    const result = await findResidentOrThrow(residentId, tx);
    await createResidentChange(
      tx,
      residentId,
      actor.id,
      'STATUS_CHANGED',
      [
        {
          field: 'residencyStatus',
          before: existing.residencyStatus,
          after: input.status,
        },
      ],
      input.reason,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.RESIDENT_STATUS_CHANGED,
      actorUserId: actor.id,
      entityType: 'Resident',
      entityId: residentId,
      metadata: {
        residentNumber: result.residentNumber,
        fromStatus: existing.residencyStatus,
        toStatus: input.status,
      },
      ...(context ?? {}),
    });

    if (membership && household) {
      const endedAt = new Date();
      if (
        input.status === ResidencyStatus.MOVED_OUT ||
        input.status === ResidencyStatus.DECEASED
      ) {
        await tx.householdMembership.update({
          where: { id: membership.id },
          data: {
            status: HouseholdMembershipStatus.ENDED,
            activeResidentId: null,
            endedAt,
            endReason:
              input.status === ResidencyStatus.DECEASED
                ? MembershipEndReason.DECEASED
                : MembershipEndReason.MOVED_OUT,
            endNote: input.reason,
            updatedByUserId: actor.id,
            version: { increment: 1 },
          },
        });
        await tx.household.update({
          where: { id: household.id },
          data: {
            ...(household.headResidentId === residentId
              ? { headResidentId: null }
              : {}),
            verificationStatus: VerificationStatus.UNVERIFIED,
            verifiedAt: null,
            verifiedByUserId: null,
            updatedByUserId: actor.id,
            version: { increment: 1 },
          },
        });
        await tx.householdChange.create({
          data: {
            householdId: household.id,
            actorUserId: actor.id,
            action: HouseholdChangeAction.MEMBER_ENDED,
            changes: JSON.stringify({
              membershipId: membership.id,
              residentId,
              residentStatus: input.status,
              endReason:
                input.status === ResidencyStatus.DECEASED
                  ? MembershipEndReason.DECEASED
                  : MembershipEndReason.MOVED_OUT,
            }),
            reason: input.reason,
          },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_ENDED,
          actorUserId: actor.id,
          entityType: 'Household',
          entityId: household.id,
          metadata: {
            householdNumber: household.householdNumber,
            membershipId: membership.id,
            residentId,
            residentStatus: input.status,
          },
          ...(context ?? {}),
        });
      } else if (input.status === ResidencyStatus.INACTIVE) {
        await tx.household.update({
          where: { id: household.id },
          data: {
            verificationStatus: VerificationStatus.UNVERIFIED,
            verifiedAt: null,
            verifiedByUserId: null,
            updatedByUserId: actor.id,
            version: { increment: 1 },
          },
        });
        await tx.householdChange.create({
          data: {
            householdId: household.id,
            actorUserId: actor.id,
            action: HouseholdChangeAction.MEMBER_STATUS_CHANGED,
            changes: JSON.stringify({
              membershipId: membership.id,
              residentId,
              residentStatus: input.status,
            }),
            reason: input.reason,
          },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.HOUSEHOLD_REVIEW_REQUIRED,
          actorUserId: actor.id,
          entityType: 'Household',
          entityId: household.id,
          metadata: {
            householdNumber: household.householdNumber,
            membershipId: membership.id,
            residentId,
            reason: input.status,
          },
          ...(context ?? {}),
        });
      }
    }

    return result;
  });

  return loadResidentDetail(resident);
}

export async function verifyResident(
  residentId: string,
  input: { version: number },
  actor: AuthUser,
  context?: AuditContext,
) {
  const resident = await withTransactionRetry(async (tx) => {
    await lockResidentRow(tx, residentId);
    const existing = await findResidentOrThrow(residentId, tx);

    if (existing.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.STALE_RESIDENT,
        'This resident record changed since you opened it. Reload and try again.',
        { currentVersion: existing.version },
      );
    }

    if (existing.verificationStatus === VerificationStatus.VERIFIED) {
      throw new AppError(
        409,
        ERROR_CODES.RESIDENT_ALREADY_VERIFIED,
        'This resident record is already verified.',
      );
    }

    const updated = await tx.resident.updateMany({
      where: { id: residentId, version: input.version },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedByUserId: actor.id,
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.STALE_RESIDENT,
        'This resident record changed since you opened it. Reload and try again.',
      );
    }

    const result = await findResidentOrThrow(residentId, tx);
    await createResidentChange(
      tx,
      residentId,
      actor.id,
      'VERIFIED',
      [
        {
          field: 'verificationStatus',
          before: VerificationStatus.UNVERIFIED,
          after: VerificationStatus.VERIFIED,
        },
      ],
      null,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.RESIDENT_VERIFIED,
      actorUserId: actor.id,
      entityType: 'Resident',
      entityId: residentId,
      metadata: { residentNumber: result.residentNumber },
      ...(context ?? {}),
    });
    return result;
  });

  return loadResidentDetail(resident);
}

export async function getResidentForInternalUse(
  residentId: string,
): Promise<Resident> {
  return findResidentOrThrow(residentId);
}

export function draftFromCreateInput(
  input: ResidentDraftInput,
): ResidentDraftInput {
  return { ...residentDraftFromInput(input), residencyStatus: input.residencyStatus };
}
