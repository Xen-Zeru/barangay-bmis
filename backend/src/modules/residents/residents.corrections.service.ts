import { Prisma, ResidencyStatus } from '@prisma/client';
import {
  AUDIT_ACTIONS,
  recordSensitiveReadAudit,
  writeAudit,
} from '../../lib/audit';
import type { AuditContext } from '../../lib/audit';
import { AppError, ERROR_CODES } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { hasPermission, PERMISSIONS } from '../../security/permissions';
import type { AuthUser } from '../auth/auth.types';
import type {
  CancelReviewInput,
  CorrectionDecisionInput,
  CorrectionListQuery,
  CorrectionRequestInput,
} from './residents.schemas';
import {
  lockCorrectionRow,
  lockResidentRow,
  withTransactionRetry,
} from './resident-locking';
import type { TransactionClient } from './resident-locking';
import {
  createResidentChange,
  findResidentOrThrow,
  loadResidentDetail,
} from './residents.service';
import { fullNameOf } from './resident-utils';
import type { Resident } from '@prisma/client';

const correctionUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

type CorrectionWithRelations = Prisma.ResidentCorrectionGetPayload<{
  include: {
    resident: true;
    requestedBy: { select: typeof correctionUserSelect };
    decidedBy: { select: typeof correctionUserSelect };
  };
}>;

export interface CorrectionResidentDto {
  id: string;
  residentNumber: string;
  fullName: string;
  residencyStatus: string;
}

export interface WorkflowUserDto {
  id: string;
  fullName: string;
}

export interface CorrectionSummaryDto {
  id: string;
  resident: CorrectionResidentDto;
  status: string;
  correctionType: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  evidenceReference: string;
  requestedBy: WorkflowUserDto | null;
  decidedBy: WorkflowUserDto | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  version: number;
}

function toWorkflowUser(
  user: { id: string; firstName: string; lastName: string } | null,
): WorkflowUserDto | null {
  return user
    ? { id: user.id, fullName: `${user.firstName} ${user.lastName}`.trim() }
    : null;
}

function toCorrectionResident(resident: Resident): CorrectionResidentDto {
  return {
    id: resident.id,
    residentNumber: resident.residentNumber,
    fullName: fullNameOf(resident),
    residencyStatus: resident.residencyStatus,
  };
}

function toSummary(correction: CorrectionWithRelations): CorrectionSummaryDto {
  return {
    id: correction.id,
    resident: toCorrectionResident(correction.resident),
    status: correction.status,
    correctionType: correction.correctionType,
    fromStatus: correction.fromStatus,
    toStatus: correction.toStatus,
    reason: correction.reason,
    evidenceReference: correction.evidenceReference,
    requestedBy: toWorkflowUser(correction.requestedBy),
    decidedBy: toWorkflowUser(correction.decidedBy),
    decisionNote: correction.decisionNote,
    createdAt: correction.createdAt.toISOString(),
    decidedAt: correction.decidedAt?.toISOString() ?? null,
    version: correction.version,
  };
}

async function findCorrectionOrThrow(
  client: TransactionClient | typeof prisma,
  correctionId: string,
): Promise<CorrectionWithRelations> {
  const correction = await client.residentCorrection.findUnique({
    where: { id: correctionId },
    include: {
      resident: true,
      requestedBy: { select: correctionUserSelect },
      decidedBy: { select: correctionUserSelect },
    },
  });
  if (!correction) {
    throw new AppError(
      404,
      ERROR_CODES.CORRECTION_NOT_FOUND,
      'The correction request could not be found.',
    );
  }
  return correction;
}

