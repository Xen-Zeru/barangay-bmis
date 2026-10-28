# BMIS Architecture

**Status:** Phase 3 (households and Puroks)
**Scope:** Barangay 2, Sipalay City, Negros Occidental

---

## 1. Architectural style

BMIS is a **modular monolith** with a separately built single-page frontend.

Why a monolith:

- One barangay office, a small number of concurrent staff, and one database.
- A single deployable API is easier to operate, back up, and audit than
  distributed services.
- Module boundaries are still explicit by folder and permission, so modules can
  be extracted later if scale ever requires it.

```
Browser (React SPA)
        │  HTTPS, session cookie + X-CSRF-Token
        ▼
Express API (stateless process, stateful DB sessions)
        │
        ├── Authentication / RBAC middleware
        ├── Module routers (auth, dashboard, residents, puroks, households)
        ├── Audit service (append-only writes)
        ▼
Prisma ORM ──► MySQL / MariaDB
```

---

## 2. Backend structure

```
backend/
├── prisma/
│   ├── schema.prisma              Phase 1–3 models
│   ├── migrations/                Committed SQL migrations
│   └── seed.ts                    Synthetic accounts, residents, Puroks, households
├── src/
│   ├── config/env.ts              Zod-validated environment
│   ├── lib/
│   │   ├── prisma.ts              Singleton Prisma client
│   │   ├── errors.ts              AppError + stable error codes
│   │   ├── audit.ts               Audit actions and write helper
│   │   ├── transaction.ts         READ COMMITTED transaction + bounded retry
│   │   ├── yearly-sequence.ts     Atomic resident/household number allocation
│   │   └── session-helpers.ts     Regenerate/save/destroy promises
│   ├── middleware/
│   │   ├── session.ts             express-session + Prisma store
│   │   ├── auth.ts                loadCurrentUser, requireAuth, requirePermission
│   │   ├── validate.ts            Zod body validation
│   │   ├── rate-limit.ts          Global and login limiters
│   │   └── error-handler.ts       404 + central error translation
│   ├── modules/
│   │   ├── auth/                  schemas, service, routes, DTOs
│   │   ├── dashboard/             role-aware payload builder
│   │   ├── residents/             lifecycle, duplicates, corrections, locking
│   │   ├── puroks/                Purok registry and status safeguards
│   │   ├── households/            household/membership lifecycle and history
│   │   └── health/                liveness and DB check
│   ├── security/
│   │   ├── permissions.ts         Permission catalogue + role matrix
│   │   └── csrf.ts                Session-bound CSRF token
│   ├── session/
│   │   └── prisma-session-store.ts
│   ├── types/                     Express request/session augmentation
│   ├── app.ts                     Composition root (no listen)
│   ├── routes.ts                  /api router composition
│   └── server.ts                  listen, session pruning, graceful shutdown
└── tests/                         Vitest + Supertest, isolated DB
```

### Layer responsibilities

| Layer        | Responsibility                                                   |
| ------------ | ---------------------------------------------------------------- |
| Routes       | HTTP shape, status codes, CSRF, auth middleware, audit calls     |
| Services     | Business rules (credential verification, lockout, dashboard data)|
| Data access  | Prisma queries; no HTTP concerns                                 |
| Middleware   | Cross-cutting: session, identity loading, permissions, validation|
| Security     | Permission catalogue, CSRF, rate limits                          |

Business logic is kept out of route handlers where it is likely to be reused or
tested in isolation (e.g. `authenticate`, `buildDashboard`, `createResident`).
There is no generic repository abstraction; Prisma is the data-access layer.

### Resident module boundaries

| File | Responsibility |
| ---- | -------------- |
| `residents.schemas.ts` | Zod input/query contracts and nullable/legacy-source rules |
| `resident-utils.ts` | Name normalization, identity keys, DTO mapping, source checks |
| `resident-locking.ts` | Bounded deadlock retry, row locks, resident-number allocation |
| `residents.service.ts` | Directory, lookup, create/update, status, verification, history |
| `residents.duplicates.service.ts` | Duplicate review queue and decisions |
| `residents.corrections.service.ts` | Deceased-status correction queue and decisions |
| `residents.routes.ts` | HTTP wiring, permissions, validation, audit context |

