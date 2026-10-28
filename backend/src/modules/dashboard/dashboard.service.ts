import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ROLE_LABELS } from '../../security/permissions';
import type { AuthUser } from '../auth/auth.types';

export interface DashboardWidget {
  id: string;
  title: string;
  description: string;
  value?: number;
  valueLabel?: string;
  tone: 'neutral' | 'info' | 'positive' | 'warning';
  phase: 1 | 2 | 3;
  comingSoon: boolean;
}

export interface DashboardPayload {
  user: {
    id: string;
    firstName: string;
    fullName: string;
    role: AuthUser['role'];
    roleLabel: string;
    lastLoginAt: string | null;
  };
  headline: string;
  subheadline: string;
  generatedAt: string;
  widgets: DashboardWidget[];
}

interface RoleCopy {
  headline: string;
  subheadline: string;
  widgets: DashboardWidget[];
}

function comingSoon(
  id: string,
  title: string,
  description: string,
  tone: DashboardWidget['tone'] = 'neutral',
  phase: DashboardWidget['phase'] = 2,
): DashboardWidget {
  return { id, title, description, tone, phase, comingSoon: true };
}

function roleCopy(role: UserRole): RoleCopy {
  switch (role) {
    case UserRole.SYSTEM_ADMIN:
      return {
        headline: 'System administration overview',
        subheadline:
          'Account, session, and security activity for Barangay 2 BMIS.',
        widgets: [],
      };
    case UserRole.BARANGAY_SECRETARY:
      return {
        headline: 'Secretariat workspace',
        subheadline:
          'Prepare records and certificates while keeping every action auditable.',
        widgets: [
          comingSoon(
            'certificate-requests',
            'Certificate requests',
            'Request intake, processing, and issuance will be enabled in Phase 3.',
            'info',
          ),
          comingSoon(
            'residents',
            'Resident registry',
            'Search resident records and open audited profiles.',
          ),
          comingSoon(
            'corrections',
            'Correction requests',
            'Deceased-status corrections awaiting Captain approval.',
            'warning',
          ),
          comingSoon(
            'households',
            'Households and puroks',
            'Household grouping and purok assignment across the barangay.',
            'info',
            3,
          ),
          comingSoon(
            'puroks',
            'Puroks',
            'Active Puroks available for household assignment.',
            'neutral',
            3,
          ),
          comingSoon(
            'reports',
            'Reports and analytics',
            'Official summaries and exports will be available in Phase 4.',
          ),
        ],
      };
    case UserRole.BARANGAY_ENCODER:
      return {
        headline: 'Data entry workspace',
        subheadline:
          'Encode and maintain barangay records with a full audit trail.',
        widgets: [
          comingSoon(
            'residents',
            'Resident records',
            'Create and update resident profiles with an audit trail.',
            'info',
          ),
          comingSoon(
            'households',
            'Households',
            'Link residents to households and Puroks in Phase 3.',
            'info',
            3,
          ),
          comingSoon(
            'certificate-requests',
            'Certificate requests',
            'Encode certificate requests in Phase 3.',
          ),
          comingSoon(
            'encoding-activity',
            'Encoding activity',
            'Your recent encoding history will appear in Phase 2.',
          ),
        ],
      };
    case UserRole.BARANGAY_CAPTAIN:
      return {
        headline: 'Approvals and oversight',
        subheadline:
          'Review certificate approvals and barangay-level reports.',
        widgets: [
          comingSoon(
            'certificate-approvals',
            'Certificate approvals',
            'Approve or return certificate requests in Phase 3.',
            'warning',
          ),
          comingSoon(
            'reports',
            'Reports and analytics',
            'Population, household, and certificate summaries in Phase 4.',
            'info',
          ),
          comingSoon(
            'corrections',
            'Correction approvals',
            'Review deceased-status corrections with evidence.',
            'warning',
          ),
          comingSoon(
            'households',
            'Households',
            'Household totals and active Purok coverage for oversight.',
            'info',
            3,
          ),
          comingSoon(
            'certificate-register',
            'Certificate register',
            'Review issued certificates in Phase 3.',
          ),
        ],
      };
    default: {
      const exhaustiveCheck: never = role;
      throw new Error(`Unhandled role: ${String(exhaustiveCheck)}`);
    }
  }
}

