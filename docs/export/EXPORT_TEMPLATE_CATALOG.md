# Export Studio — Template Catalog (DX-10)

Source of truth: `src/services/export/exportTemplateRegistry.ts`. This document mirrors it for human reference — if they ever disagree, the code wins.

## Available templates

### Executive Performance Workbook (`executive-performance`)
- **Roles:** admin, general_manager, regional_manager, district_supervisor
- **Formats:** XLSX
- **Required selectors:** month — **Optional:** branch, district, region, includeRawData
- **Sheets:** Executive Summary, Branch Performance, KPI Analysis, Risks & Opportunities, Raw Data (optional), Definitions
- **Source:** `generateExecutiveReport()` — registry-aware, no Core-only fallback
- **Limitation:** Rankings and Pharmacist Performance sheets are not included.

### Branch Performance Workbook (`branch-performance`)
- **Roles:** admin, general_manager, regional_manager, district_supervisor, branch_manager, manager
- **Formats:** XLSX, CSV
- **Required selectors:** month, branch — **Optional:** includeRawData
- **Sheets:** Branch Summary, KPI Performance, Targets vs Actuals, Raw Data (optional), Definitions
- **Source:** `generateBranchSummary()`
- **Limitation:** Pharmacist Contribution and Trend Analysis sheets are deferred.

### KPI Performance Workbook (`kpi-performance`)
- **Roles:** admin, general_manager, regional_manager, district_supervisor, branch_manager, manager
- **Formats:** XLSX, CSV
- **Required selectors:** month, kpi — **Optional:** branch, district, region, includeRawData
- **Sheets:** KPI Summary, Branch Comparison, Raw Data (optional), Definitions
- **Scoped to exactly one KPI** — every value in the workbook shares that KPI's unit.
- **Limitation:** Pharmacist Comparison and Monthly Trend sheets are deferred.

### Import Audit Workbook (`import-audit`)
- **Roles:** admin only
- **Formats:** XLSX, CSV
- **Required selectors:** none — **Optional:** dateRange
- **Sheets:** Import Jobs, Failed & Retryable Summary, Domain Summary, Definitions
- **Source:** `listRecentImportJobs()` (same source as Data Exchange Studio's Import History)
- **Limitation:** Job-level only — no per-row error-category breakdown (per-row data is not bulk-fetched by the source query). Limited to the same recent-job window as Import History, not a full historical archive.

## Not available in this catalog version

### Pharmacist Performance Workbook (`pharmacist-performance`)
**Blocked.** Requires the evaluation ledger / ranking engine output (`src/evaluationLedger`, `src/ranking`), which was not verified safe to wire in this bundle without risking an incorrect or invented calculation. The UI shows "Not available yet" with this exact reason — never a generate button.

### Evaluation Results Workbook (`evaluation-results`)
**Blocked.** Requires the evaluation pipeline / profile resolver output (`src/engine/evaluationPipeline`, `src/profileStudio`), which carries its own versioning and calculation-trace semantics not verified safe to re-export in this bundle. Same "Not available yet" treatment.

## Workbook version

All templates are at workbook version `1.0` for this release.
