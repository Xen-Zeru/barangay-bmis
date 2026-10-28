import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/Spinner';

interface RedirectState {
  from?: string;
}

const FEATURES = [
  'Role-based access for authorized barangay personnel',
  'Session-protected sign-in with a complete audit trail',
  'Built for daily records, certificate, and reporting work',
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as RedirectState | null;
  const destination = state?.from ?? '/dashboard';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(destination, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError(
          'Unable to reach the BMIS server. Check your connection and try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-brand-500/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative">
          <div className="flex items-center gap-4">
            <BrandMark size="lg" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-300">
                Republic of the Philippines
              </p>
              <p className="mt-1 text-sm text-brand-200">
                City of Sipalay &middot; Negros Occidental
              </p>
            </div>
          </div>

          <h1 className="mt-12 max-w-xl text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Barangay 2
            <br />
            Management Information System
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-brand-200">
            A secure workspace for resident records, household profiling, and
            certificate services.
          </p>

          <ul className="mt-10 space-y-4">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-gold-300 ring-1 ring-gold-400/30">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                <span className="text-brand-100">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs leading-relaxed text-brand-400">
          Authorized personnel only. All sign-in attempts and actions are
          recorded in the barangay audit log.
        </p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Barangay 2 BMIS
              </p>
              <p className="text-xs text-slate-500">
                Sipalay City, Negros Occidental
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-300/30 sm:p-9">
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">
                Barangay personnel
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Sign in
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Use the account issued by your barangay system administrator.
              </p>
            </div>

            {error ? (
              <div
                className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  aria-invalid={Boolean(error)}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-50"
                  placeholder="e.g. secretary"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(error)}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-20 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-50"
                    placeholder="Enter your password"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-1.5 my-auto h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-500/25 disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {import.meta.env.DEV ? (
              <p className="mt-6 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                Development build. Seeded demo accounts and their password are
                documented in the project README.
              </p>
            ) : null}
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
            Access is limited to authorized barangay personnel.
            <br />
            Every session is protected and audited.
          </p>
        </div>
      </main>
    </div>
  );
}
