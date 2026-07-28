# Universal AI Intake — Phase 2 Approval Model

## Cryptographic binding

An approval token (`connectorApprovalService.issueApprovalToken()`)
binds, in its signed payload:

- `sessionId`
- `previewSignature` (Phase 1's existing `computeRowsSignature()`
  fingerprint over the session's staged rows — reused, not reinvented)
- `approvedRowIds[]` / `excludedRowIds[]`
- `exp` (expiry, default 10 minutes)

Entity type and create/update counts are not separately embedded in
the token — they are implicit in `previewSignature`, since that
fingerprint changes if the underlying rows (and therefore their
classifications) change at all.

## Lifecycle guarantees

- **Short-lived**: default 10-minute TTL (`APPROVAL_TTL_SECONDS`).
- **Single-use**: `executeIntakeSession()` calls
  `assertApprovalNotConsumed(approvalId, ...)` before committing, and
  `markApprovalConsumed()` immediately after — verified by
  `connectorHttpHandler.test.ts`'s "execute rejects an already-used
  approval (single-use)".
- **Server-generated**: the client never constructs or influences the
  token's signature.
- **No plaintext secrets inside the token**: the payload contains only
  session/row/expiry metadata, never the signing secret itself.
- **Not reusable across sessions**: `verifyApprovalToken()` rejects a
  token whose embedded `sessionId` doesn't match the session it's
  presented against.
- **Does not survive preview changes**: if the session is validated
  again after approval (new rows, re-classification), its
  `previewSignature` changes, and `verifyApprovalToken()`'s comparison
  against the *current* signature fails with `PREVIEW_STALE` —
  verified by "invalidates the token when the preview signature
  changed since approval".

## High-volume confirmation

Above 50 committable rows (`APPROVE_PHRASE_THRESHOLD`), the caller
must additionally pass `approvalPhrase: "APPROVE IMPORT"` — matching
Phase 1's identical UI-level threshold, kept consistent across both
entry points.
