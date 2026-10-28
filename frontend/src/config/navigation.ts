import { PERMISSIONS, hasPermission } from '../auth/permissions';
import type { Permission } from '../auth/permissions';
import type { IconName } from '../components/Icon';
import type { UserRole } from '../types/api';

export interface NavigationItem {
  key: string;
  label: string;
  to: string;
  permission: Permission;
  phase: 1 | 2 | 3 | 4 | 5;
  icon: IconName;
  description: string;
  enabled?: boolean;
}

/**
 * Module map for Version 1. Implemented items set `enabled: true`; the rest are
 * rendered as disabled placeholders so personnel can see what is coming and
 * which role owns each module.
 */
export const NAVIGATION: readonly NavigationItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    to: '/dashboard',
    permission: PERMISSIONS.DASHBOARD_VIEW,
    phase: 1,
    icon: 'dashboard',
    description: 'Role-specific overview',
  },
  {
    key: 'residents',
    label: 'Residents',
    to: '/residents',
    permission: PERMISSIONS.RESIDENTS_READ,
    phase: 2,
    icon: 'users',
    description: 'Resident registry',
    enabled: true,
  },
  {
    key: 'resident-lookup',
    label: 'Resident Lookup',
    to: '/residents/lookup',
    permission: PERMISSIONS.RESIDENTS_LOOKUP,
    phase: 2,
    icon: 'users',
    description: 'Limited resident lookup',
    enabled: true,
  },
  {
    key: 'duplicate-reviews',
    label: 'Duplicate Reviews',
    to: '/residents/duplicate-reviews',
    permission: PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE,
    phase: 2,
    icon: 'shield',
    description: 'Duplicate review queue',
    enabled: true,
  },
  {
    key: 'correction-requests',
    label: 'Corrections',
    to: '/residents/corrections',
    permission: PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST,
    phase: 2,
    icon: 'refresh',
    description: 'Deceased-status correction requests',
    enabled: true,
  },
  {
    key: 'correction-approvals',
    label: 'Corrections',
    to: '/residents/corrections',
    permission: PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
    phase: 2,
    icon: 'refresh',
    description: 'Correction approvals',
    enabled: true,
  },
  {
    key: 'households',
    label: 'Households',
    to: '/households',
    permission: PERMISSIONS.HOUSEHOLDS_READ,
    phase: 3,
    icon: 'home',
    description: 'Household grouping and memberships',
    enabled: true,
  },
  {
    key: 'puroks',
    label: 'Puroks',
    to: '/puroks',
    permission: PERMISSIONS.PUROKS_READ,
    phase: 3,
    icon: 'home',
    description: 'Purok configuration',
    enabled: true,
  },
  {
    key: 'certificates',
    label: 'Certificates',
    to: '/certificates',
    permission: PERMISSIONS.CERTIFICATES_READ,
    phase: 4,
    icon: 'certificate',
    description: 'Requests and issuance',
  },
  {
    key: 'reports',
    label: 'Reports',
    to: '/reports',
    permission: PERMISSIONS.REPORTS_VIEW,
    phase: 5,
    icon: 'chart',
    description: 'Analytics and exports',
  },
  {
    key: 'imports',
    label: 'Data Import',
    to: '/imports',
    permission: PERMISSIONS.IMPORT_EXECUTE,
    phase: 4,
    icon: 'upload',
    description: 'Controlled Excel/CSV intake',
  },
  {
    key: 'administration',
    label: 'Administration',
    to: '/admin/users',
    permission: PERMISSIONS.USERS_MANAGE,
    phase: 2,
    icon: 'settings',
    description: 'Accounts and roles',
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    to: '/admin/audit',
    permission: PERMISSIONS.AUDIT_READ,
    phase: 2,
    icon: 'shield',
    description: 'Security and activity trail',
  },
];

export function navigationForRole(role: UserRole): NavigationItem[] {
  return NAVIGATION.filter((item) => hasPermission(role, item.permission));
}

export function findNavigationItem(
  pathname: string,
  role?: UserRole,
): NavigationItem | undefined {
  return NAVIGATION.find(
    (item) =>
      item.to === pathname && (!role || hasPermission(role, item.permission)),
  );
}
