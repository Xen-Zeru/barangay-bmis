import { useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import { ROLE_DESCRIPTIONS } from '../auth/permissions';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { Spinner } from '../components/Spinner';
import {
  formatDateTime,
  formatNumber,
  greetingForNow,
} from '../lib/format';
import type {
  DashboardResponse,
  DashboardWidget,
  WidgetTone,
} from '../types/api';

const TONE_STYLES: Record<WidgetTone, { icon: string; value: string }> = {
  neutral: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  info: { icon: 'bg-sky-50 text-sky-700', value: 'text-sky-900' },
  positive: {
    icon: 'bg-emerald-50 text-emerald-700',
    value: 'text-emerald-900',
  },
  warning: { icon: 'bg-amber-50 text-amber-700', value: 'text-amber-900' },
};

function iconForWidget(id: string): IconName {
  if (id.includes('session') || id.includes('security')) {
    return 'shield';
  }
  if (id.includes('certificate')) {
    return 'certificate';
  }
  if (id.includes('household')) {
    return 'home';
  }
  if (id.includes('residen') || id.includes('user')) {
    return 'users';
  }
  if (id.includes('report') || id.includes('analytics')) {
    return 'chart';
  }
  if (id.includes('import')) {
    return 'upload';
  }
  return 'dashboard';
}

const PHASE_1_ITEMS = [
  'Session-based sign-in with CSRF protection',
  'Least-privilege role-based access control',
  'Audit logging for every authentication event',
  'Role-specific dashboards for daily operations',
];

const PHASE_2_ITEMS = [
  'Resident directory and audited profiles',
  'Registration and controlled editing',
  'Duplicate review and deceased-status correction',
  'Resident-number allocation and change history',
];

const PHASE_3_ITEMS = [
  'Automatic household number allocation',
  'Purok assignment with deactivation safeguards',
  'Head, member, transfer, and end workflows',
  'Household verification and history',
];

const UPCOMING_MODULES = [
  { label: 'Certificate requests and issuance', phase: 'Phase 4' },
  { label: 'Reports, analytics, and controlled import', phase: 'Phase 5' },
];

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="h-28 animate-pulse rounded-2xl bg-white" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="h-40 animate-pulse rounded-2xl bg-white"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl bg-white" />
        <div className="h-56 animate-pulse rounded-2xl bg-white" />
      </div>
    </div>
  );
}

function WidgetCard({ widget }: { widget: DashboardWidget }) {
  const tone = TONE_STYLES[widget.tone];

  return (
    <article
      className={`flex flex-col rounded-2xl p-5 ${
        widget.comingSoon
          ? 'border border-dashed border-slate-300 bg-white/60'
          : 'border border-slate-200 bg-white shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone.icon}`}
        >
          <Icon name={iconForWidget(widget.id)} />
        </span>
        {widget.comingSoon ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <Icon name="lock" className="h-3 w-3" />
            Phase {widget.phase}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Live
          </span>
        )}
      </div>

      <h3 className="mt-4 text-sm font-semibold text-slate-900">
        {widget.title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {widget.description}
      </p>

      <div className="mt-auto pt-4">
        {widget.comingSoon ? (
          <p className="text-xs font-medium text-slate-400">Planned module</p>
        ) : (
          <p className={`text-3xl font-semibold tracking-tight ${tone.value}`}>
            {formatNumber(widget.value ?? 0)}
            {widget.valueLabel ? (
              <span className="ml-1 text-sm font-medium text-slate-500">
                {widget.valueLabel}
              </span>
            ) : null}
          </p>
        )}
      </div>
    </article>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard(): Promise<void> {
      try {
        const response = await api.dashboard();
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Unable to load your dashboard. Check your connection and try again.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchDashboard();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function retry(): void {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div
        className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Dashboard unavailable</p>
            <p className="mt-1">{error ?? 'No dashboard data was returned.'}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800"
            >
              <Icon name="refresh" className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-brand-800/20 bg-brand-900 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">
              {greetingForNow()}, {data.user.firstName}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {data.headline}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-200">
              {data.subheadline}
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              Signed in as
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {data.user.roleLabel}
            </p>
            <p className="mt-0.5 text-xs text-brand-300">
              {ROLE_DESCRIPTIONS[data.user.role]}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-xs text-brand-300">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="lock" className="h-3.5 w-3.5" />
            Secure session active
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="shield" className="h-3.5 w-3.5" />
            Last sign-in: {formatDateTime(data.user.lastLoginAt)}
          </span>
        </div>
      </section>

      <section aria-labelledby="overview-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="overview-heading"
            className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500"
          >
            Overview
          </h2>
          <p className="text-xs text-slate-400">
            Updated {formatDateTime(data.generatedAt)}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.widgets.map((widget) => (
            <WidgetCard key={widget.id} widget={widget} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Icon name="check" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Phase 1 is live
              </h2>
              <p className="text-xs text-slate-500">
                The security foundation for BMIS is in place.
              </p>
            </div>
          </div>
          <ul className="mt-5 space-y-3">
            {PHASE_1_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-sm text-slate-600"
              >
                <Icon
                  name="check"
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Icon name="users" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Resident workflows are live
              </h2>
              <p className="text-xs text-slate-500">
                Phase 2 adds controlled resident records.
              </p>
            </div>
          </div>
          <ul className="mt-5 space-y-3">
            {PHASE_2_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-sm text-slate-600"
              >
                <Icon
                  name="check"
                  className="mt-0.5 h-4 w-4 shrink-0 text-sky-600"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Icon name="home" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Households and Puroks are live
              </h2>
              <p className="text-xs text-slate-500">
                Phase 3 adds membership and Purok management.
              </p>
            </div>
          </div>
          <ul className="mt-5 space-y-3">
            {PHASE_3_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-sm text-slate-600"
              >
                <Icon
                  name="check"
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Icon name="lock" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Coming in later phases
              </h2>
              <p className="text-xs text-slate-500">
                Each module ships only after barangay sign-off.
              </p>
            </div>
          </div>
          <ul className="mt-5 divide-y divide-slate-100">
            {UPCOMING_MODULES.map((module) => (
              <li
                key={module.label}
                className="flex items-center justify-between gap-3 py-2.5 text-sm text-slate-600"
              >
                <span>{module.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {module.phase}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="flex items-center justify-center gap-2 pb-2 text-center text-xs text-slate-400">
        <Spinner className="h-3 w-3 text-slate-300" />
        Barangay 2 BMIS &middot; Authorized personnel only
      </p>
    </div>
  );
}
