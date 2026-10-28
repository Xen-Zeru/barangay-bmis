import {
  HouseholdChangeAction,
  HouseholdMembershipStatus,
  HouseholdStatus,
  MembershipEndReason,
  Prisma,
  PurokStatus,
  ResidencyStatus,
  VerificationStatus,
} from '@prisma/client';
import type {
  Household,
  HouseholdMembership,
  Purok,
  Resident,
} from '@prisma/client';
import {
  AUDIT_ACTIONS,
  recordSensitiveReadAudit,
  writeAudit,
} from '../../lib/audit';
import type { AuditContext } from '../../lib/audit';
import { manilaYear } from '../../lib/date';
import { allocateYearlySequence } from '../../lib/yearly-sequence';
import { AppError, ERROR_CODES } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { withTransactionRetry } from '../../lib/transaction';
import type { TransactionClient } from '../../lib/transaction';
import {
  hasPermission,
  PERMISSIONS,
} from '../../security/permissions';
import type { AuthUser } from '../auth/auth.types';
import { findPurokOrThrow, lockPurokRow } from '../puroks/puroks.service';
import { lockResidentRow } from '../residents/resident-locking';
import {
  formatBirthDate,
  fullNameOf,
} from '../residents/resident-utils';
import type {
  AddHouseholdMemberInput,
  ChangeHouseholdHeadInput,
  CreateHouseholdInput,
  EndHouseholdMemberInput,
  HouseholdHistoryQuery,
  HouseholdListQuery,
  HouseholdStatusInput,
  TransferHouseholdMemberInput,
  UpdateHouseholdInput,
  VerifyHouseholdInput,
} from './households.schemas';

const householdInclude = {
  purok: true,
  headResident: true,
  memberships: {
    where: { status: HouseholdMembershipStatus.ACTIVE },
    orderBy: { joinedAt: 'asc' },
    include: { resident: true },
  },
} satisfies Prisma.HouseholdInclude;

type HouseholdWithRelations = Prisma.HouseholdGetPayload<{
  include: typeof householdInclude;
}>;

type MembershipWithResident = HouseholdWithRelations['memberships'][number];

export interface HouseholdPurokDto {
  id: string;
  code: string;
  name: string;
  status: PurokStatus;
}

export interface HouseholdHeadDto {
  id: string;
  residentNumber: string;
  fullName: string;
}

export interface HouseholdMemberDto {
  id: string;
  residentId: string;
  residentNumber: string;
  fullName: string;
  relationship: string | null;
  joinedAt: string;
  status: HouseholdMembershipStatus;
  version: number;
  birthYear: number;
  birthDate: string | null;
  sex: string;
  residencyStatus: ResidencyStatus;
  verificationStatus: VerificationStatus | null;
  contactNumber: string | null;
}

