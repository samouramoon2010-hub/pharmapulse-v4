# Universal AI Intake — Phase 2.2 Production Activation Policy

## Staged enablement — even after MCP registration succeeds

Getting an MCP endpoint deployed and registered with ChatGPT is not
the same decision as letting ChatGPT write data. This repo's existing
production-write guard (`assertProductionWriteAllowed`, Phase 2,
unchanged) already enforces a hard separation between "the connector
can be called at all" (`CONNECTOR_ENABLED`) and "the connector can
execute writes" (`CONNECTOR_PRODUCTION_WRITES_ENABLED`) — Phase 2.2
adds an explicit **staged rollout policy** on top of that existing
mechanical guard.

## Stage 1 — read + prepare only (initial state after deployment)

Enable:

- `pharmapulse_get_reference_data`
- `pharmapulse_create_intake_session`
- `pharmapulse_validate_intake_session`
- `pharmapulse_get_intake_preview`
- `pharmapulse_get_intake_status`

Keep disabled (withhold the scope from the issued token, and/or leave
`CONNECTOR_PRODUCTION_WRITES_ENABLED` unset):

- `pharmapulse_approve_intake_session`
- `pharmapulse_execute_intake_session`
- `pharmapulse_cancel_intake_session` (not destructive, but has no
  value without approve/execute also being usable — no reason to
  enable it prematurely)

At this stage, a ChatGPT connector session can read reference data,
propose a structured import, and see a full validation/preview — but
cannot approve or execute anything. This is intentionally the
**lowest-risk possible real integration test**: it proves the entire
read path and the entire validation/normalization path work
end-to-end against production Firestore data, without any write ever
being possible.

## Gate to Stage 2 — everything below must be true

1. **Real ChatGPT read-path verification** — an actual ChatGPT
   connector session has successfully called at least
   `pharmapulse_get_reference_data`, `pharmapulse_create_intake_session`,
   and `pharmapulse_get_intake_preview` (see
   `AI_INTAKE_PHASE_2_2_CHATGPT_REGISTRATION.md`'s test procedure).
2. **Security review** — a human review of the deployed environment
   variables, the `CONNECTOR_CLIENT_ADMIN_MAP` mapping, and the token
   scopes actually issued to ChatGPT's connector session.
3. **Audit verification** — confirm `connector_audit_logs` records
   are actually being written for the Stage-1 calls, with the correct
   `connectorClientId`/`mappedAdminUid`/`tool`/`outcome` fields, and
   are reviewable by an admin.
4. **Owner confirmation** — an explicit, out-of-band decision by the
   product owner to proceed, not an automatic timer or count-based
   trigger.
5. **Explicit production-write enablement** — `CONNECTOR_PRODUCTION_WRITES_ENABLED=true`
   is set deliberately, by a human, in the Netlify dashboard.
6. **A small controlled import test** — the very first `approve` +
   `execute` call from ChatGPT should be against a small, low-risk row
   set (e.g. a single test Region or a handful of rows an admin can
   easily verify and, if needed, manually correct), not a full
   production data migration.

## Stage 2 — approve + execute enabled

Only after all six Stage-1→2 gates are satisfied: re-issue (or expand
the scope of) the connector token to include `intake:approve` and
`intake:execute`, and confirm `CONNECTOR_PRODUCTION_WRITES_ENABLED=true`.

## What this repository does NOT automate

There is no code in this repository that automatically transitions
from Stage 1 to Stage 2 based on call counts, elapsed time, or success
rate. Every transition described above is a manual, human,
out-of-band action (editing a Netlify environment variable, reissuing
a token with a different scope set) — exactly matching the spec's "Do
not enable execution automatically" instruction. This document is
guidance for the human operator performing that action, not a
mechanism enforced by the code.
