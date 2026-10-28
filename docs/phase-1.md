# Phase 1 — Plan, Scope, and Acceptance

**Project:** Barangay 2 Management Information System (BMIS)
**Location:** Barangay 2, Sipalay City, Negros Occidental
**Verification date:** 2026-10-28
**Status:** Implemented and verified. Phase 2 is also implemented; see
[`phase-2.md`](phase-2.md). This document remains the Phase 1 historical record.

---

## 1. Objective

Establish a secure, maintainable foundation before any resident data is stored:
project scaffolding, MySQL/Prisma architecture, session authentication,
role-based authorization, audit logging, a login experience, and a role-aware
application shell.

---

## 2. Scope delivered

### Backend

- Express 5 + TypeScript API with a composition root (`app.ts`) and separate
  process entry point (`server.ts`).
- Zod-validated environment configuration with production safety checks.
- Prisma schema, committed initial migration, and isolated test database flow.
- Prisma-backed `express-session` store with expiry pruning and graceful
  shutdown.
- Authentication: CSRF issuance, login, logout, current-user endpoint.
- Session-fixation protection via session regeneration at login.
- CSRF protection on every mutating `/api` request.
- bcrypt password verification with a dummy hash for unknown usernames.
- Account lockout after repeated failures.
- IP rate limiting for login and the API.
- Permission catalogue and least-privilege role matrix.
- Per-request user reload so deactivation and role changes apply immediately.
- Authentication audit logging.
- Role-aware dashboard payload with live admin counts and non-fabricated
  placeholders for later modules.
- Health endpoint with a database check.
- Central error handling with stable error codes.
- Helmet security headers and an explicit CORS allow-list.
- Synthetic seed accounts, refused in production.

### Frontend

- React 19 + TypeScript + Vite + Tailwind CSS 4 application.
- Authentication context and session bootstrap.
- Typed fetch client with in-memory CSRF token and structured errors.
- Login page with client validation, server errors, loading state, and password
  visibility toggle.
- Protected and public-only route guards with return-path preservation.
- Responsive dashboard shell: sidebar, mobile drawer, top bar, user identity,
  and sign-out.
- Permission-filtered navigation with Phase 2+ modules visibly disabled.
- Role-aware dashboard rendered from server data.
- Loading skeletons, empty/error states, and retry behavior.
- Asia/Manila date, number, and greeting formatting.
- 404 page.

### Documentation and data

- Root README with setup, commands, accounts, testing, and troubleshooting.
- Architecture, database, security, API, Phase 1, and DILG compatibility
  documents.
- Five synthetic development accounts covering every role plus an inactive
  account.

---

## 3. Acceptance criteria and evidence

| # | Criterion                                             | Evidence                                                        | Result |
| - | ----------------------------------------------------- | --------------------------------------------------------------- | ------ |
| 1 | Both packages build for production                    | `npm run build` (backend `tsc`; frontend Vite bundle)            | Pass   |
| 2 | No TypeScript errors                                  | `npm run typecheck` (both packages)                              | Pass   |
| 3 | Lint passes                                           | `npm run lint` (Oxlint, both packages)                           | Pass   |
| 4 | Backend automated tests pass                          | 33 tests / 4 files (`auth`, `dashboard`, `rbac`, `session-store`) | Pass   |
| 5 | Frontend automated tests pass                         | 14 tests / 4 files (`navigation`, `LoginPage`, `RouteGuards`, `DashboardPage`) | Pass |
| 6 | Database schema applies cleanly                       | `prisma migrate deploy` on dev and test databases                | Pass   |
| 7 | Seeded accounts can sign in                           | Live smoke test with `sysadmin`; `/me` and `/dashboard` returned | Pass   |
| 8 | Missing CSRF token is rejected                        | `403 CSRF_TOKEN_INVALID` covered by tests                        | Pass   |
| 9 | Session ID and CSRF token rotate at login             | Old token rejected; new token accepted; test coverage            | Pass   |
| 10 | Deactivation takes effect immediately                | `/me` returns 401 after status change; test coverage             | Pass   |
| 11 | Failed logins are audited and lock the account       | Audit row + `423 ACCOUNT_LOCKED`; test coverage                  | Pass   |
| 12 | Permissions are enforced server-side                 | Middleware tests for admin/secretary/encoder/captain             | Pass   |
| 13 | Dashboards are role-aware and do not invent data     | Per-role payload tests; placeholders marked `comingSoon`         | Pass   |
| 14 | Production builds start and serve                     | Compiled API started; `/api/health` returned `ok`                | Pass   |