### Household module boundaries

| File | Responsibility |
| ---- | -------------- |
| `households.schemas.ts` | Zod contracts for household, head, membership, and history operations |
| `households.service.ts` | Numbering, locking, CRUD, verification, head/status, member end/transfer, privacy DTOs |
| `households.routes.ts` | HTTP wiring, permission checks, validation, audit context |

Cross-workflow writes use service functions and Prisma transactions, not other
route handlers. Resident and household mutations write history and audit rows in
the same transaction. Sensitive reads are audited before the response is
returned. Resident status transitions call the household integration path so
memberships and heads cannot drift from resident status.

---

## 3. Request lifecycle

For a state-changing authenticated request:

1. `helmet` adds security headers.
2. CORS checks the browser origin against the configured allow-list.
3. `express.json` parses a bounded JSON body (100 kB).
4. `express-session` loads the session from the `sessions` table.
5. `loadCurrentUser` re-reads the user from the database. Role changes,
   deactivation, and lock status take effect immediately.
6. Global API rate limiter runs.
7. CSRF middleware compares `X-CSRF-Token` with the token stored in the session.
8. Route-level middleware checks authentication and permission.
9. Zod validates the body; failures return `VALIDATION_ERROR` with field issues.
10. The route/service performs the operation and writes audit records where
    required.
11. The central error handler formats known and unknown errors consistently.

Sessions are persisted in MySQL, so an API restart does not sign everyone out.
`loadCurrentUser` still causes one indexed primary-key lookup per authenticated
request; this is acceptable at barangay scale and is the safer trade-off.

---

## 4. Frontend structure

```
frontend/src/
├── api/client.ts          Fetch wrapper, CSRF state, typed ApiError
├── auth/
│   ├── AuthContext.ts     Context + useAuth hook
│   ├── AuthProvider.tsx   Session bootstrap, login, logout
│   ├── RouteGuards.tsx    ProtectedRoute, PublicOnlyRoute, RequirePermission
│   └── permissions.ts     Frontend mirror of the backend role matrix
├── components/            BrandMark, Icon, Spinner, PageLoader, ResidentPicker
├── config/navigation.ts   Permission-filtered navigation + enabled metadata
├── layouts/               DashboardLayout, Sidebar, Topbar
├── lib/format.ts          Asia/Manila date, number, greeting helpers
├── lib/resident-labels.ts Resident status/sex/source labels
├── lib/household-labels.ts Household membership/status labels
├── pages/                 Login, Dashboard, residents/*, households/*, puroks/*, NotFound
├── test/                  Vitest setup and tests
├── types/api.ts           API contract types
├── App.tsx                Routes
└── main.tsx               Entry point
```

### Frontend auth flow

1. `AuthProvider` calls `GET /api/auth/me`.
2. On success it stores the user and the refreshed CSRF token.
3. On 401 it marks the session anonymous and fetches a CSRF token for the login
   form.
4. `ProtectedRoute` redirects anonymous users to `/login`, preserving the
   attempted path.
5. `PublicOnlyRoute` sends already-authenticated users to the dashboard.
6. Login regenerates the server session and returns a **new** CSRF token; the
   client replaces the old token before any further mutation.
7. Logout destroys the session, clears the cookie, and obtains a fresh
   anonymous CSRF token.

The SPA never stores credentials or tokens in `localStorage`. The CSRF token is
held only in module memory.

### Role-aware layout

Navigation is filtered by the permission matrix, and each item carries a phase
and optional `enabled` flag:

- Dashboard, resident, household, and Purok workflows are live links.
- Unimplemented modules remain visible but disabled with a "Soon" badge.
- The Captain sees Resident Lookup, Corrections, read-only Households/Puroks,
  and no full registry or household history.
- The Secretary sees the directory, duplicate/correction queues, household
  verification/head/status actions, and Purok management.
- The Encoder sees the directory, household/member maintenance, and read-only
  Puroks.
