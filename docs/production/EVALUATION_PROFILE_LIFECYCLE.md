# Evaluation Profile Lifecycle — PR-1C

Documents the relationship between Profile Studio (authoring) and the
Evaluation Registry (the official, engine-consumed profile store), and
the real publish/version/immutability model behind each.

## Two systems, two collections, two purposes

| | Profile Studio | Evaluation Registry |
|---|---|---|
| Collection family | `profileStudioProfiles`, `profileStudioPublishPackages`, `profileStudioSimulationRuns`, `profileStudioAuditLogs`, `profileStudioSnapshots` (`PS_COL.*` in [`profileStudioService.ts`](../../src/profileStudio/profileStudioService.ts)) | `evaluation_profiles` (`COL.EVALUATION_PROFILES`) |
| Schema | `ProfileStudioProfileDoc` — `metadata`/`hierarchy`/`processors`/`validationSummary`/`simulationSummary` ([`persistenceTypes.ts`](../../src/profileStudio/persistenceTypes.ts)) | `EvaluationProfile` — `baskets`/`basketIds`/`defaultThresholdRule` ([`evaluationRegistryTypes.ts`](../../src/engine/evaluationRegistry/evaluationRegistryTypes.ts)) |
| Consumed by the live Evaluation Engine? | **No** | **Yes** — this is the only schema the engine reads |
| Has its own "publish" action | Yes — `createPublishPackageDocument()`, gated by `canPublishProfile(role)` | Yes — `publishEvaluationProfile()` |

**These are not two competing official schemas.** Profile Studio is an
authoring and simulation workspace; its "publish" creates an immutable
*publish package* document inside its own collection family for review and
audit purposes. It never writes to `evaluation_profiles` and never calls
the Evaluation Registry's publish path. Before PR-1C this distinction
existed only in code — nothing on the page told an admin that Profile
Studio's "Published" status does not mean "live in evaluation." PR-1C adds
an explicit banner to `ProfileStudioPage.jsx` stating this directly:

> "Profile Studio is an authoring and simulation workspace. Publishing a
> profile here does not activate it for live evaluation — only a profile
> published in the Evaluation Registry is used by the Evaluation Engine."

## Evaluation Registry — the official publish flow (unchanged, already correct)

`publishEvaluationProfile()` in
[`evaluationRegistryService.ts`](../../src/services/evaluationRegistryService.ts):

1. Fetch the draft profile document.
2. Guard: only `status:'draft'` profiles may publish.
3. Structural validation (`validateEvaluationProfile` — basket weights, elements, thresholds).
4. Cross-registry integrity check (`checkProfileIntegrity` — unknown/inactive KPI references, empty baskets, missing threshold rules; cross-basket KPI reuse is a warning, never a blocker).
5. Status → `published`, `publishedAt` set. **Published profiles are immutable** — editing requires `newVersion()`, which creates a new document with `version = previous + 1` and `previousVersionId` pointing back, preserving every historical version indefinitely.
6. Audit log entry written.

No direct draft-to-production bypass exists. This flow was reviewed in
Phase 0 and found already correct — not modified in this section.

## Version grouping — list declutter, not a data-model change

`EvaluationRegistryPage.tsx` previously rendered one flat table row per
profile **version** — a profile with five archived historical versions
showed five separate rows with identical names. PR-1C folds all but the
most recent archived version of each profile name into an explicit,
collapsed "Show N older archived versions" section below the main table.
Drafts and the active published version are never affected by this — they
remain individually visible and selectable, since bulk-select and
duplicate-draft detection both operate on exactly those rows and must keep
working unchanged.

This is a display change only — `primaryRows`/`archivedHistoryRows` are
both derived from the same `filtered` profile list; no document was
moved, merged, or re-keyed.

## Optional field serialization

Reviewed `evaluationRegistryService.ts`'s write paths: `clean()` already
filters `undefined` out of every payload before `setDoc`/`updateDoc`
(`Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))`),
and `EvaluationRegistryPage.tsx`'s description field already uses
`draft.description ?? ''` rather than passing `undefined` through. No
`metadata.description: undefined` (or equivalent) write path was found in
either Profile Studio or the Evaluation Registry. No code change was
required here — this was a defensive audit, not a fix.

## Known limitation — no Profile Studio → Evaluation Registry compiler

The product brief's target flow is `Profile Studio → Author → Simulate →
Validate → Publish → Evaluation Registry → Evaluation Engine V2`. Today,
a profile authored and published in Profile Studio does **not**
automatically (or manually) become an `EvaluationProfile` document — an
admin who wants a Profile-Studio-authored profile to actually run in
evaluation must separately build the equivalent profile in the Evaluation
Registry's basket/element editor.

Building a correct compiler from `ProfileStudioProfileDoc`'s
hierarchy/processor model to `EvaluationProfile`'s basket/element/
threshold model is a non-trivial mapping exercise (the two schemas were
designed independently and don't share a 1:1 field correspondence) and was
not attempted in this section — rushing it risks producing profiles that
pass Profile Studio's validation but fail or silently misbehave in the
real Evaluation Engine, which would be worse than the current honest gap.
Per this section's Phase-0 instruction to stop rather than force an
unsafe integration, this is documented here as the principal deferred
item for a dedicated follow-up section, not built in PR-1C. The additive
safety fix applied in this section (the authoring-only banner above)
ensures the gap is disclosed rather than silently misleading in the
meantime.
