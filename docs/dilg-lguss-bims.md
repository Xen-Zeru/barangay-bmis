# DILG LGUSS-BIMS Compatibility Strategy

**Status:** Planning only — no integration code exists
**Constraint:** No official DILG LGUSS-BIMS integration API has been assumed,
verified, or provided.

---

## 1. Position

Barangay 2 BMIS is the barangay’s system of record for daily operations. DILG
LGUSS-BIMS is treated as an **external reporting destination** whose interface
is currently unknown. The implemented system therefore makes no assumption
about:

- the existence, shape, or stability of an official API;
- authentication or authorization mechanisms;
- supported file formats or field names;
- submission frequency or deadlines;
- identifier requirements;
- legal basis or data-sharing terms.

No scraping, reverse engineering, credential sharing, or unattended submission
will be implemented. Any future integration must be based on a published
specification or a written arrangement with DILG or the City LGU.

---

## 2. Design principles

1. **No hard dependency.** BMIS must remain fully usable if no DILG interface
   exists. Integration is optional and isolated.
2. **Canonical internal model.** Store barangay data in a clean internal schema.
   Map to external formats through versioned adapters; do not reshape core
   tables around an unverified external schema.
3. **File-first interoperability.** Support versioned CSV/XLSX exports and
   controlled imports, which are the most likely short-term compatibility path.
4. **Human in the loop.** A responsible officer reviews every export or
   submission. Nothing is transmitted automatically.
5. **Traceability.** Every export is reproducible, recorded, and tied to the
   data snapshot and mapping profile used.
6. **Data minimization.** Export only the fields required by an approved
   report; avoid unnecessary PII.
7. **Version everything.** Mapping profiles and templates are versioned and
   retained so historical reports can be regenerated.

---

## 3. Compatibility layers (planned)

```
┌─────────────────────────────────────────────┐
│ Canonical BMIS data (residents, households, │
│ certificates, puroks, reference data)       │
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────▼─────────┐
         │ Mapping profile   │  versioned, reviewed, tested
         │ (field + transform)│
         └─────────┬─────────┘
                   │
      ┌────────────┼─────────────┐
      ▼            ▼             ▼
  CSV export   XLSX export   Future API adapter
  (manual)     (manual)      (only if specified)
```

### 3.1 Export adapters

- Generate CSV/XLSX from a frozen query snapshot.
- Use a versioned mapping profile per report type and template revision.
- Produce a validation report before download: missing required values,
  invalid codes, duplicate identifiers, and out-of-range dates.
- Record: export ID, actor, timestamp, reporting period, row count, profile
  version, and checksum.
- Allow regeneration of the same snapshot for audit purposes.

### 3.2 Import adapters

- Provide downloadable templates with locked headers and a reference sheet.
- Run a **dry-run** validation before committing any row.
- Report row-level errors with source file, row number, field, and reason.
- Require explicit confirmation; imports are transactional or fully rolled
  back.
- Record provenance (file name, checksum, uploader, batch ID, outcome).
- Guard against CSV formula injection, oversized files, malformed encodings,
  and duplicate submissions.

### 3.3 Future API adapter (not built)

If DILG publishes an API, implement it behind an interface that isolates:

- base URL, environment, and version;
- authentication and secret storage;
- payload mapping and validation;
- retry, idempotency, and reconciliation;
- submission records and error handling;
- feature flag to disable the integration instantly.

Proposed conceptual contract (documentation only):

```ts
interface ExternalReportAdapter {
  readonly name: string;
  readonly version: string;
  validate(snapshot: ReportSnapshot): Promise<ValidationReport>;
  export(snapshot: ReportSnapshot): Promise<ExportArtifact>;
  submit?(artifact: ExportArtifact): Promise<SubmissionResult>;
}
```

`submit` is optional precisely because an official submission channel may not
exist. Phases 1–3 implement none of this.

---

## 4. Data dictionary readiness

Before mapping anything, confirm with DILG/City LGU and the barangay:

| Topic                     | Needed decision                                          |
| ------------------------- | -------------------------------------------------------- |
| Barangay identifier       | Official PSGC code and exact registered name             |
| Geographic hierarchy      | City, barangay, purok naming and codes                   |
| Household identifier      | Format, uniqueness scope, renumbering rules              |
| Resident identifier       | Whether PhilSys or another identifier is required/allowed |
| Name conventions          | Order, suffixes, maiden names, aliases                   |
| Address format            | Required components and free-text rules                  |
| Demographics              | Sex/gender, civil status, citizenship, occupation codes  |
| Certificates              | Types, purposes, fees, signatories, control numbers      |
| Reporting periods         | Monthly/quarterly/annual deadlines and cutoffs           |
| File format               | CSV vs XLSX, encoding, delimiter, header rules           |
| Validation rules          | Required fields, code lists, date/number formats         |
| Submission channel        | Portal upload, email, physical media, or API             |
| Data-sharing terms        | Legal basis, retention, confidentiality, breach notice   |

These answers directly affect the remaining schema. Phases 2–3 now provide the
canonical resident core and household/Purok structure, but official Purok names
and codes, address standards, and external identifier decisions still need
confirmation before export mapping. Guessing now would create costly migrations
later.

---

## 5. Privacy and security

DILG-bound exports may contain personal data. Before enabling them:

- Confirm the legal basis and any data-sharing agreement.
- Complete a Privacy Impact Assessment and update the privacy notice.
- Apply least-privilege access to export functions (`reports:view`,
  `import:execute`, and future export permissions).
- Encrypt files at rest and in transit; avoid emailing unencrypted exports.
- Set short retention for generated files and record deletions.
- Do not log export contents or PII.
- Require officer confirmation and record who exported what and when.
- Provide a way to correct or withdraw data if required.

---

## 6. Phased roadmap

| Phase | Scope                                             | DILG relevance                     |
| ----- | ------------------------------------------------- | ---------------------------------- |
| 1     | Auth, RBAC, audit, dashboard shell                | None — foundation only             |
| 2     | Resident records, duplicate review, corrections   | Canonical person data established  |
| 3     | Households, puroks, addresses                     | Geographic/household mapping ready; official Purok labels pending |
| 4     | Certificate requests, approval, issuance          | Certificate register becomes source|
| 5     | Reports, analytics, controlled import/export      | First file-based compatibility     |
| 6     | Integration (only if an official contract exists) | API or mandated file submission    |

The integration phase is not approved and may never be needed. A file-based
export in the reporting phase may satisfy the barangay’s actual reporting
obligations.

---

## 7. Coordination checklist

- [ ] Ask DILG Region VI / Provincial Office whether LGUSS-BIMS exposes an API
      or prescribed file templates.
- [ ] Ask the Sipalay City LGU for the current reporting workflow and contacts.
- [ ] Obtain official templates, code lists, and version history in writing.
- [ ] Confirm the barangay’s PSGC code and official name spelling.
- [ ] Clarify who is authorized to submit and retain reports.
- [ ] Obtain or confirm the data-sharing/confidentiality terms.
- [ ] Identify a test environment or sample data (never real PII).
- [ ] Record the supported template/API version in the mapping profile.
- [ ] Define a fallback if the external system is unavailable at a deadline.

Until these are answered, BMIS will not claim DILG compatibility beyond
“export-ready design”.
