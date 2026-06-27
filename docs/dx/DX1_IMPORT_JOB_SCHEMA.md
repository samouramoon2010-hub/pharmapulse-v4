# DX-1 — Proposed `import_jobs` Firestore Schema (documented, NOT applied)

Status: **Proposed only.** Nothing in this document has been applied to
`firestore.rules` or `firestore.indexes.json`. DX-1 ships the
`ImportJob`/staging contracts and an in-memory repository
(`src/services/dataExchange/stagingRepository.ts`) that satisfies the same
interface a Firestore-backed implementation would. Creating the real
collection, rules, and indexes is deliberately deferred to a reviewed,
separate step — not bundled into this foundation change — so DX-1's blast
radius stays limited to application code.

## Why no new collection was created in DX-1

1. The generic `ImportJob` contract (`src/services/dataExchange/importJobTypes.ts`)
   and the `StagingRepository` interface are already fully exercised by
   in-memory tests (`dx1Persistence.test.ts`) covering save/load, resume,
   and abandoned-draft cleanup — DX-1's completion criteria ("staging
   repository supports resume", "idempotency and retry behavior are
   proven") do not require a live collection to certify.
2. The existing `staging_entries` collection (audited, not modified —
   see `docs/SECRET_SCAN_EXCEPTIONS.md`'s sibling audit notes and
   `firestore.rules` lines 380–397) already serves the one domain DX-1
   wires up (KPI_ACTUALS) via the legacy `kpiImportService` path, which
   DX-1 wraps unchanged.
3. Applying new `firestore.rules`/`firestore.indexes.json` changes is a
   deploy-affecting action. Per this engagement's established posture
   (see Foundation Closure bundles), Firestore-rule changes get their own
   reviewed step, not a side effect of an architecture/foundation bundle.

## Proposed schema (for DX-2+ implementation, pending separate review)

```
import_jobs/{jobId}
  domain:            string   // ImportDomain
  status:            string   // ImportJobStatus
  orgScope:          string | null
  createdBy:         string   // uid
  createdAt:         timestamp
  updatedAt:         timestamp
  fileMeta: {
    fileName:        string
    sizeBytes:       number
    checksum:        string   // sha256 — drives re-upload detection
    sheetName:       string | null
  }
  mappingVersion:    string | null
  validationSummary: { totalRows, valid, warning, error, conflict, duplicate, update, skip }
  rowCounts:         { parsed, validated, committed, failed, skipped, remaining }
  commitBatches:     Array<{ batchIndex, attempted, committed, skipped, failed, startedAt, endedAt }>
  rollbackStatus:    string   // NOT_ATTEMPTED | IN_PROGRESS | COMPLETED | NOT_POSSIBLE
  startedAt:         timestamp | null
  endedAt:           timestamp | null
```

`import_jobs/{jobId}/rows/{rowId}` (subcollection, proposed) would hold
`StagedImportRow` documents instead of overloading `staging_entries` with a
`jobId` field — keeping the existing collection's contract untouched, per
"prefer backward-compatible extension over replacement."

## Proposed rules sketch (NOT applied)

```
match /import_jobs/{jobId} {
  allow read:   if isAny() && (resource.data.createdBy == uid() || isAdmin());
  allow create: if isAny() && request.resource.data.createdBy == uid();
  allow update: if isAny() && resource.data.createdBy == uid();
  allow delete: if isAdmin();

  match /rows/{rowId} {
    allow read, write: if isAny() && get(/databases/$(database)/documents/import_jobs/$(jobId)).data.createdBy == uid();
  }
}
```

This sketch preserves org/scope isolation by gating on `createdBy`,
matching the existing `staging_entries` ownership pattern. It has **not**
been added to `firestore.rules` and must be reviewed against the full
ruleset (and given a composite index for `createdBy` + `status` queries)
before any DX-2+ bundle relies on it.
