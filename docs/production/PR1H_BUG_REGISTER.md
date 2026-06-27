# PR-1H — Bug Register

Bug-fix policy applied: only reproducible, production-relevant, in-scope,
low-to-moderate-risk defects were fixed, each with a regression test. No
speculative fixes, no opportunistic refactors. Two real findings outside
this policy (touching evaluation methodology, which is explicitly frozen
by current production policy) were deliberately **not** fixed — see the
"Findings deferred, not fixed" section at the end.

## Bug 1 — Personal email exposed on the real production `/login` page

- **Symptom:** the production Login V2 page (`/login`, served by
  `LoginPageV2.jsx`) displayed a real personal email address,
  `samir@alathirpharmacy.com`, as the placeholder text in both the
  sign-in email field and the password-reset email field — visible to
  every visitor of the public login page.
- **Root cause:** the placeholder was copied forward from an early
  iteration of the page and never replaced with a generic example.
  Notably, every later preview/concept variant of the login page
  (`/login-v3`, `/login-concept-a/b/c`, `/login-network-preview`,
  `/login-vortex-preview`) was already certified by its own test to
  **not** contain this string — but no equivalent test existed for the
  actual production page, `LoginPageV2.jsx`, so the leak there went
  unnoticed through every prior phase.
- **Files changed:** [`src/pages/auth/LoginPageV2.jsx`](../../src/pages/auth/LoginPageV2.jsx)
  — both `placeholder="samir@alathirpharmacy.com"` occurrences replaced
  with `placeholder="name@yourpharmacy.com"`.
- **Risk:** low (string-only change, no logic touched).
- **Test added:** [`src/design/pr1hBugFixes.test.ts`](../../src/design/pr1hBugFixes.test.ts),
  describe block "PR-1H bug fix 3" — 3 assertions confirming the email
  string is gone and the generic placeholder is present in both fields.
- **Result:** fixed and verified live (dev server screenshot/snapshot
  confirmed the rendered placeholder is now `name@yourpharmacy.com`).

## Bug 2 — Diagnostic console noise on every KPI entry save

- **Symptom:** `historyService.js`'s `triggerHistorySnapshots()` fired 4
  unconditional `console.log()` calls (start, batch-1-committed,
  batch-2-committed, summary) every single time any pharmacist saved a
  KPI entry — pure operational noise with no functional purpose, left
  over from development.
- **Root cause:** debug logging never removed before shipping.
- **Files changed:** [`src/services/historyService.js`](../../src/services/historyService.js)
  — removed all 4 `console.log` calls; also removed the now-unused
  `batch1Success` local variable that existed only to feed the removed
  summary log (it was never read anywhere else, so leaving it would have
  introduced genuine dead code).
- **Risk:** low (logging-only removal; `console.error` failure logging
  in the same function was left untouched).
- **Test added:** same file, describe block "PR-1H bug fix 1" — asserts
  no `console.log(` remains, `console.error(` is still present, and
  `batch1Success` is fully gone.
- **Result:** fixed.

## Bug 3 — KPI Entry hint icon not accessible to screen readers

- **Symptom:** each per-KPI hint indicator in `KpiEntryPage.jsx`
  (`<span title={hint}><Info /></span>`) relied on the `title` attribute
  alone for its explanatory text — `title` is a sighted-hover tooltip
  only and is not reliably exposed to screen readers, so the hint text
  was effectively invisible to assistive-technology users.
- **Root cause:** missing `aria-label`/`role` on an icon-only element.
- **Files changed:** [`src/pages/pharmacist/KpiEntryPage.jsx`](../../src/pages/pharmacist/KpiEntryPage.jsx)
  — added `role="img" aria-label={hint}` to the span, kept the existing
  `title={hint}` for sighted users.
- **Risk:** low (additive ARIA attributes only, no layout/logic change).
- **Test added:** same regression file, describe block "PR-1H bug fix 2."
- **Result:** fixed.

## Findings deferred, not fixed (evaluation methodology — explicitly frozen)

Two evaluation-engine findings surfaced during certification were
**deliberately not fixed in this phase**, because both touch evaluation
*methodology*, which the current production policy explicitly forbids
modifying in PR-1H ("do not modify evaluation methodology"). Fixing
either would change the numeric output of every future (and potentially
re-run historical) evaluation calculation — exactly the kind of change
that requires a dedicated, product-owner-approved phase, not a
stabilization bug fix.

1. **No weight redistribution when an optional KPI element has no data**
   (`src/engine/evaluationEngine/evaluationEngine.ts:254-258`). Today, a
   missing optional element contributes its full weight at 0 toward the
   basket aggregate rather than having its weight redistributed across
   the elements that do have data. This may be the intended, already-
   shipped methodology (distinct from the *required*-KPI-missing case,
   which correctly invalidates the whole basket) — this audit could not
   determine intent from code alone, and changing it without sign-off
   would be a real methodology change.
2. **Final score not explicitly rounded to 2 decimal places before
   storage** (`src/engine/evaluationEngine/evaluationEngine.ts:317`,
   `src/services/evaluationLedgerService.ts:175,225`). `finalScore` is
   stored as a raw floating-point sum. This is arguably closer to an
   implementation-hygiene issue than true methodology, but it still
   changes the exact persisted/displayed value of every evaluation
   result going forward (and would behave differently for any future
   re-computation of a historical period), so it was left untouched
   pending an explicit decision.

**Recommendation:** raise both as a named follow-up phase requiring
product-owner methodology sign-off, with the existing parity/methodology
test suite (`er2aEngine.test.ts`, `achievementCap.test.ts`,
`evaluationEngineV2Promotion.test.ts`, etc.) as the regression baseline
to compare against before and after any change.

## Findings reviewed, no defect found

Every other check item in PR-1H sections 5–13 (Dashboard, KPI Entry,
Targets, Reports, Rankings, Evaluation Engine V2 routing/cap/published-
profile-selection/archive-protection/traceability/shadow-isolation, Data
Exchange, Export Studio, Users/Roles/Scopes) passed certification with
no real defect found — see the per-area evidence summarized in
[`PR1H_SMOKE_TEST_MATRIX.md`](PR1H_SMOKE_TEST_MATRIX.md) and the route
audit in [`PR1H_RELEASE_CANDIDATE.md`](PR1H_RELEASE_CANDIDATE.md).
