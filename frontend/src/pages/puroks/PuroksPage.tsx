import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, puroksApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../../auth/permissions';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { PUROK_STATUS_LABELS } from '../../lib/household-labels';
import type { Purok } from '../../types/api';

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

function statusTone(status: Purok['status']): string {
  return status === 'ACTIVE'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    : 'bg-slate-100 text-slate-600 ring-slate-500/20';
}

export function PuroksPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Purok[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createCode, setCreateCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [editing, setEditing] = useState<Purok | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [statusTarget, setStatusTarget] = useState<Purok | null>(null);
  const [statusReason, setStatusReason] = useState('');

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const response = await puroksApi.list({ pageSize: 100, sort: 'name_asc' });
      setItems(response.items);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to load Puroks.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canWrite = user
    ? hasPermission(user.role, PERMISSIONS.PUROKS_WRITE)
    : false;

  async function createPurok(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await puroksApi.create({ code: createCode, name: createName });
      setCreateCode('');
      setCreateName('');
      setNotice('Purok created.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to create Purok.',
      );
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(purok: Purok): void {
    setEditing(purok);
    setEditCode(purok.code);
    setEditName(purok.name);
    setStatusTarget(null);
    setError(null);
    setNotice(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editing || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await puroksApi.update(editing.id, {
        code: editCode,
        name: editName,
        version: editing.version,
      });
      setNotice('Purok updated.');
      setEditing(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to update Purok.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!statusTarget || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await puroksApi.changeStatus(statusTarget.id, {
        status: statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        reason: statusReason,
        version: statusTarget.version,
      });
      setNotice(
        `Purok ${statusTarget.status === 'ACTIVE' ? 'deactivated' : 'reactivated'}.`,
      );
      setStatusTarget(null);
      setStatusReason('');
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to change the Purok status.',
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
            Barangay geography
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Puroks
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Maintain the Puroks used for household assignment. Deactivation is
            blocked while active households remain assigned.
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Active Puroks
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {items.filter((item) => item.status === 'ACTIVE').length}
          </p>
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

      {canWrite ? (
        <form
          onSubmit={(event) => void createPurok(event)}
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[150px_1fr_auto]"
        >
          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="purok-code">
              Code
            </label>
            <input
              id="purok-code"
              value={createCode}
              onChange={(event) => setCreateCode(event.target.value)}
              placeholder="P-05"
              className={`mt-1 ${INPUT_CLASS}`}
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="purok-name">
              Name
            </label>
            <input
              id="purok-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Purok 5"
              className={`mt-1 ${INPUT_CLASS}`}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="self-end rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            Add Purok
          </button>
        </form>
      ) : null}

      {editing ? (
        <form
          onSubmit={(event) => void saveEdit(event)}
          className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm sm:grid-cols-[150px_1fr_auto_auto]"
        >
          <input
            aria-label="Edit Purok code"
            value={editCode}
            onChange={(event) => setEditCode(event.target.value)}
            className={INPUT_CLASS}
            required
          />
          <input
            aria-label="Edit Purok name"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            className={INPUT_CLASS}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
          >
            Cancel
          </button>
        </form>
      ) : null}

      {statusTarget ? (
        <form
          onSubmit={(event) => void saveStatus(event)}
          className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]"
        >
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {statusTarget.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}{' '}
              {statusTarget.name}
            </p>
            <input
              aria-label="Purok status reason"
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              placeholder="Reason for the status change"
              className={`mt-2 ${INPUT_CLASS}`}
              required
              minLength={5}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="self-end rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusTarget(null);
              setStatusReason('');
            }}
            className="self-end rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Cancel
          </button>
        </form>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-500">
            <Spinner className="h-5 w-5" />
            Loading Puroks...
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            No Puroks have been configured.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Purok</th>
                  <th className="px-5 py-3 font-semibold">Code</th>
                  <th className="px-5 py-3 font-semibold">Households</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  {canWrite ? <th className="px-5 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((purok) => (
                  <tr key={purok.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{purok.name}</p>
                      <p className="text-xs text-slate-400">
                        {purok.activeHouseholdCount} active of{' '}
                        {purok.householdCount} total
                      </p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-600">
                      {purok.code}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {purok.activeHouseholdCount}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusTone(purok.status)}`}
                      >
                        {PUROK_STATUS_LABELS[purok.status]}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(purok)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusTarget(purok);
                              setStatusReason('');
                              setEditing(null);
                              setError(null);
                              setNotice(null);
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {purok.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Icon name="home" className="h-4 w-4" />
        Purok names remain configurable until official barangay labels are confirmed.
      </p>
    </div>
  );
}
