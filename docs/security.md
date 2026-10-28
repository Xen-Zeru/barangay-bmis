# Security and Role-Based Access Control

**System:** Barangay 2 BMIS
**Phase:** 1–3 — authentication foundation, resident management, and households
**Last verification:** 2026-10-28

> Phases 1–3 provide a security foundation, controlled resident workflows, and
> household/Purok management, not a production certification. The checklist at the end of this document
> must be completed before the system handles real resident data.

---

## 1. Roles

| Role constant        | Display name                    | Primary purpose                    |
| -------------------- | ------------------------------- | ---------------------------------- |
| `SYSTEM_ADMIN`       | System Administrator            | Accounts, sessions, audit trail    |
| `BARANGAY_SECRETARY` | Barangay Secretary              | Records, certificates, reporting   |
| `BARANGAY_ENCODER`   | Barangay Encoder                | Resident/household data entry      |
| `BARANGAY_CAPTAIN`   | Barangay Captain / Approver     | Approvals and oversight            |

---

## 2. Permission matrix

The backend matrix in `backend/src/security/permissions.ts` is authoritative.
The frontend copy in `frontend/src/auth/permissions.ts` only hides or disables
UI; it is never trusted for authorization.

| Permission              | Admin | Secretary | Encoder | Captain |
| ----------------------- | :---: | :-------: | :-----: | :-----: |
| `dashboard:view`        |   Y   |     Y     |    Y    |    Y    |
| `users:manage`          |   Y   |     –     |    –    |    –    |
| `audit:read`            |   Y   |     –     |    –    |    –    |
| `residents:read`        |   –   |     Y     |    Y    |    –    |
| `residents:lookup`      |   –   |     –     |    –    |    Y    |
| `residents:write`       |   –   |     Y     |    Y    |    –    |
| `residents:verify`      |   –   |     Y     |    –    |    –    |
| `residents:duplicates:approve` | – | Y | – | – |
| `residents:corrections:request` | – | Y | – | – |
| `residents:corrections:approve` | – | – | – | Y |
| `puroks:read`           |   –   |     Y     |    Y    |    Y    |
| `puroks:write`          |   –   |     Y     |    –    |    –    |
| `households:read`       |   –   |     Y     |    Y    |    Y    |
| `households:write`      |   –   |     Y     |    Y    |    –    |
| `households:verify`     |   –   |     Y     |    –    |    –    |
| `households:head:change`|   –   |     Y     |    –    |    –    |
| `households:status`     |   –   |     Y     |    –    |    –    |
| `households:history:read`|  –   |     Y     |    Y    |    –    |
| `certificates:read`     |   –   |     Y     |    Y    |    Y    |
| `certificates:write`    |   –   |     Y     |    Y    |    –    |
| `certificates:approve`  |   –   |     –     |    –    |    Y    |
| `certificates:issue`    |   –   |     Y     |    –    |    –    |
| `reports:view`          |   Y   |     Y     |    –    |    Y    |
| `import:execute`        |   Y   |     Y     |    –    |    –    |

Deliberate separations of duty:

- **No self-approval path:** duplicate reviews and corrections cannot be
  decided by their requester.
- **Separate duplicate and correction authority:** the Secretary approves
  duplicate reviews; the Captain approves deceased-status corrections.
- **Approval ≠ issuance:** the Captain approves certificates; the Secretary
  issues them.
- **Encoders cannot import bulk data:** controlled import is limited to the
  Secretary and Administrator.
- **Administrators have no resident or household access:** they manage
  accounts and audit trails, not barangay records.
- **Captain sees minimal identity data:** lookup and read-only household views
  only, with no contact details, exact birth dates, landmarks, source
  references, or history.
- **Household verification and head/status changes remain Secretary duties;**
  the Encoder can maintain household details and memberships but cannot approve
  them.
- **Purok configuration is Secretary-only;** Encoders and the Captain may read
  the Purok list.

