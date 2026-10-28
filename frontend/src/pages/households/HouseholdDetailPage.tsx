import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { formatBirthDate, formatDateTime } from '../../lib/format';
import {
  HOUSEHOLD_STATUS_LABELS,
  MEMBERSHIP_END_REASON_LABELS,
} from '../../lib/household-labels';
import { VERIFICATION_LABELS } from '../../lib/resident-labels';
import type {
  HouseholdChange,
  HouseholdDetail,
  HouseholdMember,
  HouseholdSummary,
  MembershipEndReason,
  Purok,
  ResidentLookup,
} from '../../types/api';

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

function changeText(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export function HouseholdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [household, setHousehold] = useState<HouseholdDetail | null>(null);
  const [history, setHistory] = useState<HouseholdChange[]>([]);
  const [puroks, setPuroks] = useState<Purok[]>([]);
  const [targets, setTargets] = useState<HouseholdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [editPurokId, setEditPurokId] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [headResidentId, setHeadResidentId] = useState('');
  const [headReason, setHeadReason] = useState('');
  const [member, setMember] = useState<ResidentLookup | null>(null);
  const [relationship, setRelationship] = useState('');
  const [ending, setEnding] = useState<HouseholdMember | null>(null);
  const [endReason, setEndReason] =
    useState<MembershipEndReason>('LEFT_HOUSEHOLD');
  const [endNote, setEndNote] = useState('');
  const [transferring, setTransferring] = useState<HouseholdMember | null>(null);
  const [targetHouseholdId, setTargetHouseholdId] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const canWrite = user
    ? hasPermission(user.role, PERMISSIONS.HOUSEHOLDS_WRITE)
    : false;
  const canVerify = user
    ? hasPermission(user.role, PERMISSIONS.HOUSEHOLDS_VERIFY)
    : false;
  const canChangeHead = user
    ? hasPermission(user.role, PERMISSIONS.HOUSEHOLDS_HEAD_CHANGE)
    : false;
  const canChangeStatus = user
    ? hasPermission(user.role, PERMISSIONS.HOUSEHOLDS_STATUS)
    : false;
  const canHistory = user
    ? hasPermission(user.role, PERMISSIONS.HOUSEHOLDS_HISTORY_READ)
    : false;

  async function load(silent = false): Promise<void> {
    if (!id) {
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    try {
      const [profile, purokResponse, householdResponse, changeHistory] =
        await Promise.all([
          householdsApi.get(id),
          puroksApi.list({ pageSize: 100, sort: 'name_asc' }),
          canWrite
            ? householdsApi.list({ pageSize: 100, status: 'ACTIVE' })
            : Promise.resolve({ items: [] as HouseholdSummary[] }),
          canHistory
            ? householdsApi.history(id, { pageSize: 50 })
            : Promise.resolve({ items: [] as HouseholdChange[] }),
        ]);
      setHousehold(profile);
      setPuroks(purokResponse.items);
      setTargets(
        householdResponse.items.filter(
          (target) => target.id !== profile.id && target.purok.status === 'ACTIVE',
        ),
      );
      setHistory(changeHistory.items);
      setEditPurokId(profile.purok.id);
      setEditAddress(profile.addressLine);
      setEditLandmark(profile.landmark ?? '');
      setHeadResidentId(profile.head?.id ?? '');
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to load this household.',
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load();
  }, [id, canWrite, canHistory]);

  function applyResult(result: HouseholdDetail, message: string): void {
    setHousehold(result);
    setNotice(message);
    setError(null);
    setShowEdit(false);
    setShowStatus(false);
    setEnding(null);
    setTransferring(null);
    setMember(null);
    setRelationship('');
    setEndNote('');
    setTransferReason('');
    setHeadReason('');
    void load(true);
  }

  function reportError(caught: unknown, fallback: string): void {
    setError(caught instanceof ApiError ? caught.message : fallback);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!household || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      applyResult(
        await householdsApi.update(household.id, {
          purokId: editPurokId,
          addressLine: editAddress,
          landmark: editLandmark.trim() || null,
          version: household.version,
        }),
        'Household details updated and verification reset.',
      );
    } catch (caught) {
      reportError(caught, 'Unable to update the household.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(): Promise<void> {
    if (!household || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      applyResult(
        await householdsApi.verify(household.id, {
          version: household.version,
        }),
        'Household verified.',
      );
    } catch (caught) {
      reportError(caught, 'Unable to verify the household.');
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!household || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      applyResult(
        await householdsApi.changeStatus(household.id, {
          status: household.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
          reason: statusReason,
          version: household.version,
        }),
        'Household status updated.',
      );
      setStatusReason('');
    } catch (caught) {
      reportError(caught, 'Unable to change the household status.');
    } finally {
      setBusy(false);
    }
  }

  async function saveHead(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!household || busy || !headResidentId) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      applyResult(
        await householdsApi.changeHead(household.id, {
          residentId: headResidentId,
          reason: headReason,
          version: household.version,
        }),
        'Household head updated and verification reset.',
      );
    } catch (caught) {
      reportError(caught, 'Unable to change the household head.');
    } finally {
      setBusy(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!household || busy || !member) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      applyResult(
        await householdsApi.addMember(household.id, {
          residentId: member.id,
          relationship: relationship.trim() || null,
        }),
        'Resident added to the household.',
      );
    } catch (caught) {
      reportError(caught, 'Unable to add the resident.');
    } finally {
      setBusy(false);
    }
  }

  async function endMembership(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!household || !ending || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      applyResult(
        await householdsApi.endMember(household.id, ending.id, {
          reason: endReason,
          note: endNote.trim() || null,
          version: ending.version,
        }),
        'Household membership ended.',
      );
    } catch (caught) {
      reportError(caught, 'Unable to end the membership.');
    } finally {
      setBusy(false);
    }
  }

  async function transferMembership(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!household || !transferring || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      applyResult(
        await householdsApi.transferMember(household.id, transferring.id, {
          targetHouseholdId,
          relationship: transferring.relationship,
          reason: transferReason,
          version: transferring.version,
        }),
        'Resident transferred to the target household.',
      );
    } catch (caught) {
      reportError(caught, 'Unable to transfer the member.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-20 text-sm text-slate-500">
        <Spinner className="h-5 w-5" />
        Loading household...
      </div>
    );
  }

  if (!household) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error ?? 'Household record not found.'}
      </div>
    );
  }

  const activeMembers = household.members.filter(
    (current) => current.residencyStatus === 'ACTIVE',
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Household profile
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-semibold tracking-tight text-slate-900">
                {household.householdNumber}
              </h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                  household.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                    : 'bg-slate-100 text-slate-600 ring-slate-500/20'
                }`}
              >
                {HOUSEHOLD_STATUS_LABELS[household.status]}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                {VERIFICATION_LABELS[household.verificationStatus]}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {household.purok.name} · {household.addressLine}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/households"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to households
            </Link>
            {canWrite ? (
              <button
                type="button"
                onClick={() => setShowEdit((current) => !current)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Edit details
              </button>
            ) : null}
            {canVerify &&
            household.status === 'ACTIVE' &&
            household.verificationStatus === 'UNVERIFIED' ? (
              <button
                type="button"
                onClick={() => void verify()}
                disabled={busy}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                Verify household
              </button>
            ) : null}
            {canChangeStatus ? (
              <button
                type="button"
                onClick={() => setShowStatus((current) => !current)}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                {household.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
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

        <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Head
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {household.head?.fullName ?? 'No head assigned'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Active members
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {household.activeMemberCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Landmark
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {household.landmark ?? 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Last updated
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {formatDateTime(household.updatedAt)}
            </dd>
          </div>
        </dl>
      </section>

      {showEdit && canWrite ? (
        <form
          onSubmit={(event) => void saveEdit(event)}
          className="grid gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-slate-700">
            Purok
            <select
              value={editPurokId}
              onChange={(event) => setEditPurokId(event.target.value)}
              className={INPUT_CLASS}
              required
            >
              {puroks
                .filter(
                  (purok) =>
                    purok.status === 'ACTIVE' || purok.id === editPurokId,
                )
                .map((purok) => (
                  <option key={purok.id} value={purok.id}>
                    {purok.name} ({purok.code})
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Address
            <input
              value={editAddress}
              onChange={(event) => setEditAddress(event.target.value)}
              className={INPUT_CLASS}
              required
              minLength={3}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Landmark
            <input
              value={editLandmark}
              onChange={(event) => setEditLandmark(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
            >
              Save details
            </button>
          </div>
        </form>
      ) : null}

      {showStatus && canChangeStatus ? (
        <form
          onSubmit={(event) => void saveStatus(event)}
          className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:grid-cols-[1fr_auto_auto]"
        >
          <label className="text-sm font-medium text-amber-900">
            Reason for {household.status === 'ACTIVE' ? 'deactivation' : 'reactivation'}
            <input
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              className={INPUT_CLASS}
              required
              minLength={5}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="self-end rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setShowStatus(false)}
            className="self-end rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Cancel
          </button>
        </form>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Active members
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Membership changes reset household verification.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {household.activeMemberCount} active
          </span>
        </div>

        {household.members.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No active members. Add a resident to this household.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-semibold">Resident</th>
                  <th className="px-3 py-3 font-semibold">Relationship</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Joined</th>
                  {canWrite ? <th className="px-3 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {household.members.map((current) => (
                  <tr key={current.id}>
                    <td className="px-3 py-4">
                      <p className="font-medium text-slate-900">
                        {current.fullName}
                        {household.head?.id === current.residentId ? (
                          <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                            Head
                          </span>
                        ) : null}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {current.residentNumber} ·{' '}
                        {current.birthDate
                          ? formatBirthDate(current.birthDate)
                          : `Born ${current.birthYear}`}
                      </p>
                      {current.contactNumber ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {current.contactNumber}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 text-slate-600">
                      {current.relationship ?? 'Not recorded'}
                    </td>
                    <td className="px-3 py-4 text-slate-600">
                      {current.residencyStatus}
                    </td>
                    <td className="px-3 py-4 text-slate-600">
                      {formatDateTime(current.joinedAt)}
                    </td>
                    {canWrite ? (
                      <td className="px-3 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEnding(current);
                              setTransferring(null);
                              setEndReason('LEFT_HOUSEHOLD');
                              setEndNote('');
                              setError(null);
                              setNotice(null);
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            End
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTransferring(current);
                              setEnding(null);
                              setTargetHouseholdId('');
                              setTransferReason('');
                              setError(null);
                              setNotice(null);
                            }}
                            disabled={targets.length === 0}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            Transfer
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

        {ending ? (
          <form
            onSubmit={(event) => void endMembership(event)}
            className="mt-5 grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[180px_1fr_auto_auto]"
          >
            <label className="text-sm font-medium text-amber-900">
              End reason
              <select
                value={endReason}
                onChange={(event) =>
                  setEndReason(event.target.value as MembershipEndReason)
                }
                className={INPUT_CLASS}
              >
                {Object.entries(MEMBERSHIP_END_REASON_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-sm font-medium text-amber-900">
              Note {endReason === 'OTHER' ? '(required)' : '(optional)'}
              <input
                value={endNote}
                onChange={(event) => setEndNote(event.target.value)}
                className={INPUT_CLASS}
                required={endReason === 'OTHER'}
                minLength={endReason === 'OTHER' ? 5 : undefined}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="self-end rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              End membership
            </button>
            <button
              type="button"
              onClick={() => setEnding(null)}
              className="self-end rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Cancel
            </button>
          </form>
        ) : null}

        {transferring ? (
          <form
            onSubmit={(event) => void transferMembership(event)}
            className="mt-5 grid gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:grid-cols-[1fr_1fr_auto_auto]"
          >
            <label className="text-sm font-medium text-sky-900">
              Target household
              <select
                value={targetHouseholdId}
                onChange={(event) => setTargetHouseholdId(event.target.value)}
                className={INPUT_CLASS}
                required
              >
                <option value="">Select a target household</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.householdNumber} · {target.purok.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-sky-900">
              Transfer reason
              <input
                value={transferReason}
                onChange={(event) => setTransferReason(event.target.value)}
                className={INPUT_CLASS}
                required
                minLength={5}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="self-end rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
            >
              Transfer
            </button>
            <button
              type="button"
              onClick={() => setTransferring(null)}
              className="self-end rounded-lg border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Cancel
            </button>
          </form>
        ) : null}

        {canWrite && household.status === 'ACTIVE' ? (
          <form
            onSubmit={(event) => void addMember(event)}
            className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_200px_auto]"
          >
            <ResidentPicker
              label="Add resident"
              selected={member}
              onSelect={setMember}
              required
            />
            <label className="text-sm font-medium text-slate-700">
              Relationship
              <input
                value={relationship}
                onChange={(event) => setRelationship(event.target.value)}
                placeholder="Spouse, child, parent"
                className={INPUT_CLASS}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !member}
              className="self-end rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              Add member
            </button>
          </form>
        ) : null}
      </section>

      {canChangeHead && household.status === 'ACTIVE' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Household head</h3>
          <p className="mt-1 text-xs text-slate-500">
            Only current active members can be assigned as head.
          </p>
          <form
            onSubmit={(event) => void saveHead(event)}
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
          >
            <label className="text-sm font-medium text-slate-700">
              Head resident
              <select
                value={headResidentId}
                onChange={(event) => setHeadResidentId(event.target.value)}
                className={INPUT_CLASS}
                required
              >
                <option value="">Select an active member</option>
                {activeMembers.map((current) => (
                  <option key={current.id} value={current.residentId}>
                    {current.fullName} ({current.residentNumber})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Reason
              <input
                value={headReason}
                onChange={(event) => setHeadReason(event.target.value)}
                className={INPUT_CLASS}
                required
                minLength={5}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !headResidentId || activeMembers.length === 0}
              className="self-end rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              Set head
            </button>
          </form>
        </section>
      ) : null}

      {canHistory ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Icon name="shield" className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">
              Household history
            </h3>
          </div>
          {history.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No household changes have been recorded.
            </p>
          ) : (
            <ol className="mt-4 space-y-4 border-l border-slate-200 pl-5">
              {history.map((change) => (
                <li key={change.id} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-700 ring-4 ring-white" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {change.action.replaceAll('_', ' ')}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDateTime(change.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {change.actor?.fullName ?? 'System'} ·{' '}
                    {change.reason ?? 'No reason recorded'}
                  </p>
                  {change.changes ? (
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-500">
                      {Object.entries(change.changes).map(([field, value]) => (
                        <li key={field}>
                          <span className="font-semibold text-slate-600">
                            {field.replaceAll(/([A-Z])/g, ' $1')}:
                          </span>{' '}
                          {changeText(value)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
