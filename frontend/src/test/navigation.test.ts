import { describe, expect, it } from 'vitest';
import { navigationForRole } from '../config/navigation';
import type { UserRole } from '../types/api';

function labelsFor(role: UserRole): string[] {
  return navigationForRole(role).map((item) => item.label);
}

describe('role-aware navigation', () => {
  it('shows every role the dashboard', () => {
    const roles: UserRole[] = [
      'SYSTEM_ADMIN',
      'BARANGAY_SECRETARY',
      'BARANGAY_ENCODER',
      'BARANGAY_CAPTAIN',
    ];

    for (const role of roles) {
      expect(labelsFor(role)).toContain('Dashboard');
    }
  });

  it('shows administration and audit logs only to the system administrator', () => {
    const admin = labelsFor('SYSTEM_ADMIN');
    expect(admin).toContain('Administration');
    expect(admin).toContain('Audit Logs');

    for (const role of [
      'BARANGAY_SECRETARY',
      'BARANGAY_ENCODER',
      'BARANGAY_CAPTAIN',
    ] as UserRole[]) {
      const labels = labelsFor(role);
      expect(labels).not.toContain('Administration');
      expect(labels).not.toContain('Audit Logs');
    }
  });

  it('restricts data import to administrators and secretaries', () => {
    expect(labelsFor('SYSTEM_ADMIN')).toContain('Data Import');
    expect(labelsFor('BARANGAY_SECRETARY')).toContain('Data Import');
    expect(labelsFor('BARANGAY_ENCODER')).not.toContain('Data Import');
    expect(labelsFor('BARANGAY_CAPTAIN')).not.toContain('Data Import');
  });

  it('gives the captain limited lookup and correction approval without full registry access', () => {
    const captain = labelsFor('BARANGAY_CAPTAIN');
    expect(captain).toContain('Certificates');
    expect(captain).toContain('Reports');
    expect(captain).toContain('Resident Lookup');
    expect(captain).toContain('Corrections');
    expect(captain).not.toContain('Residents');
    expect(captain).not.toContain('Duplicate Reviews');
  });

  it('shows the resident registry to record-keeping roles only', () => {
    expect(labelsFor('BARANGAY_SECRETARY')).toContain('Residents');
    expect(labelsFor('BARANGAY_ENCODER')).toContain('Residents');
    expect(labelsFor('SYSTEM_ADMIN')).not.toContain('Residents');
  });

  it('shows the duplicate review queue only to the Secretary', () => {
    expect(labelsFor('BARANGAY_SECRETARY')).toContain('Duplicate Reviews');
    expect(labelsFor('BARANGAY_ENCODER')).not.toContain('Duplicate Reviews');
    expect(labelsFor('BARANGAY_CAPTAIN')).not.toContain('Duplicate Reviews');
    expect(labelsFor('SYSTEM_ADMIN')).not.toContain('Duplicate Reviews');
  });

  it('marks implemented modules as enabled and later modules as placeholders', () => {
    const enabledKeys = new Set([
      'residents',
      'resident-lookup',
      'duplicate-reviews',
      'correction-requests',
      'correction-approvals',
      'households',
      'puroks',
    ]);
    for (const role of [
      'SYSTEM_ADMIN',
      'BARANGAY_SECRETARY',
      'BARANGAY_ENCODER',
      'BARANGAY_CAPTAIN',
    ] as UserRole[]) {
      for (const item of navigationForRole(role)) {
        if (item.key === 'dashboard' || enabledKeys.has(item.key)) {
          expect(item.enabled ?? item.phase === 1).toBe(true);
        } else {
          expect(item.enabled ?? item.phase === 1).toBe(false);
        }
      }
    }
  });
});
