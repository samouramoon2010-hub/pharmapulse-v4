# DX-10 — Export Studio Closure

## Scope completed

Export Studio implemented as a separate subsystem from Data Exchange (Import) Studio. 4 of 6 catalog templates are available and fully wired end-to-end (data selection → dataset builder → workbook/CSV → validation → download → audit). 2 templates (Pharmacist Performance, Evaluation Results) are explicitly marked unavailable with a documented blocker rather than shipped with guessed logic.

## Templates delivered

| Template | Status |
|---|---|
| Executive Performance Workbook | Available — XLSX |
| Branch Performance Workbook | Available — XLSX, CSV |
| KPI Performance Workbook | Available — XLSX, CSV (scoped to one KPI) |
| Import Audit Workbook | Available — XLSX, CSV (admin-only, job-level) |
| Pharmacist Performance Workbook | **Not available** — blocked on evaluation ledger/ranking engine integration |
| Evaluation Results Workbook | **Not available** — blocked on evaluation pipeline/profile resolver integration |

## Workbook architecture

Cover sheet (title, scope, period, generated-at/by, workbook version, confidentiality classification) → analytical sheets → optional Raw Data → Definitions. Autofilter and column widths applied to every data sheet (the genuinely-supported SheetJS CE features, verified during DX-8). Number/percentage/currency cell formats applied per column based on declared unit. No frozen panes, no data-validation dropdowns, no macros, no formulas, no external links — none claimed.

## Metric correctness safeguards

- Built on `generateBranchSummary()`/`generateExecutiveReport()` — the registry-aware engine, never `ReportsPage.jsx` (the location of the documented "first-branch fallback" and "mixed-unit sum" bugs in `docs/deferred/REPORTS_CORRECTNESS_AUDIT.md`).
- Every numeric export column carries an explicit `unit`. KPI Performance Workbook is scoped to exactly one KPI by design — structurally impossible to mix units.
- Executive Performance's KPI Analysis sheet aggregates `totalActual`/`totalTarget` **within one KPI only**, one row per KPI — verified by a dedicated test asserting no duplicate KPI rows and a non-empty unit on every row.
- Gap (Actual − Target) is `null`, never a false zero, when no target exists — verified by test.
- CLAIMED-pharmacist exclusion and archived-KPI exclusion are inherited from the upstream engines (`generateBranchSummary`'s registry-driven KPI selection, the existing CLAIMED-exclusion boundary) — Export Studio adds no new identity-resolution logic that could regress them.

## CSV support

UTF-8 with BOM (Arabic-safe in Excel), deterministic column order (`sheet.columns`, never object key enumeration), proper quoting/escaping of commas/quotes/newlines, null renders as an empty cell never the string `"null"`. Verified by 6 focused tests.

## PDF status

**Not implemented. Explicitly disabled.** No PDF library or generator exists anywhere in this codebase (confirmed: no PDF dependency in `package.json`, no PDF-related source files). The UI never offers a PDF option that doesn't work — PDF is absent from the format selector entirely for every template.

## UI

`src/pages/admin/ExportStudioPage.jsx`, routed at `/export-studio` (Admin-only), linked from the sidebar's Data Architecture group. Template/scope/month/branch/KPI/format selectors shown conditionally per template's declared selector requirements. Preview Summary, validation-failure messaging, generate/download action, and a Recent Exports history table (Admin-only).

## Audit/history

Reuses `audit_logs` via `logAction()` — `AUDIT_ACTION.EXPORT` added as a one-line constant (mirroring the existing `IMPORT` entry). **No new Firestore collection.** No workbook contents or raw row data ever persisted — only the metadata fields specified in the task (template, actor, role, scope, format, timestamp, row count, workbook version, status, failure category, file name).

## Security

- No Firestore rule was touched. No rule change of any kind.
- Route-level Admin gate on `/export-studio`; Import Audit additionally catalog-gated to admin.
- All branch/pharmacist data flows through the existing `scopeResolver.filterAllowedPharmacies()` — no new scope logic, no broadened access.
- No raw exception text, stack trace, or internal document ID is ever shown to the user — validation issues are plain-English sentences.
- `recordExportAudit()`'s `actorUid`/`actorRole` come from the authenticated `userProfile`, not user-controlled input — not spoofable from the export selection form.
- **No security issue found.**

## Performance

`EXPORT_LIMITS` (`exportLimits.ts`): 2,000 rows/sheet, 8,000 rows/workbook — the same order of magnitude as the proven DX6/DX7 Actuals ceiling, since Export Studio reads already-aggregated per-branch/per-KPI summaries, not raw row-by-row data. Validation blocks (not silently truncates) any export that would exceed these limits, with a clear message naming the limit. No streaming or enterprise-scale claim is made.

## Files changed

New: `src/services/export/{exportTypes,exportLimits,exportTemplateRegistry,exportStyling,exportValidation,workbookBuilder,exportDownloadService,csvExportService,exportAuditService}.ts`, `src/services/export/datasetBuilders/{branchPerformanceDataset,kpiPerformanceDataset,executivePerformanceDataset,importAuditDataset}.ts`, `src/pages/admin/ExportStudioPage.jsx`, 9 corresponding `.test.ts` files, 6 docs under `docs/export/`.
Modified: `src/App.jsx` (route + import), `src/components/layout/Sidebar.jsx` (nav entry), `src/services/auditService.js` + `.d.ts` (one-line `EXPORT` action constant).

## Tests

- Focused DX-10 tests: **52/52** passing across 9 files (template registry, 4 dataset builders, workbook builder, validation, CSV, audit service).
- Full Data Exchange regression: unaffected — no Data Exchange file was modified except the read-only reuse of `listRecentImportJobs()`.
- Full-suite count: **24,911/24,911** passing across **328** files.

## TypeScript

Baseline: 2,127. Final: 2,127. **Delta: 0. Zero new TypeScript errors confirmed**, and confirmed zero errors in any file touched by this bundle.

## Build result

`vite build` — passed.

## Firestore changes

**None.** No rules changed, no indexes changed, no new collections, no migrations.

## Documentation created

`EXPORT_STUDIO_ARCHITECTURE_V1.md`, `EXPORT_TEMPLATE_CATALOG.md`, `EXPORT_METRIC_DEFINITIONS.md`, `EXPORT_USER_GUIDE.md`, `EXPORT_ADMIN_RUNBOOK.md`, this closure document.

## Known limitations

- Pharmacist Performance and Evaluation Results templates are not available — documented blockers, not silent gaps.
- No native Excel charts — chart-ready summary tables only (SheetJS CE writer limitation, same as DX-8).
- No PDF export of any kind.
- Import Audit Workbook is job-level only, no per-row error-category breakdown.
- `/export-studio` route is Admin-only even though the catalog declares broader `supportedRoles` for future use.
- Performance limits (2,000/8,000 rows) are derived from the same order of magnitude as DX6/DX7's proven ceiling, not independently load-tested in this bundle.

## Final decision

**EXPORT STUDIO FORMALLY CLOSED**
