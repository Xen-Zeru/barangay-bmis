import { UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createTestUser, loginAgent, resetDatabase } from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const EXPECTED_ROLE_WIDGETS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'security-events',
  [UserRole.BARANGAY_SECRETARY]: 'certificate-requests',
  [UserRole.BARANGAY_ENCODER]: 'encoding-activity',
  [UserRole.BARANGAY_CAPTAIN]: 'certificate-approvals',
};

describe('GET /api/dashboard', () => {
  it.each(Object.values(UserRole))(
    'returns a role-aware dashboard for %s',
    async (role) => {
      await createTestUser({ username: `dashboard.${role}`, role });
      const agent = request.agent(app);

      await loginAgent(agent, `dashboard.${role}`);
      const response = await agent.get('/api/dashboard').expect(200);

      expect(response.body.user.role).toBe(role);
      expect(response.body.user.roleLabel).toEqual(expect.any(String));
      expect(response.body.widgets.length).toBeGreaterThan(0);

      const widgetIds = (response.body.widgets as Array<{ id: string }>).map(
        (widget) => widget.id,
      );
      expect(widgetIds).toContain(EXPECTED_ROLE_WIDGETS[role]);
    },
  );

  it('shows live system counts to the administrator', async () => {
    await createTestUser({ username: 'admin.stats', role: UserRole.SYSTEM_ADMIN });
    const agent = request.agent(app);

    await loginAgent(agent, 'admin.stats');
    const response = await agent.get('/api/dashboard').expect(200);

    const widgets = response.body.widgets as Array<{
      id: string;
      value?: number;
      comingSoon: boolean;
    }>;
    const activeUsers = widgets.find((widget) => widget.id === 'active-users');
    const activeSessions = widgets.find(
      (widget) => widget.id === 'active-sessions',
    );
    const securityEvents = widgets.find(
      (widget) => widget.id === 'security-events',
    );

    expect(activeUsers?.value).toBeGreaterThanOrEqual(1);
    expect(activeSessions?.value).toBeGreaterThanOrEqual(1);
    expect(securityEvents?.value).toBeGreaterThanOrEqual(1);
    expect(activeUsers?.comingSoon).toBe(false);
  });

  it('shows live Phase 3 household and Purok counts to authorised roles', async () => {
    await createTestUser({
      username: 'secretary.households',
      role: UserRole.BARANGAY_SECRETARY,
    });
    const purok = await prisma.purok.create({
      data: {
        code: 'P-01',
        name: 'Purok 1',
        nameNormalized: 'purok 1',
      },
    });
    const inactivePurok = await prisma.purok.create({
      data: {
        code: 'P-02',
        name: 'Purok 2',
        nameNormalized: 'purok 2',
        status: 'INACTIVE',
      },
    });
    await prisma.household.create({
      data: {
        householdNumber: 'HH-2026-000001',
        purokId: purok.id,
        addressLine: 'Active household',
      },
    });
    await prisma.household.create({
      data: {
        householdNumber: 'HH-2026-000002',
        purokId: inactivePurok.id,
        addressLine: 'Inactive household',
        status: 'INACTIVE',
      },
    });

    const agent = request.agent(app);
    await loginAgent(agent, 'secretary.households');
    const response = await agent.get('/api/dashboard').expect(200);
    const widgets = response.body.widgets as Array<{
      id: string;
      value?: number;
      phase: number;
      comingSoon: boolean;
    }>;

    expect(widgets.find((widget) => widget.id === 'households')).toMatchObject({
      value: 1,
      phase: 3,
      comingSoon: false,
    });
    expect(widgets.find((widget) => widget.id === 'puroks')).toMatchObject({
      value: 1,
      phase: 3,
      comingSoon: false,
    });
  });

  it('does not expose administrator widgets to the captain', async () => {
    await createTestUser({ username: 'captain.view', role: UserRole.BARANGAY_CAPTAIN });
    const agent = request.agent(app);

    await loginAgent(agent, 'captain.view');
    const response = await agent.get('/api/dashboard').expect(200);

    const ids = (response.body.widgets as Array<{ id: string }>).map(
      (widget) => widget.id,
    );
    expect(ids).not.toContain('active-users');
    expect(ids).not.toContain('security-events');

    const approvals = (
      response.body.widgets as Array<{ id: string; comingSoon: boolean }>
    ).find((widget) => widget.id === 'certificate-approvals');
    expect(approvals?.comingSoon).toBe(true);
  });
});
