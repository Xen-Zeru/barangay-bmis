import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, residentsApi } from '../../api/client';
import type { ResidentInput } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PERMISSIONS, hasPermission } from '../../auth/permissions';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatBirthDate } from '../../lib/format';
import { SEX_LABELS, STATUS_LABELS } from '../../lib/resident-labels';
import type {
  RecordSource,
  ResidencyStatus,
  ResidentCandidate,
  Sex,
} from '../../types/api';

interface FormState {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  birthDate: string;
  sex: Sex;
  contactNumber: string;
  residencyStatus: ResidencyStatus;
  recordSource: RecordSource;
  sourceReference: string;
  sourceReferenceUnavailableReason: string;
}

const INITIAL_FORM: FormState = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  birthDate: '',
  sex: 'MALE',
  contactNumber: '',
  residencyStatus: 'ACTIVE',
  recordSource: 'WALK_IN',
  sourceReference: '',
  sourceReferenceUnavailableReason: '',
};

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return {};
  }
  const fields: Record<string, string> = {};
  for (const item of error.details) {
    if (
      item &&
      typeof item === 'object' &&
      'field' in item &&
      typeof item.field === 'string' &&
      'message' in item &&
      typeof item.message === 'string'
    ) {
      fields[item.field] = item.message;
    }
  }
  return fields;
}

function basePayload(form: FormState) {
  return {
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim() || null,
    lastName: form.lastName.trim(),
    suffix: form.suffix.trim() || null,
    birthDate: form.birthDate,
    sex: form.sex,
    contactNumber: form.contactNumber.trim() || null,
    recordSource: form.recordSource,
    sourceReference: form.sourceReference.trim() || null,
    sourceReferenceUnavailableReason:
      form.sourceReferenceUnavailableReason.trim() || null,
  };
}

function createPayload(form: FormState): ResidentInput {
  return {
    ...basePayload(form),
    residencyStatus: form.residencyStatus,
  };
}

