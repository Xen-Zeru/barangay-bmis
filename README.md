# Barangay 2 Management Information System (BMIS)

Secure, role-based barangay information system for **Barangay 2, Sipalay City,
Negros Occidental, Philippines**.

> **Status: Phase 3 complete.** Authentication, authorization, audit logging,
> the role-aware application shell, resident management, households, and Puroks
> are implemented. Certificates, reports, controlled import, and DILG
> integration are intentionally **not** implemented yet.

---

## 1. What is implemented

### Phase 1 — security foundation

- Session-based authentication with database-backed sessions
- CSRF protection for all state-changing requests
- Account lockout after repeated failed sign-ins
- Role-based access control for four barangay roles
- Audit trail for sign-in, sign-out, failed, inactive, and locked attempts
- Role-aware dashboard with live administration counts
- Responsive React login page and application shell
- MySQL/MariaDB schema managed by Prisma migrations
- Synthetic development accounts

### Phase 2 — resident management

- Resident directory with search, filters, sorting, and pagination
- Audited full profiles, change history, and Captain-friendly lookup
- Walk-in/field-survey registration and optimistic-concurrency editing
- Secretary verification, status changes, and deceased-status access control
- Resident-number allocation in `RES-YYYY-NNNNNN` format
- Duplicate review queue with exact/broad candidate matching, row locking,
  separate approval, and no self-approval
- Deceased-status correction workflow with Captain approval, evidence
  reference, and separation of duties
- Live Phase 2 dashboard widgets and role-aware navigation
- Automated backend and frontend tests

### Phase 3 — households and Puroks

- Purok registry with active/inactive safeguards and optimistic editing
- Household registry with immutable `HH-YYYY-NNNNNN` numbers
- Household heads, member add/end, and atomic transfers
- Membership history preserved instead of hard deletion
- Secretary verification and controlled head/status changes
- Captain read-only household views with sensitive fields redacted
- Resident profile household card and live Phase 3 dashboard widgets
- Household/Purok frontend pages, navigation, and permission-aware actions
- Concurrency tests for numbering, head changes, transfers, and resident status
  transitions

**Not yet implemented:** certificate requests, reports, Excel/CSV import, user
administration screens, or a DILG integration.

---

## 2. Technology stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS 4             |
| Routing    | React Router 7                                         |
| Backend    | Node.js, Express 5, TypeScript                         |
| Database   | MySQL 8 / MariaDB 10.11+                               |
| ORM        | Prisma 6                                               |
| Validation | Zod 4                                                  |
| Auth       | `express-session` + Prisma session store, bcryptjs     |
| Security   | Helmet, CORS allow-list, CSRF token, rate limiting     |
| Tests      | Vitest, Supertest, Testing Library                     |
| Linting    | Oxlint                                                 |

---

## 3. Repository layout

```
barangay-bmis/
├── backend/            Express API, Prisma schema, migrations, tests
├── frontend/           React SPA (login, dashboard, residents, households, Puroks)
├── docs/               Architecture, database, security, API, phase plan
├── package.json        Root convenience scripts
└── README.md
```

See [`docs/architecture.md`](docs/architecture.md) for the full structure.

---

## 4. Prerequisites

- Node.js **22 or newer** (developed and verified on Node 26)
- npm **10 or newer**
- MySQL **8** or MariaDB **10.11+**
- A database user that can create/alter tables in the application database and
  in an isolated test database
- `openssl` for generating secrets (recommended)

MariaDB is used for local development in this workspace; the schema avoids
engine-specific features so MySQL 8 is also supported.

---

## 5. First-time setup

### 5.1 Install dependencies

From the repository root:

```bash
npm run install:all
```

