import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, residentsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../../auth/permissions';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatBirthDate, formatDateTime } from '../../lib/format';
import { HOUSEHOLD_STATUS_LABELS } from '../../lib/household-labels';
import {
  SEX_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  VERIFICATION_LABELS,
} from '../../lib/resident-labels';
import type {
  ResidencyStatus,
  ResidentChange,
  ResidentDetail,
} from '../../types/api';

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  suffix: 'Suffix',
  birthDate: 'Birth date',
  sex: 'Sex',
  contactNumber: 'Contact number',
  residencyStatus: 'Residency status',
  recordSource: 'Record source',
  sourceReference: 'Source reference',
  sourceReferenceUnavailableReason: 'Unavailable-reference reason',
  verificationStatus: 'Verification status',
};

function readableChange(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export function ResidentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [resident, setResident] = useState<ResidentDetail | null>(null);
  const [history, setHistory] = useState<ResidentChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [status, setStatus] = useState<ResidencyStatus>('INACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [correctionStatus, setCorrectionStatus] =
    useState<ResidencyStatus>('ACTIVE');
  const [correctionReason, setCorrectionReason] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');

  async function load(): Promise<void> {
    if (!id) {
      return;
    }
    setLoading(true);
    try {
      const [profile, changeHistory] = await Promise.all([
        residentsApi.get(id),
        residentsApi.history(id, { pageSize: 50 }),
      ]);
      setResident(profile);
      setHistory(changeHistory.items);
      setStatus(
        (['ACTIVE', 'MOVED_OUT', 'INACTIVE', 'DECEASED'] as ResidencyStatus[]).find(
          (option) => option !== profile.residencyStatus,
        ) ?? 'ACTIVE',
      );
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to load this resident record.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function verify(): Promise<void> {
    if (!resident || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      setResident(await residentsApi.verify(resident.id, { version: resident.version }));
      setNotice('Resident record verified.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to verify.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!resident || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setResident(
        await residentsApi.changeStatus(resident.id, {
          status,
          reason: statusReason,
          version: resident.version,
        }),
      );
      setStatusReason('');
      setNotice('Residency status updated.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to change the residency status.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestCorrection(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!resident || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await residentsApi.requestCorrection(resident.id, {
        toStatus: correctionStatus,
        reason: correctionReason,
        evidenceReference,
      });
      setCorrectionReason('');
      setEvidenceReference('');
      setNotice('Correction request submitted for Captain approval.');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to submit the correction request.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-20 text-sm text-slate-500">
        <Spinner className="h-5 w-5" />
        Loading resident...
      </div>
    );
  }

  if (!resident) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error ?? 'Resident record not found.'}
      </div>
    );
  }

  const canWrite = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_WRITE)
    : false;
  const canVerify = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_VERIFY)
    : false;
  const canRequestCorrection = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST)
    : false;
  const statusOptions = (
    ['ACTIVE', 'MOVED_OUT', 'INACTIVE', 'DECEASED'] as ResidencyStatus[]
  ).filter((option) => option !== resident.residencyStatus);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Resident profile
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                {resident.fullName}
              </h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${STATUS_TONES[resident.residencyStatus]}`}
              >
                {STATUS_LABELS[resident.residencyStatus]}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                {VERIFICATION_LABELS[resident.verificationStatus]}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {resident.residentNumber}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/residents"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to directory
            </Link>
            {canWrite ? (
              <Link
                to={`/residents/${resident.id}/edit`}
                className="rounded-lg bg-brand-900 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Edit record
              </Link>
            ) : null}
            {canVerify && resident.verificationStatus === 'UNVERIFIED' ? (
              <button
                type="button"
                onClick={() => void verify()}
                disabled={busy}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                Verify record
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Birth date
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {formatBirthDate(resident.birthDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sex
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {SEX_LABELS[resident.sex]}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Contact number
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {resident.contactNumber ?? 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Record source
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {SOURCE_LABELS[resident.recordSource]}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Source reference
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {resident.sourceReference ??
                resident.sourceReferenceUnavailableReason ??
                'Not recorded'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Verified
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {resident.verifiedAt
                ? formatDateTime(resident.verifiedAt)
                : 'Not yet verified'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Status changed
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {formatDateTime(resident.statusChangedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Last updated
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {formatDateTime(resident.updatedAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Icon name="home" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Household
              </h3>
              <p className="text-xs text-slate-500">
                Current active membership and Purok assignment.
              </p>
            </div>
          </div>
          {resident.household ? (
            <Link
              to={`/households/${resident.household.id}`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View household
            </Link>
          ) : null}
        </div>
        {resident.household ? (
          <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Household number
              </dt>
              <dd className="mt-1 font-mono text-sm text-slate-800">
                {resident.household.householdNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Purok
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {resident.household.purok.name} ({resident.household.purok.code})
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Address
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {resident.household.addressLine}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Membership
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {resident.household.isHead
                  ? 'Household head'
                  : resident.household.relationship ?? 'Member'}
                <span className="ml-2 text-xs text-slate-500">
                  {HOUSEHOLD_STATUS_LABELS[resident.household.status]} ·{' '}
                  {VERIFICATION_LABELS[resident.household.verificationStatus]}
                </span>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
            This resident is not an active member of a household.
          </p>
        )}
      </section>

      {canWrite && resident.residencyStatus !== 'DECEASED' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Change residency status
          </h3>
          <form onSubmit={(event) => void changeStatus(event)} className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <label className="text-sm font-medium text-slate-700">
              New status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ResidencyStatus)}
                className={INPUT_CLASS}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Reason
              <input
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
                className={INPUT_CLASS}
                placeholder="Required for the audit trail"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Update status
            </button>
          </form>
        </section>
      ) : null}

      {resident.residencyStatus === 'DECEASED' && canRequestCorrection ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Request a deceased-status correction
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Normal status changes are blocked for a deceased record. Document the
            evidence and route this request to the Captain.
          </p>
          <form onSubmit={(event) => void requestCorrection(event)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Corrected status
              <select
                value={correctionStatus}
                onChange={(event) =>
                  setCorrectionStatus(event.target.value as ResidencyStatus)
                }
                className={INPUT_CLASS}
              >
                <option value="ACTIVE">Active</option>
                <option value="MOVED_OUT">Moved out</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Evidence reference
              <input
                value={evidenceReference}
                onChange={(event) => setEvidenceReference(event.target.value)}
                className={INPUT_CLASS}
                placeholder="Record book, log entry, or document reference"
                required
              />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Reason
              <textarea
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                rows={2}
                className={INPUT_CLASS}
                required
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              >
                Submit correction request
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon name="refresh" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Change history
            </h3>
            <p className="text-xs text-slate-500">
              Newest first. Sensitive profile reads are also audited.
            </p>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500">No history recorded yet.</p>
        ) : (
          <ol className="mt-5 space-y-4">
            {history.map((item) => (
              <li key={item.id} className="border-l-2 border-slate-200 pl-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {item.action.replaceAll('_', ' ')}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(item.createdAt)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.actor?.fullName ?? 'System'}
                  {item.reason ? ` · ${item.reason}` : ''}
                </p>
                {item.changes.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {item.changes.map((change) => (
                      <li key={change.field} className="text-xs text-slate-600">
                        <span className="font-medium text-slate-700">
                          {FIELD_LABELS[change.field] ?? change.field}:
                        </span>{' '}
                        {readableChange(change.before)} →{' '}
                        {readableChange(change.after)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
