import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ApiError,
  householdsApi,
  puroksApi,
} from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../../auth/permissions';
import { Icon } from '../../components/Icon';
import { ResidentPicker } from '../../components/ResidentPicker';
import { Spinner } from '../../components/Spinner';
import {
  HOUSEHOLD_STATUS_LABELS,
  PUROK_STATUS_LABELS,
} from '../../lib/household-labels';
import { VERIFICATION_LABELS } from '../../lib/resident-labels';
import type {
  HouseholdListResponse,
  HouseholdStatus,
  Purok,
  ResidentLookup,
  VerificationStatus,
} from '../../types/api';

const PAGE_SIZE = 12;
const INPUT_CLASS =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

export function HouseholdsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<HouseholdListResponse | null>(null);
  const [puroks, setPuroks] = useState<Purok[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [purokId, setPurokId] = useState('');
  const [status, setStatus] = useState<HouseholdStatus | ''>('');
  const [verification, setVerification] = useState<VerificationStatus | ''>('');
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [newPurokId, setNewPurokId] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [head, setHead] = useState<ResidentLookup | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const response = await householdsApi.list({
        q: query || undefined,
        purokId: purokId || undefined,
        status: status || undefined,
        verificationStatus: verification || undefined,
        page,
        pageSize: PAGE_SIZE,
        sort: 'householdNumber_asc',
      });
      setData(response);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to load households.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [query, purokId, status, verification, page]);

  useEffect(() => {
    let cancelled = false;
    puroksApi
      .list({ pageSize: 100, sort: 'name_asc' })
      .then((response) => {
        if (!cancelled) {
          setPuroks(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPuroks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canWrite = user
    ? hasPermission(user.role, PERMISSIONS.HOUSEHOLDS_WRITE)
    : false;
  const activePuroks = puroks.filter((purok) => purok.status === 'ACTIVE');

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function createHousehold(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await householdsApi.create({
        purokId: newPurokId,
        addressLine,
        landmark: landmark.trim() || null,
        ...(head ? { headResidentId: head.id } : {}),
      });
      setNotice(`Household ${created.householdNumber} created.`);
      setAddressLine('');
      setLandmark('');
      setHead(null);
      setNewPurokId('');
      setShowCreate(false);
      navigate(`/households/${created.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to create the household.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Household registry
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Households
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Group residents into numbered households, assign a Purok, and keep
            membership changes auditable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.role === 'BARANGAY_SECRETARY' ? (
            <Link
              to="/puroks"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Icon name="home" className="h-4 w-4" />
              Manage Puroks
            </Link>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                setShowCreate((current) => !current);
                setError(null);
                setNotice(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-800"
            >
              <Icon name="home" className="h-4 w-4" />
              New household
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {showCreate && canWrite ? (
        <form
          onSubmit={(event) => void createHousehold(event)}
          className="space-y-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-5 shadow-sm"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Register a household
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              The household number is allocated automatically. A head may be
              assigned now or later.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Purok
              <select
                value={newPurokId}
                onChange={(event) => setNewPurokId(event.target.value)}
                className={`mt-1 w-full ${INPUT_CLASS}`}
                required
              >
                <option value="">Select an active Purok</option>
                {activePuroks.map((purok) => (
                  <option key={purok.id} value={purok.id}>
                    {purok.name} ({purok.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Address
              <input
                value={addressLine}
                onChange={(event) => setAddressLine(event.target.value)}
                placeholder="House number, street, Barangay 2"
                className={`mt-1 w-full ${INPUT_CLASS}`}
                required
                minLength={3}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Landmark
              <input
                value={landmark}
                onChange={(event) => setLandmark(event.target.value)}
                placeholder="Optional nearby landmark"
                className={`mt-1 w-full ${INPUT_CLASS}`}
              />
            </label>
            <div className="sm:pt-6">
              <ResidentPicker
                label="Household head"
                selected={head}
                onSelect={setHead}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || activePuroks.length === 0}
              className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              Create household
            </button>
          </div>
        </form>
      ) : null}

      <form
        onSubmit={submitSearch}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_170px_150px_170px_auto]"
      >
        <input
          type="search"
          aria-label="Search households"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search household number, head, or address"
          className={INPUT_CLASS}
        />
        <select
          aria-label="Filter by Purok"
          value={purokId}
          onChange={(event) => {
            setPurokId(event.target.value);
            setPage(1);
          }}
          className={INPUT_CLASS}
        >
          <option value="">All Puroks</option>
          {puroks.map((purok) => (
            <option key={purok.id} value={purok.id}>
              {purok.name}
              {purok.status === 'INACTIVE'
                ? ` (${PUROK_STATUS_LABELS[purok.status]})`
                : ''}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by household status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as HouseholdStatus | '');
            setPage(1);
          }}
          className={INPUT_CLASS}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select
          aria-label="Filter by verification status"
          value={verification}
          onChange={(event) => {
            setVerification(event.target.value as VerificationStatus | '');
            setPage(1);
          }}
          className={INPUT_CLASS}
        >
          <option value="">All verification</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="VERIFIED">Verified</option>
        </select>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Icon name="home" className="h-4 w-4" />
          Search
        </button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-500">
            <Spinner className="h-5 w-5" />
            Loading households...
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Household</th>
                    <th className="px-5 py-3 font-semibold">Head</th>
                    <th className="px-5 py-3 font-semibold">Purok</th>
                    <th className="px-5 py-3 font-semibold">Members</th>
                    <th className="px-5 py-3 font-semibold">Verification</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((household) => (
                    <tr key={household.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs font-semibold text-slate-800">
                          {household.householdNumber}
                        </p>
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                          {household.addressLine}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {household.head?.fullName ?? 'No head assigned'}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {household.head?.residentNumber ?? '—'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700">{household.purok.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {household.purok.code}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {household.activeMemberCount}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {VERIFICATION_LABELS[household.verificationStatus]}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                            household.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                              : 'bg-slate-100 text-slate-600 ring-slate-500/20'
                          }`}
                        >
                          {HOUSEHOLD_STATUS_LABELS[household.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          to={`/households/${household.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-800 hover:text-brand-900"
                        >
                          Open
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
                {data.pagination.total} household
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
              No households found
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Adjust the filters or register a new household.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