export interface HouseholdSummaryDto {
  id: string;
  householdNumber: string;
  purok: HouseholdPurokDto;
  addressLine: string;
  landmark: string | null;
  head: HouseholdHeadDto | null;
  status: HouseholdStatus;
  statusChangedAt: string;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  version: number;
  activeMemberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdDetailDto extends HouseholdSummaryDto {
  members: HouseholdMemberDto[];
}

export interface HouseholdChangeDto {
  id: string;
  action: HouseholdChangeAction;
  changes: Record<string, unknown> | null;
  reason: string | null;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function isLimitedView(actor: AuthUser): boolean {
  return !hasPermission(actor.role, PERMISSIONS.RESIDENTS_READ);
}

function purokDto(purok: Purok): HouseholdPurokDto {
  return {
    id: purok.id,
    code: purok.code,
    name: purok.name,
    status: purok.status,
  };
}

function headDto(resident: Resident | null): HouseholdHeadDto | null {
  if (!resident) {
    return null;
  }
  return {
    id: resident.id,
    residentNumber: resident.residentNumber,
    fullName: fullNameOf(resident),
  };
}

function memberDto(
  membership: MembershipWithResident,
  limited: boolean,
): HouseholdMemberDto {
  const resident = membership.resident;
  return {
    id: membership.id,
    residentId: resident.id,
    residentNumber: resident.residentNumber,
    fullName: fullNameOf(resident),
    relationship: membership.relationship,
    joinedAt: membership.joinedAt.toISOString(),
    status: membership.status,
    version: membership.version,
    birthYear: resident.birthDate.getUTCFullYear(),
    birthDate: limited ? null : formatBirthDate(resident.birthDate),
    sex: resident.sex,
    residencyStatus: resident.residencyStatus,
    verificationStatus: limited ? null : resident.verificationStatus,
    contactNumber: limited ? null : resident.contactNumber,
  };
}

function toHouseholdSummary(
  household: HouseholdWithRelations,
  actor: AuthUser,
): HouseholdSummaryDto {
  const limited = isLimitedView(actor);
  return {
    id: household.id,
    householdNumber: household.householdNumber,
    purok: purokDto(household.purok),
    addressLine: household.addressLine,
    landmark: limited ? null : household.landmark,
    head: headDto(household.headResident),
    status: household.status,
    statusChangedAt: household.statusChangedAt.toISOString(),
    verificationStatus: household.verificationStatus,
    verifiedAt: limited ? null : household.verifiedAt?.toISOString() ?? null,
    version: household.version,
    activeMemberCount: household.memberships.length,
    createdAt: household.createdAt.toISOString(),
    updatedAt: household.updatedAt.toISOString(),
  };
}

function toHouseholdDetail(
  household: HouseholdWithRelations,
  actor: AuthUser,
): HouseholdDetailDto {
  const limited = isLimitedView(actor);
  return {
    ...toHouseholdSummary(household, actor),
    members: household.memberships.map((membership) =>
      memberDto(membership, limited),
    ),
  };
}

function parseChanges(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function loadHousehold(
  householdId: string,
  actor: AuthUser,
): Promise<HouseholdDetailDto> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: householdInclude,
  });
  if (!household) {
    throw new AppError(
      404,
      ERROR_CODES.HOUSEHOLD_NOT_FOUND,
      'The household record could not be found.',
    );
  }
  return toHouseholdDetail(household, actor);
}

async function findHouseholdRowOrThrow(
  householdId: string,
  client: TransactionClient | typeof prisma = prisma,
): Promise<Household> {
  const household = await client.household.findUnique({
    where: { id: householdId },
  });
  if (!household) {
    throw new AppError(
      404,
      ERROR_CODES.HOUSEHOLD_NOT_FOUND,
      'The household record could not be found.',
    );
  }
  return household;
}

async function lockHouseholdRow(
  tx: TransactionClient,
  householdId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM households WHERE id = ${householdId} FOR UPDATE
  `);
}

async function lockMembershipRow(
  tx: TransactionClient,
  membershipId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM household_memberships WHERE id = ${membershipId} FOR UPDATE
  `);
}

async function lockPuroks(
  tx: TransactionClient,
  purokIds: string[],
): Promise<void> {
  for (const purokId of [...new Set(purokIds)].sort()) {
    await lockPurokRow(tx, purokId);
  }
}

async function lockHouseholds(
  tx: TransactionClient,
  householdIds: string[],
): Promise<void> {
  for (const householdId of [...new Set(householdIds)].sort()) {
    await lockHouseholdRow(tx, householdId);
  }
}

async function lockCurrentHousehold(
  tx: TransactionClient,
  householdId: string,
): Promise<Household> {
  const initial = await findHouseholdRowOrThrow(householdId, tx);
  await lockPurokRow(tx, initial.purokId);
  await lockHouseholdRow(tx, householdId);
  const current = await findHouseholdRowOrThrow(householdId, tx);
  if (current.purokId !== initial.purokId) {
    throw new AppError(
      409,
      ERROR_CODES.CONCURRENT_MODIFICATION,
      'Another request modified this household. Please reload and try again.',
    );
  }
  return current;
}

async function allocateHouseholdNumber(
  tx: TransactionClient,
  now = new Date(),
): Promise<string> {
  const year = manilaYear(now);
  const lastNumber = await allocateYearlySequence(
    tx,
    'household_number_sequences',
    year,
  );
  if (lastNumber > 999_999) {
    throw new AppError(
      500,
      ERROR_CODES.HOUSEHOLD_NUMBER_EXHAUSTED,
      'The household number sequence for this year is exhausted. Contact the system administrator.',
    );
  }
  return `HH-${year}-${String(lastNumber).padStart(6, '0')}`;
}

