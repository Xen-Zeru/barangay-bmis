import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageLoader } from '../components/PageLoader';
import { useAuth } from './AuthContext';
import { hasPermission } from './permissions';
import type { Permission } from './permissions';

interface RedirectState {
  from?: string;
}

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <PageLoader />;
  }

  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname } satisfies RedirectState}
      />
    );
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const state = location.state as RedirectState | null;
  const destination = state?.from ?? '/dashboard';

  if (status === 'loading') {
    return <PageLoader />;
  }

  if (status === 'authenticated') {
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}


export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <PageLoader />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!hasPermission(user.role, permission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireAnyPermission({
  permissions,
  children,
}: {
  permissions: readonly Permission[];
  children: ReactNode;
}) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <PageLoader />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!permissions.some((permission) => hasPermission(user.role, permission))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
