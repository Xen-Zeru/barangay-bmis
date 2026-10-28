import type {
  DuplicateReviewStatus,
  RecordSource,
  ResidencyStatus,
  Sex,
  VerificationStatus,
} from '../types/api';

export const SEX_LABELS: Record<Sex, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  NOT_RECORDED: 'Not recorded',
};

export const STATUS_LABELS: Record<ResidencyStatus, string> = {
  ACTIVE: 'Active',
  MOVED_OUT: 'Moved out',
  DECEASED: 'Deceased',
  INACTIVE: 'Inactive',
};

export const SOURCE_LABELS: Record<RecordSource, string> = {
  WALK_IN: 'Walk-in',
  FIELD_SURVEY: 'Field survey',
  EXISTING_RECORD: 'Existing record',
  IMPORT: 'Imported',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  UNVERIFIED: 'Unverified',
  VERIFIED: 'Verified',
};

export const REVIEW_STATUS_LABELS: Record<DuplicateReviewStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const STATUS_TONES: Record<ResidencyStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  MOVED_OUT: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  DECEASED: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  INACTIVE: 'bg-amber-50 text-amber-700 ring-amber-600/20',
};

export const REVIEW_STATUS_TONES: Record<DuplicateReviewStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};
