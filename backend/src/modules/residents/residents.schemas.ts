import {
  RecordSource,
  ResidencyStatus,
  Sex,
  VerificationStatus,
} from '@prisma/client';
import { z } from 'zod';
import { isBirthDateInRange, sourceReferenceProblem } from './resident-utils';

const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SUFFIX_VALUES = ['JR', 'SR', 'II', 'III', 'IV', 'V'] as const;

function emptyToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  if (value === null) {
    return undefined;
  }
  return value;
}

function emptyToNull(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  return value;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function requiredName(label: string) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(80, `${label} must be 80 characters or fewer.`)
    .transform(collapseWhitespace)
    .refine(
      (value) => NAME_PATTERN.test(value),
      `${label} may only contain letters, spaces, periods, hyphens, and apostrophes.`,
    );
}

function optionalName(label: string) {
  return z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(80, `${label} must be 80 characters or fewer.`)
      .transform(collapseWhitespace)
      .refine(
        (value) => NAME_PATTERN.test(value),
        `${label} may only contain letters, spaces, periods, hyphens, and apostrophes.`,
      )
      .nullable()
      .optional(),
  );
}

function optionalText(label: string, max: number, min = 1) {
  return z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .min(min, `${label} must be at least ${min} characters.`)
      .max(max, `${label} must be ${max} characters or fewer.`)
      .refine(
        (value) => !CONTROL_CHARACTERS.test(value),
        `${label} contains invalid characters.`,
      )
      .nullable()
      .optional(),
  );
}

const suffixSchema = z.preprocess((value) => {
  const cleaned = emptyToNull(value);
  return typeof cleaned === 'string'
    ? cleaned.replace(/\.$/, '').toUpperCase()
    : cleaned;
}, z
  .enum(SUFFIX_VALUES, { error: 'Use Jr., Sr., II, III, IV, or V.' })
  .nullable()
  .optional());

const birthDateSchema = z
  .string({ error: 'Birth date is required.' })
  .refine(
    (value) => isBirthDateInRange(value),
    'Enter a valid birth date between 1900-01-01 and today.',
  );

const contactNumberSchema = z.preprocess((value) => {
  const cleaned = emptyToNull(value);
  return typeof cleaned === 'string'
    ? cleaned.replace(/[\s-]/g, '')
    : cleaned;
}, z
  .string()
  .regex(
    /^(?:\+63|0)9\d{9}$/,
    'Enter a valid Philippine mobile number, such as 09171234567.',
  )
  .nullable()
  .optional());

const residentFields = {
  firstName: requiredName('First name'),
  middleName: optionalName('Middle name'),
  lastName: requiredName('Last name'),
  suffix: suffixSchema,
  birthDate: birthDateSchema,
  sex: z.nativeEnum(Sex, { error: 'Select a sex category.' }),
  contactNumber: contactNumberSchema,
  residencyStatus: z.nativeEnum(ResidencyStatus, {
    error: 'Select a residency status.',
  }),
  recordSource: z.nativeEnum(RecordSource, {
    error: 'Select a record source.',
  }),
  sourceReference: optionalText('Source reference', 150),
  sourceReferenceUnavailableReason: optionalText(
    'Unavailable-reference reason',
    500,
    10,
  ),
};

type SourceFields = {
  recordSource: RecordSource;
  sourceReference?: string | null;
  sourceReferenceUnavailableReason?: string | null;
};

function addSourceReferenceIssue(
  data: SourceFields,
  context: z.RefinementCtx,
): void {
  const problem = sourceReferenceProblem(data);
  if (problem) {
    context.addIssue({
      code: 'custom',
      path: [problem.field],
      message: problem.message,
    });
  }
}

const residentFieldsSchema = z.object({
  ...residentFields,
  residencyStatus: residentFields.residencyStatus.default(
    ResidencyStatus.ACTIVE,
  ),
});

export const createResidentSchema = residentFieldsSchema
  .strict()
  .superRefine(addSourceReferenceIssue);

const updateResidentFields = z
  .object({ ...residentFields })
  .omit({ residencyStatus: true })
  .partial();

export const updateResidentSchema = updateResidentFields
  .extend({
    version: z.coerce
      .number({ error: 'Record version is required.' })
      .int()
      .min(1),
    duplicateReason: optionalText('Duplicate override reason', 500, 10),
  })
  .strict()
  .superRefine((data, context) => {
    const editableFields = [
      'firstName',
      'middleName',
      'lastName',
      'suffix',
      'birthDate',
      'sex',
      'contactNumber',
      'recordSource',
      'sourceReference',
      'sourceReferenceUnavailableReason',
    ] as const;

    if (!editableFields.some((field) => data[field] !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['firstName'],
        message: 'Provide at least one field to update.',
      });
    }
  });