### Verification commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

### Verified output summary

- Backend: `Test Files 4 passed (4)`, `Tests 33 passed (33)`
- Frontend: `Test Files 4 passed (4)`, `Tests 14 passed (14)`
- Frontend production bundle: ~290 kB JS / ~34 kB CSS before gzip
- Health smoke test: `{"status":"ok","database":"up",...}`

> The local environment installed Prisma engines manually after the first
> package install exceeded the shell timeout. This is an environment issue, not
> a project defect; see the README troubleshooting section.

---

## 4. Test coverage map

| Area                          | Backend | Frontend |
| ----------------------------- | ------- | -------- |
| Health and security headers   | Yes     | –        |
| CSRF issuance and enforcement | Yes     | –        |
| Login success and DTO shape   | Yes     | Yes      |
| Wrong password / unknown user | Yes     | Yes      |
| Inactive and locked accounts  | Yes     | –        |
| Validation errors             | Yes     | Yes      |
| Logout and token rotation     | Yes     | –        |
| Immediate deactivation        | Yes     | –        |
| Session store + pruning       | Yes     | –        |
| Permission matrix + middleware| Yes     | Yes      |
| Role-aware dashboard payload  | Yes     | Yes      |
| Route guards                  | –       | Yes      |
| Error and loading states      | –       | Yes      |

Deliberately not automated in Phase 1: visual regression, accessibility audit,
cross-browser E2E, load testing, and real MySQL-vs-MariaDB matrix testing.

---

## 5. Operating assumptions

- Barangay staff use modern managed browsers on desktop; the layout is also
  usable on a phone for basic sign-in and dashboard viewing.
- The barangay has not yet approved a password policy, MFA requirement, or
  session timeout. Defaults are 12-round bcrypt, no MFA, and an 8-hour rolling
  session.
- The application will be deployed on a single server or small VPS behind
  HTTPS. The in-memory rate limiter assumes one API instance.
- The initial role matrix is a proposal and requires barangay sign-off.
- Development data is synthetic. No real resident data exists in the system.
- DILG interoperability is not implemented because no official integration
  contract has been provided.

---

## 6. Explicitly out of scope for Phase 1

- Resident management
- Household and purok management
- Certificate requests, approval, issuance, numbering, and templates
- Reports and analytics
- Administration UI, account provisioning, password reset, MFA
- Audit log viewer
- Controlled Excel/CSV import
- DILG LGUSS-BIMS integration
- Production deployment, TLS termination, backups, monitoring

No code for these modules has been started.

---

## 7. Open questions requiring barangay sign-off

1. **Approver identity:** is the Barangay Captain the only authorized
   certificate approver, or can a designated officer act on their behalf?
2. **Role matrix:** confirm the proposed least-privilege matrix, especially
   whether administrators should remain read-only on resident data.
3. **Account issuance:** who creates accounts, what identity proof is required,
   and who can reset passwords or unlock accounts?
4. **Password policy and MFA:** minimum length/complexity, rotation, and whether
   MFA is required for administrators and approvers.
5. **Session timeout:** is an 8-hour rolling session acceptable, or should
   sessions expire sooner when idle?
6. **Resident data:** required fields, consent language, retention period, and
   whether national identifiers (e.g. PhilSys) may be stored.
7. **Purok list and household numbering:** official names and numbering scheme
   for Barangay 2.
8. **Certificate catalogue:** official types, purposes, fees, signatories,
   control-number format, and templates.
9. **DILG requirements:** any mandated reports, templates, identifiers, or
   deadlines that must shape the Phase 2 schema.
10. **Hosting and operations:** who owns the server, domain, TLS certificate,
    backups, monitoring, and incident response?
11. **Privacy compliance:** who completes the Privacy Impact Assessment and
    handles data subject requests under RA 10173?

---

## 8. Phase 2 entry criteria

Phase 2 (Resident Registry + Households/Puroks) starts only after:

- This Phase 1 report is approved.
- The role matrix and approver model are signed off.
- Resident field list, household numbering, and official purok list are
  confirmed.
- Retention and privacy requirements for resident data are documented.
- The barangay accepts the remaining Phase 1 security gaps or schedules them
  before production.

Until then, the repository stays at the Phase 1 boundary.
