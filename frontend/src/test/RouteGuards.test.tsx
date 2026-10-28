import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  ProtectedRoute,
  RequireAnyPermission,
} from '../auth/RouteGuards';
import { PERMISSIONS } from '../auth/permissions';

const authState = vi.hoisted(() => ({
  status: 'anonymous' as 'loading' | 'authenticated' | 'anonymous',
  user: null as unknown,
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    status: authState.status,
    user: authState.user,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

function renderGuardedRoute() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <div>
                Protected dashboard
                <Outlet />
              </div>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
        </Route>
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderAnyPermissionRoute() {
  return render(
    <MemoryRouter initialEntries={['/corrections']}>
      <Routes>
        <Route
          path="/corrections"
          element={
            <RequireAnyPermission
              permissions={[
                PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST,
                PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
              ]}
            >
              <div>Correction queue</div>
            </RequireAnyPermission>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard content</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAnyPermission', () => {
  it('allows a role with either permission', () => {
    authState.status = 'authenticated';
    authState.user = { id: 'captain-1', role: 'BARANGAY_CAPTAIN' };
    renderAnyPermissionRoute();
    expect(screen.getByText('Correction queue')).toBeInTheDocument();
  });

  it('redirects a role with neither permission', () => {
    authState.status = 'authenticated';
    authState.user = { id: 'encoder-1', role: 'BARANGAY_ENCODER' };
    renderAnyPermissionRoute();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  it('redirects anonymous visitors to the login screen', () => {
    authState.status = 'anonymous';
    authState.user = null;
    renderGuardedRoute();

    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('shows a loader while the session is being restored', () => {
    authState.status = 'loading';
    authState.user = null;
    renderGuardedRoute();

    expect(screen.getByText(/preparing your workspace/i)).toBeInTheDocument();
  });

  it('renders the protected content for an authenticated user', () => {
    authState.status = 'authenticated';
    authState.user = { id: 'user-1', role: 'SYSTEM_ADMIN' };
    renderGuardedRoute();

    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });
});
