import { useState } from 'react';
import { ApiError, residentsApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../auth/permissions';
import { Spinner } from './Spinner';
import type { ResidentLookup } from '../types/api';

interface ResidentPickerProps {
  label: string;
  selected: ResidentLookup | null;
  onSelect: (resident: ResidentLookup | null) => void;
  placeholder?: string;
  limit?: number;
  required?: boolean;
}

export function ResidentPicker({
  label,
  selected,
  onSelect,
  placeholder = 'Search by name or resident number',
  limit = 8,
  required = false,
}: ResidentPickerProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResidentLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(): Promise<void> {
    const text = query.trim();
    if (text.length < 2) {
      setError('Enter at least two characters to search.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      if (
        user &&
        hasPermission(user.role, PERMISSIONS.RESIDENTS_READ)
      ) {
        const response = await residentsApi.list({
          q: text,
          pageSize: limit,
          sort: 'name_asc',
        });
        setResults(
          response.items
            .filter((resident) => resident.residencyStatus === 'ACTIVE')
            .map((resident) => ({
              id: resident.id,
              residentNumber: resident.residentNumber,
              fullName: resident.fullName,
              birthYear: Number(resident.birthDate.slice(0, 4)),
              sex: resident.sex,
              residencyStatus: resident.residencyStatus,
            })),
        );
      } else {
        const lookup = await residentsApi.lookup(text, limit);
        setResults(
          lookup.filter(
            (resident) => resident.residencyStatus === 'ACTIVE',
          ),
        );
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to search residents.',
      );
    } finally {
      setSearching(false);
    }
  }

  if (selected) {
    return (
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-emerald-950">
              {selected.fullName}
            </p>
            <p className="font-mono text-[11px] text-emerald-700">
              {selected.residentNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setResults([]);
              setQuery('');
            }}
            className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs font-semibold text-slate-500">
        {label}
        {required ? null : (
          <span className="ml-1 font-normal text-slate-400">(optional)</span>
        )}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {searching ? <Spinner className="h-4 w-4" /> : null}
          Search
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 bg-white">
          {results.map((resident) => (
            <li key={resident.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(resident);
                  setResults([]);
                  setError(null);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {resident.fullName}
                  </span>
                  <span className="block font-mono text-[11px] text-slate-500">
                    {resident.residentNumber}
                  </span>
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {resident.residencyStatus}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
