# BMIS API Reference (Phases 1–3)

Base URL: `/api`
Content type: `application/json`
Authentication: session cookie (`bmis.sid`) plus `X-CSRF-Token` on mutations.

---

## 1. Conventions

### Success

Resources are returned directly, without a wrapper:

```json
{ "user": { "...": "..." }, "csrfToken": "..." }
```

### Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": [{ "field": "password", "message": "Password is required." }]
  }
}
```

| HTTP | Code                    | Meaning                                  |
| ---- | ----------------------- | ---------------------------------------- |
| 400  | `VALIDATION_ERROR`      | Zod validation failed                    |
| 400  | `INVALID_JSON`          | Malformed JSON body                      |
| 401  | `UNAUTHENTICATED`       | No valid session                         |
| 401  | `INVALID_CREDENTIALS`   | Wrong username or password               |
| 403  | `FORBIDDEN`             | Role lacks the required permission       |
| 403  | `ACCOUNT_INACTIVE`      | Account disabled                         |
| 403  | `CSRF_TOKEN_INVALID`    | Missing/expired CSRF token               |
| 403  | `CORS_ORIGIN_DENIED`    | Origin not in the allow-list             |
| 404  | `NOT_FOUND`             | Unknown API route                        |
| 404  | `RESIDENT_NOT_FOUND`    | Resident does not exist                  |
| 404  | `DUPLICATE_REVIEW_NOT_FOUND` | Duplicate review does not exist     |
| 404  | `CORRECTION_NOT_FOUND`  | Correction does not exist                |
| 404  | `PUROK_NOT_FOUND`       | Purok does not exist                     |
| 404  | `HOUSEHOLD_NOT_FOUND`   | Household does not exist                 |
| 404  | `MEMBERSHIP_NOT_FOUND`  | Household membership does not exist      |
| 409  | `POSSIBLE_DUPLICATE`    | Registration/edit matched existing residents |
| 409  | `STALE_RESIDENT`        | Resident `version` is outdated           |
| 409  | `CONCURRENT_MODIFICATION` | Locked row changed during the transaction |
| 409  | `INVALID_STATUS_TRANSITION` | Status transition is not allowed     |
| 409  | `CORRECTION_REQUIRED`   | Deceased status needs the correction workflow |
| 409  | `RESIDENT_ALREADY_VERIFIED` | Verification was already applied      |
| 409  | `DUPLICATE_REVIEW_PENDING` | A duplicate review is already pending |
| 409  | `DUPLICATE_REVIEW_NOT_REQUIRED` | No duplicate exists for that draft |
| 409  | `DUPLICATE_REVIEW_ALREADY_DECIDED` | Review is no longer pending  |
| 409  | `DUPLICATE_SELF_APPROVAL` | Requester cannot decide their own review |
| 409  | `CORRECTION_PENDING` / `CORRECTION_ALREADY_DECIDED` | Correction state conflict |
| 409  | `CORRECTION_SELF_APPROVAL` | Requester cannot approve their own correction |
| 409  | `RESIDENT_NUMBER_EXHAUSTED` | Yearly resident-number sequence exceeded |
| 409  | `PUROK_CODE_TAKEN` / `PUROK_NAME_TAKEN` | Purok code or name already exists |
| 409  | `PUROK_IN_USE`          | Active households still use the Purok    |
| 409  | `PUROK_INACTIVE`        | Purok is inactive                        |
| 409  | `STALE_PUROK`           | Purok `version` is outdated              |
| 409  | `STALE_HOUSEHOLD`       | Household `version` is outdated          |
| 409  | `HOUSEHOLD_NOT_ACTIVE`  | Household is inactive                    |
| 409  | `HOUSEHOLD_HAS_ACTIVE_MEMBERS` | Deactivation blocked by active members |
| 409  | `HOUSEHOLD_HEAD_REQUIRED` | Operation requires an assigned head    |
| 409  | `HOUSEHOLD_HEAD_NOT_MEMBER` | Selected head is not an active member |
| 409  | `HOUSEHOLD_ALREADY_VERIFIED` | Household was already verified     |
| 409  | `MEMBERSHIP_ALREADY_ENDED` | Membership is no longer active       |
| 409  | `RESIDENT_ALREADY_IN_HOUSEHOLD` | Resident already has an active membership |
| 409  | `RESIDENT_NOT_ACTIVE`   | Resident is not active                   |
| 500  | `HOUSEHOLD_NUMBER_EXHAUSTED` | Yearly household-number sequence exceeded |
| 423  | `ACCOUNT_LOCKED`        | Temporary lockout; see `retryAfterSeconds` |
| 429  | `RATE_LIMITED`          | Too many requests                        |
| 500  | `INTERNAL_ERROR`        | Unexpected server error                  |

### CSRF workflow

1. `GET /api/auth/csrf` and keep the session cookie.
2. Read `csrfToken` from the response.
3. Send it as `X-CSRF-Token` on every `POST`, `PUT`, `PATCH`, `DELETE`.
4. After login, replace the token with the new one returned by the login
   response. After logout, request a fresh token before the next login.

Example with curl:

```bash
JAR=/tmp/bmis-cookies.txt