export async function requestCorrection(
  residentId: string,
  input: CorrectionRequestInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<CorrectionSummaryDto> {
  if (!hasPermission(actor.role, PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST)) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to request resident corrections.',
    );
  }

  const correction = await withTransactionRetry(async (tx) => {
    await lockResidentRow(tx, residentId);
    const resident = await findResidentOrThrow(residentId, tx);

    if (resident.residencyStatus !== ResidencyStatus.DECEASED) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_REQUIRED,
        'Corrections are only available for records currently marked DECEASED.',
      );
    }
    const existing = await tx.residentCorrection.findFirst({
      where: {
        activeResidentId: residentId,
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_PENDING,
        'A correction is already pending for this resident.',
        { correctionId: existing.id },
      );
    }

    const created = await tx.residentCorrection.create({
      data: {
        residentId,
        status: 'PENDING',
        correctionType: 'STATUS_REVERSAL',
        fromStatus: resident.residencyStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        evidenceReference: input.evidenceReference,
        requestedByUserId: actor.id,
        activeResidentId: residentId,
      },
      include: {
        resident: true,
        requestedBy: { select: correctionUserSelect },
        decidedBy: { select: correctionUserSelect },
      },
    });

    await writeAudit(tx, {
      action: AUDIT_ACTIONS.CORRECTION_REQUESTED,
      actorUserId: actor.id,
      entityType: 'ResidentCorrection',
      entityId: created.id,
      metadata: {
        residentNumber: resident.residentNumber,
        fromStatus: resident.residencyStatus,
        toStatus: input.toStatus,
      },
      ...context,
    });
    return created;
  });

  return toSummary(correction);
}

export async function listCorrections(
  query: CorrectionListQuery,
  actor: AuthUser,
): Promise<{
  items: CorrectionSummaryDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const canApprove = hasPermission(
    actor.role,
    PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
  );
  const canRequest = hasPermission(
    actor.role,
    PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST,
  );
  if (!canApprove && !canRequest) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to view correction requests.',
    );
  }

  const where: Prisma.ResidentCorrectionWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(canApprove ? {} : { requestedByUserId: actor.id }),
  };

  const [items, total] = await Promise.all([
    prisma.residentCorrection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        resident: true,
        requestedBy: { select: correctionUserSelect },
        decidedBy: { select: correctionUserSelect },
      },
    }),
    prisma.residentCorrection.count({ where }),
  ]);

  return {
    items: items.map(toSummary),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getCorrection(
  correctionId: string,
  actor: AuthUser,
  context: AuditContext,
): Promise<CorrectionSummaryDto> {
  const correction = await findCorrectionOrThrow(prisma, correctionId);
  const canApprove = hasPermission(
    actor.role,
    PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
  );
  if (!canApprove && correction.requestedByUserId !== actor.id) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to view this correction request.',
    );
  }

  await recordSensitiveReadAudit({
    action: AUDIT_ACTIONS.CORRECTION_VIEWED,
    actorUserId: actor.id,
    entityType: 'ResidentCorrection',
    entityId: correction.id,
    metadata: {
      residentNumber: correction.resident.residentNumber,
      status: correction.status,
    },
    ...context,
  });

  return toSummary(correction);
}

