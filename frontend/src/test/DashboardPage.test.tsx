import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from '../pages/DashboardPage';
import type { DashboardResponse } from '../types/api';

const { dashboardMock } = vi.hoisted(() => ({
  dashboardMock: vi.fn(),
}));

vi.mock('../api/client', () => ({
  api: { dashboard: dashboardMock },
  ApiError: class ApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

const DASHBOARD_FIXTURE: DashboardResponse = {
  user: {
    id: 'user-1',
    firstName: 'Ana',
    fullName: 'Ana Villanueva',
    role: 'SYSTEM_ADMIN',
    roleLabel: 'System Administrator',
    lastLoginAt: '2026-10-28T00:00:00.000Z',
  },
  headline: 'System administration overview',
  subheadline: 'Account, session, and security activity.',
  generatedAt: '2026-10-28T01:00:00.000Z',
  widgets: [
    {
      id: 'active-users',
      title: 'Active accounts',
      description: 'Users who can currently sign in.',
      value: 4,
      tone: 'info',
      phase: 1,
      comingSoon: false,
    },
    {
      id: 'residents',
      title: 'Resident registry',
      description: 'Resident records arrive in Phase 2.',
      tone: 'neutral',
      phase: 2,
      comingSoon: true,
    },
  ],
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  dashboardMock.mockReset();
});

describe('DashboardPage', () => {
  it('renders role-specific data and phase badges', async () => {
    dashboardMock.mockResolvedValue(DASHBOARD_FIXTURE);
    renderDashboard();

    expect(
      await screen.findByText('System administration overview'),
    ).toBeInTheDocument();
    expect(screen.getByText('Active accounts')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('Resident registry').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Phase 2').length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows a recoverable error state', async () => {
    dashboardMock.mockRejectedValue(new Error('network down'));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dashboard unavailable',
    );
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });
});