TOKEN=$(curl -s -c "$JAR" http://localhost:4000/api/auth/csrf \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).csrfToken')

curl -s -b "$JAR" -c "$JAR" \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{"username":"secretary","password":"BmisDev!2026#"}' \
  http://localhost:4000/api/auth/login
```

---

## 2. Health

### `GET /api/health`

Public. Returns 200 when the API and database are reachable, 503 otherwise.

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-10-28T11:43:14.721Z",
  "uptimeSeconds": 2
}
```

---

## 3. Authentication

### `GET /api/auth/csrf`

Public. Creates an anonymous session if needed.

```json
{ "csrfToken": "…43-character-base64url-token…" }
```

### `POST /api/auth/login`

Public + CSRF + rate limit.

Request:

```json
{ "username": "secretary", "password": "BmisDev!2026#" }
```

Response `200`:

```json
{
  "user": {
    "id": "uuid",
    "username": "secretary",
    "email": "secretary@barangay2.local",
    "firstName": "Maria",
    "middleName": "Santos",
    "lastName": "Bautista",
    "fullName": "Maria Bautista",
    "role": "BARANGAY_SECRETARY",
    "status": "ACTIVE",
    "lastLoginAt": "2026-10-28T11:51:48.117Z"
  },
  "csrfToken": "…new-token…"
}
```

The previous CSRF token is invalid after login because the session ID is
regenerated (session-fixation protection).

Responses: `400` validation, `401` invalid credentials, `403` inactive,
`423` locked (`details.retryAfterSeconds`), `429` rate limited.

### `GET /api/auth/me`

Session required. Returns the current user and a refreshed CSRF token.

```json
{ "user": { "…": "…" }, "csrfToken": "…" }
```

Returns `401` when the session is absent, expired, or the account is no longer
active.

### `POST /api/auth/logout`

CSRF required; authentication optional (idempotent). Destroys the session,
clears the cookie, and returns `204 No Content`. Returns `403` if the CSRF token
is missing or stale.

---

## 4. Dashboard

### `GET /api/dashboard`

Session required. The payload is composed for the caller’s role.

```json
{
  "user": {
    "id": "uuid",
    "firstName": "Ana",
    "fullName": "Ana Villanueva",
    "role": "SYSTEM_ADMIN",
    "roleLabel": "System Administrator",
    "lastLoginAt": "2026-10-28T11:51:48.117Z"
  },
  "headline": "System administration overview",
  "subheadline": "Account, session, and security activity for Barangay 2 BMIS.",
  "generatedAt": "2026-10-28T11:52:03.000Z",
  "widgets": [
    {
      "id": "active-users",
      "title": "Active accounts",
      "description": "Users who can currently sign in to BMIS.",
      "value": 4,
      "tone": "info",
      "phase": 1,
      "comingSoon": false
    },
    {
      "id": "active-sessions",
      "title": "Active sessions",
      "description": "Signed-in sessions that have not expired.",
      "value": 3,
      "tone": "positive",
      "phase": 1,
      "comingSoon": false
    }
  ]
}
```

Administrators receive live counts for active accounts, active sessions, and
security events in the last 24 hours. Secretary and Encoder dashboards include
the live resident count. Secretary and Captain dashboards include the pending
correction count. Other modules remain clearly marked placeholders.

Widget `tone`: `neutral | info | positive | warning`. Widgets with
`comingSoon: true` never include a `value`.

---

## 5. Residents

All resident routes are under `/api/residents`. Mutations require CSRF. Full
profile and history reads create fail-closed audit records; directory and
lookup reads do not create one row per record.

### Resident fields

| Field | Rules |
| ----- | ----- |
| `firstName`, `lastName` | Required, 1–80 characters, letters/spaces/`.`/`-`/`'` |
| `middleName`, `suffix` | Optional; suffix is `JR`, `SR`, `II`, `III`, `IV`, or `V` |
| `birthDate` | `YYYY-MM-DD`, 1900-01-01 through today |
| `sex` | `MALE`, `FEMALE`, `NOT_RECORDED` |
| `contactNumber` | Optional PH mobile: `09XXXXXXXXX` or `+639XXXXXXXXX` |
| `residencyStatus` | `ACTIVE`, `MOVED_OUT`, `DECEASED`, `INACTIVE` |
| `recordSource` | `WALK_IN`, `FIELD_SURVEY`, `EXISTING_RECORD`, `IMPORT` |
| `sourceReference` | Optional, ≤150 characters |
| `sourceReferenceUnavailableReason` | Optional, 10–500 characters |

`EXISTING_RECORD` and `IMPORT` require either a source reference or an
unavailable-reference reason, not both. Other sources may not use the
"unavailable" reason. `NOT_RECORDED` sex is limited to the Secretary or to
legacy/imported records.

### Directory and lookup

| Method | Route | Permission | Notes |
| ------ | ----- | ---------- | ----- |
| `GET` | `/api/residents` | `residents:read` | `q`, `status`, `verificationStatus`, `sex`, `source`, `sort`, `page`, `pageSize` |
| `GET` | `/api/residents/lookup` | `residents:lookup` | `q` required, `limit` 1–20; returns minimal identity only |
| `GET` | `/api/residents/:id` | `residents:read` | Full profile; audited |
| `GET` | `/api/residents/:id/history` | `residents:read` | Paginated changes; audited |

Lookup returns only `id`, `residentNumber`, `fullName`, `birthYear`, `sex`, and
`residencyStatus`. It is the Captain's only resident route.

Directory response:

```json
{
  "items": [
    {
      "id": "uuid",
      "residentNumber": "RES-2026-000001",
      "fullName": "Juan Dela Cruz Santos",
      "birthDate": "1985-03-14",
      "sex": "MALE",
      "residencyStatus": "ACTIVE",
      "verificationStatus": "VERIFIED",
      "recordSource": "WALK_IN",
      "version": 2
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### Registration and editing

| Method | Route | Permission | Notes |
| ------ | ----- | ---------- | ----- |
| `POST` | `/api/residents` | `residents:write` | Returns `201` with full detail |
| `PATCH` | `/api/residents/:id` | `residents:write` | Requires `version`; status is not editable here |
| `PATCH` | `/api/residents/:id/status` | `residents:write` | `status`, `reason`, `version` |
| `POST` | `/api/residents/:id/verify` | `residents:verify` | `version`; Secretary only in the seeded matrix |

Registration checks identity and name/birth-date matches. A conflict returns
`409 POSSIBLE_DUPLICATE` with candidate details; the client then submits
`POST /api/residents/duplicate-reviews` with the same draft plus a `reason`.
Editing an identity field can produce the same response; `duplicateReason` is
then required to proceed.

Status changes use an allow-list. `DECEASED` is terminal for normal status
changes; reversing it requires the correction workflow. Successful writes
increment `version`, append a resident change row, and write an audit record in
the same transaction.

### Duplicate reviews

| Method | Route | Permission |
| ------ | ----- | ---------- |
| `GET` | `/api/residents/duplicate-reviews` | `residents:write` or `residents:duplicates:approve` |
| `POST` | `/api/residents/duplicate-reviews` | `residents:write` |
| `GET` | `/api/residents/duplicate-reviews/:id` | same as list; audited detail |
| `POST` | `/api/residents/duplicate-reviews/:id/approve` | `residents:duplicates:approve` |
| `POST` | `/api/residents/duplicate-reviews/:id/reject` | `residents:duplicates:approve` |
| `POST` | `/api/residents/duplicate-reviews/:id/cancel` | `residents:write`, requester only |

Only one pending review is allowed per normalized identity. Decisions require
`note` and `version`. The requester cannot approve or reject their own review;
they may cancel it. Approval creates the resident, allocates a resident number,
clears the draft and active identity key, records the decision, and rejects
other pending reviews for the same identity.

### Deceased-status corrections

| Method | Route | Permission |
| ------ | ----- | ---------- |
| `GET` | `/api/residents/corrections` | `residents:corrections:request` or `residents:corrections:approve` |
| `GET` | `/api/residents/corrections/:id` | same as list; audited detail |
| `POST` | `/api/residents/:id/corrections` | `residents:corrections:request` |
| `POST` | `/api/residents/corrections/:id/approve` | `residents:corrections:approve` |
| `POST` | `/api/residents/corrections/:id/reject` | `residents:corrections:approve` |
| `POST` | `/api/residents/corrections/:id/cancel` | `residents:corrections:request`, requester only |

Request body: `toStatus` (not `DECEASED`), `reason` (≥10), and
`evidenceReference`. Only a currently `DECEASED` resident with no pending
correction is eligible. The Captain cannot approve their own request. Approval
reverses the resident status, records `STATUS_CORRECTED` history, and writes the
audit record transactionally.

---

## 6. Puroks

Purok routes are under `/api/puroks`. There are no hard-delete routes.

| Method | Route | Permission | Notes |
| ------ | ----- | ---------- | ----- |
| `GET` | `/api/puroks` | `puroks:read` | `q`, `status`, `sort`, `page`, `pageSize` |
| `GET` | `/api/puroks/:id` | `puroks:read` | Detail with household counts |
| `POST` | `/api/puroks` | `puroks:write` | `code`, `name` |
| `PATCH` | `/api/puroks/:id` | `puroks:write` | `code`, `name`, `version`; at least one field |
| `PATCH` | `/api/puroks/:id/status` | `puroks:write` | `status`, `reason`, `version` |

Purok codes are uppercase, 2–20 characters, and unique. Names are normalized
and unique. Deactivation returns `409 PUROK_IN_USE` while active households
remain. Detail/list responses include `householdCount` and
`activeHouseholdCount`.

---

## 7. Households

Household routes are under `/api/households`. All mutations require CSRF.
Household detail and history reads are audited. There are no hard-delete routes.

### Create and edit

| Method | Route | Permission | Notes |
| ------ | ----- | ---------- | ----- |
| `POST` | `/api/households` | `households:write` | `purokId`, `addressLine`, optional `landmark`, optional `headResidentId` |
| `PATCH` | `/api/households/:id` | `households:write` | `purokId`, `addressLine`, `landmark`, and required `version` |
| `PATCH` | `/api/households/:id/status` | `households:status` | `status`, `reason`, `version` |
| `POST` | `/api/households/:id/verify` | `households:verify` | `version` |
| `PATCH` | `/api/households/:id/head` | `households:head:change` | `residentId`, `reason`, `version` |

Creation allocates an immutable `HH-YYYY-NNNNNN` number. The optional head must
be an active resident with no other active household. Household edits and
membership changes reset verification to `UNVERIFIED`.

A household cannot be deactivated while active members remain
(`HOUSEHOLD_HAS_ACTIVE_MEMBERS`). A head change requires the target resident to
be an active member (`HOUSEHOLD_HEAD_NOT_MEMBER`).

### Directory, detail, and history

| Method | Route | Permission | Notes |
| ------ | ----- | ---------- | ----- |
| `GET` | `/api/households` | `households:read` | `q`, `purokId`, `status`, `verificationStatus`, `sort`, `page`, `pageSize` |
| `GET` | `/api/households/:id` | `households:read` | Audited detail |
| `GET` | `/api/households/:id/history` | `households:read` + `households:history:read` | Audited, paginated |

Captain list/detail responses omit contact numbers, exact birth dates,
landmarks, verification details, ended memberships, and history. The household
summary includes `activeMemberCount`; detail includes the current active member
roster.

### Memberships

| Method | Route | Permission | Notes |
| ------ | ----- | ---------- | ----- |
| `POST` | `/api/households/:id/members` | `households:write` | `residentId`, optional `relationship` |
| `POST` | `/api/households/:id/members/:membershipId/end` | `households:write` | `reason`, optional `note`, membership `version` |
| `POST` | `/api/households/:id/members/:membershipId/transfer` | `households:write` | `targetHouseholdId`, optional `relationship`, `reason`, membership `version` |

End reasons are `LEFT_HOUSEHOLD`, `MOVED_OUT`, `DECEASED`, `TRANSFERRED`,
`HOUSEHOLD_DISSOLVED`, and `OTHER`; `OTHER` requires a note. Ending the head
membership clears the head. Transfer is atomic: the source membership ends with
`TRANSFERRED` and a new active membership is created in the target household.
Only one active membership per resident is possible, even under concurrent
requests.

Resident status integration:

- `INACTIVE` preserves membership and head but resets household verification.
- `MOVED_OUT` and `DECEASED` end the membership and clear the head.
- Returning to `ACTIVE` does not recreate a membership automatically.

---

## 8. Cookie and rate-limit notes

- Cookie: `bmis.sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in
  production, rolling expiry (8 hours by default).
- Login limit: 20 attempts per IP per 15 minutes.
- API limit: 600 requests per IP per 15 minutes.
- Both limiters are disabled only when `RATE_LIMIT_DISABLED=true`, which is
  rejected in production and used by the automated tests.

Certificates, reports, import, user-management, and audit-log viewer endpoints
are not implemented.
