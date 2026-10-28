import type {
  HouseholdMembershipStatus,
  HouseholdStatus,
  MembershipEndReason,
  PurokStatus,
} from '../types/api';

export const PUROK_STATUS_LABELS: Record<PurokStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

export const HOUSEHOLD_STATUS_LABELS: Record<HouseholdStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

export const MEMBERSHIP_STATUS_LABELS: Record<
  HouseholdMembershipStatus,
  string
> = {
  ACTIVE: 'Active',
  ENDED: 'Ended',
};

export const MEMBERSHIP_END_REASON_LABELS: Record<
  MembershipEndReason,
  string
> = {
  LEFT_HOUSEHOLD: 'Left household',
  MOVED_OUT: 'Moved out',
  DECEASED: 'Deceased',
  TRANSFERRED: 'Transferred',
  HOUSEHOLD_DISSOLVED: 'Household dissolved',
  OTHER: 'Other',
};
