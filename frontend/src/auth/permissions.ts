import type { UserRole } from '../types/api';

/**
 * Frontend mirror of backend/src/security/permissions.ts.
 * Keep both permission catalogues in sync when adding modules.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',
  USERS_MANAGE: 'users:manage',
  AUDIT_READ: 'audit:read',
  RESIDENTS_READ: 'residents:read',
  RESIDENTS_LOOKUP: 'residents:lookup',
  RESIDENTS_WRITE: 'residents:write',
  RESIDENTS_VERIFY: 'residents:verify',
  RESIDENTS_DUPLICATES_APPROVE: 'residents:duplicates:approve',
  RESIDENTS_CORRECTIONS_REQUEST: 'residents:corrections:request',
  RESIDENTS_CORRECTIONS_APPROVE: 'residents:corrections:approve',
  PUROKS_READ: 'puroks:read',
  PUROKS_WRITE: 'puroks:write',
  HOUSEHOLDS_READ: 'households:read',
  HOUSEHOLDS_WRITE: 'households:write',
  HOUSEHOLDS_VERIFY: 'households:verify',
  HOUSEHOLDS_HEAD_CHANGE: 'households:head:change',
  HOUSEHOLDS_STATUS: 'households:status',
  HOUSEHOLDS_HISTORY_READ: 'households:history:read',
  CERTIFICATES_READ: 'certificates:read',
  CERTIFICATES_WRITE: 'certificates:write',
  CERTIFICATES_APPROVE: 'certificates:approve',
  CERTIFICATES_ISSUE: 'certificates:issue',
  REPORTS_VIEW: 'reports:view',
  IMPORT_EXECUTE: 'import:execute',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  BARANGAY_SECRETARY: 'Barangay Secretary',
  BARANGAY_ENCODER: 'Barangay Encoder',
  BARANGAY_CAPTAIN: 'Barangay Captain / Approver',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SYSTEM_ADMIN: 'Accounts, sessions, and audit trail',
  BARANGAY_SECRETARY: 'Records, certificates, and reporting',
  BARANGAY_ENCODER: 'Resident and household data entry',
  BARANGAY_CAPTAIN: 'Certificate approvals and oversight',
};

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SYSTEM_ADMIN: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.IMPORT_EXECUTE,
  ],
  BARANGAY_SECRETARY: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RESIDENTS_READ,
    PERMISSIONS.RESIDENTS_WRITE,
    PERMISSIONS.RESIDENTS_VERIFY,
    PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE,
    PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST,
    PERMISSIONS.PUROKS_READ,
    PERMISSIONS.PUROKS_WRITE,
    PERMISSIONS.HOUSEHOLDS_READ,
    PERMISSIONS.HOUSEHOLDS_WRITE,
    PERMISSIONS.HOUSEHOLDS_VERIFY,
    PERMISSIONS.HOUSEHOLDS_HEAD_CHANGE,
    PERMISSIONS.HOUSEHOLDS_STATUS,
    PERMISSIONS.HOUSEHOLDS_HISTORY_READ,
    PERMISSIONS.CERTIFICATES_READ,
    PERMISSIONS.CERTIFICATES_WRITE,
    PERMISSIONS.CERTIFICATES_ISSUE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.IMPORT_EXECUTE,
  ],
  BARANGAY_ENCODER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RESIDENTS_READ,
    PERMISSIONS.RESIDENTS_WRITE,
    PERMISSIONS.PUROKS_READ,
    PERMISSIONS.HOUSEHOLDS_READ,
    PERMISSIONS.HOUSEHOLDS_WRITE,
    PERMISSIONS.HOUSEHOLDS_HISTORY_READ,
    PERMISSIONS.CERTIFICATES_READ,
    PERMISSIONS.CERTIFICATES_WRITE,
  ],
  BARANGAY_CAPTAIN: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RESIDENTS_LOOKUP,
    PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
    PERMISSIONS.PUROKS_READ,
    PERMISSIONS.HOUSEHOLDS_READ,
    PERMISSIONS.CERTIFICATES_READ,
    PERMISSIONS.CERTIFICATES_APPROVE,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
