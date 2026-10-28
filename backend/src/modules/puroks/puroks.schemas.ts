import { PurokStatus } from '@prisma/client';
import { z } from 'zod';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s.'()-]*$/u;

function emptyToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  if (value === null) {
    return undefined;
  }
  return value;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const codeSchema = z
  .string({ error: 'Purok code is required.' })
  .trim()
  .min(2, 'Purok code must be at least 2 characters.')
  .max(20, 'Purok code must be 20 characters or fewer.')
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => CODE_PATTERN.test(value),
    'Purok code may only contain letters, numbers, and hyphens.',
  );

const nameSchema = z
  .string({ error: 'Purok name is required.' })
  .trim()
  .min(2, 'Purok name must be at least 2 characters.')
  .max(120, 'Purok name must be 120 characters or fewer.')
  .transform(collapseWhitespace)
  .refine(
    (value) =>
      !CONTROL_CHARACTERS.test(value) && NAME_PATTERN.test(value),
    'Purok name may only contain letters, numbers, spaces, periods, hyphens, apostrophes, and parentheses.',
  );

const versionSchema = z.coerce
  .number({ error: 'Record version is required.' })
  .int()
  .min(1);

export const createPurokSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
  })
  .strict();

export const updatePurokSchema = z
  .object({
    code: codeSchema.optional(),
    name: nameSchema.optional(),
    version: versionSchema,
  })
  .strict()
  .superRefine((data, context) => {
    if (data.code === undefined && data.name === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Provide a code or name to update.',
      });
    }
  });

export const purokStatusSchema = z
  .object({
    status: z.nativeEnum(PurokStatus, {
      error: 'Select a Purok status.',
    }),
    reason: z
      .string({ error: 'A reason is required.' })
      .trim()
      .min(5, 'Provide a reason of at least 5 characters.')
      .max(500, 'Reason must be 500 characters or fewer.')
      .refine(
        (value) => !CONTROL_CHARACTERS.test(value),
        'Reason contains invalid characters.',
      ),
    version: versionSchema,
  })
  .strict();

export const purokListQuerySchema = z
  .object({
    q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    status: z.preprocess(
      emptyToUndefined,
      z.nativeEnum(PurokStatus).optional(),
    ),
    sort: z.enum(['name_asc', 'name_desc', 'updatedAt_desc']).default('name_asc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const purokParamsSchema = z.object({
  id: z.string().uuid('Invalid Purok identifier.'),
});

export type CreatePurokInput = z.infer<typeof createPurokSchema>;
export type UpdatePurokInput = z.infer<typeof updatePurokSchema>;
export type PurokStatusInput = z.infer<typeof purokStatusSchema>;
export type PurokListQuery = z.infer<typeof purokListQuerySchema>;
