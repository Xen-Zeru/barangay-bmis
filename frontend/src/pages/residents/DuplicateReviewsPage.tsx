import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, residentsApi } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatDateTime } from '../../lib/format';
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONES,
} from '../../lib/resident-labels';
import type {
  DuplicateReviewListResponse,
  DuplicateReviewStatus,
} from '../../types/api';

export function DuplicateReviewsPage() {
  const [status, setStatus] = useState<DuplicateReviewStatus | ''>('PENDING');
  const [data, setData] = useState<DuplicateReviewListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    residentsApi
      .duplicateReviews({
        status: status || undefined,
        pageSize: 50,
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
              : 'Unable to load duplicate reviews.',
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
  }, [status]);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Duplicate control
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Duplicate review queue
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Review possible duplicates before a resident record is created.
            Requests you submitted cannot be approved by you.
          </p>
        </div>
        <Link
          to="/residents"
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to residents
        </Link>
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-slate-700" htmlFor="review-status">
          Status
        </label>
        <select
          id="review-status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as DuplicateReviewStatus | '')
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-500">
            <Spinner className="h-5 w-5" />
            Loading reviews...
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Requested</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Candidates</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Decision</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((review) => (
                  <tr key={review.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">
                        {review.requestedBy?.fullName ?? 'Unknown requester'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(review.createdAt)}
                      </p>
                    </td>
                    <td className="max-w-xs px-5 py-3 text-slate-600">
                      <p className="line-clamp-2">{review.reason}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {review.candidateCount}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${REVIEW_STATUS_TONES[review.status]}`}
                      >
                        {REVIEW_STATUS_LABELS[review.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {review.decidedBy?.fullName ?? 'Awaiting decision'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/residents/duplicate-reviews/${review.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-800 hover:text-brand-900"
                      >
                        Review
                        <Icon name="arrow-right" className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No duplicate reviews found
            </p>
            <p className="mt-1 text-sm text-slate-500">
              New possible duplicates will appear here for Secretary review.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
