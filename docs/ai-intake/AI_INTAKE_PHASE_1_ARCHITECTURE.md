# Universal AI Intake — Phase 1 Architecture

## Core decision: no new backend

The spec's "secure backend service with validation, authorization,
preview, explicit confirmation, and audit logging" requirement is
satisfied by **reusing the existing Data Exchange Studio import
pipeline** (`src/services/dataExchange/`) rather than building
Firebase Cloud Functions from scratch.

**Why:** this repo has no Cloud Functions infrastructure at all (no
`functions/` directory, no `firebase-functions` dependency). Every
existing "secure write" in the app — KPI Registry, Data Exchange
Studio, evaluation engine — already uses the same pattern: Firestore
security rules enforce admin-only + ownership at the database layer,
each import adapter re-asserts authorization in code (defense in
depth), and every write is audit-logged via `auditService.logAction()`.
Introducing Cloud Functions for this one feature would be inconsistent
with the rest of the codebase and out of scope for "no production
deployment." This was confirmed with the project owner before
implementation began.

## An "AI Intake session" is an ImportJob

There is no parallel Firestore collection. An intake session **is**
an `ImportJob` document (`import_jobs/{jobId}` + `import_jobs/{jobId}/rows`
staging subcollection) — the same model Data Exchange Studio already
uses. `src/services/dataExchange/intakeSessionTypes.ts` adds a small
set of additive, optional fields (`intakeSourceType`,
`intakeSourceFileName`, `intakeDetectionConfidence`, `approvedAt`,
`executedAt`, etc.) onto the existing `ImportJob` type, following the
same convention as `previewSignature`/`retryCount` added in earlier
Data Exchange phases.

## Request flow

```
Upload/Paste → detectEntityType() → adapter.parseRow() → runValidation()
  → Preview (row-level classification) → user approval
  → commitJob() → executed ImportJob
```

Every step above the "user approval" line only ever reads. No
`writeBatch`/`setDoc`/`addDoc` call happens before the user explicitly
clicks Approve (or types `APPROVE IMPORT` for imports above 50 rows).

## Per-domain adapter registry

`src/services/dataExchange/intakeDomainRegistry.ts` maps each of the 8
supported entity types to its adapter factory and the existing
Firestore reference-data loaders:

| Domain | Adapter | Reference-data source |
|---|---|---|
| Regions | `regionsAdapter.ts` (new) | new `regions` full-record read |
| Groups | `groupsAdapter.ts` (existing) | `fetchExistingOnboardingData()` |
| Pharmacies | `branchesAdapter.ts` (existing) | `fetchExistingOnboardingData()` |
| Users | `pharmacistsAdapter.ts` (existing) | `fetchExistingOnboardingData()` |
| Assignments | `assignmentsAdapter.ts` (existing) | `fetchExistingOnboardingData()` |
| KPI Definitions | `kpiRegistryDraftOnlyAdapter.ts` (new wrapper) | `fetchKpiRegistryOnce()` |
| KPI Targets | `branchTargetsAdapter.ts` / `pharmacistTargetsAdapter.ts` (existing) | onboarding data + registry |
| KPI Actuals | `branchActualsAdapter.ts` / `pharmacistActualsAdapter.ts` (existing) | onboarding data + registry |

Only **Regions** is a genuinely new adapter this phase — the other 7
domains already existed in Data Exchange Studio and are reused as-is.

## Parsers

- **Excel/CSV**: the existing `xlsx` library (already a dependency),
  same as Data Exchange Studio.
- **Plain text**: new `textIntakeParser.ts` — JSON array, tab-separated,
  comma-separated, or `key: value` blocks, converted into the same raw
  row shape Excel/CSV parsing already produces so every adapter
  consumes it unmodified.
- **PDF**: new `pdfIntakeParser.ts` using `pdfjs-dist` (new dependency)
  for text-layer extraction only — not OCR. A PDF with no extractable
  text returns the exact required message
  `"This PDF requires image extraction or OCR review"`.
- **Images**: new `imageIntakeAdapter.ts` defines the provider interface
  only; no provider is registered in Phase 1, so every image resolves
  to a controlled `NO_PROVIDER_CONFIGURED` state. See
  `AI_INTAKE_PHASE_1_LIMITATIONS.md`.

## Auto-detection

`entityDetection.ts` scores a parsed header row against every domain's
existing `HEADER_ALIASES` (already centralized in `headerResolution.ts`)
using the same exact-alias matcher every adapter's `resolveColumns()`
already uses — no new fuzzy-matching algorithm.

## Route and permissions

`/ai-intake`, admin-only (`<PR roles={ADMIN}>`), same pattern as
`/data-exchange` and `/admin/kpis`. See
`AI_INTAKE_PHASE_1_SECURITY.md` for the full permission model.
