import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicateReviewDetailPage } from '../pages/residents/DuplicateReviewDetailPage';
import type { DuplicateReviewDetail } from '../types/api';

const { reviewMock, authState } = vi.hoisted(() => ({
  reviewMock: vi.fn(),
  authState: {
    userId: 'secretary-1',
  },
}));

vi.mock('../api/client', () => ({
  residentsApi: { duplicateReview: reviewMock },
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

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: authState.userId, role: 'BARANGAY_SECRETARY' },
    status: 'authenticated',
  }),
}));

const FIXTURE: DuplicateReviewDetail = {
  id: 'review-1',
  status: 'PENDING',
  reason: 'Same name and birth date.',
  requestedBy: { id: 'secretary-1', fullName: 'Maria Bautista' },
  decidedBy: null,
  candidateCount: 1,
  createdResidentId: null,
  createdAt: '2026-10-28T00:00:00.000Z',
  decidedAt: null,
  version: 1,
  decisionNote: null,
  draft: {
    firstName: 'Juan',
    middleName: 'Dela Cruz',
    lastName: 'Santos',
    suffix: null,
    birthDate: '1985-03-14',
    sex: 'MALE',
    contactNumber: '09171234567',
    residencyStatus: 'ACTIVE',
    recordSource: 'WALK_IN',
    sourceReference: null,
    sourceReferenceUnavailableReason: null,
  },
  candidates: [
    {
      id: 'resident-1',
      residentNumber: 'RES-2026-000001',
      fullName: 'Juan Dela Cruz Santos',
      birthDate: '1985-03-14',
      sex: 'MALE',
      residencyStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      matchType: 'EXACT',
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/residents/duplicate-reviews/review-1']}>
      <Routes>
        <Route
          path="/residents/duplicate-reviews/:id"
          element={<DuplicateReviewDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reviewMock.mockReset();
  authState.userId = 'secretary-1';
});

describe('DuplicateReviewDetailPage', () => {
  it('prevents the requester from approving their own duplicate review', async () => {
    reviewMock.mockResolvedValue(FIXTURE);
    renderPage();

    expect(
      await screen.findByText('Possible duplicate'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you requested this review/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /approve and create resident/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cancel review/i }),
    ).toBeInTheDocument();
  });

  it('shows approval controls to a different Secretary', async () => {
    authState.userId = 'secretary-2';
    reviewMock.mockResolvedValue(FIXTURE);
    renderPage();

    expect(
      await screen.findByRole('button', {
        name: /approve and create resident/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^reject$/i }),
    ).toBeInTheDocument();
  });
});
