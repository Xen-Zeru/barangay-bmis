import { Prisma } from '@prisma/client';
import type { TransactionClient } from './transaction';

export type YearlySequenceTable =
  | 'household_number_sequences'
  | 'resident_number_sequences';

export async function allocateYearlySequence(
  tx: TransactionClient,
  table: YearlySequenceTable,
  year: number,
): Promise<number> {
  await tx.$executeRaw(
    Prisma.sql`
      INSERT INTO ${Prisma.raw(table)} (year, lastNumber, updatedAt)
      VALUES (${year}, LAST_INSERT_ID(1), NOW(3))
      ON DUPLICATE KEY UPDATE
        lastNumber = LAST_INSERT_ID(lastNumber + 1),
        updatedAt = NOW(3)
    `,
  );
  const rows = await tx.$queryRaw<Array<{ lastNumber: bigint | number }>>`
    SELECT LAST_INSERT_ID() AS lastNumber
  `;
  return Number(rows[0]?.lastNumber ?? 0);
}
