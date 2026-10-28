import { Prisma } from '@prisma/client';
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
import {
  createResidentSchema,
} from './residents.schemas';
import type {
  CancelReviewInput,
  CreateDuplicateReviewInput,
  DuplicateDecisionInput,
  ReviewListQuery,
} from './residents.schemas';
import {
  lockDuplicateReviewRow,
  lockIdentity,
  withTransactionRetry,
} from './resident-locking';
import type { TransactionClient } from './resident-locking';
import {
  createResidentChange,
  findDuplicateCandidates,
  insertResidentInTransaction,
  loadResidentDetail,
  validateDraftRules,
} from './residents.service';
import {
  identityKeyFor,
  residentDraftFromInput,
  toResidentCandidate,
} from './resident-utils';
import type {
  DuplicateMatchType,
  ResidentCandidateDto,
  ResidentDraftDto,
  ResidentDraftInput,
} from './resident-utils';

const reviewUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

type ReviewWithUsers = Prisma.ResidentDuplicateReviewGetPayload<{
  include: {
    requestedBy: { select: typeof reviewUserSelect };
    decidedBy: { select: typeof reviewUserSelect };
  };
}>;

export interface WorkflowUserDto {
  id: string;
  fullName: string;
}

export interface DuplicateReviewSummaryDto {
  id: string;
  status: string;
  reason: string;
  requestedBy: WorkflowUserDto | null;
  decidedBy: WorkflowUserDto | null;
  candidateCount: number;
  createdResidentId: string | null;
  createdAt: string;
  decidedAt: string | null;
  version: number;
}

export interface DuplicateReviewDetailDto extends DuplicateReviewSummaryDto {
  decisionNote: string | null;
  draft: ResidentDraftDto | null;
  candidates: ResidentCandidateDto[];
}

interface CandidateRef {
  id: string;
  matchType: DuplicateMatchType;
}

function parseCandidateRefs(value: string | null): CandidateRef[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is CandidateRef =>
        Boolean(
          item &&
            typeof item === 'object' &&
            'id' in item &&
            typeof item.id === 'string' &&
            'matchType' in item &&
            (item.matchType === 'EXACT' || item.matchType === 'BROAD'),
        ),
    );
  } catch {
    return [];
  }
}

function parseDraft(value: string | null): ResidentDraftDto | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    const result = createResidentSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return residentDraftFromInput(result.data);
  } catch {
    return null;
  }
}

function toWorkflowUser(
  user: { id: string; firstName: string; lastName: string } | null,
): WorkflowUserDto | null {
  return user
    ? { id: user.id, fullName: `${user.firstName} ${user.lastName}`.trim() }
    : null;
}

function toSummary(review: ReviewWithUsers): DuplicateReviewSummaryDto {
  return {
    id: review.id,
    status: review.status,
    reason: review.reason,
    requestedBy: toWorkflowUser(review.requestedBy),
    decidedBy: toWorkflowUser(review.decidedBy),
    candidateCount: parseCandidateRefs(review.candidateResidentIds).length,
    createdResidentId: review.createdResidentId,
    createdAt: review.createdAt.toISOString(),
    decidedAt: review.decidedAt?.toISOString() ?? null,
    version: review.version,
  };
}

async function loadCandidates(
  client: TransactionClient | typeof prisma,
  draft: ResidentDraftDto | null,
  refs: CandidateRef[],
): Promise<ResidentCandidateDto[]> {
  if (draft) {
    return findDuplicateCandidates(client, draft);
  }

  if (refs.length === 0) {
    return [];
  }

  const residents = await client.resident.findMany({
    where: { id: { in: refs.map((ref) => ref.id) } },
    orderBy: { updatedAt: 'desc' },
  });
  const matchTypes = new Map(refs.map((ref) => [ref.id, ref.matchType]));
  return residents.map((resident) =>
    toResidentCandidate(
      resident,
      matchTypes.get(resident.id) ?? 'BROAD',
    ),
  );
}

async function findReviewOrThrow(
  client: TransactionClient | typeof prisma,
  reviewId: string,
): Promise<ReviewWithUsers> {
  const review = await client.residentDuplicateReview.findUnique({
    where: { id: reviewId },
    include: {
      requestedBy: { select: reviewUserSelect },
      decidedBy: { select: reviewUserSelect },
    },
  });
  if (!review) {
    throw new AppError(
      404,
      ERROR_CODES.DUPLICATE_REVIEW_NOT_FOUND,
      'The duplicate review request could not be found.',
    );
  }
  return review;
}

