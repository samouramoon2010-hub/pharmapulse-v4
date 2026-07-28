# Universal AI Intake — Phase 1 Known Limitations

## Image extraction is architecture-only

`imageIntakeAdapter.ts` defines the provider interface
(`ImageExtractionProvider`) and a registration hook
(`registerImageExtractionProvider`), but **no provider is registered
in Phase 1**. Every image upload resolves to a controlled
`NO_PROVIDER_CONFIGURED` state — the image is held in the intake
session only, nothing is extracted or fabricated. A future phase could
register a real provider (e.g. a vision-capable model) without any UI
change, since the page already calls `extractFromImage()` generically.

The existing BYOK text-only AI client
(`src/assistant/realAiProviderClient.ts`) is a plausible extension
point for a future provider (it already builds Gemini/OpenAI/Claude
request payloads), but it has no image/vision support today and is
**not called anywhere in this phase**.

## PDF is text-layer extraction only, not OCR

`pdfIntakeParser.ts` uses `pdfjs-dist` to read a PDF's existing text
layer. A scanned/image-only PDF (no text layer) returns the exact
required message *"This PDF requires image extraction or OCR review"*
— there is no OCR fallback, per instruction ("do not add unreliable
local OCR loops").

## Users import never creates a Firebase Auth account

Reusing `pharmacistsAdapter.ts` unchanged: bulk user import writes
only the Firestore `users/{docId}` profile with
`authStatus: 'PENDING_INVITATION'`. No Firebase Auth account or
password is ever created automatically — activation remains the
existing manual `createUser()` flow's job. This was already the
established, approved behavior before this phase; Phase 1 does not
change it.

## KPI Targets/Actuals duplicate-period detection

`branchTargetsAdapter.ts`/`pharmacistTargetsAdapter.ts`/
`branchActualsAdapter.ts`/`pharmacistActualsAdapter.ts` each perform
their own live, per-batch Firestore reads inside `loadExistingRecords()`
to detect an existing target/actual for the same KPI+scope+period —
this already works correctly through `/ai-intake` with no additional
wiring, since the registry passes exactly the dependencies
(`existingBranches`, `registry`, pharmacist lookup maps) those adapters
already expect.

## No file storage / retention infrastructure

Per the storage policy in `AI_INTAKE_PHASE_1_SECURITY.md`: files are
parsed entirely client-side and never uploaded to a backend. This
means there is no server-side audit copy of the original file itself
— only the derived session metadata and the row-level data that was
actually validated/committed are retained (in `import_jobs`). If a
future phase needs the original file retained for compliance, a
Storage bucket integration would need to be added explicitly.

## Cloud Functions were not built

Per the owner's confirmed decision (see
`AI_INTAKE_PHASE_1_ARCHITECTURE.md`), this phase intentionally kept
the existing Firestore-rules-based security model rather than
introducing Cloud Functions. If a future phase requires true
server-side execution (e.g. for a paid image-extraction provider whose
API key must never reach the client), that would be a larger,
separate infrastructure decision.

## MCP connector readiness, not implementation

The operation names suggested by the spec
(`createIntakeSession`/`parseIntakeSource`/etc.) map conceptually onto
this phase's functions (`fetchIntakeExistingData`,
`createAdapterForDomain`, `runValidation`, `commitJob`), but no MCP
server or connector was built — explicitly out of scope for Phase 1.
