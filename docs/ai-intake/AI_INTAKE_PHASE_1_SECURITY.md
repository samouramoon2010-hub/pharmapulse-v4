# Universal AI Intake — Phase 1 Security Model

## Permissions

`/ai-intake` is gated identically to `/data-exchange`:
`<Route path="/ai-intake" element={<PR roles={ADMIN}><AiIntakePage /></PR>} />`
in `src/App.jsx`. `PR` wraps `ProtectedRoute`
(`src/components/layout/ProtectedRoute.jsx`), which redirects
unauthenticated users to `/login` and non-admin roles to
`/unauthorized`. No other role has any access to this page in Phase 1
— read and write are both admin-only, matching the spec exactly.

## No unrestricted client writes

Every write goes through the existing Data Exchange import pipeline:

1. **Firestore rules** (`firestore.rules`) enforce `isAdmin() &&
   createdBy == uid()` on `import_jobs` and admin-only writes on every
   production collection an adapter can touch (`regions`, `districts`,
   `pharmacies`, `users`, `kpi_registry`, `targets`, `kpi_entries`).
2. **Adapter-level `authorizeRow()`** re-checks `ctx.actorRole ===
   'admin'` in code — defense in depth, not a substitute for the rules.
3. **No Admin SDK, no service-account key.** Nothing in this phase
   introduces server-side credentials; every read/write still goes
   through the authenticated client SDK, same as the rest of the app.

## Approval gate

No commit (`commitJob()`) is ever called before the user explicitly
approves. Above 50 committable rows, approval additionally requires
typing the literal phrase `APPROVE IMPORT` — verified in
`aiIntakePhase1Certification.test.ts` (source-scan: exactly one
`commitJob(` call site, located inside `handleApproveAndExecute`).

## Idempotency

Reuses the existing engine's `buildCommitOperationKey(jobId,
identityKey)` and `previewSignature` stale-preview check — no new
idempotency mechanism. Re-running an already-`COMPLETED` job is
refused by the same guard `onboardingOrchestrator.ts` already
enforces for Data Exchange Studio.

## Audit logging

Every commit uses the existing `logAction()`
(`src/services/auditService.js`) via each adapter's `commitBatch()` —
same `audit_logs` collection, same fields (`action`, `collection`,
`docId`, `userId`, `userRole`, `before`, `after`, `meta`), same
`AUDIT_ACTION` enum. No secrets or raw tokens are ever recorded (the
existing service never accepts them as a field).

## Storage / retention policy

No file storage infrastructure (Firebase Storage bucket) is used in
this phase. Uploaded files (Excel/CSV/PDF/image) are parsed **entirely
client-side** in the browser and never uploaded to a backend or
persisted anywhere — only the derived session metadata (file name,
mime type, detected domain, row counts) is written to the `import_jobs`
document, matching the fallback the spec itself allows: *"If file
storage infrastructure is not available, keep the file client-side for
parsing and store only session metadata."*

## Never automated in this phase

Per the spec's safety constraints, none of the following exist
anywhere in the intake flow (verified by source-scan test 4 in
`aiIntakePhase1Certification.test.ts`): deleting organizational
records, deleting users, deleting KPIs, changing permissions,
publishing evaluation profiles, auto-publishing KPI definitions,
modifying Firebase Auth accounts, Factory Reset, bypassing Firestore
rules, or silently overwriting conflicts (every conflict requires
Preview screen visibility and is never auto-resolved).