export async function createDuplicateReview(
  input: CreateDuplicateReviewInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<DuplicateReviewSummaryDto> {
  const { reason, ...draftInput } = input;
  const draft = draftInput as ResidentDraftInput;
  validateDraftRules(draft, actor);
  const identityKey = identityKeyFor(draft, draft.birthDate);

  const review = await withTransactionRetry(async (tx) => {
    await lockIdentity(tx, identityKey);
    const candidates = await findDuplicateCandidates(tx, draft);
    if (candidates.length === 0) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_NOT_REQUIRED,
        'No possible duplicate was found. Create the resident record directly.',
      );
    }

    const existing = await tx.residentDuplicateReview.findFirst({
      where: {
        identityKey,
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_PENDING,
        'A duplicate review is already pending for this possible resident.',
        { reviewId: existing.id },
      );
    }

    const refs: CandidateRef[] = candidates.map((candidate) => ({
      id: candidate.id,
      matchType: candidate.matchType,
    }));
    const created = await tx.residentDuplicateReview.create({
      data: {
        identityKey,
        activeIdentityKey: identityKey,
        requestedByUserId: actor.id,
        draftData: JSON.stringify(draft),
        candidateResidentIds: JSON.stringify(refs),
        reason,
      },
      include: {
        requestedBy: { select: reviewUserSelect },
        decidedBy: { select: reviewUserSelect },
      },
    });

    await writeAudit(tx, {
      action: AUDIT_ACTIONS.DUPLICATE_REVIEW_REQUESTED,
      actorUserId: actor.id,
      entityType: 'ResidentDuplicateReview',
      entityId: created.id,
      metadata: {
        candidateCount: candidates.length,
      },
      ...context,
    });
    return created;
  });

  return toSummary(review);
}

export async function listDuplicateReviews(
  query: ReviewListQuery,
  actor: AuthUser,
): Promise<{
  items: DuplicateReviewSummaryDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const canReview = hasPermission(
    actor.role,
    PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE,
  );
  const canRequest = hasPermission(actor.role, PERMISSIONS.RESIDENTS_WRITE);
  if (!canReview && !canRequest) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to view duplicate reviews.',
    );
  }

  const where: Prisma.ResidentDuplicateReviewWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(canReview ? {} : { requestedByUserId: actor.id }),
  };

  const [items, total] = await Promise.all([
    prisma.residentDuplicateReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        requestedBy: { select: reviewUserSelect },
        decidedBy: { select: reviewUserSelect },
      },
    }),
    prisma.residentDuplicateReview.count({ where }),
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

export async function getDuplicateReview(
  reviewId: string,
  actor: AuthUser,
  context: AuditContext,
): Promise<DuplicateReviewDetailDto> {
  const review = await findReviewOrThrow(prisma, reviewId);
  const canReview = hasPermission(
    actor.role,
    PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE,
  );
  if (!canReview && review.requestedByUserId !== actor.id) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to view this duplicate review.',
    );
  }

  const refs = parseCandidateRefs(review.candidateResidentIds);
  const draft = review.status === 'PENDING' ? parseDraft(review.draftData) : null;
  const candidates = await loadCandidates(prisma, draft, refs);

  await recordSensitiveReadAudit({
    action: AUDIT_ACTIONS.DUPLICATE_REVIEW_VIEWED,
    actorUserId: actor.id,
    entityType: 'ResidentDuplicateReview',
    entityId: review.id,
    metadata: {
      status: review.status,
      candidateCount: refs.length,
    },
    ...context,
  });

  return {
    ...toSummary(review),
    decisionNote: review.decisionNote,
    draft,
    candidates,
  };
}

