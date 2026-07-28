# Universal AI Intake — Phase 1 Data Contracts

## Intake session (= ImportJob)

No new collection. See `src/services/dataExchange/importJobTypes.ts`
(`ImportJob` interface) for the full base shape, plus the additive
fields in the same file:

| Field | Type | Notes |
|---|---|---|
| `intakeSourceType` | `'EXCEL'\|'CSV'\|'TEXT'\|'PDF'\|'IMAGE'` | optional |
| `intakeSourceFileName` | `string` | optional |
| `intakeSourceMimeType` | `string` | optional |
| `intakeSelectedSheet` | `string` | optional |
| `intakeDetectionConfidence` | `number` (0-100) | optional |
| `intakeSchemaVersion` | `string` | defaults to `1.0.0` |
| `intakeParserVersion` | `string` | defaults to `1.0.0` |
| `approvedAt` | ISO string | set once, at approval |
| `executedAt` | ISO string | set once, at execution |

Lifecycle reuses the existing `ImportJobStatus` union:
`DRAFT → PARSING → MAPPED → VALIDATING → READY → COMMITTING →
COMPLETED | PARTIALLY_COMPLETED | FAILED` (+ `CANCELLED`/`ROLLED_BACK`).

## Row-level model (= StagedImportRow)

No new type. `StagedImportRow<TStaged>` (`importJobTypes.ts`) already
carries `sourceRowNumber` (as `rowIndex`), raw/normalized values (as
`staged`), `issues` (validation errors/warnings), and commit state
(`state`, `committedResult`, `failureReason`). The spec's requested
`proposedAction` (`create/update/skip/conflict/invalid`) is derived
from the existing `RowClassification` via
`intakeSessionTypes.ts`'s `toProposedAction()` — display-only, never a
stored field, so the commit engine keeps one single source of truth.

| Spec's `proposedAction` | Existing `RowClassification` |
|---|---|
| `create` | `VALID`, `WARNING` |
| `update` | `UPDATE` |
| `skip` | `SKIP`, `DUPLICATE` |
| `conflict` | `CONFLICT` |
| `invalid` | `ERROR` |

## Entity schemas

### Region (new)
Required: `regionName`/`regionCode` → `code`, `name`. Optional:
`managerUid`, `status`. Validation: unique code (case-insensitive, both
in-file and against Firestore), whitespace-normalized. See
`src/services/dataExchange/adapters/regionsAdapter.ts`.

### Group, Pharmacy, User, Assignment, KPI Definition, KPI Target,
### KPI Actual
All reuse their existing Data Exchange Studio adapter and schema
unmodified — see each adapter file's own header comment for its exact
field mapping (`groupsAdapter.ts`, `branchesAdapter.ts`,
`pharmacistsAdapter.ts`, `assignmentsAdapter.ts`,
`kpiRegistryAdapter.ts`, `branchTargetsAdapter.ts`/
`pharmacistTargetsAdapter.ts`, `branchActualsAdapter.ts`/
`pharmacistActualsAdapter.ts`).

**One Phase 1 addition:** KPI Definitions imported through `/ai-intake`
are wrapped by `kpiRegistryDraftOnlyAdapter.ts`, which forces
`isActive: false` / `lifecycleStage: 'draft'` on every staged row
regardless of what the source specifies (`kpiRegistryAdapter.ts`
itself is unchanged, so existing Data Exchange Studio behavior for
current users is unaffected).

## Normalization

Reuses `src/services/dataExchange/adapters/columnAliasUtils.ts`
(`normalizeHeader`, `pickField`, `findAliasMatch`, `parseStatusToActive`)
— the same whitespace/case/separator normalization every existing
adapter already applies. No new normalization logic was introduced.