async function withPhaseWidgets(
  role: UserRole,
  widgets: DashboardWidget[],
): Promise<DashboardWidget[]> {
  if (role === UserRole.BARANGAY_SECRETARY || role === UserRole.BARANGAY_ENCODER) {
    const [residentCount, activeHouseholds, activePuroks] = await Promise.all([
      prisma.resident.count(),
      prisma.household.count({ where: { status: 'ACTIVE' } }),
      prisma.purok.count({ where: { status: 'ACTIVE' } }),
    ]);
    return widgets.map((widget) => {
      if (widget.id === 'residents') {
        return {
          ...widget,
          description: 'Live resident directory with audited profile access.',
          value: residentCount,
          comingSoon: false,
        };
      }
      if (widget.id === 'households') {
        return {
          ...widget,
          description:
            'Active households with current Purok assignment and membership.',
          value: activeHouseholds,
          valueLabel: 'active households',
          comingSoon: false,
          phase: 3,
        };
      }
      if (widget.id === 'puroks') {
        return {
          ...widget,
          description: 'Active Puroks available for household assignment.',
          value: activePuroks,
          valueLabel: 'active puroks',
          comingSoon: false,
          phase: 3,
        };
      }
      return widget;
    });
  }

  if (role === UserRole.BARANGAY_CAPTAIN) {
    const [pendingCorrections, activeHouseholds] = await Promise.all([
      prisma.residentCorrection.count({ where: { status: 'PENDING' } }),
      prisma.household.count({ where: { status: 'ACTIVE' } }),
    ]);
    return widgets.map((widget) => {
      if (widget.id === 'corrections') {
        return {
          ...widget,
          description:
            'Deceased-status corrections awaiting your decision.',
          value: pendingCorrections,
          comingSoon: false,
        };
      }
      if (widget.id === 'households') {
        return {
          ...widget,
          description:
            'Active households across the barangay for oversight.',
          value: activeHouseholds,
          valueLabel: 'active households',
          comingSoon: false,
          phase: 3,
        };
      }
      return widget;
    });
  }

  return widgets;
}

async function adminWidgets(): Promise<DashboardWidget[]> {
  const lastDay = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [activeUsers, activeSessions, recentSecurityEvents] = await Promise.all([
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: lastDay } } }),
  ]);

  return [
    {
      id: 'active-users',
      title: 'Active accounts',
      description: 'Users who can currently sign in to BMIS.',
      value: activeUsers,
      tone: 'info',
      phase: 1,
      comingSoon: false,
    },
    {
      id: 'active-sessions',
      title: 'Active sessions',
      description: 'Signed-in sessions across all devices.',
      value: activeSessions,
      tone: 'positive',
      phase: 1,
      comingSoon: false,
    },
    {
      id: 'security-events',
      title: 'Security events (24h)',
      description: 'Sign-in, sign-out, and lockout events recorded.',
      value: recentSecurityEvents,
      tone: 'warning',
      phase: 1,
      comingSoon: false,
    },
    ...roleCopy(UserRole.SYSTEM_ADMIN).widgets,
  ];
}

export async function buildDashboard(user: AuthUser): Promise<DashboardPayload> {
  const copy = roleCopy(user.role);
  const widgets =
    user.role === UserRole.SYSTEM_ADMIN
      ? await adminWidgets()
      : await withPhaseWidgets(user.role, copy.widgets);

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      fullName: user.fullName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      lastLoginAt: user.lastLoginAt,
    },
    headline: copy.headline,
    subheadline: copy.subheadline,
    generatedAt: new Date().toISOString(),
    widgets,
  };
}