export async function approveDuplicateReview(
  reviewId: string,
  input: DuplicateDecisionInput,
  actor: AuthUser,
  context: AuditContext,
) {
  if (
    !hasPermission(actor.role, PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE)
  ) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to approve duplicate reviews.',
    );
  }

  const resident = await withTransactionRetry(async (tx) => {
    const initial = await findReviewOrThrow(tx, reviewId);
    await lockIdentity(tx, initial.identityKey);
    await lockDuplicateReviewRow(tx, reviewId);
    const review = await findReviewOrThrow(tx, reviewId);

    if (review.status !== 'PENDING') {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_ALREADY_DECIDED,
        'This duplicate review has already been decided.',
      );
    }
    if (review.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'This duplicate review changed. Reload and try again.',
        { currentVersion: review.version },
      );
    }
    if (review.requestedByUserId === actor.id) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_SELF_APPROVAL,
        'A duplicate review cannot be approved by the person who requested it.',
      );
    }

    const draft = parseDraft(review.draftData);
    if (!draft) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_ERROR,
        'The pending duplicate review is malformed and cannot be approved.',
      );
    }

    const candidates = await findDuplicateCandidates(tx, draft);
    const created = await insertResidentInTransaction(tx, draft, actor, {
      reason: `Approved duplicate review: ${input.note}`,
      metadata: {
        duplicateReviewId: review.id,
        candidateCount: candidates.length,
      },
      context,
    });

    const updated = await tx.residentDuplicateReview.updateMany({
      where: {
        id: review.id,
        status: 'PENDING',
        version: input.version,
      },
      data: {
        status: 'APPROVED',
        decidedByUserId: actor.id,
        decisionNote: input.note,
        decidedAt: new Date(),
        draftData: null,
        activeIdentityKey: null,
        createdResidentId: created.id,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_ALREADY_DECIDED,
        'This duplicate review has already been decided.',
      );
    }

    await createResidentChange(
      tx,
      created.id,
      actor.id,
      'DUPLICATE_REVIEW_APPROVED',
      null,
      input.note,
    );
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.DUPLICATE_REVIEW_APPROVED,
      actorUserId: actor.id,
      entityType: 'ResidentDuplicateReview',
      entityId: review.id,
      metadata: {
        residentNumber: created.residentNumber,
        candidateCount: candidates.length,
      },
      ...context,
    });
    return created;
  });

  return loadResidentDetail(resident);
}

export async function rejectDuplicateReview(
  reviewId: string,
  input: DuplicateDecisionInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<DuplicateReviewSummaryDto> {
  if (
    !hasPermission(actor.role, PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE)
  ) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to reject duplicate reviews.',
    );
  }

  const review = await withTransactionRetry(async (tx) => {
    await lockDuplicateReviewRow(tx, reviewId);
    const existing = await findReviewOrThrow(tx, reviewId);

    if (existing.status !== 'PENDING') {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_ALREADY_DECIDED,
        'This duplicate review has already been decided.',
      );
    }
    if (existing.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.CONCURRENT_MODIFICATION,
        'This duplicate review changed. Reload and try again.',
        { currentVersion: existing.version },
      );
    }
    if (existing.requestedByUserId === actor.id) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_SELF_APPROVAL,
        'A duplicate review cannot be rejected by the person who requested it.',
      );
    }

    const updated = await tx.residentDuplicateReview.updateMany({
      where: {
        id: reviewId,
        status: 'PENDING',
        version: input.version,
      },
      data: {
        status: 'REJECTED',
        decidedByUserId: actor.id,
        decisionNote: input.note,
        decidedAt: new Date(),
        draftData: null,
        activeIdentityKey: null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_ALREADY_DECIDED,
        'This duplicate review has already been decided.',
      );
    }

    await writeAudit(tx, {
      action: AUDIT_ACTIONS.DUPLICATE_REVIEW_REJECTED,
      actorUserId: actor.id,
      entityType: 'ResidentDuplicateReview',
      entityId: reviewId,
      metadata: {},
      ...context,
    });
    return findReviewOrThrow(tx, reviewId);
  });

  return toSummary(review);
}

export async function cancelDuplicateReview(
  reviewId: string,
  input: CancelReviewInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<DuplicateReviewSummaryDto> {
  const review = await withTransactionRetry(async (tx) => {
    await lockDuplicateReviewRow(tx, reviewId);
    const existing = await findReviewOrThrow(tx, reviewId);

    if (existing.status !== 'PENDING') {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_ALREADY_DECIDED,
        'This duplicate review has already been decided.',
      );
    }
    if (existing.requestedByUserId !== actor.id) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        'Only the person who requested this review may cancel it.',
      );
    }

    const updated = await tx.residentDuplicateReview.updateMany({
      where: { id: reviewId, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        decisionNote: input.note ?? null,
        decidedAt: new Date(),
        draftData: null,
        activeIdentityKey: null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_REVIEW_ALREADY_DECIDED,
        'This duplicate review has already been decided.',
      );
    }

    await writeAudit(tx, {
      action: AUDIT_ACTIONS.DUPLICATE_REVIEW_CANCELLED,
      actorUserId: actor.id,
      entityType: 'ResidentDuplicateReview',
      entityId: reviewId,
      metadata: {},
      ...context,
    });
    return findReviewOrThrow(tx, reviewId);
  });

  return toSummary(review);
}