export function ResidentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<ResidentCandidate[]>([]);
  const [duplicateReason, setDuplicateReason] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState<{
    id: string;
    canView: boolean;
  } | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    setLoading(true);

    residentsApi
      .get(id)
      .then((resident) => {
        if (cancelled) {
          return;
        }
        setForm({
          firstName: resident.firstName,
          middleName: resident.middleName ?? '',
          lastName: resident.lastName,
          suffix: resident.suffix ?? '',
          birthDate: resident.birthDate,
          sex: resident.sex,
          contactNumber: resident.contactNumber ?? '',
          residencyStatus: resident.residencyStatus,
          recordSource: resident.recordSource,
          sourceReference: resident.sourceReference ?? '',
          sourceReferenceUnavailableReason:
            resident.sourceReferenceUnavailableReason ?? '',
        });
        setVersion(resident.version);
        setError(null);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Unable to load this resident record.',
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
  }, [id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});
    setCandidates([]);

    try {
      if (isEdit && id) {
        const resident = await residentsApi.update(id, {
          ...basePayload(form),
          version,
          ...(duplicateReason.trim()
            ? { duplicateReason: duplicateReason.trim() }
            : {}),
        });
        navigate(`/residents/${resident.id}`);
        return;
      }

      const resident = await residentsApi.create(createPayload(form));
      navigate(`/residents/${resident.id}`);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.code === 'POSSIBLE_DUPLICATE'
      ) {
        const details = caught.details as
          | { candidates?: ResidentCandidate[] }
          | undefined;
        setCandidates(details?.candidates ?? []);
        setError(
          isEdit
            ? 'This change would create a possible duplicate. A Secretary must review and document an override reason.'
            : 'A possible duplicate was found. Submit this record for Secretary review instead of creating it directly.',
        );
      } else {
        setFieldErrors(fieldErrorsFrom(caught));
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Unable to save the resident record.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitDuplicateReview(): Promise<void> {
    if (saving) {
      return;
    }
    if (duplicateReason.trim().length < 10) {
      setFieldErrors({
        duplicateReason: 'Provide a reason of at least 10 characters.',
      });
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const review = await residentsApi.createDuplicateReview({
        ...createPayload(form),
        reason: duplicateReason.trim(),
      });
      setReviewSubmitted({
        id: review.id,
        canView: user
          ? hasPermission(
              user.role,
              PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE,
            )
          : false,
      });
    } catch (caught) {
      setFieldErrors(fieldErrorsFrom(caught));
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to submit the duplicate review.',
      );
    } finally {
      setSaving(false);
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

  if (reviewSubmitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
        <div className="flex items-start gap-3">
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Submitted for duplicate review</p>
            <p className="mt-1">
              No resident record was created yet. A Secretary must review the
              possible duplicate before the record can be added.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {reviewSubmitted.canView ? (
                <Link
                  to={`/residents/duplicate-reviews/${reviewSubmitted.id}`}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Open review
                </Link>
              ) : null}
              <Link
                to="/residents"
                className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Back to residents
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showDuplicateOverride = isEdit && candidates.length > 0;
  const isLegacySource =
    form.recordSource === 'EXISTING_RECORD' || form.recordSource === 'IMPORT';

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {isEdit ? 'Update record' : 'New record'}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            {isEdit ? 'Edit resident' : 'Register resident'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Identity fields are matched carefully to prevent accidental
            duplicates.
          </p>
        </div>
        <Link
          to={isEdit && id ? `/residents/${id}` : '/residents'}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {error}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Possible duplicates
          </h3>
          <div className="mt-3 space-y-2">
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {candidate.fullName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {candidate.residentNumber} ·{' '}
                    {formatBirthDate(candidate.birthDate)} ·{' '}
                    {STATUS_LABELS[candidate.residencyStatus]}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {candidate.matchType === 'EXACT' ? 'Exact match' : 'Broad match'}
                </span>
              </div>
            ))}
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            {showDuplicateOverride
              ? 'Secretary override reason'
              : 'Duplicate review reason'}
            <textarea
              value={duplicateReason}
              onChange={(event) => setDuplicateReason(event.target.value)}
              rows={3}
              className={INPUT_CLASS}
              placeholder="Explain the evidence or inquiry that shows this is a different person."
            />
          </label>
          {fieldErrors.duplicateReason ? (
            <p className="mt-1 text-xs font-medium text-red-700">
              {fieldErrors.duplicateReason}
            </p>
          ) : null}

          {showDuplicateOverride ? (
            <p className="mt-3 text-xs text-slate-500">
              Submit the form again with this override reason. Only a Secretary
              can approve a duplicate override on an existing record.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void submitDuplicateReview()}
              disabled={saving}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Icon name="shield" className="h-4 w-4" />}
              Submit for duplicate review
            </button>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Identity</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            First name
            <input
              value={form.firstName}
              onChange={(event) => update('firstName', event.target.value)}
              className={INPUT_CLASS}
              required
            />
            {fieldErrors.firstName ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.firstName}</p>
            ) : null}
          </label>
          <label className="text-sm font-medium text-slate-700">
            Middle name
            <input
              value={form.middleName}
              onChange={(event) => update('middleName', event.target.value)}
              className={INPUT_CLASS}
            />
            {fieldErrors.middleName ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.middleName}</p>
            ) : null}
          </label>
          <label className="text-sm font-medium text-slate-700">
            Last name
            <input
              value={form.lastName}
              onChange={(event) => update('lastName', event.target.value)}
              className={INPUT_CLASS}
              required
            />
            {fieldErrors.lastName ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.lastName}</p>
            ) : null}
          </label>
          <label className="text-sm font-medium text-slate-700">
            Suffix
            <select
              value={form.suffix}
              onChange={(event) => update('suffix', event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">None</option>
              <option value="JR">Jr.</option>
              <option value="SR">Sr.</option>
              <option value="II">II</option>
              <option value="III">III</option>
              <option value="IV">IV</option>
              <option value="V">V</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Birth date
            <input
              type="date"
              value={form.birthDate}
              onChange={(event) => update('birthDate', event.target.value)}
              className={INPUT_CLASS}
              required
            />
            {fieldErrors.birthDate ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.birthDate}</p>
            ) : null}
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sex
            <select
              value={form.sex}
              onChange={(event) => update('sex', event.target.value as Sex)}
              className={INPUT_CLASS}
            >
              {Object.entries(SEX_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-400">
              “Not recorded” is for legacy records or an authorized Secretary
              exception.
            </span>
            {fieldErrors.sex ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.sex}</p>
            ) : null}
          </label>
          <label className="text-sm font-medium text-slate-700">
            Contact number
            <input
              inputMode="tel"
              value={form.contactNumber}
              onChange={(event) => update('contactNumber', event.target.value)}
              className={INPUT_CLASS}
              placeholder="09171234567"
            />
            {fieldErrors.contactNumber ? (
              <p className="mt-1 text-xs text-red-700">
                {fieldErrors.contactNumber}
              </p>
            ) : null}
          </label>
          {!isEdit ? (
            <label className="text-sm font-medium text-slate-700">
              Residency status
              <select
                value={form.residencyStatus}
                onChange={(event) =>
                  update('residencyStatus', event.target.value as ResidencyStatus)
                }
                className={INPUT_CLASS}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Source</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Record source
            <select
              value={form.recordSource}
              onChange={(event) => {
                const value = event.target.value as RecordSource;
                update('recordSource', value);
                if (value !== 'EXISTING_RECORD' && value !== 'IMPORT') {
                  update('sourceReferenceUnavailableReason', '');
                }
              }}
              className={INPUT_CLASS}
            >
              <option value="WALK_IN">Walk-in</option>
              <option value="FIELD_SURVEY">Field survey</option>
              <option value="EXISTING_RECORD">Existing record</option>
              <option value="IMPORT">Imported</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Source reference
            <input
              value={form.sourceReference}
              onChange={(event) => update('sourceReference', event.target.value)}
              className={INPUT_CLASS}
              placeholder="Masterlist page, index card, or intake reference"
            />
            {fieldErrors.sourceReference ? (
              <p className="mt-1 text-xs text-red-700">
                {fieldErrors.sourceReference}
              </p>
            ) : null}
          </label>
          {isLegacySource ? (
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Why is a legacy source reference unavailable?
              <textarea
                value={form.sourceReferenceUnavailableReason}
                onChange={(event) =>
                  update('sourceReferenceUnavailableReason', event.target.value)
                }
                rows={2}
                className={INPUT_CLASS}
                placeholder="Only use this when the legacy record has no usable reference."
              />
              {fieldErrors.sourceReferenceUnavailableReason ? (
                <p className="mt-1 text-xs text-red-700">
                  {fieldErrors.sourceReferenceUnavailableReason}
                </p>
              ) : null}
            </label>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          to={isEdit && id ? `/residents/${id}` : '/residents'}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-70"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
          {saving
            ? 'Saving...'
            : isEdit
              ? 'Save changes'
              : 'Create resident'}
        </button>
      </div>
    </form>
  );
}
