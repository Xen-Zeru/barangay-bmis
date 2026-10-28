import { AppError, ERROR_CODES } from '../../lib/errors';
import { manilaYear } from '../../lib/date';
import { withTransactionRetry } from '../../lib/transaction';
import type { TransactionClient } from '../../lib/transaction';
import { allocateYearlySequence } from '../../lib/yearly-sequence';

export { withTransactionRetry };
export type { TransactionClient };

/**
 * Serializes duplicate checks for a probable person without imposing a unique
 * identity constraint (legitimate same-name/same-birth-date residents exist).
 * Lock order convention: identity guard before new resident inserts; existing
 * resident row before identity guard during updates.
 */
export async function lockIdentity(
  tx: TransactionClient,
  identityKey: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO resident_identity_guards (identityKey, createdAt)
    VALUES (${identityKey}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE identityKey = resident_identity_guards.identityKey
  `;
  await tx.$queryRaw`
    SELECT identityKey FROM resident_identity_guards
    WHERE identityKey = ${identityKey}
    FOR UPDATE
  `;
}

export async function lockResidentRow(
  tx: TransactionClient,
  residentId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM residents WHERE id = ${residentId} FOR UPDATE
  `;
}

export async function lockDuplicateReviewRow(
  tx: TransactionClient,
  reviewId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM resident_duplicate_reviews WHERE id = ${reviewId} FOR UPDATE
  `;
}

export async function lockCorrectionRow(
  tx: TransactionClient,
  correctionId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM resident_corrections WHERE id = ${correctionId} FOR UPDATE
  `;
}

export async function allocateResidentNumber(
  tx: TransactionClient,
  now = new Date(),
): Promise<string> {
  const year = manilaYear(now);
  const lastNumber = await allocateYearlySequence(
    tx,
    'resident_number_sequences',
    year,
  );

  if (lastNumber > 999_999) {
    throw new AppError(
      500,
      ERROR_CODES.RESIDENT_NUMBER_EXHAUSTED,
      'The resident number sequence for this year is exhausted. Contact the system administrator.',
    );
  }

  return `RES-${year}-${String(lastNumber).padStart(6, '0')}`;
}