The backend `postinstall` runs `prisma generate`. If your network blocks the
Prisma engine host, see [Troubleshooting](#10-troubleshooting).

### 5.2 Create databases

```sql
CREATE DATABASE bmis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE bmis_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Use the names configured in your `DATABASE_URL` values; the examples use
`bmis` and `bmis_test`. For a real deployment use a dedicated, least-privilege
account instead of `root`, and do not reuse the development database for tests.

### 5.3 Configure environment variables

```bash
cp backend/.env.example backend/.env
cp backend/.env.test.example backend/.env.test
cp frontend/.env.example frontend/.env
```

Edit `backend/.env`:

- Set `DATABASE_URL` to your database.
- Replace `SESSION_SECRET` with a unique value:
  `openssl rand -base64 48`
- Keep `COOKIE_SECURE=false` only for local HTTP development. It is forced to
  `true` automatically when `NODE_ENV=production`.

Edit `backend/.env.test` with the **test** database URL. Test runs refuse to
start unless the database name ends in `_test`.

### 5.4 Apply migrations and seed development data

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` refuses to run when `NODE_ENV=production`.

### 5.5 Run the application

Terminal 1:

```bash
npm run dev:backend     # http://localhost:4000
```

Terminal 2:

```bash
npm run dev:frontend    # http://localhost:5173
```

The Vite dev server proxies `/api` to the backend, so the browser sees a single
origin and the session cookie works without CORS complications.

Open <http://localhost:5173>.

---

## 6. Synthetic development accounts

All seeded accounts use the password stored in `SEED_DEFAULT_PASSWORD`
(default in `.env.example`: `BmisDev!2026#`).

| Username           | Role                | Status   | Purpose                       |
| ------------------ | ------------------- | -------- | ----------------------------- |
| `sysadmin`         | System Administrator| Active   | Administration and audit      |
| `secretary`        | Barangay Secretary  | Active   | Records and certificates      |
| `encoder`          | Barangay Encoder    | Active   | Data entry                    |
| `captain`          | Barangay Captain    | Active   | Approvals and oversight       |
| `inactive.encoder` | Barangay Encoder    | Inactive | Verifies disabled-account UX  |

> These are **synthetic development accounts**, not real personnel data.
> Seeded accounts share one password for convenience. Do not use this seed
> script, or these credentials, in production. The system does not yet include
> a password-change or account-provisioning UI; that is required before go-live.
> `db:seed` also creates six synthetic resident records, four synthetic Puroks,
> and three synthetic households for local testing.

---

## 7. Commands

### Root

| Command                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm run install:all`  | Install backend and frontend dependencies      |
| `npm run dev:backend`  | Start API with watch mode                      |
| `npm run dev:frontend` | Start Vite dev server                          |
| `npm run generate`     | Generate Prisma client                         |
| `npm run db:migrate`   | Apply committed migrations                     |
| `npm run db:seed`      | Upsert synthetic accounts, residents, households, and Puroks |
| `npm run lint`         | Lint backend and frontend                      |
| `npm run typecheck`    | Type-check both packages                       |
| `npm run test`         | Run backend then frontend test suites          |
| `npm run build`        | Production build for API and SPA               |
| `npm run verify`       | Lint + typecheck + tests + build (release gate)|

### Backend

| Command                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | `tsx watch src/server.ts`                      |
| `npm run build`        | Generate Prisma client and compile to `dist/`  |
| `npm run start`        | Run compiled API                               |
| `npm run test`         | Vitest + Supertest against `*_test` database   |
| `npm run db:push`      | Push schema without a migration (local only)   |
| `npm run db:reset`     | Destructive reset + seed (local only)          |

### Frontend

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run dev`       | Vite dev server                  |
| `npm run build`     | Type-check and production bundle |
| `npm run test`      | Vitest + Testing Library         |
| `npm run typecheck` | `tsc -b`                         |

---

## 8. API summary

All API routes are under `/api`. State-changing requests require the
`X-CSRF-Token` header obtained from `GET /api/auth/csrf`.

| Method | Route              | Auth        | Purpose                              |
| ------ | ------------------ | ----------- | ------------------------------------ |
| GET    | `/api/health`      | Public      | Liveness + database check             |
| GET    | `/api/auth/csrf`   | Public      | Issue/read session CSRF token         |
| POST   | `/api/auth/login`  | Public      | Sign in (rate-limited)                |
| POST   | `/api/auth/logout` | CSRF        | Destroy session                       |
| GET    | `/api/auth/me`     | Session     | Current user + refreshed CSRF token   |
| GET    | `/api/dashboard`   | Session     | Role-aware dashboard payload          |
| GET    | `/api/residents`   | `residents:read` | Directory search/filter/pagination |
| POST   | `/api/residents`   | `residents:write` | Register a resident             |
| GET    | `/api/residents/:id` | `residents:read` | Audited full profile          |
| PATCH  | `/api/residents/:id` | `residents:write` | Optimistic-concurrency edit  |
| PATCH  | `/api/residents/:id/status` | `residents:write` | Status change     |
| POST   | `/api/residents/:id/verify` | `residents:verify` | Verify a record  |
| GET    | `/api/residents/:id/history` | `residents:read` | Audited history  |
| GET    | `/api/residents/lookup` | `residents:lookup` | Captain lookup |
| GET/POST | `/api/residents/duplicate-reviews` | auth / `residents:write` | Review queue |
| GET    | `/api/residents/duplicate-reviews/:id` | auth | Audited review detail |
| POST   | `/api/residents/duplicate-reviews/:id/approve` | `residents:duplicates:approve` | Approve |
| POST   | `/api/residents/duplicate-reviews/:id/reject` | `residents:duplicates:approve` | Reject |
| POST   | `/api/residents/duplicate-reviews/:id/cancel` | `residents:write` | Cancel own request |
| GET    | `/api/residents/corrections` | auth | Correction queue |
| GET    | `/api/residents/corrections/:id` | auth | Audited correction detail |
| POST   | `/api/residents/:id/corrections` | `residents:corrections:request` | Request correction |
| POST   | `/api/residents/corrections/:id/approve` | `residents:corrections:approve` | Captain approve |
| POST   | `/api/residents/corrections/:id/reject` | `residents:corrections:approve` | Captain reject |
| POST   | `/api/residents/corrections/:id/cancel` | `residents:corrections:request` | Cancel request |
| GET    | `/api/puroks` | `puroks:read` | Purok directory |
| GET    | `/api/puroks/:id` | `puroks:read` | Purok detail |
| POST   | `/api/puroks` | `puroks:write` | Create a Purok |
| PATCH  | `/api/puroks/:id` | `puroks:write` | Edit a Purok |
| PATCH  | `/api/puroks/:id/status` | `puroks:write` | Activate/deactivate |
| GET    | `/api/households` | `households:read` | Household directory |
| GET    | `/api/households/:id` | `households:read` | Household detail |
| GET    | `/api/households/:id/history` | `households:history:read` | Household history |
| POST   | `/api/households` | `households:write` | Create a household |
| PATCH  | `/api/households/:id` | `households:write` | Edit household details |
| PATCH  | `/api/households/:id/status` | `households:status` | Activate/deactivate |
| POST   | `/api/households/:id/verify` | `households:verify` | Verify a household |
| PATCH  | `/api/households/:id/head` | `households:head:change` | Change head |
| POST   | `/api/households/:id/members` | `households:write` | Add a member |
| POST   | `/api/households/:id/members/:membershipId/end` | `households:write` | End membership |
| POST   | `/api/households/:id/members/:membershipId/transfer` | `households:write` | Transfer member |

Full request/response examples: [`docs/api.md`](docs/api.md).

---

## 9. Testing

Backend tests run against the database in `backend/.env.test`. The global test
setup applies migrations before the suite and each test resets its own data.
The suite refuses to run if the URL does not contain a `_test` database name.

```bash
npm run test
```

Current coverage:

- **Backend:** 66 tests across authentication, CSRF, lockout, session
  invalidation, RBAC, dashboard payloads, audit records, health, the Prisma
  session store, resident lifecycle, duplicate review, corrections,
  resident/household numbering, Puroks, households, and concurrency controls.
- **Frontend:** 25 tests across role-aware navigation, login validation and
  errors, route guards, dashboard rendering/error states, resident directory,
  household/Purok pages, and duplicate-review self-approval controls.

`npm run verify` runs lint, type-check, both test suites, and both production
builds in sequence.

---

## 10. Troubleshooting

### Prisma engine download is slow or blocked

`prisma generate` downloads platform engines from `binaries.prisma.sh` on first
use. Allow access to that host, or pre-seed `node_modules/@prisma/engines`.
On this workspace the engines for `debian-openssl-3.0.x` were downloaded
manually because the initial install exceeded the shell timeout; a normal
developer machine should not need this.

### MySQL access denied

Create a dedicated user and grant it rights on both databases:

```sql
CREATE USER 'bmis_user'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON bmis.* TO 'bmis_user'@'localhost';
GRANT ALL PRIVILEGES ON bmis_test.* TO 'bmis_user'@'localhost';
FLUSH PRIVILEGES;
```

### Login returns 403 `CSRF_TOKEN_INVALID`

The browser must first call `GET /api/auth/csrf` and send the returned value in
`X-CSRF-Token`. The provided frontend client does this automatically. A stale
tab after a backend restart will recover on refresh.

### Cookie is not set in production

Production forces `Secure` cookies. The application must be served over HTTPS
through a trusted reverse proxy, and `TRUST_PROXY=true` must be set when the
proxy terminates TLS.

---

## 11. Security and compliance

Phases 1–3 implement secure session authentication, CSRF protection,
role-based authorization, account lockout, rate limiting, security headers,
input validation, authentication audit logging, and transactional
resident/household audit and history records. The system is **not production-ready**
until the production checklist and remaining gaps in
[`docs/security.md`](docs/security.md) are resolved, including MFA/password
reset, deployment hardening, backups, retention policy, and a Privacy Impact
Assessment under the Data Privacy Act of 2012 (RA 10173).

---

## 12. DILG LGUSS-BIMS compatibility

No official DILG integration API has been assumed. The system contains **no
DILG integration code**. Phases 2–3 establish the canonical resident and
household data model;
the compatibility strategy is documented in
[`docs/dilg-lguss-bims.md`](docs/dilg-lguss-bims.md): versioned file-based
export/import adapters, a canonical barangay data dictionary, validation,
human review, and formal coordination with DILG/City LGU before any integration
is built.

---

## 13. Documentation index

- [Architecture](docs/architecture.md)
- [Database and Prisma](docs/database.md)
- [Security and RBAC](docs/security.md)
- [API reference](docs/api.md)
- [Phase 1 plan and acceptance](docs/phase-1.md)
- [Phase 2 plan and acceptance](docs/phase-2.md)
- [Phase 3 plan and acceptance](docs/phase-3.md)
- [DILG LGUSS-BIMS compatibility](docs/dilg-lguss-bims.md)