export async function approveCorrection(
  correctionId: string,
  input: CorrectionDecisionInput,
  actor: AuthUser,
  context: AuditContext,
) {
  if (
    !hasPermission(actor.role, PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE)
  ) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to approve resident corrections.',
    );
  }

  const resident = await withTransactionRetry(async (tx) => {
    const initial = await findCorrectionOrThrow(tx, correctionId);
    await lockResidentRow(tx, initial.residentId);
    await lockCorrectionRow(tx, correctionId);
    const correction = await findCorrectionOrThrow(tx, correctionId);

    if (correction.status !== 'PENDING') {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_ALREADY_DECIDED,
        'This correction request has already been decided.',
      );
    }
    if (correction.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'This correction request changed. Reload and try again.',
        { currentVersion: correction.version },
      );
    }
    if (correction.requestedByUserId === actor.id) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_SELF_APPROVAL,
        'A correction request cannot be approved by the person who requested it.',
      );
    }

    const current = await findResidentOrThrow(correction.residentId, tx);
    if (current.residencyStatus !== ResidencyStatus.DECEASED) {
      throw new AppError(
        409,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        'The resident is no longer DECEASED. This correction can no longer be approved.',
        { currentStatus: current.residencyStatus },
      );
    }

    const updatedResident = await tx.resident.update({
      where: { id: current.id },
      data: {
        residencyStatus: correction.toStatus,
        statusChangedAt: new Date(),
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });

    const updated = await tx.residentCorrection.updateMany({
      where: {
        id: correction.id,
        status: 'PENDING',
        version: input.version,
      },
      data: {
        status: 'APPROVED',
        decidedByUserId: actor.id,
        decisionNote: input.note,
        decidedAt: new Date(),
        activeResidentId: null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_ALREADY_DECIDED,
        'This correction request has already been decided.',
      );
    }

    await createResidentChange(
      tx,
      current.id,
      actor.id,
      'STATUS_CORRECTED',
      [
        {
          field: 'residencyStatus',
          before: correction.fromStatus,
          after: correction.toStatus,
        },
      ],
      input.note,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.CORRECTION_APPROVED,
      actorUserId: actor.id,
      entityType: 'ResidentCorrection',
      entityId: correction.id,
      metadata: {
        residentNumber: current.residentNumber,
        fromStatus: correction.fromStatus,
        toStatus: correction.toStatus,
      },
      ...context,
    });
    return updatedResident;
  });

  return loadResidentDetail(resident);
}

export async function rejectCorrection(
  correctionId: string,
  input: CorrectionDecisionInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<CorrectionSummaryDto> {
  if (
    !hasPermission(actor.role, PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE)
  ) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to reject resident corrections.',
    );
  }

  const correction = await withTransactionRetry(async (tx) => {
    await lockCorrectionRow(tx, correctionId);
    const existing = await findCorrectionOrThrow(tx, correctionId);

    if (existing.status !== 'PENDING') {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_ALREADY_DECIDED,
        'This correction request has already been decided.',
      );
    }
    if (existing.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'This correction request changed. Reload and try again.',
        { currentVersion: existing.version },
      );
    }
    if (existing.requestedByUserId === actor.id) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_SELF_APPROVAL,
        'A correction request cannot be rejected by the person who requested it.',
      );
    }

    const updated = await tx.residentCorrection.updateMany({
      where: {
        id: correctionId,
        status: 'PENDING',
        version: input.version,
      },
      data: {
        status: 'REJECTED',
        decidedByUserId: actor.id,
        decisionNote: input.note,
        decidedAt: new Date(),
        activeResidentId: null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_ALREADY_DECIDED,
        'This correction request has already been decided.',
      );
    }

    await writeAudit(tx, {
      action: AUDIT_ACTIONS.CORRECTION_REJECTED,
      actorUserId: actor.id,
      entityType: 'ResidentCorrection',
      entityId: correctionId,
      metadata: {},
      ...context,
    });
    return findCorrectionOrThrow(tx, correctionId);
  });

  return toSummary(correction);
}

export async function cancelCorrection(
  correctionId: string,
  input: CancelReviewInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<CorrectionSummaryDto> {
  const correction = await withTransactionRetry(async (tx) => {
    await lockCorrectionRow(tx, correctionId);
    const existing = await findCorrectionOrThrow(tx, correctionId);

    if (existing.status !== 'PENDING') {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_ALREADY_DECIDED,
        'This correction request has already been decided.',
      );
    }
    if (existing.requestedByUserId !== actor.id) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the person who requested this correction may cancel it.',
      );
    }

    const updated = await tx.residentCorrection.updateMany({
      where: { id: correctionId, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        decisionNote: input.note ?? null,
        decidedAt: new Date(),
        activeResidentId: null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.CORRECTION_ALREADY_DECIDED,
        'This correction request has already been decided.',
      );
    }

    await writeAudit(tx, {
      action: AUDIT_ACTIONS.CORRECTION_CANCELLED,
      actorUserId: actor.id,
      entityType: 'ResidentCorrection',
      entityId: correctionId,
      metadata: {},
      ...context,
    });
    return findCorrectionOrThrow(tx, correctionId);
  });

  return toSummary(correction);
}
