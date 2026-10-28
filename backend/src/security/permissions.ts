import { UserRole } from '@prisma/client';

/**
 * Permission catalogue shared conceptually with the frontend.
 * The frontend keeps an identical copy in src/auth/permissions.ts.
 * Keep both files in sync when adding modules.
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
  [UserRole.SYSTEM_ADMIN]: 'System Administrator',
  [UserRole.BARANGAY_SECRETARY]: 'Barangay Secretary',
  [UserRole.BARANGAY_ENCODER]: 'Barangay Encoder',
  [UserRole.BARANGAY_CAPTAIN]: 'Barangay Captain / Approver',
};

/**
 * Least-privilege role matrix for Version 1.
 *
 * System administrators manage accounts and audit trails but do not access
 * resident records or approve certificates. Resident access for administrators
 * requires an explicit future authorization mechanism. Certificate approval is
 * reserved for the Captain; issuance is reserved for the Secretary. Duplicate
 * approval and resident verification are separate Secretary duties. Reversing
 * a deceased status is approved by the Captain, never by the requester. This
 * separation of duties is deliberate and should be reviewed before go-live.
 */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.SYSTEM_ADMIN]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.IMPORT_EXECUTE,
  ],
  [UserRole.BARANGAY_SECRETARY]: [
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
  [UserRole.BARANGAY_ENCODER]: [
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
  [UserRole.BARANGAY_CAPTAIN]: [
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

const permissionSets = new Map<UserRole, ReadonlySet<Permission>>(
  Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => [
    role as UserRole,
    new Set(permissions),
  ]),
);

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return permissionSets.get(role)?.has(permission) ?? false;
}

export function isUserRole(value: string): value is UserRole {
  return (Object.values(UserRole) as string[]).includes(value);
}
