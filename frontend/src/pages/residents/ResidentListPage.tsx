import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, residentsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../../auth/permissions';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatBirthDate } from '../../lib/format';
import {
  SEX_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  VERIFICATION_LABELS,
} from '../../lib/resident-labels';
import type {
  ResidencyStatus,
  ResidentListResponse,
  VerificationStatus,
} from '../../types/api';

const PAGE_SIZE = 12;

export function ResidentListPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ResidencyStatus | ''>('');
  const [verification, setVerification] = useState<VerificationStatus | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ResidentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    residentsApi
      .list({
        q: query || undefined,
        status: status || undefined,
        verificationStatus: verification || undefined,
        page,
        pageSize: PAGE_SIZE,
        sort: 'name_asc',
      })
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Unable to load the resident directory.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, status, verification, page]);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  const canWrite = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_WRITE)
    : false;
  const canReviewDuplicates = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE)
    : false;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Resident registry
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Resident records
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Search the barangay directory, open a profile, and keep residency
            information current. Every full profile view is audited.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReviewDuplicates ? (
            <Link
              to="/residents/duplicate-reviews"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Icon name="shield" className="h-4 w-4" />
              Duplicate reviews
            </Link>
          ) : null}
          {canWrite ? (
            <Link
              to="/residents/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-800"
            >
              <Icon name="users" className="h-4 w-4" />
              Register resident
            </Link>
          ) : null}
        </div>
      </section>

      <form
        onSubmit={submitSearch}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_170px_170px_auto]"
      >
        <label className="sr-only" htmlFor="resident-search">
          Search residents
        </label>
        <input
          id="resident-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or resident number"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <select
          aria-label="Filter by residency status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ResidencyStatus | '');
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="MOVED_OUT">Moved out</option>
          <option value="DECEASED">Deceased</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select
          aria-label="Filter by verification status"
          value={verification}
          onChange={(event) => {
            setVerification(event.target.value as VerificationStatus | '');
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">All verification</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="VERIFIED">Verified</option>
        </select>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Icon name="users" className="h-4 w-4" />
          Search
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-500">
            <Spinner className="h-5 w-5" />
            Loading residents...
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Resident</th>
                    <th className="px-5 py-3 font-semibold">Number</th>
                    <th className="px-5 py-3 font-semibold">Birth date</th>
                    <th className="px-5 py-3 font-semibold">Sex</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Verification</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((resident) => (
                    <tr key={resident.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {resident.fullName}
                        </p>
                        <p className="text-xs text-slate-400">
                          Updated {new Date(resident.updatedAt).toLocaleDateString('en-PH')}
                        </p>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">
                        {resident.residentNumber}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {formatBirthDate(resident.birthDate)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {SEX_LABELS[resident.sex]}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${STATUS_TONES[resident.residencyStatus]}`}
                        >
                          {STATUS_LABELS[resident.residencyStatus]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {VERIFICATION_LABELS[resident.verificationStatus]}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          to={`/residents/${resident.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-800 hover:text-brand-900"
                        >
                          Open profile
                          <Icon name="arrow-right" className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
              <p>
                {data.pagination.total} resident
                {data.pagination.total === 1 ? '' : 's'} found
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {data.pagination.page} of{' '}
                  {Math.max(data.pagination.totalPages, 1)}
                </span>
                <button
                  type="button"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No resident records found
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Adjust the search or filters, or register a new resident.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
