import {
  HouseholdStatus,
  MembershipEndReason,
  VerificationStatus,
} from '@prisma/client';
import { z } from 'zod';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ADDRESS_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s.,'#/()-]*$/u;
const RELATIONSHIP_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;

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

const versionSchema = z.coerce
  .number({ error: 'Record version is required.' })
  .int()
  .min(1);

const addressSchema = z
  .string({ error: 'Address is required.' })
  .trim()
  .min(3, 'Address must be at least 3 characters.')
  .max(255, 'Address must be 255 characters or fewer.')
  .transform(collapseWhitespace)
  .refine(
    (value) =>
      !CONTROL_CHARACTERS.test(value) && ADDRESS_PATTERN.test(value),
    'Address contains invalid characters.',
  );

const landmarkSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(200, 'Landmark must be 200 characters or fewer.')
    .transform(collapseWhitespace)
    .refine(
      (value) => !CONTROL_CHARACTERS.test(value),
      'Landmark contains invalid characters.',
    )
    .nullable()
    .optional(),
);

const relationshipSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(80, 'Relationship must be 80 characters or fewer.')
    .transform(collapseWhitespace)
    .refine(
      (value) =>
        !CONTROL_CHARACTERS.test(value) &&
        RELATIONSHIP_PATTERN.test(value),
      'Relationship may only contain letters, spaces, periods, hyphens, and apostrophes.',
    )
    .nullable()
    .optional(),
);

const reasonSchema = z
  .string({ error: 'A reason is required.' })
  .trim()
  .min(5, 'Provide a reason of at least 5 characters.')
  .max(500, 'Reason must be 500 characters or fewer.')
  .refine(
    (value) => !CONTROL_CHARACTERS.test(value),
    'Reason contains invalid characters.',
  );

const noteSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .min(5, 'Note must be at least 5 characters.')
    .max(500, 'Note must be 500 characters or fewer.')
    .refine(
      (value) => !CONTROL_CHARACTERS.test(value),
      'Note contains invalid characters.',
    )
    .nullable()
    .optional(),
);

export const householdParamsSchema = z.object({
  id: z.string().uuid('Invalid household identifier.'),
});

export const createHouseholdSchema = z
  .object({
    purokId: z.string().uuid('Select a valid Purok.'),
    addressLine: addressSchema,
    landmark: landmarkSchema,
    headResidentId: z
      .preprocess(emptyToUndefined, z.string().uuid('Select a valid resident.').optional()),
  })
  .strict();

export const updateHouseholdSchema = z
  .object({
    purokId: z.string().uuid('Select a valid Purok.').optional(),
    addressLine: addressSchema.optional(),
    landmark: landmarkSchema,
    version: versionSchema,
  })
  .strict()
  .superRefine((data, context) => {
    if (
      data.purokId === undefined &&
      data.addressLine === undefined &&
      data.landmark === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['addressLine'],
        message: 'Provide at least one household field to update.',
      });
    }
  });

export const householdStatusSchema = z
  .object({
    status: z.nativeEnum(HouseholdStatus, {
      error: 'Select a household status.',
    }),
    reason: reasonSchema,
    version: versionSchema,
  })
  .strict();

export const verifyHouseholdSchema = z
  .object({
    version: versionSchema,
  })
  .strict();

export const changeHouseholdHeadSchema = z
  .object({
    residentId: z.string().uuid('Select a valid resident.'),
    reason: reasonSchema,
    version: versionSchema,
  })
  .strict();

export const addHouseholdMemberSchema = z
  .object({
    residentId: z.string().uuid('Select a valid resident.'),
    relationship: relationshipSchema,
  })
  .strict();

export const endHouseholdMemberSchema = z
  .object({
    reason: z.nativeEnum(MembershipEndReason, {
      error: 'Select a membership end reason.',
    }),
    note: noteSchema,
    version: versionSchema,
  })
  .strict()
  .superRefine((data, context) => {
    if (data.reason === MembershipEndReason.OTHER && !data.note) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Provide a note when using the Other reason.',
      });
    }
  });

export const transferHouseholdMemberSchema = z
  .object({
    targetHouseholdId: z.string().uuid('Select a valid target household.'),
    relationship: relationshipSchema,
    reason: reasonSchema,
    version: versionSchema,
  })
  .strict();

export const householdListQuerySchema = z
  .object({
    q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    purokId: z.preprocess(
      emptyToUndefined,
      z.string().uuid('Select a valid Purok.').optional(),
    ),
    status: z.preprocess(
      emptyToUndefined,
      z.nativeEnum(HouseholdStatus).optional(),
    ),
    verificationStatus: z.preprocess(
      emptyToUndefined,
      z.nativeEnum(VerificationStatus).optional(),
    ),
    sort: z
      .enum(['householdNumber_asc', 'householdNumber_desc', 'updatedAt_desc'])
      .default('householdNumber_asc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const householdHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const householdMemberParamsSchema = householdParamsSchema.extend({
  membershipId: z.string().uuid('Invalid membership identifier.'),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;
export type HouseholdStatusInput = z.infer<typeof householdStatusSchema>;
export type VerifyHouseholdInput = z.infer<typeof verifyHouseholdSchema>;
export type ChangeHouseholdHeadInput = z.infer<
  typeof changeHouseholdHeadSchema
>;
export type AddHouseholdMemberInput = z.infer<
  typeof addHouseholdMemberSchema
>;
export type EndHouseholdMemberInput = z.infer<
  typeof endHouseholdMemberSchema
>;
export type TransferHouseholdMemberInput = z.infer<
  typeof transferHouseholdMemberSchema
>;
export type HouseholdListQuery = z.infer<typeof householdListQuerySchema>;
export type HouseholdHistoryQuery = z.infer<
  typeof householdHistoryQuerySchema
>;
