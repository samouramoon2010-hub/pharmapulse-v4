# Export Studio — Admin Runbook (DX-10)

## Permissions

- The `/export-studio` route is Admin-only at the route level (`App.jsx`), regardless of a template's declared `supportedRoles` in the catalog — a conservative initial-release choice. Broadening to other roles requires a route change, not just a catalog change.
- Import Audit Workbook is additionally admin-only inside the catalog itself.
- Export History is only shown to admins.

## Troubleshooting

### "Validation failed — not downloaded"

The export pipeline always validates before writing a file. Common blocking reasons:
- **ROW_LIMIT_EXCEEDED / WORKBOOK_LIMIT_EXCEEDED** — the selection produced more rows than `EXPORT_LIMITS` allows (`src/services/export/exportLimits.ts`: 2,000/sheet, 8,000/workbook). Narrow the scope (fewer branches, shorter date range).
- **DUPLICATE_HEADER / INVALID_WORKSHEET_NAME** — would indicate a bug in a dataset builder, not a user error. Escalate.
- **ROW_COUNT_MISMATCH** — would indicate a bug in a dataset builder's `meta.rowCount` accounting. Escalate.
- **MISSING_SCOPE_LABEL / MISSING_PERIOD_LABEL / MISSING_GENERATED_BY** — would indicate the page failed to pass required context. Escalate.

None of these ever expose a raw stack trace to the end user — the validation issue's `message` field is always a plain sentence.

### Empty export

If a selection matches zero rows, the export still downloads (headers + Definitions only) with an `EMPTY_DATASET` warning — this is a non-blocking warning, not a failure. Confirm the selection (correct month, correct branch) before assuming something is broken.

### "Not available yet"

Pharmacist Performance and Evaluation Results show this for every selection — this is not a bug, it is the documented state of this catalog version. Do not attempt to work around it by selecting a different template; there is no equivalent data in another template.

### Export History shows nothing

Export History reads from `audit_logs` filtered to `action == 'export'`, the same collection as every other audit record. If a generate action just happened but doesn't appear: check that `recordExportAudit()` didn't throw (it uses the same fire-and-forget pattern as `logAction()` — failures are logged to console, not surfaced to the user, by design, matching the existing audit service's error-handling convention).

## Recovery

There is nothing to "recover" in Export Studio — it performs no writes to operational data, no staging, and no multi-step commit. Every export is a single, idempotent read-and-generate operation; re-running it is always safe.

## Escalation

Escalate if:
- A validation issue code appears that isn't in `exportValidation.ts`'s known set — would indicate an unhandled case.
- An export's row count or scope doesn't match what the requester is authorized to see — this is a security-relevant bug, not a UX issue, and should be treated with the same urgency as a Data Exchange Studio scope-leakage report.
- A workbook's Definitions sheet is missing or incomplete for an available template — this violates the "never black-box reporting" requirement and should block release of that template until fixed.