- The Administrator sees no resident or household navigation.

The dashboard payload is built server-side per role. Administrators receive
live account/session/security counts; record-keeping roles receive live
resident and household counts; the Secretary and Captain receive the pending
correction count. Unimplemented modules stay placeholders.

---

## 5. Module boundaries

Planned modules map cleanly to new backend module folders and frontend pages:

| Module                   | Backend                        | Primary permissions                         |
| ------------------------ | ------------------------------ | ------------------------------------------- |
| Certificate requests     | `modules/certificates`         | `certificates:read/write/approve/issue`     |
| Reports and analytics    | `modules/reports`              | `reports:view`                              |
| Administration           | `modules/users`                | `users:manage`                              |
| Audit log viewer         | `modules/audit`                | `audit:read`                                |
| Controlled import        | `modules/imports`              | `import:execute`                            |

Phases 2–3 established the module pattern: Zod schemas, service tests,
permission enforcement, transactional history/audit, fail-closed sensitive
reads, canonical lock ordering, and optimistic versions. Future modules should
follow it. Cross-module writes should use service
functions rather than importing another module's route handlers.

---

## 6. API conventions

- Base path: `/api`
- JSON request and response bodies.
- Success: resource object directly (no envelope).
- Error envelope:

  ```json
  {
    "error": {
      "code": "INVALID_CREDENTIALS",
      "message": "Invalid username or password.",
      "details": []
    }
  }
  ```

- Stable machine-readable `code`; human-readable `message`.
- No stack traces or internal details in production responses.
- Validation failures return HTTP 400 with `details: [{ field, message }]`.
- Authentication failures use 401; authorization failures use 403; locked
  accounts use 423; rate limiting uses 429.

---

## 7. Key decisions and trade-offs

| Decision                              | Rationale                                                        |
| ------------------------------------- | ---------------------------------------------------------------- |
| Session auth instead of JWT           | Server-side revocation, no token storage in the browser, simpler  |
| Session store in MySQL                | Survives restarts; supports central invalidation                 |
| User reloaded per request             | Immediate effect for deactivation and role changes               |
| CSRF token in session, sent via header | Double-submit alternative is weaker; header cannot be set cross-site |
| Duplicated frontend permission matrix  | Avoids a shared build package in Phase 1; must stay in sync      |
| Dashboard composed server-side         | Prevents the SPA from guessing role capabilities                 |
| `enabled` nav flag instead of phase-only | Lets implemented modules become live without rewriting the shell |
| Duplicate approval by Secretary        | Record-keeping decision; Captain retains correction authority     |
| Captain lookup instead of full read    | Minimum necessary identity access for approvals                   |
| Transactional resident/household history/audit | Business change, history, and audit cannot diverge          |
| Optimistic versions + row locks        | Prevents silent overwrites, duplicate approvals, and membership races |
| READ COMMITTED + atomic yearly sequences | Reduces lock-conversion errors under concurrent numbering        |
| Captain household redaction            | Minimum necessary access while retaining oversight                |
| UTC storage, Asia/Manila presentation  | Correct storage; local rendering for barangay staff              |
| Separate test database                 | Tests never risk development or production records               |

The duplicated permission matrix remains the main maintainability risk. When a
third consumer appears, promote it to a shared package or generate the frontend
copy from a single source.

---

## 8. Deployment shape (recommended, not yet configured)

```
Internet
  │ HTTPS
  ▼
Reverse proxy (nginx/Caddy) ── /api ──► Node API (127.0.0.1:4000)
  │                          └─ /*  ──► static SPA build
  ▼
MySQL/MariaDB (private network, no public port)
```

- TLS terminates at the proxy; the API trusts exactly one proxy hop.
- Cookies are `Secure`, `HttpOnly`, `SameSite=Lax`.
- The SPA and API share an origin, so no cross-origin cookie configuration is
  needed in production.
- Backups, log shipping, monitoring, and secret management are deployment
  concerns that must be resolved before go-live.

No deployment artifacts are included yet. The household module adds no new
deployment components.
