# Login V3 Cutover Runbook — PR-1F Gate 3

How to move the production `/login` route from `LoginPageV2.jsx` to
`LoginPageV3.jsx`, and how to roll back if anything looks wrong. This
runbook documents the **procedure**; whether it has been executed yet
is recorded in
[`PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md`](PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md)'s
decision line — check that file for current status before assuming
any step below has run.

## Pre-conditions (must all be true before Step C)

1. Auth parity confirmed — [`LOGIN_V3_AUTH_PARITY_MATRIX.md`](LOGIN_V3_AUTH_PARITY_MATRIX.md) fully ✅.
2. Focused Gate 3 test suite green (`pr1fLoginV3Gate3AuthIntegration.test.ts`).
3. Full regression suite green, build passing, zero new TypeScript errors.
4. Live-browser certification of error/reset/double-submit/responsive states complete (this gate's own non-production-credential testing).
5. **A real user has manually signed in at `/login-v3` with a real account and confirmed**: successful login, correct role-based redirect, working logout, and (revisiting `/login-v3` while still signed in) no broken/looping state. This step cannot be performed by the agent — there is no test Firebase account and no emulator in this project (production-only Firebase project, confirmed in `src/services/firebase.js`).

If #5 has not happened, do not proceed past this point. Per the gate's
own rule: *if parity does not pass, leave `/login` on V2 and mark Gate
3 not closed.*

## Step A — Auth parity on `/login-v3` (already done by this gate)

Wire `LoginPageV3` to the production auth contract, add focused tests,
and live-test error/reset/double-submit paths with a non-production
account. This is everything in this gate up to (not including) the
live success-path check.

## Step B — Side-by-side comparison

Compare `/login` and `/login-v3` for: successful login, failed login,
forgot password, session persistence across refresh, redirect
destination, mobile vs desktop, autofill/password-manager behavior,
and accessibility. Recorded in
[`LOGIN_V3_AUTH_PARITY_MATRIX.md`](LOGIN_V3_AUTH_PARITY_MATRIX.md).

## Step C — Production route cutover

Only once every pre-condition above is true:

1. In `src/App.jsx`, change the `/login` route's element from
   `<LoginPageV2 />` to `<LoginPageV3 />`.
2. Add a new route `/login-v2 → <LoginPageV2 />` — **not linked from
   any nav, button, or redirect** — so the previous experience stays
   reachable by direct URL only, as an explicit fallback.
3. Keep the `/login-v3` route as-is (it becomes a harmless alias of
   `/login` once the cutover lands — both render the same component).
4. Do **not** delete `LoginPageV2.jsx`, do **not** touch
   `authStore.js`'s contract, do **not** touch Firestore/Auth rules.
5. Re-run the full test suite, `tsc --noEmit`, and `npm run build`
   after the route change — this is a one-line element swap plus one
   additive route, so no new failures are expected, but it must be
   confirmed, not assumed.
6. Re-verify manually: visiting `/login` now shows the V3 shell, and a
   real sign-in at `/login` still succeeds.

## Rollback (if anything looks wrong after Step C)

Revert `src/App.jsx`'s `/login` route back to `<LoginPageV2 />` (one
line). Because Step C never modified `authStore.js`, Firestore rules,
or any session logic, rollback is purely a routing change — no data
migration, no session invalidation, no user impact beyond which visual
shell they see at `/login`.

## When `LoginPageV2.jsx` / `/login-v2` can be removed

Not in this gate. Keep the fallback route live for at least one full
release cycle after cutover so there is a fast, zero-risk way back if
a real-world issue surfaces that wasn't caught in testing. Removing it
is explicit future scope — do not maintain two actively-promoted
production login experiences indefinitely, but do not delete the
fallback the same day it stops being the default either.

## Passkey / Face ID

Out of scope for this runbook entirely. Both buttons remain disabled,
honestly labeled placeholders through Gate 3 and through this cutover.
WebAuthn implementation is explicit Gate 4 scope, not started here.
