import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { api, ensureCsrfToken, setCsrfToken } from '../api/client';
import type { AuthUser } from '../types/api';
import { AuthContext } from './AuthContext';
import type { AuthContextValue, AuthStatus } from './AuthContext';

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      try {
        const data = await api.me();
        if (cancelled) {
          return;
        }
        setCsrfToken(data.csrfToken);
        setUser(data.user);
        setStatus('authenticated');
      } catch {
        if (cancelled) {
          return;
        }
        setUser(null);
        setStatus('anonymous');
        try {
          await ensureCsrfToken(true);
        } catch {
          // The login page retries CSRF initialization on submit.
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<AuthUser> => {
      const data = await api.login(username, password);
      setCsrfToken(data.csrfToken);
      setUser(data.user);
      setStatus('authenticated');
      return data.user;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } finally {
      setCsrfToken(null);
      setUser(null);
      setStatus('anonymous');
      try {
        await ensureCsrfToken(true);
      } catch {
        // A later login attempt will request a fresh token.
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