async function writeHouseholdChange(
  tx: TransactionClient,
  householdId: string,
  actorUserId: string,
  action: HouseholdChangeAction,
  changes: Record<string, unknown> | null,
  reason: string | null,
): Promise<void> {
  await tx.householdChange.create({
    data: {
      householdId,
      actorUserId,
      action,
      changes: changes ? JSON.stringify(changes) : null,
      reason,
    },
  });
}

function verificationReset(): {
  verificationStatus: VerificationStatus;
  verifiedAt: null;
  verifiedByUserId: null;
} {
  return {
    verificationStatus: VerificationStatus.UNVERIFIED,
    verifiedAt: null,
    verifiedByUserId: null,
  };
}

async function activeMembershipForResident(
  tx: TransactionClient,
  residentId: string,
): Promise<HouseholdMembership | null> {
  return tx.householdMembership.findUnique({
    where: { activeResidentId: residentId },
  });
}

async function assertResidentCanJoin(
  tx: TransactionClient,
  residentId: string,
): Promise<Resident> {
  const resident = await tx.resident.findUnique({ where: { id: residentId } });
  if (!resident) {
    throw new AppError(
      404,
      ERROR_CODES.RESIDENT_NOT_FOUND,
      'The resident record could not be found.',
    );
  }
  if (resident.residencyStatus !== ResidencyStatus.ACTIVE) {
    throw new AppError(
      409,
      ERROR_CODES.RESIDENT_NOT_ACTIVE,
      'Only an active resident can join a household.',
    );
  }
  const activeMembership = await activeMembershipForResident(tx, residentId);
  if (activeMembership) {
    throw new AppError(
      409,
      ERROR_CODES.RESIDENT_ALREADY_IN_HOUSEHOLD,
      'This resident already belongs to a household.',
      {
        householdId: activeMembership.householdId,
        membershipId: activeMembership.id,
      },
    );
  }
  return resident;
}

function assertHouseholdActive(household: Household): void {
  if (household.status !== HouseholdStatus.ACTIVE) {
    throw new AppError(
      409,
      ERROR_CODES.HOUSEHOLD_NOT_ACTIVE,
      'This household is inactive. Reactivate it before making roster changes.',
    );
  }
}

function assertPurokActive(purok: Purok): void {
  if (purok.status !== PurokStatus.ACTIVE) {
    throw new AppError(
      409,
      ERROR_CODES.PUROK_INACTIVE,
      'The selected Purok is inactive.',
    );
  }
}

function staleHousehold(currentVersion: number): AppError {
  return new AppError(
    409,
    ERROR_CODES.STALE_HOUSEHOLD,
    'This household changed since you opened it. Reload and try again.',
    { currentVersion },
  );
}

