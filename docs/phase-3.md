# Phase 3 — Households and Puroks

**Status:** Implemented and verified on 2026-10-28
**Scope:** Barangay 2, Sipalay City, Negros Occidental

---

## 1. Delivered scope

- Dedicated Purok records with code, name, status, optimistic version, and
  transactional audit/history behavior.
- Household records with immutable `HH-YYYY-NNNNNN` numbers, one Purok,
  address, optional landmark, status, verification, and version.
- One active household membership per resident, enforced by a unique nullable
  `activeResidentId`.
- One household head, enforced by a unique nullable `headResidentId`; the head
  must be an active member.
- Member add, end, and atomic transfer workflows with preserved membership
  history and end reasons.
- Secretary-only household verification, head changes, and status changes.
- Encoder household creation, detail edits, and membership changes.
- Captain read-only household views with contact details, exact birth dates,
  landmark, verification details, and history removed.
- Resident profile household card and dashboard Phase 3 widgets.
- Household/Purok frontend pages, resident picker, routes, permissions, and
  navigation.

Official Purok names and codes were not available during implementation. The
seed uses synthetic `Purok 1`–`Purok 4` labels with `P-01`–`P-04` codes. These
must be replaced after barangay sign-off; the database does not cap Puroks at
four.

---

## 2. Data rules

- Every household belongs to exactly one Purok.
- A resident can have only one active household membership.
- A resident can belong to only one household at a time.
- The household head must be an active member.
- Ending the head membership or moving the head out clears the head.
- Household numbers are never reused.
- Household numbers use the Asia/Manila year.
- Verification is reset by household edits, head changes, member add/end,
  transfers, resident `INACTIVE`, and other membership-affecting changes.
- Household deactivation is blocked while active members remain.
- Purok deactivation is blocked while active households remain.
- No hard-delete endpoints exist for Puroks, households, or memberships.

### Resident status integration

| Resident transition | Household effect |
| ------------------- | ---------------- |
| `ACTIVE` → `INACTIVE` | Membership and head preserved; household verification reset |
| `ACTIVE`/`INACTIVE` → `MOVED_OUT` | Membership ended with `MOVED_OUT`; head cleared; verification reset |
| `ACTIVE`/`INACTIVE` → `DECEASED` | Membership ended with `DECEASED`; head cleared; verification reset |
| `MOVED_OUT`/`DECEASED` → active | No membership is recreated automatically; a staff member must add the resident |

Explicitly ending an inactive resident's membership requires a reason. Using
the `OTHER` end reason requires a note.

---

## 3. API surface

### Puroks

| Method | Route | Permission |
| ------ | ----- | ---------- |
| GET | `/api/puroks` | `puroks:read` |
| GET | `/api/puroks/:id` | `puroks:read` |
| POST | `/api/puroks` | `puroks:write` |
| PATCH | `/api/puroks/:id` | `puroks:write` |
| PATCH | `/api/puroks/:id/status` | `puroks:write` |

### Households

| Method | Route | Permission |
| ------ | ----- | ---------- |
| GET | `/api/households` | `households:read` |
| GET | `/api/households/:id` | `households:read` |
| GET | `/api/households/:id/history` | `households:read` + `households:history:read` |
| POST | `/api/households` | `households:write` |
| PATCH | `/api/households/:id` | `households:write` |
| PATCH | `/api/households/:id/status` | `households:status` |
| POST | `/api/households/:id/verify` | `households:verify` |
| PATCH | `/api/households/:id/head` | `households:head:change` |
| POST | `/api/households/:id/members` | `households:write` |
| POST | `/api/households/:id/members/:membershipId/end` | `households:write` |
| POST | `/api/households/:id/members/:membershipId/transfer` | `households:write` |

All mutations require CSRF. Household detail and history reads create audit
records; Purok reads do not. Captain household reads record a limited-view audit
and do not expose sensitive fields.

---

## 4. Authorization

| Capability | Admin | Secretary | Encoder | Captain |
| ---------- | :---: | :-------: | :-----: | :-----: |
| View Puroks | – | Y | Y | Y |
| Manage Puroks | – | Y | – | – |
| View households | – | Y | Y | Y |
| Create/edit households | – | Y | Y | – |
| Add/end/transfer members | – | Y | Y | – |
| Verify household | – | Y | – | – |
| Change household head | – | Y | – | – |
| Change household status | – | Y | – | – |
| View household history | – | Y | Y | – |

Administrators manage accounts and audit logs, not barangay household records.
The frontend permission matrix mirrors these rules for UI visibility only; the
backend is authoritative.

---

## 5. Concurrency and integrity

- Canonical lock order:
  `HouseholdNumberSequence (create only) → Purok → Resident → Household →
  HouseholdMembership`.
- Multiple UUIDs are sorted before locking.
- Mutations use bounded deadlock/lock-retry handling.
- Transactions run at `READ COMMITTED`.
- Household and Purok edits use optimistic `version` checks.
- Membership end/transfer uses the membership `version`.
- Active membership and active head uniqueness are enforced by database unique
  constraints, not only application checks.
- Household numbers are allocated with an atomic yearly sequence update; the
  resident-number allocator uses the same mechanism.
- Audits, household changes, membership changes, and record updates commit in
  the same transaction.

---

## 6. Verification

- Backend: 66 tests across 8 files, including Purok, household, dashboard,
  resident integration, and concurrency coverage.
- Concurrency coverage includes parallel household-number allocation,
  conflicting head changes, competing membership transfers, and overlapping
  terminal resident status changes.
- Frontend: 25 tests across 7 files, including navigation route visibility and
  Phase 3 module enablement.
- Backend and frontend typechecks, production builds, and the full
  `npm run verify` gate pass.
- Lint reports warnings only; no errors.
- Development and test databases have the Phase 3 migration applied.
- Seed is idempotent and creates 4 synthetic Puroks and 3 synthetic households.

Known remaining work:

- Replace synthetic Purok names/codes with official barangay data.
- Expand frontend coverage for household detail/member mutation flows.
- Complete production security, backup, retention, and privacy prerequisites in
  `docs/security.md`.
