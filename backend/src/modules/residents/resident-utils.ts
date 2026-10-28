import { createHash } from 'node:crypto';
import {
  HouseholdStatus,
  RecordSource,
  ResidencyStatus,
  VerificationStatus,
} from '@prisma/client';
import type { Resident, Sex } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';

export interface ResidentNameInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
}

export interface ResidentDraftInput extends ResidentNameInput {
  birthDate: string;
  sex: Sex;
  contactNumber?: string | null;
  residencyStatus: ResidencyStatus;
  recordSource: RecordSource;
  sourceReference?: string | null;
  sourceReferenceUnavailableReason?: string | null;
}

export interface ResidentSummaryDto {
  id: string;
  residentNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  fullName: string;
  birthDate: string;
  sex: Sex;
  residencyStatus: ResidencyStatus;
  verificationStatus: VerificationStatus;
  recordSource: RecordSource;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResidentHouseholdDto {
  id: string;
  householdNumber: string;
  purok: { id: string; code: string; name: string };
  addressLine: string;
  relationship: string | null;
  isHead: boolean;
  status: HouseholdStatus;
  verificationStatus: VerificationStatus;
}

export interface ResidentDetailDto extends ResidentSummaryDto {
  contactNumber: string | null;
  sourceReference: string | null;
  sourceReferenceUnavailableReason: string | null;
  statusChangedAt: string;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  household: ResidentHouseholdDto | null;
}

export interface ResidentLookupDto {
  id: string;
  residentNumber: string;
  fullName: string;
  birthYear: number;
  sex: Sex;
  residencyStatus: ResidencyStatus;
}

export type DuplicateMatchType = 'EXACT' | 'BROAD';

export interface ResidentCandidateDto {
  id: string;
  residentNumber: string;
  fullName: string;
  birthDate: string;
  sex: Sex;
  residencyStatus: ResidencyStatus;
  verificationStatus: VerificationStatus;
  matchType: DuplicateMatchType;
}

export interface ResidentChangeItem {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ResidentChangeDto {
  id: string;
  action: string;
  changes: ResidentChangeItem[];
  reason: string | null;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface ResidentDraftDto {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  birthDate: string;
  sex: Sex;
  contactNumber: string | null;
  residencyStatus: ResidencyStatus;
  recordSource: RecordSource;
  sourceReference: string | null;
  sourceReferenceUnavailableReason: string | null;
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_NAME_CHARACTERS = /[^\p{L}\p{N}\s'-]/gu;
const SEPARATORS = /['-]/g;
const WHITESPACE = /\s+/g;

export function normalizeNamePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_NAME_CHARACTERS, ' ')
    .replace(SEPARATORS, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

export function normalizedFullName(input: ResidentNameInput): string {
  return [input.firstName, input.middleName, input.lastName, input.suffix]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map(normalizeNamePart)
    .join(' ');
}

export function normalizedNameKey(input: ResidentNameInput): string {
  return [input.firstName, input.lastName]
    .map(normalizeNamePart)
    .join(' ');
}

export function identityKeyFor(
  input: ResidentNameInput,
  birthDate: string,
): string {
  return createHash('sha256')
    .update(`${normalizedNameKey(input)}|${birthDate}`)
    .digest('hex');
}

export function parseBirthDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatBirthDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isBirthDateInRange(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = parseBirthDate(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  if (parsed.toISOString().slice(0, 10) !== value) {
    return false;
  }
  const minimum = new Date('1900-01-01T00:00:00.000Z');
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return parsed >= minimum && parsed <= today;
}

export function fullNameOf(
  person: Pick<Resident, 'firstName' | 'middleName' | 'lastName' | 'suffix'>,
): string {
  return [
    person.firstName,
    person.middleName,
    person.lastName,
    person.suffix,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ');
}

export function fullNameOfUser(person: {
  firstName: string;
  lastName: string;
}): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function maskContact(contactNumber: string | null): string | null {
  if (!contactNumber) {
    return null;
  }
  return `***-***-${contactNumber.slice(-4)}`;
}

export function toResidentSummary(resident: Resident): ResidentSummaryDto {
  return {
    id: resident.id,
    residentNumber: resident.residentNumber,
    firstName: resident.firstName,
    middleName: resident.middleName,
    lastName: resident.lastName,
    suffix: resident.suffix,
    fullName: fullNameOf(resident),
    birthDate: formatBirthDate(resident.birthDate),
    sex: resident.sex,
    residencyStatus: resident.residencyStatus,
    verificationStatus: resident.verificationStatus,
    recordSource: resident.recordSource,
    version: resident.version,
    createdAt: resident.createdAt.toISOString(),
    updatedAt: resident.updatedAt.toISOString(),
  };
}

export function toResidentDetail(
  resident: Resident,
  household: ResidentHouseholdDto | null = null,
): ResidentDetailDto {
  return {
    ...toResidentSummary(resident),
    contactNumber: resident.contactNumber,
    sourceReference: resident.sourceReference,
    sourceReferenceUnavailableReason:
      resident.sourceReferenceUnavailableReason,
    statusChangedAt: resident.statusChangedAt.toISOString(),
    verifiedAt: resident.verifiedAt?.toISOString() ?? null,
    verifiedByUserId: resident.verifiedByUserId,
    createdByUserId: resident.createdByUserId,
    updatedByUserId: resident.updatedByUserId,
    household,
  };
}

export function toResidentLookup(resident: Resident): ResidentLookupDto {
  return {
    id: resident.id,
    residentNumber: resident.residentNumber,
    fullName: fullNameOf(resident),
    birthYear: resident.birthDate.getUTCFullYear(),
    sex: resident.sex,
    residencyStatus: resident.residencyStatus,
  };
}

export function toResidentDraft(resident: Resident): ResidentDraftDto {
  return {
    firstName: resident.firstName,
    middleName: resident.middleName,
    lastName: resident.lastName,
    suffix: resident.suffix,
    birthDate: formatBirthDate(resident.birthDate),
    sex: resident.sex,
    contactNumber: resident.contactNumber,
    residencyStatus: resident.residencyStatus,
    recordSource: resident.recordSource,
    sourceReference: resident.sourceReference,
    sourceReferenceUnavailableReason:
      resident.sourceReferenceUnavailableReason,
  };
}

export function toResidentCandidate(
  resident: Resident,
  matchType: DuplicateMatchType,
): ResidentCandidateDto {
  return {
    id: resident.id,
    residentNumber: resident.residentNumber,
    fullName: fullNameOf(resident),
    birthDate: formatBirthDate(resident.birthDate),
    sex: resident.sex,
    residencyStatus: resident.residencyStatus,
    verificationStatus: resident.verificationStatus,
    matchType,
  };
}

export function residentDraftFromInput(
  input: ResidentDraftInput,
): ResidentDraftDto {
  return {
    firstName: input.firstName,
    middleName: input.middleName ?? null,
    lastName: input.lastName,
    suffix: input.suffix ?? null,
    birthDate: input.birthDate,
    sex: input.sex,
    contactNumber: input.contactNumber ?? null,
    residencyStatus: input.residencyStatus,
    recordSource: input.recordSource,
    sourceReference: input.sourceReference ?? null,
    sourceReferenceUnavailableReason:
      input.sourceReferenceUnavailableReason ?? null,
  };
}

export function sourceReferenceProblem(input: {
  recordSource: RecordSource;
  sourceReference?: string | null;
  sourceReferenceUnavailableReason?: string | null;
}): { field: string; message: string } | null {
  const hasReference = Boolean(input.sourceReference?.trim());
  const hasReason = Boolean(input.sourceReferenceUnavailableReason?.trim());
  const legacySource =
    input.recordSource === RecordSource.EXISTING_RECORD ||
    input.recordSource === RecordSource.IMPORT;

  if (legacySource && !hasReference && !hasReason) {
    return {
      field: 'sourceReference',
      message:
        'Provide a source reference, or document why a legacy reference is unavailable.',
    };
  }

  if (hasReference && hasReason) {
    return {
      field: 'sourceReferenceUnavailableReason',
      message:
        'Provide either a source reference or an unavailable-reference reason, not both.',
    };
  }

  if (!legacySource && hasReason) {
    return {
      field: 'sourceReferenceUnavailableReason',
      message:
        'An unavailable-reference reason is only allowed for legacy or imported records.',
    };
  }

  return null;
}

export function canUseNotRecorded(
  actor: AuthUser,
  recordSource: RecordSource,
): boolean {
  if (
    recordSource === RecordSource.EXISTING_RECORD ||
    recordSource === RecordSource.IMPORT
  ) {
    return true;
  }
  return actor.role === 'BARANGAY_SECRETARY';
}

export function changeEntries(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): ResidentChangeItem[] {
  const changes: ResidentChangeItem[] = [];
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes.push({
        field,
        before: before[field],
        after: after[field],
      });
    }
  }
  return changes;
}

export function parseChangePayload(value: string | null): ResidentChangeItem[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is ResidentChangeItem =>
        Boolean(
          item &&
            typeof item === 'object' &&
            'field' in item &&
            typeof item.field === 'string',
        ),
    );
  } catch {
    return [];
  }
}
