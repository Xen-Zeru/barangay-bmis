import { Prisma } from '@prisma/client';
import { AppError, ERROR_CODES } from './errors';
import { prisma } from './prisma';

export type TransactionClient = Prisma.TransactionClient;

const MAX_TRANSACTION_ATTEMPTS = 6;

function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      error.code === 'P2034' ||
      /deadlock|lock wait timeout|serialization|record has changed since last read|try restarting transaction/i.test(
        error.message,
      )
    );
  }
  return (
    error instanceof Error &&
    /deadlock|lock wait timeout|serialization|record has changed since last read|try restarting transaction/i.test(
      error.message,
    )
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Retries only database deadlock/lock-timeout failures. Business errors such
 * as POSSIBLE_DUPLICATE pass through immediately.
 *
 * Canonical lock order for Phase 3:
 * household number sequence (create only) -> Purok -> Resident -> Household
 * -> HouseholdMembership.
 */
export async function withTransactionRetry<T>(
  operation: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (
        attempt < MAX_TRANSACTION_ATTEMPTS &&
        isRetryableTransactionError(error)
      ) {
        await sleep(25 * attempt);
        continue;
      }
      if (isRetryableTransactionError(error)) {
        throw new AppError(
          409,
          ERROR_CODES.CONCURRENT_MODIFICATION,
          'Another request modified the same records. Please reload and try again.',
        );
      }
      throw error;
    }
  }
  throw new AppError(
    409,
    ERROR_CODES.CONCURRENT_MODIFICATION,
    'Another request modified the same records. Please reload and try again.',
  );
}
