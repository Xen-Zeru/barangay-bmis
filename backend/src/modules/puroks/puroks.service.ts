import { Prisma, PurokStatus } from '@prisma/client';
import type { Purok } from '@prisma/client';
import { AUDIT_ACTIONS, writeAudit } from '../../lib/audit';
import type { AuditContext } from '../../lib/audit';
import { AppError, ERROR_CODES } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { withTransactionRetry } from '../../lib/transaction';
import type { TransactionClient } from '../../lib/transaction';
import type { AuthUser } from '../auth/auth.types';
import { normalizeNamePart } from '../residents/resident-utils';
import type {
  CreatePurokInput,
  PurokListQuery,
  PurokStatusInput,
  UpdatePurokInput,
} from './puroks.schemas';

export interface PurokDto {
  id: string;
  code: string;
  name: string;
  status: PurokStatus;
  version: number;
  householdCount: number;
  activeHouseholdCount: number;
  createdAt: string;
  updatedAt: string;
}

interface HouseholdCounts {
  householdCount: number;
  activeHouseholdCount: number;
}

function normalizePurokName(name: string): string {
  return normalizeNamePart(name);
}

function emptyCounts(): HouseholdCounts {
  return { householdCount: 0, activeHouseholdCount: 0 };
}

function toPurokDto(
  purok: Purok,
  counts: HouseholdCounts = emptyCounts(),
): PurokDto {
  return {
    id: purok.id,
    code: purok.code,
    name: purok.name,
    status: purok.status,
    version: purok.version,
    householdCount: counts.householdCount,
    activeHouseholdCount: counts.activeHouseholdCount,
    createdAt: purok.createdAt.toISOString(),
    updatedAt: purok.updatedAt.toISOString(),
  };
}

async function countsByPurok(
  client: TransactionClient | typeof prisma,
  purokIds: string[],
): Promise<Map<string, HouseholdCounts>> {
  const result = new Map<string, HouseholdCounts>();
  if (purokIds.length === 0) {
    return result;
  }

  const grouped = await client.household.groupBy({
    by: ['purokId', 'status'],
    where: { purokId: { in: purokIds } },
    _count: { _all: true },
  });

  for (const row of grouped) {
    const current = result.get(row.purokId) ?? emptyCounts();
    current.householdCount += row._count._all;
    if (row.status === 'ACTIVE') {
      current.activeHouseholdCount += row._count._all;
    }
    result.set(row.purokId, current);
  }

  return result;
}

async function getCounts(
  client: TransactionClient | typeof prisma,
  purokId: string,
): Promise<HouseholdCounts> {
  const counts = await countsByPurok(client, [purokId]);
  return counts.get(purokId) ?? emptyCounts();
}