This matrix reflects the approved Phase 3 decisions. Formal barangay sign-off
is still required before real resident or household data is processed.

---

## 3. Authentication flow

```
1. GET  /api/auth/csrf          → creates session, returns CSRF token
2. POST /api/auth/login         → X-CSRF-Token + username + password
   ├─ rate limit (IP)
   ├─ Zod validation
   ├─ account lock check
   ├─ bcrypt verification (dummy hash for unknown users)
   ├─ active-status check
   ├─ session ID regeneration (fixation prevention)
   ├─ new CSRF token issued
   ├─ LOGIN_SUCCESS audit record
   └─ Set-Cookie: bmis.sid=...; HttpOnly; SameSite=Lax; [Secure]
3. GET  /api/auth/me            → current user + refreshed CSRF token
4. POST /api/auth/logout        → destroy session, clear cookie, LOGOUT audit
```

### Password handling

- bcrypt with cost 12 by default (`BCRYPT_ROUNDS`, allowed 4–15).
- Password hashes are never serialized to the client.
- Unknown usernames still perform a bcrypt comparison against a dummy hash to
  reduce timing-based username enumeration.
- Failed attempts increment `failedLoginAttempts`; at the configured threshold
  (`LOGIN_MAX_ATTEMPTS`, default 5) the account is locked for
  `LOGIN_LOCK_MINUTES` (default 15).
- A successful sign-in clears the counter and lock.
- Login responses use a generic `Invalid username or password.` message. An
  inactive account is only revealed after the correct password is supplied.

### Session handling

| Property          | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| Cookie name       | `bmis.sid` (configurable)                                    |
| Storage           | `sessions` table in MySQL                                    |
| TTL               | 480 minutes default, rolling                                 |
| Flags             | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production |
| ID rotation       | Regenerated on every successful login                        |
| Invalidation      | Logout deletes the row; deactivation invalidates on next request |
| Expired row purge | Every 15 minutes plus opportunistic deletion on read         |

There is no token in browser storage. The session cookie is the only credential
the browser retains.

---

## 4. CSRF protection

- A 32-byte random token is generated per session and stored server-side.
- The client receives it from `GET /api/auth/csrf` or `GET /api/auth/me`.
- Every `POST`, `PUT`, `PATCH`, and `DELETE` under `/api` requires
  `X-CSRF-Token`.
- Comparison uses `crypto.timingSafeEqual` with a length check.
- The token is rotated whenever the session ID is regenerated at login.
- The token is never placed in a cookie, so a cross-site attacker cannot read
  it through the cookie jar.
- `SameSite=Lax` adds defense in depth, but is not the primary control.

The frontend stores the token in module memory only and replaces it with the
value returned by login and `/me`.

---

## 5. Authorization enforcement

- `requireAuth` rejects missing sessions with `401 UNAUTHENTICATED`.
- `requirePermission(permission)` rejects unauthorized roles with
  `403 FORBIDDEN`.
- `loadCurrentUser` re-reads the user on every request, so a deactivated or
  deleted account loses access immediately, even with a valid session cookie.
- Dashboard content is composed server-side by role; the client cannot request
  another role’s payload.
- Resident route permissions are enforced in `residents.routes.ts`; Purok and
  household permissions are enforced in their own routers. Services re-check
  role-sensitive transitions so a route cannot accidentally bypass them.
- The Captain’s `residents:lookup` endpoint returns only minimal identity
  fields and does not grant full-profile or history access.
- Captain household list/detail responses redact contact numbers, exact birth
  dates, landmarks, verification details, ended memberships, and history.
- Household history has an additional permission, so household read access
  alone does not expose the change trail.
- The frontend permission matrix only hides UI; it is never the authorization
  boundary.

---

## 6. Audit logging

Authentication audit failures are logged to the server console but do not block
sign-in. Resident mutations use transactional audit writes: the business change,
history row, and audit row succeed or fail together. Sensitive resident reads use
a fail-closed write; if the audit row cannot be written, the payload is not
returned.

