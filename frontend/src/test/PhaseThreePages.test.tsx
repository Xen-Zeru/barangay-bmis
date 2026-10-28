import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdsPage } from '../pages/households/HouseholdsPage';
import { PuroksPage } from '../pages/puroks/PuroksPage';
import type {
  HouseholdListResponse,
  PurokListResponse,
} from '../types/api';

const auth = vi.hoisted(() => ({ role: 'BARANGAY_SECRETARY' }));
const mocks = vi.hoisted(() => ({
  householdList: vi.fn(),
  purokList: vi.fn(),
}));

vi.mock('../api/client', () => ({
  householdsApi: { list: mocks.householdList },
  puroksApi: { list: mocks.purokList },
  residentsApi: {},
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    details?: unknown;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      role: auth.role,
      fullName: 'Test User',
    },
    status: 'authenticated',
  }),
}));

const HOUSEHOLDS: HouseholdListResponse = {
  items: [
    {
      id: 'household-1',
      householdNumber: 'HH-2026-000001',
      purok: {
        id: 'purok-1',
        code: 'P-01',
        name: 'Purok 1',
        status: 'ACTIVE',
      },
      addressLine: '12 Mabini Street',
      landmark: 'Blue gate',
      head: {
        id: 'resident-1',
        residentNumber: 'RES-2026-000001',
        fullName: 'Juan Dela Cruz Santos',
      },
      status: 'ACTIVE',
      statusChangedAt: '2026-10-28T00:00:00.000Z',
      verificationStatus: 'VERIFIED',
      verifiedAt: '2026-10-28T00:00:00.000Z',
      version: 2,
      activeMemberCount: 3,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
};

const PUROKS: PurokListResponse = {
  items: [
    {
      id: 'purok-1',
      code: 'P-01',
      name: 'Purok 1',
      status: 'ACTIVE',
      version: 1,
      householdCount: 4,
      activeHouseholdCount: 3,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
};

beforeEach(() => {
  auth.role = 'BARANGAY_SECRETARY';
  mocks.householdList.mockReset();
  mocks.purokList.mockReset();
  mocks.householdList.mockResolvedValue(HOUSEHOLDS);
  mocks.purokList.mockResolvedValue(PUROKS);
});

describe('Phase 3 pages', () => {
  it('renders household rows and record-keeping actions', async () => {
    render(
      <MemoryRouter>
        <HouseholdsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('HH-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('Juan Dela Cruz Santos')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open/i }),
    ).toHaveAttribute('href', '/households/household-1');
    expect(
      screen.getByRole('button', { name: /new household/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /manage puroks/i }),
    ).toHaveAttribute('href', '/puroks');
  });

  it('keeps captain household views read-only', async () => {
    auth.role = 'BARANGAY_CAPTAIN';
    render(
      <MemoryRouter>
        <HouseholdsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('HH-2026-000001')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new household/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /manage puroks/i }),
    ).not.toBeInTheDocument();
  });

  it('renders Purok household counts and secretary controls', async () => {
    render(
      <MemoryRouter>
        <PuroksPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Purok 1')).toBeInTheDocument();
    expect(screen.getByText('P-01')).toBeInTheDocument();
    expect(screen.getByText('3 active of 4 total')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add purok/i }),
    ).toBeInTheDocument();
  });
});