export async function listHouseholds(
  query: HouseholdListQuery,
  actor: AuthUser,
): Promise<{ items: HouseholdSummaryDto[]; pagination: Pagination }> {
  const search = query.q?.trim() ?? '';
  const where: Prisma.HouseholdWhereInput = {
    ...(query.purokId ? { purokId: query.purokId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.verificationStatus
      ? { verificationStatus: query.verificationStatus }
      : {}),
    ...(search
      ? {
          OR: [
            { householdNumber: { contains: search } },
            { addressLine: { contains: search } },
            {
              headResident: {
                is: {
                  OR: [
                    { firstName: { contains: search } },
                    { lastName: { contains: search } },
                    { residentNumber: { contains: search } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.HouseholdOrderByWithRelationInput[] =
    query.sort === 'householdNumber_desc'
      ? [{ householdNumber: 'desc' }]
      : query.sort === 'updatedAt_desc'
        ? [{ updatedAt: 'desc' }]
        : [{ householdNumber: 'asc' }];

  const [items, total] = await Promise.all([
    prisma.household.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: householdInclude,
    }),
    prisma.household.count({ where }),
  ]);

  return {
    items: items.map((household) => toHouseholdSummary(household, actor)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getHousehold(
  householdId: string,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  const household = await loadHousehold(householdId, actor);
  await recordSensitiveReadAudit({
    action: AUDIT_ACTIONS.HOUSEHOLD_PROFILE_VIEWED,
    actorUserId: actor.id,
    entityType: 'Household',
    entityId: household.id,
    metadata: {
      householdNumber: household.householdNumber,
      resource: 'profile',
      access: isLimitedView(actor) ? 'limited' : 'full',
    },
    ...context,
  });
  return household;
}

export async function getHouseholdHistory(
  householdId: string,
  query: HouseholdHistoryQuery,
  actor: AuthUser,
  context: AuditContext,
): Promise<{ items: HouseholdChangeDto[]; pagination: Pagination }> {
  const household = await findHouseholdRowOrThrow(householdId);
  await recordSensitiveReadAudit({
    action: AUDIT_ACTIONS.HOUSEHOLD_HISTORY_VIEWED,
    actorUserId: actor.id,
    entityType: 'Household',
    entityId: household.id,
    metadata: {
      householdNumber: household.householdNumber,
      resource: 'history',
    },
    ...context,
  });

  const [items, total] = await Promise.all([
    prisma.householdChange.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.householdChange.count({ where: { householdId } }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      action: item.action,
      changes: parseChanges(item.changes),
      reason: item.reason,
      actor: item.actor
        ? {
            id: item.actor.id,
            fullName: `${item.actor.firstName} ${item.actor.lastName}`.trim(),
          }
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

export async function createHousehold(
  input: CreateHouseholdInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  const householdId = await withTransactionRetry(async (tx) => {
    const householdNumber = await allocateHouseholdNumber(tx);
    await lockPurokRow(tx, input.purokId);
    const purok = await findPurokOrThrow(input.purokId, tx);
    assertPurokActive(purok);

    const headResidentId = input.headResidentId ?? null;
    if (headResidentId) {
      await lockResidentRow(tx, headResidentId);
      await assertResidentCanJoin(tx, headResidentId);
    }

    const household = await tx.household.create({
      data: {
        householdNumber,
        purokId: input.purokId,
        addressLine: input.addressLine,
        landmark: input.landmark ?? null,
        headResidentId,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
    });

    await writeHouseholdChange(
      tx,
      household.id,
      actor.id,
      HouseholdChangeAction.CREATED,
      {
        householdNumber,
        purokId: input.purokId,
        addressLine: input.addressLine,
        headResidentId,
      },
      null,
    );

    if (headResidentId) {
      const membership = await tx.householdMembership.create({
        data: {
          householdId: household.id,
          residentId: headResidentId,
          activeResidentId: headResidentId,
          relationship: 'Head',
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        },
      });
      await writeHouseholdChange(
        tx,
        household.id,
        actor.id,
        HouseholdChangeAction.MEMBER_ADDED,
        { membershipId: membership.id, residentId: headResidentId },
        null,
      );
      await writeAudit(tx, {
        action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_ADDED,
        actorUserId: actor.id,
        entityType: 'Household',
        entityId: household.id,
        metadata: {
          householdNumber,
          residentId: headResidentId,
          membershipId: membership.id,
          relationship: 'Head',
        },
        ...context,
      });
    }

    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_CREATED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: household.id,
      metadata: {
        householdNumber,
        purokId: input.purokId,
        headResidentId,
      },
      ...context,
    });

    return household.id;
  });

  return loadHousehold(householdId, actor);
}

export async function updateHousehold(
  householdId: string,
  input: UpdateHouseholdInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  await withTransactionRetry(async (tx) => {
    const initial = await findHouseholdRowOrThrow(householdId, tx);
    const targetPurokId = input.purokId ?? initial.purokId;
    await lockPuroks(tx, [initial.purokId, targetPurokId]);
    await lockHouseholdRow(tx, householdId);
    const existing = await findHouseholdRowOrThrow(householdId, tx);
    if (existing.purokId !== initial.purokId) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'Another request modified this household. Please reload and try again.',
      );
    }
    if (existing.version !== input.version) {
      throw staleHousehold(existing.version);
    }

    if (targetPurokId !== existing.purokId) {
      const targetPurok = await findPurokOrThrow(targetPurokId, tx);
      assertPurokActive(targetPurok);
    }

    const changes: Record<string, { before: unknown; after: unknown }> = {};
    if (input.purokId !== undefined && input.purokId !== existing.purokId) {
      changes.purokId = {
        before: existing.purokId,
        after: input.purokId,
      };
    }
    if (
      input.addressLine !== undefined &&
      input.addressLine !== existing.addressLine
    ) {
      changes.addressLine = {
        before: existing.addressLine,
        after: input.addressLine,
      };
    }
    if (
      input.landmark !== undefined &&
      (input.landmark ?? null) !== existing.landmark
    ) {
      changes.landmark = {
        before: existing.landmark,
        after: input.landmark ?? null,
      };
    }
    if (Object.keys(changes).length === 0) {
      return;
    }

    const resetVerification =
      changes.purokId !== undefined ||
      changes.addressLine !== undefined ||
      changes.landmark !== undefined;

    await tx.household.update({
      where: { id: householdId },
      data: {
        ...(input.purokId !== undefined ? { purokId: input.purokId } : {}),
        ...(input.addressLine !== undefined
          ? { addressLine: input.addressLine }
          : {}),
        ...(input.landmark !== undefined
          ? { landmark: input.landmark ?? null }
          : {}),
        ...(resetVerification ? verificationReset() : {}),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });

    await writeHouseholdChange(
      tx,
      householdId,
      actor.id,
      HouseholdChangeAction.UPDATED,
      changes,
      null,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_UPDATED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: householdId,
      metadata: {
        householdNumber: existing.householdNumber,
        changes,
        verificationReset: resetVerification,
      },
      ...context,
    });
  });

  return loadHousehold(householdId, actor);
}

export async function changeHouseholdStatus(
  householdId: string,
  input: HouseholdStatusInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  await withTransactionRetry(async (tx) => {
    const existing = await lockCurrentHousehold(tx, householdId);
    if (existing.version !== input.version) {
      throw staleHousehold(existing.version);
    }
    if (existing.status === input.status) {
      throw new AppError(
        409,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        `This household is already ${input.status.toLowerCase()}.`,
      );
    }

    if (input.status === HouseholdStatus.INACTIVE) {
      const activeMembers = await tx.householdMembership.count({
        where: {
          householdId,
          status: HouseholdMembershipStatus.ACTIVE,
        },
      });
      if (activeMembers > 0) {
        throw new AppError(
          409,
          ERROR_CODES.HOUSEHOLD_HAS_ACTIVE_MEMBERS,
          'End all active memberships before deactivating this household.',
          { activeMemberCount: activeMembers },
        );
      }
    } else {
      const purok = await findPurokOrThrow(existing.purokId, tx);
      assertPurokActive(purok);
    }

    await tx.household.update({
      where: { id: householdId },
      data: {
        status: input.status,
        statusChangedAt: new Date(),
        ...(input.status === HouseholdStatus.INACTIVE
          ? { headResidentId: null, ...verificationReset() }
          : {}),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await writeHouseholdChange(
      tx,
      householdId,
      actor.id,
      HouseholdChangeAction.STATUS_CHANGED,
      { before: existing.status, after: input.status },
      input.reason,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_STATUS_CHANGED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: householdId,
      metadata: {
        householdNumber: existing.householdNumber,
        before: existing.status,
        after: input.status,
        reason: input.reason,
      },
      ...context,
    });
  });

  return loadHousehold(householdId, actor);
}

export async function verifyHousehold(
  householdId: string,
  input: VerifyHouseholdInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  await withTransactionRetry(async (tx) => {
    const existing = await lockCurrentHousehold(tx, householdId);
    if (existing.version !== input.version) {
      throw staleHousehold(existing.version);
    }
    assertHouseholdActive(existing);
    if (existing.verificationStatus === VerificationStatus.VERIFIED) {
      throw new AppError(
        409,
        ERROR_CODES.HOUSEHOLD_ALREADY_VERIFIED,
        'This household is already verified.',
      );
    }
    if (!existing.headResidentId) {
      throw new AppError(
        409,
        ERROR_CODES.HOUSEHOLD_HEAD_REQUIRED,
        'Assign a household head before verifying this household.',
      );
    }

    const headMembership = await tx.householdMembership.findFirst({
      where: {
        householdId,
        residentId: existing.headResidentId,
        status: HouseholdMembershipStatus.ACTIVE,
      },
    });
    if (!headMembership) {
      throw new AppError(
        409,
        ERROR_CODES.HOUSEHOLD_HEAD_NOT_MEMBER,
        'The household head must have an active membership.',
      );
    }

    await tx.household.update({
      where: { id: householdId },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedByUserId: actor.id,
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await writeHouseholdChange(
      tx,
      householdId,
      actor.id,
      HouseholdChangeAction.VERIFIED,
      {
        verificationStatus: {
          before: existing.verificationStatus,
          after: VerificationStatus.VERIFIED,
        },
      },
      null,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_VERIFIED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: householdId,
      metadata: { householdNumber: existing.householdNumber },
      ...context,
    });
  });

  return loadHousehold(householdId, actor);
}

export async function changeHouseholdHead(
  householdId: string,
  input: ChangeHouseholdHeadInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  await withTransactionRetry(async (tx) => {
    const initial = await findHouseholdRowOrThrow(householdId, tx);
    await lockPurokRow(tx, initial.purokId);
    await lockResidentRow(tx, input.residentId);
    await lockHouseholdRow(tx, householdId);
    const existing = await findHouseholdRowOrThrow(householdId, tx);
    if (existing.purokId !== initial.purokId) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'Another request modified this household. Please reload and try again.',
      );
    }
    if (existing.version !== input.version) {
      throw staleHousehold(existing.version);
    }
    assertHouseholdActive(existing);

    const targetMembership = await tx.householdMembership.findFirst({
      where: {
        householdId,
        residentId: input.residentId,
        status: HouseholdMembershipStatus.ACTIVE,
      },
    });
    if (!targetMembership) {
      throw new AppError(
        409,
        ERROR_CODES.HOUSEHOLD_HEAD_NOT_MEMBER,
        'The selected household head must have an active membership.',
      );
    }
    if (existing.headResidentId === input.residentId) {
      return;
    }

    await tx.household.update({
      where: { id: householdId },
      data: {
        headResidentId: input.residentId,
        ...verificationReset(),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await writeHouseholdChange(
      tx,
      householdId,
      actor.id,
      HouseholdChangeAction.HEAD_CHANGED,
      {
        headResidentId: {
          before: existing.headResidentId,
          after: input.residentId,
        },
      },
      input.reason,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_HEAD_CHANGED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: householdId,
      metadata: {
        householdNumber: existing.householdNumber,
        before: existing.headResidentId,
        after: input.residentId,
        reason: input.reason,
      },
      ...context,
    });
  });

  return loadHousehold(householdId, actor);
}

export async function addHouseholdMember(
  householdId: string,
  input: AddHouseholdMemberInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  await withTransactionRetry(async (tx) => {
    const initial = await findHouseholdRowOrThrow(householdId, tx);
    await lockPurokRow(tx, initial.purokId);
    await lockResidentRow(tx, input.residentId);
    await lockHouseholdRow(tx, householdId);
    const existing = await findHouseholdRowOrThrow(householdId, tx);
    if (existing.purokId !== initial.purokId) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'Another request modified this household. Please reload and try again.',
      );
    }
    assertHouseholdActive(existing);
    const purok = await findPurokOrThrow(existing.purokId, tx);
    assertPurokActive(purok);
    await assertResidentCanJoin(tx, input.residentId);

    const membership = await tx.householdMembership.create({
      data: {
        householdId,
        residentId: input.residentId,
        activeResidentId: input.residentId,
        relationship: input.relationship ?? null,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
    });
    await tx.household.update({
      where: { id: householdId },
      data: {
        ...verificationReset(),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await writeHouseholdChange(
      tx,
      householdId,
      actor.id,
      HouseholdChangeAction.MEMBER_ADDED,
      {
        membershipId: membership.id,
        residentId: input.residentId,
        relationship: input.relationship ?? null,
      },
      null,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_ADDED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: householdId,
      metadata: {
        householdNumber: existing.householdNumber,
        residentId: input.residentId,
        membershipId: membership.id,
      },
      ...context,
    });
  });

  return loadHousehold(householdId, actor);
}

async function findMembershipForHousehold(
  tx: TransactionClient,
  householdId: string,
  membershipId: string,
): Promise<HouseholdMembership> {
  const membership = await tx.householdMembership.findUnique({
    where: { id: membershipId },
  });
  if (!membership || membership.householdId !== householdId) {
    throw new AppError(
      404,
      ERROR_CODES.MEMBERSHIP_NOT_FOUND,
      'The household membership could not be found.',
    );
  }
  return membership;
}

export async function endHouseholdMember(
  householdId: string,
  membershipId: string,
  input: EndHouseholdMemberInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  await withTransactionRetry(async (tx) => {
    const initialMembership = await findMembershipForHousehold(
      tx,
      householdId,
      membershipId,
    );
    const initialHousehold = await findHouseholdRowOrThrow(householdId, tx);
    await lockPurokRow(tx, initialHousehold.purokId);
    await lockResidentRow(tx, initialMembership.residentId);
    await lockHouseholdRow(tx, householdId);
    await lockMembershipRow(tx, membershipId);

    const existing = await findMembershipForHousehold(
      tx,
      householdId,
      membershipId,
    );
    const household = await findHouseholdRowOrThrow(householdId, tx);
    if (
      household.purokId !== initialHousehold.purokId ||
      existing.residentId !== initialMembership.residentId
    ) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'Another request modified this membership. Please reload and try again.',
      );
    }
    if (existing.status !== HouseholdMembershipStatus.ACTIVE) {
      throw new AppError(
        409,
        ERROR_CODES.MEMBERSHIP_ALREADY_ENDED,
        'This household membership has already ended.',
      );
    }
    if (existing.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'This membership changed since you opened it. Reload and try again.',
        { currentVersion: existing.version },
      );
    }
    if (
      input.reason === MembershipEndReason.OTHER &&
      !input.note
    ) {
      throw new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Please correct the highlighted fields.',
        [{ field: 'note', message: 'Provide a note when using Other.' }],
      );
    }

    const endedAt = new Date();
    await tx.householdMembership.update({
      where: { id: membershipId },
      data: {
        status: HouseholdMembershipStatus.ENDED,
        activeResidentId: null,
        endedAt,
        endReason: input.reason,
        endNote: input.note ?? null,
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await tx.household.update({
      where: { id: householdId },
      data: {
        ...(household.headResidentId === existing.residentId
          ? { headResidentId: null }
          : {}),
        ...verificationReset(),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await writeHouseholdChange(
      tx,
      householdId,
      actor.id,
      HouseholdChangeAction.MEMBER_ENDED,
      {
        membershipId,
        residentId: existing.residentId,
        before: HouseholdMembershipStatus.ACTIVE,
        after: HouseholdMembershipStatus.ENDED,
        endReason: input.reason,
      },
      input.note ?? input.reason,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_ENDED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: householdId,
      metadata: {
        householdNumber: household.householdNumber,
        membershipId,
        residentId: existing.residentId,
        endReason: input.reason,
      },
      ...context,
    });
  });

  return loadHousehold(householdId, actor);
}

export async function transferHouseholdMember(
  sourceHouseholdId: string,
  membershipId: string,
  input: TransferHouseholdMemberInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<HouseholdDetailDto> {
  if (input.targetHouseholdId === sourceHouseholdId) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Please correct the highlighted fields.',
      [
        {
          field: 'targetHouseholdId',
          message: 'Select a different target household.',
        },
      ],
    );
  }

  await withTransactionRetry(async (tx) => {
    const initialMembership = await findMembershipForHousehold(
      tx,
      sourceHouseholdId,
      membershipId,
    );
    const initialSource = await findHouseholdRowOrThrow(sourceHouseholdId, tx);
    const initialTarget = await findHouseholdRowOrThrow(
      input.targetHouseholdId,
      tx,
    );

    await lockPuroks(tx, [initialSource.purokId, initialTarget.purokId]);
    await lockResidentRow(tx, initialMembership.residentId);
    await lockHouseholds(tx, [sourceHouseholdId, input.targetHouseholdId]);
    await lockMembershipRow(tx, membershipId);

    const membership = await findMembershipForHousehold(
      tx,
      sourceHouseholdId,
      membershipId,
    );
    const source = await findHouseholdRowOrThrow(sourceHouseholdId, tx);
    const target = await findHouseholdRowOrThrow(input.targetHouseholdId, tx);
    if (
      source.purokId !== initialSource.purokId ||
      target.purokId !== initialTarget.purokId ||
      membership.residentId !== initialMembership.residentId
    ) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'Another request modified these households. Please reload and try again.',
      );
    }
    if (membership.status !== HouseholdMembershipStatus.ACTIVE) {
      throw new AppError(
        409,
        ERROR_CODES.MEMBERSHIP_ALREADY_ENDED,
        'This household membership has already ended.',
      );
    }
    if (membership.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'This membership changed since you opened it. Reload and try again.',
        { currentVersion: membership.version },
      );
    }
    assertHouseholdActive(target);
    const targetPurok = await findPurokOrThrow(target.purokId, tx);
    assertPurokActive(targetPurok);

    const resident = await tx.resident.findUnique({
      where: { id: membership.residentId },
    });
    if (!resident) {
      throw new AppError(
        404,
        ERROR_CODES.RESIDENT_NOT_FOUND,
        'The resident record could not be found.',
      );
    }
    if (resident.residencyStatus !== ResidencyStatus.ACTIVE) {
      throw new AppError(
        409,
        ERROR_CODES.RESIDENT_NOT_ACTIVE,
        'Only an active resident can transfer to another household.',
      );
    }

    const now = new Date();
    await tx.householdMembership.update({
      where: { id: membershipId },
      data: {
        status: HouseholdMembershipStatus.ENDED,
        activeResidentId: null,
        endedAt: now,
        endReason: MembershipEndReason.TRANSFERRED,
        endNote: input.reason,
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    const targetMembership = await tx.householdMembership.create({
      data: {
        householdId: input.targetHouseholdId,
        residentId: membership.residentId,
        activeResidentId: membership.residentId,
        relationship: input.relationship ?? membership.relationship,
        joinedAt: now,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
    });

    await tx.household.update({
      where: { id: sourceHouseholdId },
      data: {
        ...(source.headResidentId === membership.residentId
          ? { headResidentId: null }
          : {}),
        ...verificationReset(),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await tx.household.update({
      where: { id: input.targetHouseholdId },
      data: {
        ...verificationReset(),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });

    await writeHouseholdChange(
      tx,
      sourceHouseholdId,
      actor.id,
      HouseholdChangeAction.MEMBER_TRANSFERRED,
      {
        membershipId,
        residentId: membership.residentId,
        targetHouseholdId: input.targetHouseholdId,
        targetMembershipId: targetMembership.id,
      },
      input.reason,
    );
    await writeHouseholdChange(
      tx,
      input.targetHouseholdId,
      actor.id,
      HouseholdChangeAction.MEMBER_TRANSFERRED,
      {
        membershipId: targetMembership.id,
        residentId: membership.residentId,
        sourceHouseholdId,
        sourceMembershipId: membershipId,
      },
      input.reason,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_TRANSFERRED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: sourceHouseholdId,
      metadata: {
        householdNumber: source.householdNumber,
        targetHouseholdNumber: target.householdNumber,
        membershipId,
        targetMembershipId: targetMembership.id,
        residentId: membership.residentId,
        reason: input.reason,
      },
      ...context,
    });
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.HOUSEHOLD_MEMBER_TRANSFERRED,
      actorUserId: actor.id,
      entityType: 'Household',
      entityId: input.targetHouseholdId,
      metadata: {
        householdNumber: target.householdNumber,
        sourceHouseholdNumber: source.householdNumber,
        membershipId: targetMembership.id,
        sourceMembershipId: membershipId,
        residentId: membership.residentId,
        reason: input.reason,
      },
      ...context,
    });
  });

  return loadHousehold(sourceHouseholdId, actor);
}