export const statusChangeSchema = z
  .object({
    status: z.nativeEnum(ResidencyStatus, {
      error: 'Select a residency status.',
    }),
    reason: z
      .string({ error: 'A reason is required.' })
      .trim()
      .min(5, 'Provide a reason of at least 5 characters.')
      .max(500, 'Reason must be 500 characters or fewer.'),
    version: z.coerce
      .number({ error: 'Record version is required.' })
      .int()
      .min(1),
  })
  .strict();

export const verifyResidentSchema = z
  .object({
    version: z.coerce
      .number({ error: 'Record version is required.' })
      .int()
      .min(1),
  })
  .strict();

export const residentListQuerySchema = z
  .object({
    q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    status: z.preprocess(
      emptyToUndefined,
      z.nativeEnum(ResidencyStatus).optional(),
    ),
    verificationStatus: z.preprocess(
      emptyToUndefined,
      z.nativeEnum(VerificationStatus).optional(),
    ),
    sex: z.preprocess(emptyToUndefined, z.nativeEnum(Sex).optional()),
    source: z.preprocess(emptyToUndefined, z.nativeEnum(RecordSource).optional()),
    sort: z
      .enum([
        'name_asc',
        'name_desc',
        'residentNumber_asc',
        'createdAt_desc',
        'updatedAt_desc',
      ])
      .default('name_asc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const residentLookupQuerySchema = z
  .object({
    q: z
      .string({ error: 'Enter a name or resident number to search.' })
      .trim()
      .min(1, 'Enter a name or resident number to search.')
      .max(100, 'Search text must be 100 characters or fewer.'),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();

export const historyQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const idParamsSchema = z.object({
  id: z.string().uuid('Invalid resident identifier.'),
});

export const duplicateReviewParamsSchema = z.object({
  id: z.string().uuid('Invalid duplicate review identifier.'),
});

export const correctionParamsSchema = z.object({
  id: z.string().uuid('Invalid correction identifier.'),
});

export const createDuplicateReviewSchema = z
  .object({
    ...residentFields,
    residencyStatus: residentFields.residencyStatus.default(
      ResidencyStatus.ACTIVE,
    ),
    reason: z
      .string({ error: 'A duplicate review reason is required.' })
      .trim()
      .min(10, 'Provide a reason of at least 10 characters.')
      .max(500, 'Reason must be 500 characters or fewer.'),
  })
  .strict()
  .superRefine(addSourceReferenceIssue);

export const duplicateDecisionSchema = z
  .object({
    note: z
      .string({ error: 'A decision note is required.' })
      .trim()
      .min(1, 'A decision note is required.')
      .max(500, 'Decision note must be 500 characters or fewer.'),
    version: z.coerce
      .number({ error: 'Review version is required.' })
      .int()
      .min(1),
  })
  .strict();

export const cancelReviewSchema = z
  .object({
    note: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(500).optional(),
    ),
  })
  .strict();

export const correctionRequestSchema = z
  .object({
    toStatus: z
      .nativeEnum(ResidencyStatus, { error: 'Select a corrected status.' })
      .refine(
        (value) => value !== ResidencyStatus.DECEASED,
        'The corrected status cannot remain DECEASED.',
      ),
    reason: z
      .string({ error: 'A correction reason is required.' })
      .trim()
      .min(10, 'Provide a reason of at least 10 characters.')
      .max(500, 'Reason must be 500 characters or fewer.'),
    evidenceReference: z
      .string({ error: 'An evidence reference is required.' })
      .trim()
      .min(1, 'An evidence reference is required.')
      .max(255, 'Evidence reference must be 255 characters or fewer.'),
  })
  .strict();

export const correctionDecisionSchema = z
  .object({
    note: z
      .string({ error: 'A decision note is required.' })
      .trim()
      .min(1, 'A decision note is required.')
      .max(500, 'Decision note must be 500 characters or fewer.'),
    version: z.coerce
      .number({ error: 'Correction version is required.' })
      .int()
      .min(1),
  })
  .strict();

export const reviewListQuerySchema = z
  .object({
    status: z.preprocess(
      emptyToUndefined,
      z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
    ),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const correctionListQuerySchema = z
  .object({
    status: z.preprocess(
      emptyToUndefined,
      z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
    ),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateResidentInput = z.infer<typeof createResidentSchema>;
export type UpdateResidentInput = z.infer<typeof updateResidentSchema>;
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
export type VerifyResidentInput = z.infer<typeof verifyResidentSchema>;
export type ResidentListQuery = z.infer<typeof residentListQuerySchema>;
export type ResidentLookupQuery = z.infer<typeof residentLookupQuerySchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type CreateDuplicateReviewInput = z.infer<
  typeof createDuplicateReviewSchema
>;
export type DuplicateDecisionInput = z.infer<typeof duplicateDecisionSchema>;
export type CancelReviewInput = z.infer<typeof cancelReviewSchema>;
export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>;
export type CorrectionDecisionInput = z.infer<typeof correctionDecisionSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type CorrectionListQuery = z.infer<typeof correctionListQuerySchema>;
