# Data Exchange Studio — Closure Matrix (DX-9)

Per-domain certification, built from direct inspection of the adapters,
runners/orchestrators, and templates as of this bundle (DX-8/DX-9). A
domain is marked "Yes" only where the corresponding code path actually
exists — never inferred from a sibling domain.

| Capability | Groups | Branches | Pharmacists | Assignments | KPI Registry | Branch Targets | Pharmacist Targets | Branch Actuals | Pharmacist Actuals |
|---|---|---|---|---|---|---|---|---|---|
| Template (downloadable) | Yes¹ | Yes¹ | Yes¹ | Yes¹ | Yes | Yes | Yes | Yes | Yes |
| Adapter (parse + validate) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Preview (zero-write) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Explicit confirm before commit | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Commit | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Audit trail (import_jobs doc) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Idempotency model | Upsert by code² | Upsert by code² | Collision-detected³ | Collision-detected³ | Collision-detected³ | Upsert by composite key⁴ | Upsert by composite key⁴ | Upsert by composite key⁴ | Upsert by composite key⁴ |
| Chunked/resumable commit | No | No | No | No | No | No | No | Yes | Yes |
| Retry failed rows only | No | No | No | No | No | No | No | Yes | Yes |
| Cancel mid-commit | No | No | No | No | No | No | No | Yes | Yes |
| Progress reporting (% / row counts) | No | No | No | No | No | No | No | Yes | Yes |
| Stale-preview protection | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| No double-commit (same job) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| CLAIMED pharmacists excluded | N/A | N/A | Yes | Yes | N/A | N/A | Yes | N/A | Yes |
| Tests | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Docs | Yes⁵ | Yes⁵ | Yes⁵ | Yes⁵ | Yes⁵ | Yes⁵ | Yes⁵ | Yes⁵ | Yes⁵ |
| **Closure status** | **CERTIFIED** | **CERTIFIED** | **CERTIFIED** | **CERTIFIED** | **CERTIFIED** | **CERTIFIED** | **CERTIFIED** | **CERTIFIED** | **CERTIFIED** |

¹ Groups/Branches/Pharmacists/Assignments ship in a single multi-sheet
"Organization Onboarding" workbook (`buildOrganizationOnboardingTemplate`)
rather than four separate files — this was a real closure gap (no
downloadable template existed for these four domains before DX-8) and is
now closed.

² Groups and Branches are written using their natural `Code` as the
Firestore document ID — re-importing the same code always upserts the
same document, so there is nothing to "collide" with; there is no
NORMALIZED_KEY_COLLISION-style adapter code for these two domains because
the doc-ID strategy already makes re-import idempotent by construction.

³ Pharmacists, Assignments, and KPI Registry resolve identity from
secondary signals (email/employee ID, primary-assignment overlap, KPI
key) and therefore carry explicit adapter-level duplicate/collision
detection (`NORMALIZED_KEY_COLLISION`, `DUPLICATE_EMAIL`,
`OVERLAPPING_PRIMARY_ASSIGNMENT`, `IDENTITY_REVIEW_REQUIRED`).

⁴ Targets and Actuals use a deterministic composite document ID
(`{branchId}_{month}` for targets, `{branchId}_{kpiKey}_{date}`-style
keys for actuals) — re-importing the same row always upserts the same
document rather than creating a duplicate.

⁵ Architecture and usage are documented in
`DX_STUDIO_ARCHITECTURE_V1.md`, `DX4_DX5_KPI_TARGETS_BUNDLE.md`,
`DX6_DX7_ACTUALS_LARGE_FILES_BUNDLE.md`, `DX8_DX9_TEMPLATES_CLOSURE.md`,
`DATA_EXCHANGE_USER_GUIDE.md`, and `DATA_EXCHANGE_ADMIN_RUNBOOK.md`.

## Known, honestly-documented limitations (not gaps to be hidden)

- **No resume/retry/cancel for Organization Onboarding, KPI Registry, or
  Targets.** These four import flows commit in a single pass (no
  chunking) because their typical row counts are small (org-structure
  and monthly-target sheets, not high-volume actuals). A partial failure
  mid-commit on these domains stops the import and reports exactly which
  rows succeeded/failed — but there is no "resume" action, the admin
  re-uploads a corrected file for the remaining rows. Only Branch/
  Pharmacist Actuals (DX-6/DX-7), which exist specifically to handle
  large files, have the chunked/resumable/cancellable engine.
- **No Excel in-cell dropdown validation lists.** The installed SheetJS
  Community Edition (xlsx@0.18.5) cannot write data-validation dropdowns
  or frozen header panes — verified by reading the library's writer
  source. Allowed values are instead documented as plain text in each
  template's Instructions sheet. This is a tooling ceiling, not a
  product decision; it is not presented as supported anywhere in the UI.
- **2,000-row practical ceiling** carries over unchanged from DX-6/DX-7 —
  see `DX6_DX7_ACTUALS_LARGE_FILES_BUNDLE.md` and the Performance section
  of `DX8_DX9_TEMPLATES_CLOSURE.md` for the tested basis of that number.
