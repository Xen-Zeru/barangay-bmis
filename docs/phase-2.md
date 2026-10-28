# Phase 2 — Resident Management

**Status:** Implemented and verified against synthetic data
**Scope:** Barangay 2, Sipalay City, Negros Occidental
**Verification date:** 2026-10-28

---

## 1. Objective

Deliver a controlled resident registry that preserves Phase 1 security
guarantees, establishes the canonical person record for later modules, and
resolves duplicate and deceased-status conflicts through explicit, audited
workflows.

Phase 2 does **not** implement households, puroks, certificates, reports,
Excel/CSV import, user administration, or DILG integration.

---

## 2. Approved decisions

### D3 — Sex categories

`Sex` is `MALE`, `FEMALE`, or `NOT_RECORDED`. `NOT_RECORDED` is limited to the
Secretary or to legacy/imported records. The final categories on the official
barangay form still require confirmation before production data entry.

### D6 — Duplicate review

- The Secretary is the initial duplicate-review approver.
- The requester cannot approve or reject their own review.
- Approval creates the resident and is separate from verification.
- Matching uses a normalized identity guard plus exact/broad candidate queries.
- Automatic pending-review expiry is **not** implemented. A pending review
  remains open until decided or cancelled; staff must clear stale requests
  manually.

### D8 — Deceased-status correction

- `residents:corrections:approve` belongs to the Captain.
- Requests capture minimum decision data: target status, reason, and evidence
  reference.
- The requester cannot approve their own correction.
- Only a currently `DECEASED` resident with no pending correction is eligible.
- Approval records `STATUS_CORRECTED` history and an audit event.

### D9 — Audit

- Full profile, history, duplicate-review detail, and correction detail reads
  are fail-closed audited.
- Directory and lookup reads do not create one audit row per result.
- Resident mutations write history and audit rows inside the same transaction.

---

## 3. Permission model

| Capability | Admin | Secretary | Encoder | Captain |
| ---------- | :---: | :-------: | :-----: | :-----: |
| Directory and full profile | – | Y | Y | – |
| Minimal lookup | – | – | – | Y |
| Create/edit | – | Y | Y | – |
| Verify | – | Y | – | – |
| Duplicate approval | – | Y | – | – |
| Correction request | – | Y | – | – |
| Correction approval | – | – | – | Y |

The backend matrix is authoritative. Frontend checks only hide or disable UI.

---

## 4. Resident lifecycle

1. **Register** with required identity and provenance fields.
2. **Detect conflict** by identity key and name/birth-date candidates.
3. **Submit duplicate review** when a conflict exists; no resident number is
   allocated yet.
4. **Approve** by a different Secretary; create the resident, allocate
   `RES-YYYY-NNNNNN`, record history/audit, and clear the draft/active key.
5. **Edit** with `version`; identity changes can require a duplicate override
   reason.
6. **Verify** as Secretary.
7. **Change status** through an allow-list. `DECEASED` is terminal for normal
   status changes.
8. **Correct** a deceased status only through Captain-approved correction.

---

## 5. Backend implementation

### Schema and migration

`prisma/migrations/20261028130000_residents_phase2/migration.sql` adds:

- `residents`
- `resident_changes`
- `resident_number_sequences`
- `resident_identity_guards`
- `resident_duplicate_reviews`
- `resident_corrections`

See [`database.md`](database.md) for columns, indexes, and ERD.

### Services

- `residents.service.ts` — directory, lookup, create/update, status, verify,
  history, duplicate candidate detection, resident-number allocation.
- `residents.duplicates.service.ts` — request/list/detail/approve/reject/cancel.
- `residents.corrections.service.ts` — request/list/detail/approve/reject/cancel.
- `resident-locking.ts` — bounded deadlock retry, `FOR UPDATE` locks, sequence
  upsert.
- `resident-utils.ts` — normalization, identity hashing, DTOs, provenance rules.

### Controls

- Unique `activeIdentityKey` and row locks prevent concurrent duplicate creation.
- Unique `createdResidentId` prevents one draft creating multiple residents.
- Unique `activeResidentId` allows only one pending correction per resident.
- Optimistic `version` checks return `409 STALE_RESIDENT`/`CONCURRENT_MODIFICATION`.
- Mutations and audit/history writes share a transaction.
- Sensitive reads require a successful audit insert before returning data.

---

## 6. Frontend implementation

- `ResidentListPage` — search, status/verification filters, sorting, pagination.
- `ResidentFormPage` — create/edit, provenance rules, duplicate submission.
- `ResidentProfilePage` — full profile, status/verification actions, history.
- `ResidentLookupPage` — minimal Captain lookup.
- `DuplicateReviewsPage` / `DuplicateReviewDetailPage` — queue, candidates,
  approve/reject/cancel, self-approval guard.
- `CorrectionsPage` / `CorrectionDetailPage` — request queue, evidence,
  Captain decision controls.
- Navigation uses an `enabled` flag; resident routes use `RequirePermission`.
- Dashboard shows live resident and pending-correction widgets.

---

## 7. Verification

### Automated

- Backend: **48 tests / 5 files** passed against `test_bmis_test`, including
  resident lifecycle, duplicate review, corrections, RBAC, and concurrency
  guards.
- Frontend: **22 tests / 6 files** passed, including resident directory and
  duplicate self-approval UI.
- Backend and frontend typechecks pass.
- `npm run verify` passed: lint, typecheck, 48 backend tests, 22 frontend
  tests, and both production builds.
- Four-role API smoke checks passed for dashboard, directory, lookup,
  duplicate queue, and correction queue access.

### Manual smoke checklist

Run with the seeded synthetic accounts:

- [ ] Secretary: register a resident, open profile/history, search directory.
- [ ] Secretary: submit and approve a duplicate review as a different Secretary.
- [ ] Secretary: request a deceased-status correction; verify no self-approval.
- [ ] Captain: use minimal lookup; approve/reject a correction with evidence.
- [ ] Encoder: create/edit; confirm no verify, duplicate-approval, or correction
      queue access.
- [ ] Admin: confirm no resident navigation or resident API access.
- [ ] Confirm sensitive reads appear in `audit_logs`.
- [ ] Confirm a stale edit returns a conflict instead of overwriting.

---

## 8. Known limitations

- Household/purok data is not modeled; profile `household` is `null`.
- Duplicate reviews have no automatic expiry.
- There is no bulk import or export; `NOT_RECORDED`/legacy provenance exists to
  support a future controlled import.
- There is no audit-log viewer UI.
- The audit table remains database-administrator writable (no hash chain/offsite
  shipping).
- Production hardening from [`security.md`](security.md) is still required,
  including MFA, password reset, backups, retention, and a Privacy Impact
  Assessment.
- All data used for verification is synthetic. There is no production or DILG
  deployment claim.

---

## 9. Rollout notes

1. Back up the target database.
2. Apply committed migrations with `npm --prefix backend run db:migrate`.
3. Do not run the development seed against production.
4. Create real accounts through an approved provisioning process (no UI yet).
5. Rotate/remove all seeded accounts and resident records before real use.
6. Train staff on duplicate evidence and correction standards.
7. Complete the production checklist before handling resident PII.
