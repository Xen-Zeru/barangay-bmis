import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, residentsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../../auth/permissions';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatDateTime } from '../../lib/format';
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONES,
  STATUS_LABELS,
} from '../../lib/resident-labels';
import type { CorrectionSummary } from '../../types/api';

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

export function CorrectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [correction, setCorrection] = useState<CorrectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!id) {
      return;
    }
    setLoading(true);
    try {
      setCorrection(await residentsApi.correction(id));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to load this correction request.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  const isRequester = Boolean(
    user && correction?.requestedBy?.id === user.id,
  );
  const canApprove = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE)
    : false;
  const canReadResident = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_READ)
    : false;

  async function approve(): Promise<void> {
    if (!correction || busy) {
      return;
    }
    if (!note.trim()) {
      setError('A decision note is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resident = await residentsApi.approveCorrection(correction.id, {
        note,
        version: correction.version,
      });
      if (canReadResident) {
        navigate(`/residents/${resident.id}`);
        return;
      }
      setNotice(
        `${resident.residentNumber} was corrected to ${STATUS_LABELS[resident.residencyStatus]}.`,
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to approve.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reject(): Promise<void> {
    if (!correction || busy) {
      return;
    }
    if (!note.trim()) {
      setError('A decision note is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setCorrection(
        await residentsApi.rejectCorrection(correction.id, {
          note,
          version: correction.version,
        }),
      );
      setNotice('Correction request rejected.');
      setNote('');
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to reject.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (!correction || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setCorrection(
        await residentsApi.cancelCorrection(correction.id, {
          note: note.trim() || undefined,
        }),
      );
      setNotice('Correction request cancelled.');
      setNote('');
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to cancel.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-20 text-sm text-slate-500">
        <Spinner className="h-5 w-5" />
        Loading correction...
      </div>
    );
  }

  if (!correction) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error ?? 'Correction request not found.'}
      </div>
    );
  }

  const pending = correction.status === 'PENDING';

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Correction request
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {correction.resident.fullName}
            </h2>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${REVIEW_STATUS_TONES[correction.status]}`}
            >
              {REVIEW_STATUS_LABELS[correction.status]}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {correction.resident.residentNumber}
          </p>
        </div>
        <Link
          to="/residents/corrections"
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to corrections
        </Link>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Requested change
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {STATUS_LABELS[correction.fromStatus]} →{' '}
              {STATUS_LABELS[correction.toStatus]}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Evidence reference
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {correction.evidenceReference}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Requested by
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {correction.requestedBy?.fullName ?? 'Unknown'} ·{' '}
              {formatDateTime(correction.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Decided by
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {correction.decidedBy?.fullName ?? 'Awaiting decision'}
              {correction.decidedAt
                ? ` · ${formatDateTime(correction.decidedAt)}`
                : ''}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Reason
            </dt>
            <dd className="mt-1 text-sm text-slate-800">{correction.reason}</dd>
          </div>
          {correction.decisionNote ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Decision note
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {correction.decisionNote}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {pending ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Decision</h3>
          {isRequester ? (
            <div className="mt-3">
              <p className="text-sm text-slate-600">
                You requested this correction, so you cannot approve or reject
                it. You may cancel it if the request is no longer needed.
              </p>
              <button
                type="button"
                onClick={() => void cancel()}
                disabled={busy}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel request
              </button>
            </div>
          ) : canApprove ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void approve();
              }}
            >
              <label className="block text-sm font-medium text-slate-700">
                Decision note
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  className={INPUT_CLASS}
                  placeholder="Describe the evidence checked and the decision."
                  required
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  <Icon name="check" className="h-4 w-4" />
                  Approve correction
                </button>
                <button
                  type="button"
                  onClick={() => void reject()}
                  disabled={busy}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Reject request
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              This correction is awaiting Captain approval.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
