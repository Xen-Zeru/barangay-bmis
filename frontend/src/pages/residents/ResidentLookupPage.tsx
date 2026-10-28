import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, residentsApi } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { SEX_LABELS, STATUS_LABELS, STATUS_TONES } from '../../lib/resident-labels';
import type { ResidentLookup } from '../../types/api';

export function ResidentLookupPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ResidentLookup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      setError('Enter a name or resident number to search.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setResults(await residentsApi.lookup(query));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to search resident records.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Limited access
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          Resident lookup
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Search by name or resident number. This view returns limited identity
          fields and does not open full resident profiles.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-5 flex flex-wrap gap-3">
          <label className="sr-only" htmlFor="lookup-search">
            Search resident lookup
          </label>
          <input
            id="lookup-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or resident number"
            className="min-w-60 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Icon name="users" className="h-4 w-4" />
            )}
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {error ? (
          <p role="alert" className="mt-4 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {results ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {results.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-700">
                No matching resident
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Check the spelling or try the resident number.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Resident</th>
                    <th className="px-5 py-3 font-semibold">Number</th>
                    <th className="px-5 py-3 font-semibold">Birth year</th>
                    <th className="px-5 py-3 font-semibold">Sex</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((resident) => (
                    <tr key={resident.id}>
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {resident.fullName}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">
                        {resident.residentNumber}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {resident.birthYear}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