| Action group | Examples |
| ------------ | -------- |
| Authentication | `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, locked/inactive blocks, `AUTH_LOGOUT` |
| Resident writes | `RESIDENT_CREATED`, `RESIDENT_UPDATED`, `RESIDENT_STATUS_CHANGED`, `RESIDENT_VERIFIED` |
| Sensitive reads | `RESIDENT_PROFILE_VIEWED`, `RESIDENT_HISTORY_VIEWED`, duplicate/correction detail views |
| Duplicate workflow | request, approve, reject, cancel |
| Correction workflow | request, approve, reject, cancel, `RESIDENT_STATUS_CORRECTED` |
| Purok writes | `PUROK_CREATED`, `PUROK_UPDATED`, `PUROK_STATUS_CHANGED` |
| Household writes | create/update/status/verify/head change, member add/end/transfer |
| Household reads | `HOUSEHOLD_PROFILE_VIEWED`, `HOUSEHOLD_HISTORY_VIEWED` |

Recorded context: actor IDs, entity type/ID, attempted username where relevant,
reason/decision metadata, changed field names, IP address, user agent, and
timestamp. Passwords, hashes, session IDs, CSRF tokens, and full resident
payloads are never recorded.

Known limitation: the audit table is writable by a database administrator and
there is no hash chain or offsite shipping yet. That remains an accepted gap,
not a finished audit-grade control.

---

## 7. Transport, headers, and input handling

- Helmet sets standard security headers; Express fingerprinting is disabled.
- CORS is an explicit allow-list with credentials enabled. Wildcard origins are
  not supported.
- JSON bodies are limited to 100 kB.
- All request bodies are validated with Zod.
- Prisma parameterizes queries. The only raw SQL uses constant table names for yearly-number allocation; no user input is interpolated into raw SQL.
- Error responses do not leak stack traces in production.
- Rate limits: 600 requests / 15 min per IP for the API and 20 login attempts /
  15 min per IP. Account lockout adds a per-account control.
- Frontend rendering escapes text by default; no `dangerouslySetInnerHTML` is
  used.

### Rate-limiter limitation

The limiter uses in-process memory. It is adequate for a single-instance
barangay deployment. If the API is scaled horizontally or placed behind an
untrusted proxy, move to a shared store and configure `TRUST_PROXY` correctly.

---

## 8. Configuration and secrets

- `backend/src/config/env.ts` validates every variable at startup and refuses
  to boot with invalid configuration.
- Production mode rejects placeholder session secrets and disabled rate
  limiting.
- Production forces `Secure` cookies regardless of `COOKIE_SECURE`.
- `.env` and `.env.test` are gitignored; only `.env.example` files are
  committed.
- Secrets must be supplied by the deployment platform or a secret manager, not
  baked into images or documentation.

---

## 9. What Phases 1–3 do not provide

These are required before handling real resident data:

1. **MFA** for administrators and approvers.
2. **Password reset / change** flows and a documented password policy.
3. **User administration UI** (create, deactivate, role change, unlock).
4. **Audit log viewer** and retention/immutability policy.
5. **Account lifecycle** rules: expiry, periodic review, offboarding.
6. **Concurrent session policy** and remote session revocation UI.
7. **Email/SMS** infrastructure for notifications or recovery.
8. **Database encryption at rest**, field-level encryption decisions for
   sensitive resident data, and key management.
9. **Backup and disaster recovery** procedures with tested restores.
10. **Monitoring/alerting** for repeated lockouts, unusual IPs, and audit write
    failures.
11. **Dependency and container scanning**, SBOM, and a patching cadence.
12. **Independent security testing** before production.
13. **Privacy Impact Assessment**, privacy notice, consent capture, data
    subject request procedures, and NPC registration as applicable under
    RA 10173.
14. **Records retention and disposal schedule** aligned with barangay records
    management rules.
15. **Certificate, reporting, and controlled-import modules**; these remain
    outside the implemented scope.
16. **Privacy-safe duplicate adjudication guidance** for staff, including what
    constitutes acceptable evidence and how to resolve false positives.
17. **Resident correction evidence handling** (where the documentary reference
    lives, who may access it, and how long it is retained).

---

## 10. Risk register (Phases 1–3)

| Risk                                      | Impact | Likelihood | Current mitigation                          | Status       |
| ----------------------------------------- | ------ | ---------- | ------------------------------------------- | ------------ |
| Credential stuffing / brute force         | High   | Medium     | bcrypt, IP rate limit, account lockout      | Partial      |
| Session theft via XSS                     | High   | Low        | HttpOnly cookie, React escaping, CSP later  | Partial      |
| CSRF on state changes                     | High   | Low        | Session-bound token header, SameSite=Lax    | Mitigated    |
| Privilege escalation via UI only          | High   | Low        | Server-side permission checks               | Mitigated    |
| Stale permissions after role change       | Medium | Low        | User reloaded from DB each request          | Mitigated    |
| Username enumeration                      | Medium | Medium     | Generic errors, dummy bcrypt comparison      | Reduced      |
| Audit log tampering                       | High   | Medium     | Restricted DB access (operational)           | Open         |
| Lost/weak seeded password in production   | High   | High       | Seed refuses production; checklist           | Open until deploy |
| In-memory rate limit bypass across nodes  | Medium | Low        | Single-instance assumption                  | Accepted v1  |
| Lockout used to deny service to a user    | Medium | Medium     | Short lock window, admin unlock later        | Accepted v1  |
| PII in logs                               | High   | Low        | Metadata minimization, no body logging       | Mitigated    |
| False-positive duplicate approval         | High   | Medium     | Candidate review, separate approver, audit   | Reduced      |
| Duplicate created under concurrency       | High   | Low        | Row locks, identity guard, unique active key | Mitigated    |
| Deceased-status correction abuse          | High   | Medium     | Captain-only approval, evidence, no self-approval | Reduced  |
| Sensitive read without audit              | High   | Low        | Fail-closed audit write before payload       | Mitigated    |
| Stale edit overwrites newer data          | Medium | Medium     | Version checks, row locks, 409 conflict      | Mitigated    |
| Excess data exposed to Captain            | Medium | Low        | Minimal lookup/household DTOs, redaction      | Mitigated    |
| Concurrent household membership collision | High   | Low        | Unique active membership, row locks, versions | Mitigated   |
| Duplicate household number allocation     | High   | Low        | Atomic yearly sequence, retry isolation       | Mitigated   |
| Household verification bypass             | Medium | Low        | Secretary-only permission, reset on mutation  | Mitigated   |

---

## 11. Production checklist

- [ ] HTTPS everywhere; HTTP redirects to HTTPS
- [ ] `NODE_ENV=production`, strong unique `SESSION_SECRET`
- [ ] `TRUST_PROXY` configured correctly for exactly one proxy hop
- [ ] `CORS_ORIGIN` restricted to the real frontend origin
- [ ] Dedicated least-privilege database account; no `root`
- [ ] Database not exposed to the public internet
- [ ] Seeded demo accounts removed or passwords rotated
- [ ] Synthetic resident records removed
- [ ] Default seed password no longer valid
- [ ] Resident and household retention policy approved
- [ ] Correction-evidence handling policy approved
- [ ] Official Purok names/codes loaded and verified
- [ ] Staff trained on duplicate review, correction evidence, and household rules
- [ ] Backups configured and restore-tested
- [ ] Audit retention and access policy approved
- [ ] Log monitoring and alerting enabled
- [ ] Dependency and OS patching process defined
- [ ] Privacy Impact Assessment completed
- [ ] Privacy notice displayed; consent process defined for resident data
- [ ] MFA and password reset implemented
- [ ] Penetration test or independent security review completed
- [ ] Incident response contact and escalation path documented
