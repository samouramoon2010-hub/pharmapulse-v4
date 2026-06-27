# Export Studio — Architecture V1 (DX-10)

Status: **Implemented and closed for the initial 4-template catalog.** Pharmacist Performance and Evaluation Results are explicitly unavailable — see Known Limitations.

## Relationship to Data Exchange (Import) Studio

Export Studio is a **separate subsystem** living entirely under `src/services/export/` and `src/pages/admin/ExportStudioPage.jsx`. It shares no code with `src/services/dataExchange/` except by deliberate, narrow reuse:

- `listRecentImportJobs()` (Import Audit Workbook's data source)
- `categorizeIssueCode`/taxonomy concepts (referenced in docs, not imported — Import Audit is job-level only, see Known Limitations)
- The same SheetJS Community Edition writer conventions established in DX-8 (autofilter + column widths; no frozen panes, no data-validation dropdowns)

It never touches `import_jobs` writes, Firestore rules, or the import job state machine.

## Pipeline

```
Data Selection → Export Template → Dataset Builder → Workbook Builder → Styling Engine → Validation → Download
```

| Stage | Module |
|---|---|
| Data Selection | `ExportStudioPage.jsx` (scope/month/branch/KPI selectors, reusing `scopeResolver.ts`, `useScopeProfile`) |
| Export Template | `exportTemplateRegistry.ts` |
| Dataset Builder | `datasetBuilders/*.ts` (one per template) |
| Workbook Builder | `workbookBuilder.ts` |
| Styling Engine | `exportStyling.ts` |
| Validation | `exportValidation.ts` |
| Download | `exportDownloadService.ts` (XLSX) / `csvExportService.ts` (CSV) |
| Audit | `exportAuditService.ts` |

A "Charts Engine" stage was scoped out: the installed SheetJS Community Edition cannot write native Excel charts (verified during DX-8 by reading the writer source). No chart sheets are produced; this is documented, not silently dropped.

## Why this never becomes a second KPI engine

Every dataset builder takes **already-computed** output from the existing, approved engines:

- `generateBranchSummary()` / `generateExecutiveReport()` (`src/engine/executive/executiveReportGenerator.ts`) — registry-aware, weight-gated, no Core-only fallback (Branch Performance, Executive Performance, KPI Performance templates)
- `listRecentImportJobs()` (`src/services/dataExchange/firestoreStagingRepository.ts`) — Import Audit template

No dataset builder re-implements achievement %, risk scoring, or KPI aggregation. `getKpiMetaForKey()` is used only to attach a `unit` label to numbers the engine already produced.

## Why Export Studio is safe from the Reports-page bugs

`docs/deferred/REPORTS_CORRECTNESS_AUDIT.md` documents bugs that live exclusively in `src/pages/shared/ReportsPage.jsx`:
1. "All Branches" silently falling back to the first branch.
2. Summing incompatible KPI units in Branch Comparison totals.

Export Studio's Executive/Branch/KPI Performance dataset builders are built directly on `generateExecutiveReport()`/`generateBranchSummary()`, which:
- Iterate every scope-filtered branch (`useExecutiveReport.ts` proves this is already a real cross-branch aggregation, not a first-branch fallback) — confirmed by reading the function body.
- Aggregate `portfolioAch` **per KPI key**, never across different KPIs — confirmed by reading `executiveReportGenerator.ts`.

Export Studio's `buildExecutivePerformanceDataset()`/`buildBranchPerformanceDataset()`/`buildKpiPerformanceDataset()` never sum two different KPIs' raw values into one cell — every numeric column carries the `ExportMetricColumn.unit` field, and the KPI Performance template is scoped to exactly one KPI by design.

## Scope and access

- `scopeResolver.ts`'s `filterAllowedPharmacies()`/`PharmacyScope` is the only scope primitive used — never re-derived.
- The Export Studio route (`/export-studio`) is Admin-only at the route level (`App.jsx`), even though the template catalog declares broader `supportedRoles` for future use — a known, conservative limitation (see closure doc).
- Import Audit template is additionally gated to `admin` role inside the catalog itself, matching Data Exchange Studio's existing admin-only Import History convention.

## Audit/history

No new Firestore collection. `exportAuditService.ts` reuses `logAction()`/`audit_logs` (`AUDIT_ACTION.EXPORT` added as a one-line constant, mirroring the existing `IMPORT` entry) — export metadata only (template, actor, role, scope, format, timestamp, row count, workbook version, status, failure category, file name). No workbook contents, no raw row data, ever persisted.

## Known limitations (see DX10_EXPORT_STUDIO_CLOSURE.md for the full list)

- Pharmacist Performance and Evaluation Results templates are not implemented — `unavailableReason` is set and surfaced in the UI as "Not available yet," never a silently-wrong calculation.
- Native Excel charts are not implemented — chart-ready summary tables only.
- PDF export is not implemented — no PDF library exists in this codebase.
- Import Audit Workbook is job-level only (no per-row error-category breakdown) — `listRecentImportJobs()` does not bulk-fetch row data.
