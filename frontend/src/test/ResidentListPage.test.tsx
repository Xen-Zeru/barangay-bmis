import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResidentListPage } from '../pages/residents/ResidentListPage';
import type { ResidentListResponse } from '../types/api';

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock('../api/client', () => ({
  residentsApi: { list: listMock },
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
      id: 'secretary-1',
      role: 'BARANGAY_SECRETARY',
      fullName: 'Maria Bautista',
    },
    status: 'authenticated',
  }),
}));

const FIXTURE: ResidentListResponse = {
  items: [
    {
      id: 'resident-1',
      residentNumber: 'RES-2026-000001',
      firstName: 'Juan',
      middleName: 'Dela Cruz',
      lastName: 'Santos',
      suffix: null,
      fullName: 'Juan Dela Cruz Santos',
      birthDate: '1985-03-14',
      sex: 'MALE',
      residencyStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      recordSource: 'WALK_IN',
      version: 2,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
};

beforeEach(() => {
  listMock.mockReset();
});

describe('ResidentListPage', () => {
  it('renders the directory and links to full profiles', async () => {
    listMock.mockResolvedValue(FIXTURE);
    render(
      <MemoryRouter>
        <ResidentListPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('Juan Dela Cruz Santos'),
    ).toBeInTheDocument();
    expect(screen.getByText('RES-2026-000001')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: /open profile/i }),
    ).toHaveAttribute('href', '/residents/resident-1');
    expect(
      screen.getByRole('link', { name: /duplicate reviews/i }),
    ).toHaveAttribute('href', '/residents/duplicate-reviews');
    expect(
      screen.getByRole('link', { name: /register resident/i }),
    ).toHaveAttribute('href', '/residents/new');
  });

  it('shows a recoverable error state', async () => {
    listMock.mockRejectedValue(new Error('offline'));
    render(
      <MemoryRouter>
        <ResidentListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load the resident directory.',
    );
  });
});
