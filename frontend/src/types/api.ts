export type UserRole =
  | 'SYSTEM_ADMIN'
  | 'BARANGAY_SECRETARY'
  | 'BARANGAY_ENCODER'
  | 'BARANGAY_CAPTAIN';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
}

export type WidgetTone = 'neutral' | 'info' | 'positive' | 'warning';

export interface DashboardWidget {
  id: string;
  title: string;
  description: string;
  value?: number;
  valueLabel?: string;
  tone: WidgetTone;
  phase: 1 | 2 | 3;
  comingSoon: boolean;
}

export interface DashboardResponse {
  user: {
    id: string;
    firstName: string;
    fullName: string;
    role: UserRole;
    roleLabel: string;
    lastLoginAt: string | null;
  };
  headline: string;
  subheadline: string;
  generatedAt: string;
  widgets: DashboardWidget[];
}

export interface LoginResponse {
  user: AuthUser;
  csrfToken: string;
}

export interface MeResponse {
  user: AuthUser;
  csrfToken: string;
}

export type Sex = 'MALE' | 'FEMALE' | 'NOT_RECORDED';
export type ResidencyStatus = 'ACTIVE' | 'MOVED_OUT' | 'DECEASED' | 'INACTIVE';
export type RecordSource =
  | 'WALK_IN'
  | 'FIELD_SURVEY'
  | 'EXISTING_RECORD'
  | 'IMPORT';
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED';
export type DuplicateMatchType = 'EXACT' | 'BROAD';
export type DuplicateReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type CorrectionType = 'STATUS_REVERSAL';
export type PurokStatus = 'ACTIVE' | 'INACTIVE';
export type HouseholdStatus = 'ACTIVE' | 'INACTIVE';
export type HouseholdMembershipStatus = 'ACTIVE' | 'ENDED';
export type MembershipEndReason =
  | 'LEFT_HOUSEHOLD'
  | 'MOVED_OUT'
  | 'DECEASED'
  | 'TRANSFERRED'
  | 'HOUSEHOLD_DISSOLVED'
  | 'OTHER';

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ResidentSummary {
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

export interface ResidentDetail extends ResidentSummary {
  contactNumber: string | null;
  sourceReference: string | null;
  sourceReferenceUnavailableReason: string | null;
  statusChangedAt: string;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  household: ResidentHousehold | null;
}

export interface ResidentHousehold {
  id: string;
  householdNumber: string;
  purok: { id: string; code: string; name: string };
  addressLine: string;
  relationship: string | null;
  isHead: boolean;
  status: HouseholdStatus;
  verificationStatus: VerificationStatus;
}

export interface ResidentLookup {
  id: string;
  residentNumber: string;
  fullName: string;
  birthYear: number;
  sex: Sex;
  residencyStatus: ResidencyStatus;
}

export interface ResidentCandidate {
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

export interface ResidentChange {
  id: string;
  action: string;
  changes: ResidentChangeItem[];
  reason: string | null;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface ResidentListResponse {
  items: ResidentSummary[];
  pagination: Pagination;
}

export interface ResidentHistoryResponse {
  items: ResidentChange[];
  pagination: Pagination;
}

export interface ResidentDraft {
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

export interface WorkflowUser {
  id: string;
  fullName: string;
}

export interface DuplicateReviewSummary {
  id: string;
  status: DuplicateReviewStatus;
  reason: string;
  requestedBy: WorkflowUser | null;
  decidedBy: WorkflowUser | null;
  candidateCount: number;
  createdResidentId: string | null;
  createdAt: string;
  decidedAt: string | null;
  version: number;
}

export interface DuplicateReviewDetail extends DuplicateReviewSummary {
  decisionNote: string | null;
  draft: ResidentDraft | null;
  candidates: ResidentCandidate[];
}

export interface DuplicateReviewListResponse {
  items: DuplicateReviewSummary[];
  pagination: Pagination;
}

export interface CorrectionResident {
  id: string;
  residentNumber: string;
  fullName: string;
  residencyStatus: ResidencyStatus;
}

export interface CorrectionSummary {
  id: string;
  resident: CorrectionResident;
  status: CorrectionStatus;
  correctionType: CorrectionType;
  fromStatus: ResidencyStatus;
  toStatus: ResidencyStatus;
  reason: string;
  evidenceReference: string;
  requestedBy: WorkflowUser | null;
  decidedBy: WorkflowUser | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  version: number;
}

export interface CorrectionListResponse {
  items: CorrectionSummary[];
  pagination: Pagination;
}

export interface Purok {
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

export interface PurokListResponse {
  items: Purok[];
  pagination: Pagination;
}

export interface HouseholdPurok {
  id: string;
  code: string;
  name: string;
  status: PurokStatus;
}

export interface HouseholdPerson {
  id: string;
  residentNumber: string;
  fullName: string;
}

export interface HouseholdMember {
  id: string;
  residentId: string;
  residentNumber: string;
  fullName: string;
  relationship: string | null;
  joinedAt: string;
  status: HouseholdMembershipStatus;
  version: number;
  birthYear: number;
  birthDate: string | null;
  sex: Sex;
  residencyStatus: ResidencyStatus;
  verificationStatus: VerificationStatus | null;
  contactNumber: string | null;
}

export interface HouseholdSummary {
  id: string;
  householdNumber: string;
  purok: HouseholdPurok;
  addressLine: string;
  landmark: string | null;
  head: HouseholdPerson | null;
  status: HouseholdStatus;
  statusChangedAt: string;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  version: number;
  activeMemberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdDetail extends HouseholdSummary {
  members: HouseholdMember[];
}

export interface HouseholdListResponse {
  items: HouseholdSummary[];
  pagination: Pagination;
}

export interface HouseholdChange {
  id: string;
  action: string;
  changes: Record<string, unknown> | null;
  reason: string | null;
  actor: WorkflowUser | null;
  createdAt: string;
}

export interface HouseholdHistoryResponse {
  items: HouseholdChange[];
  pagination: Pagination;
}