export async function lockPurokRow(
  tx: TransactionClient,
  purokId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM puroks WHERE id = ${purokId} FOR UPDATE
  `);
}

export async function findPurokOrThrow(
  purokId: string,
  client: TransactionClient | typeof prisma = prisma,
): Promise<Purok> {
  const purok = await client.purok.findUnique({ where: { id: purokId } });
  if (!purok) {
    throw new AppError(
      404,
      ERROR_CODES.PUROK_NOT_FOUND,
      'The Purok record could not be found.',
    );
  }
  return purok;
}

function uniquePurokError(error: unknown): AppError | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = String(error.meta?.target ?? '');
    return new AppError(
      409,
      target.includes('nameNormalized')
        ? ERROR_CODES.PUROK_NAME_TAKEN
        : ERROR_CODES.PUROK_CODE_TAKEN,
      target.includes('nameNormalized')
        ? 'Another Purok already uses that name.'
        : 'Another Purok already uses that code.',
    );
  }
  return null;
}

async function assertUniquePurok(
  client: TransactionClient,
  input: { code?: string; name?: string },
  excludeId?: string,
): Promise<void> {
  if (input.code) {
    const existing = await client.purok.findUnique({
      where: { code: input.code },
    });
    if (existing && existing.id !== excludeId) {
      throw new AppError(
        409,
        ERROR_CODES.PUROK_CODE_TAKEN,
        'Another Purok already uses that code.',
      );
    }
  }

  if (input.name) {
    const existing = await client.purok.findUnique({
      where: { nameNormalized: normalizePurokName(input.name) },
    });
    if (existing && existing.id !== excludeId) {
      throw new AppError(
        409,
        ERROR_CODES.PUROK_NAME_TAKEN,
        'Another Purok already uses that name.',
      );
    }
  }
}

export async function listPuroks(query: PurokListQuery): Promise<{
  items: PurokDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const search = query.q?.trim() ?? '';
  const where: Prisma.PurokWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.PurokOrderByWithRelationInput[] =
    query.sort === 'name_desc'
      ? [{ name: 'desc' }]
      : query.sort === 'updatedAt_desc'
        ? [{ updatedAt: 'desc' }]
        : [{ name: 'asc' }];

  const [items, total] = await Promise.all([
    prisma.purok.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.purok.count({ where }),
  ]);
  const counts = await countsByPurok(
    prisma,
    items.map((purok) => purok.id),
  );

  return {
    items: items.map((purok) => toPurokDto(purok, counts.get(purok.id))),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getPurok(purokId: string): Promise<PurokDto> {
  const purok = await findPurokOrThrow(purokId);
  return toPurokDto(purok, await getCounts(prisma, purokId));
}

export async function createPurok(
  input: CreatePurokInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<PurokDto> {
  try {
    const purok = await withTransactionRetry(async (tx) => {
      await assertUniquePurok(tx, input);
      const created = await tx.purok.create({
        data: {
          code: input.code,
          name: input.name,
          nameNormalized: normalizePurokName(input.name),
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        },
      });
      await writeAudit(tx, {
        action: AUDIT_ACTIONS.PUROK_CREATED,
        actorUserId: actor.id,
        entityType: 'Purok',
        entityId: created.id,
        metadata: { code: created.code, name: created.name },
        ...context,
      });
      return created;
    });
    return toPurokDto(purok);
  } catch (error) {
    const uniqueError = uniquePurokError(error);
    if (uniqueError) {
      throw uniqueError;
    }
    throw error;
  }
}

export async function updatePurok(
  purokId: string,
  input: UpdatePurokInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<PurokDto> {
  try {
    const purok = await withTransactionRetry(async (tx) => {
      await lockPurokRow(tx, purokId);
      const existing = await findPurokOrThrow(purokId, tx);
      if (existing.version !== input.version) {
        throw new AppError(
          409,
          ERROR_CODES.STALE_PUROK,
          'This Purok changed since you opened it. Reload and try again.',
          { currentVersion: existing.version },
        );
      }

      await assertUniquePurok(tx, input, purokId);
      const changes: Record<string, { before: string; after: string }> = {};
      if (input.code !== undefined && input.code !== existing.code) {
        changes.code = { before: existing.code, after: input.code };
      }
      if (input.name !== undefined && input.name !== existing.name) {
        changes.name = { before: existing.name, after: input.name };
      }
      if (Object.keys(changes).length === 0) {
        return existing;
      }

      const updated = await tx.purok.update({
        where: { id: purokId },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined
            ? {
                name: input.name,
                nameNormalized: normalizePurokName(input.name),
              }
            : {}),
          updatedByUserId: actor.id,
          version: { increment: 1 },
        },
      });
      await writeAudit(tx, {
        action: AUDIT_ACTIONS.PUROK_UPDATED,
        actorUserId: actor.id,
        entityType: 'Purok',
        entityId: updated.id,
        metadata: { changes },
        ...context,
      });
      return updated;
    });
    return toPurokDto(purok, await getCounts(prisma, purokId));
  } catch (error) {
    const uniqueError = uniquePurokError(error);
    if (uniqueError) {
      throw uniqueError;
    }
    throw error;
  }
}

export async function changePurokStatus(
  purokId: string,
  input: PurokStatusInput,
  actor: AuthUser,
  context: AuditContext,
): Promise<PurokDto> {
  const purok = await withTransactionRetry(async (tx) => {
    await lockPurokRow(tx, purokId);
    const existing = await findPurokOrThrow(purokId, tx);
    if (existing.version !== input.version) {
      throw new AppError(
        409,
        ERROR_CODES.STALE_PUROK,
        'This Purok changed since you opened it. Reload and try again.',
        { currentVersion: existing.version },
      );
    }
    if (existing.status === input.status) {
      throw new AppError(
        409,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        `This Purok is already ${input.status.toLowerCase()}.`,
      );
    }

    if (input.status === PurokStatus.INACTIVE) {
      const activeHouseholds = await tx.household.count({
        where: { purokId, status: 'ACTIVE' },
      });
      if (activeHouseholds > 0) {
        throw new AppError(
          409,
          ERROR_CODES.PUROK_IN_USE,
          'Move or deactivate this Purok’s active households before deactivating it.',
          { activeHouseholdCount: activeHouseholds },
        );
      }
    }

    const updated = await tx.purok.update({
      where: { id: purokId },
      data: {
        status: input.status,
        updatedByUserId: actor.id,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      action: AUDIT_ACTIONS.PUROK_STATUS_CHANGED,
      actorUserId: actor.id,
      entityType: 'Purok',
      entityId: updated.id,
      metadata: {
        before: existing.status,
        after: input.status,
        reason: input.reason,
      },
      ...context,
    });
    return updated;
  });

  return toPurokDto(purok, await getCounts(prisma, purokId));
}
