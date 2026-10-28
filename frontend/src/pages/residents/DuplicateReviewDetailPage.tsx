import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, residentsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../../auth/permissions';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatBirthDate, formatDateTime } from '../../lib/format';
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONES,
  SEX_LABELS,
  STATUS_LABELS,
  SOURCE_LABELS,
} from '../../lib/resident-labels';
import type { DuplicateReviewDetail } from '../../types/api';

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

export function DuplicateReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [review, setReview] = useState<DuplicateReviewDetail | null>(null);
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
      setReview(await residentsApi.duplicateReview(id));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to load this duplicate review.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  const isRequester = Boolean(
    user && review?.requestedBy?.id === user.id,
  );
  const canApprove = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE)
    : false;
  const canReadResident = user
    ? hasPermission(user.role, PERMISSIONS.RESIDENTS_READ)
    : false;

  async function approve(): Promise<void> {
    if (!review || busy) {
      return;
    }
    if (!note.trim()) {
      setError('A decision note is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resident = await residentsApi.approveDuplicate(review.id, {
        note,
        version: review.version,
      });
      if (canReadResident) {
        navigate(`/residents/${resident.id}`);
        return;
      }
      setNotice(`Resident ${resident.residentNumber} was created.`);
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
    if (!review || busy) {
      return;
    }
    if (!note.trim()) {
      setError('A decision note is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await residentsApi.rejectDuplicate(review.id, {
        note,
        version: review.version,
      });
      setReview((current) =>
        current ? { ...current, ...updated, draft: null } : current,
      );
      setNotice('Duplicate review rejected. No resident was created.');
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
    if (!review || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await residentsApi.cancelDuplicate(review.id, {
        note: note.trim() || undefined,
      });
      setReview((current) =>
        current ? { ...current, ...updated, draft: null } : current,
      );
      setNotice('Duplicate review cancelled.');
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
        Loading review...
      </div>
    );
  }

  if (!review) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error ?? 'Duplicate review not found.'}
      </div>
    );
  }

  const pending = review.status === 'PENDING';

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Duplicate review
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Possible duplicate
            </h2>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${REVIEW_STATUS_TONES[review.status]}`}
            >
              {REVIEW_STATUS_LABELS[review.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Requested by {review.requestedBy?.fullName ?? 'Unknown'} on{' '}
            {formatDateTime(review.createdAt)}
          </p>
        </div>
        <Link
          to="/residents/duplicate-reviews"
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to queue
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
        <h3 className="text-sm font-semibold text-slate-900">Request reason</h3>
        <p className="mt-2 text-sm text-slate-600">{review.reason}</p>
        {review.decisionNote ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Decision note
            </p>
            <p className="mt-1 text-sm text-slate-700">{review.decisionNote}</p>
            <p className="mt-1 text-xs text-slate-500">
              Decided by {review.decidedBy?.fullName ?? 'Unknown'} on{' '}
              {formatDateTime(review.decidedAt)}
            </p>
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Proposed resident
          </h3>
          {review.draft ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Name
                </dt>
                <dd className="mt-1 text-sm text-slate-800">
                  {[
                    review.draft.firstName,
                    review.draft.middleName,
                    review.draft.lastName,
                    review.draft.suffix,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Birth date
                </dt>
                <dd className="mt-1 text-sm text-slate-800">
                  {formatBirthDate(review.draft.birthDate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Sex
                </dt>
                <dd className="mt-1 text-sm text-slate-800">
                  {SEX_LABELS[review.draft.sex]}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Contact
                </dt>
                <dd className="mt-1 text-sm text-slate-800">
                  {review.draft.contactNumber ?? 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </dt>
                <dd className="mt-1 text-sm text-slate-800">
                  {STATUS_LABELS[review.draft.residencyStatus]}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Source
                </dt>
                <dd className="mt-1 text-sm text-slate-800">
                  {SOURCE_LABELS[review.draft.recordSource]}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              The proposed data was cleared after the decision.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Matching residents
          </h3>
          {review.candidates.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No current matching residents.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {review.candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {candidate.fullName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {candidate.residentNumber} ·{' '}
                        {formatBirthDate(candidate.birthDate)} ·{' '}
                        {STATUS_LABELS[candidate.residencyStatus]}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                      {candidate.matchType === 'EXACT'
                        ? 'Exact match'
                        : 'Broad match'}
                    </span>
                  </div>
                  {canReadResident ? (
                    <Link
                      to={`/residents/${candidate.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-800"
                    >
                      Open profile
                      <Icon name="arrow-right" className="h-3 w-3" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {pending ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Decision
          </h3>
          {isRequester ? (
            <div className="mt-3">
              <p className="text-sm text-slate-600">
                You requested this review, so you cannot approve or reject it.
                You may cancel it if the concern was resolved.
              </p>
              <button
                type="button"
                onClick={() => void cancel()}
                disabled={busy}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel review
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
                  placeholder="Document the inquiry that confirms this is a new resident."
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
                  Approve and create resident
                </button>
                <button
                  type="button"
                  onClick={() => void reject()}
                  disabled={busy}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              This review is awaiting a Secretary decision.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
