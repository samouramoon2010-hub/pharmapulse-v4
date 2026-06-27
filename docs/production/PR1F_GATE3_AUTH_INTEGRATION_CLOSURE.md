# PR-1F Gate 3 — Auth Integration & Controlled Cutover — Closure Report

Scope: connect the approved Login V3 shell (Gate 2) to the existing
production authentication flow with **zero changes to the underlying
auth contract**, then cut `/login` over to it **only after parity is
proven**. See
[`LOGIN_V3_DESIGN_LOCK.md`](LOGIN_V3_DESIGN_LOCK.md) and
[`PR1F_GATE2_STATIC_LOGIN_SHELL_CLOSURE.md`](PR1F_GATE2_STATIC_LOGIN_SHELL_CLOSURE.md)
for the shell this gate wires up.

## Audit findings (Phase 0)

Read in full before any edit: `authStore.js`, `LoginPageV2.jsx`,
`LoginPageV3.jsx`, `ProtectedRoute.jsx`, `App.jsx`,
`loginDoubleSubmit.test.ts`. Findings that shaped every decision below:

- Production has **no email normalization** today (`login()` passes
  `email`/`password` straight to `signInWithEmailAndPassword`) — V3
  must not invent one, and doesn't.
- Production has **no guard that redirects an already-authenticated
  user away from `/login`** — neither page has it; `ProtectedRoute`
  only guards the *other* direction (unauthenticated → `/login`).
- Production's password reset is an **inline mode-toggle**, not a
  modal or separate route — preserved exactly.
- `authStore.js`'s `AUTH_ERROR_MAP` was in Arabic, missing
  `auth/invalid-email` and `auth/user-disabled`, and `resetPassword()`
  had **no error handling at all** — a raw Firebase exception would
  have reached the UI. Both are fixed (see below) because they sit
  entirely inside the one auth contract both pages share — fixing them
  is "complete the existing taxonomy," not "invent a second one."
- None of these findings required a new Firebase provider, new
  Firestore schema, new auth claim, credential migration, route-guard
  redesign, or session-model change — so per Phase 0's own stop
  condition, no escalation was needed and the gate proceeded.

## Auth contract reused

`LoginPageV3` calls the exact same `useAuthStore` functions as
`LoginPageV2`, with the same arguments, same `ROLE_HOME` map, same
timeout-param check. No second sign-in implementation exists anywhere.
Full row-by-row comparison:
[`LOGIN_V3_AUTH_PARITY_MATRIX.md`](LOGIN_V3_AUTH_PARITY_MATRIX.md).

Two shared fixes were made inside `authStore.js` (affecting both
`LoginPageV2` and `LoginPageV3` identically, since both read from the
one store):

1. `AUTH_ERROR_MAP` translated Arabic → English and extended with the
   two previously-missing codes. English was chosen because the map
   has exactly one consumer surface — the two login pages — and the
   approved Identity Gateway V3 design for both is English-only
   (confirmed via `grep`: zero other call sites read
   `useAuthStore().error`).
2. `resetPassword()` now wraps `sendPasswordResetEmail` in try/catch
   and maps errors through the same table, instead of letting a raw
   Firebase exception escape to the UI.

## Login V3 wiring

Real controlled inputs (email, password, show/hide toggle), real
submit handler, real error banner, real loading state, real
forgot-password flow — all already built in Gate 2 and reused
unchanged at the wiring level. Gate 3 added:

- Focus management: `useEffect` moves focus to the error banner
  (`role="alert"`, `tabIndex={-1}`) whenever `error` or `resetErr`
  changes, so screen-reader and keyboard users land on it immediately.
- `aria-busy` on both submit buttons.
- **Ref-based double-submit guards** (`loginInFlightRef`,
  `resetInFlightRef`) on top of the existing `submitting`/
  `resetSubmitting` state guards.

## Defect found and fixed during this gate

Live double-click testing (two `button.click()` calls fired
back-to-back, no delay) produced **two real `signInWithPassword`
requests** against the production Firebase project. Root cause:
React batches `setState`, so the second synchronous click read the
pre-update `submitting` value before the first click's state change
had been flushed — the existing state-only guard could not see itself
as "already submitting" in time. Fixed by adding a `useRef` flag that
is set/cleared synchronously around the async call, checked *before*
the state check. Re-tested live with three rapid clicks after the fix:
exactly **one** real network request fired. The same pattern was
applied to the reset-password form for consistency, since it has the
identical race shape. `LoginPageV2.jsx` was left untouched — it never
had a `submitting`-based guard at all, so this is a V3-only hardening,
not a parity break (V2's behavior is unchanged either way).

## Error behavior

Every required category maps to a clean, business-facing English
message with **no raw Firebase code or stack ever rendered**:
not-found, wrong-password, invalid-credential, invalid-email,
user-disabled, too-many-requests, network-request-failed, plus a
generic fallback for any unmapped code and a dedicated message for the
"authenticated but no Firestore profile" case. Verified two ways:

- **Behaviorally**, in `pr1fLoginV3Gate3AuthIntegration.test.ts`
  (mocked Firebase), one test per category plus the unmapped-code
  fallback.
- **Live**, against the real production Firebase project, using a
  synthetic non-existent email (`gate3-final-check@pharmapulse-test.invalid`)
  and a wrong password — the real `signInWithPassword` call returned a
  real `400`, and the rendered banner read exactly *"Incorrect email or
  password."* with no Firebase text anywhere in the DOM.

## Password reset

Wired to the existing `resetPassword()` action, same inline
mode-toggle UI pattern as `LoginPageV2`. Live-tested against the real
project with a synthetic non-existent email: Firebase's
`sendPasswordResetEmail` resolved **without throwing** (confirmed via
network capture: `POST .../accounts:sendOobCode → 200`) — this is
Firebase's standard email-enumeration protection, not an app defect,
and the success-state UI ("Link sent") is correct either way since the
app cannot and should not distinguish "sent" from "account doesn't
exist" for a reset request. Invalid-email-format and other Firebase
error codes are still mapped through the same table (verified
behaviorally).

## Session and redirect behavior

Unchanged. `authStore.js`'s `login`/`logout`/`init`/`_loggingIn` guard
were not modified beyond the two error-handling fixes above — no
session model change, no persistence change, no route-guard change.
Neither `/login` nor `/login-v3` redirects an already-authenticated
visitor away — confirmed as a pre-existing, shared characteristic of
both pages (see the parity matrix), not introduced or fixed
unilaterally in this gate, to keep the side-by-side comparison valid.

## Live-browser evidence (no production credentials used)

All testing below used synthetic, non-existent `*.invalid` email
addresses against the real production Firebase project — no real
account was created, signed into, or exposed.

- Real `signInWithPassword` round-trip confirmed via network capture
  (`400` for bad credentials), with the error banner correctly showing
  the mapped English message and receiving keyboard focus.
- Real `sendPasswordResetEmail` round-trip confirmed (`200`,
  enumeration-protected).
- Double-submit race found and fixed; re-verified with three rapid
  clicks producing exactly one network request after the fix.
- Reset-password mode UI (inline toggle, "Back to sign in") confirmed
  rendering correctly.

**Not performed by the agent, by design:** signing in with a real,
working account. This project is a production-only Firebase project
with no emulator and no self-registration flow, so there is no safe
way for the agent to obtain or use a real working credential. Per the
user's own choice (offered three options; selected "I'll test it
myself"), this final check — successful login, correct role redirect,
working logout — is performed by the user directly, not the agent.
**This is the one remaining open item before Gate 3 can close.**

## Responsive evidence

Re-confirmed the error state and the reset-password mode render
cleanly with no layout regression at 375×812 (mobile) and 1440×900
(desktop) — the two states Gate 2 did not yet have content for. Full
8-breakpoint structural certification (320–1920px) was already done in
Gate 2 and is unaffected by Gate 3's wiring (no layout, spacing, or
asset changes were made in this gate). One pre-existing, disclosed
characteristic became newly visible while capturing this evidence: the
error banner's trailing period renders before the word "Incorrect"
because the app's `<html dir>` defaults to `rtl` and neither login page
forces `dir="ltr"` on its English content — this is the same root
cause already disclosed in
[`LOGIN_V3_RESPONSIVE_SPEC.md`](LOGIN_V3_RESPONSIVE_SPEC.md)'s RTL/LTR
section (card/visual mirroring), just newly observable because Gate 2
had no error-state text to expose it on. Not fixed here — forcing
`dir="ltr"` is an art-direction decision the responsive spec already
flagged as belonging to whoever owns final cutover, not an implicit
side effect of wiring auth.

## Controlled cutover

**Not performed.** Per the gate's own Step C rule — cutover happens
only after parity passes, and the user's chosen verification path (see
above) has not yet completed. Procedure for when it does:
[`LOGIN_V3_CUTOVER_RUNBOOK.md`](LOGIN_V3_CUTOVER_RUNBOOK.md).
`/login` still serves `LoginPageV2.jsx` in production right now.

## Login V2 fallback

Not yet created — the `/login-v2` fallback route is part of Step C in
the cutover runbook and only gets added at the same time as the actual
cutover, not before. `LoginPageV2.jsx` itself remains completely
untouched (confirmed in the regression suite, section 9).

## Security review

- No password ever passed to `console.log`/`console.error`/`console.warn`
  in either page or in `authStore.js` (verified by source-string
  assertion).
- No hardcoded credential, no sample email, no password in a query
  string, anywhere in `LoginPageV3.jsx`.
- Zustand `persist` `partialize` still excludes password — only
  `userProfile` and `{uid, email}` are ever written to `localStorage`
  (unchanged from before this gate).
- No raw Firebase error code or stack trace is ever rendered — every
  error the UI can show came through `AUTH_ERROR_MAP`.
- Firestore rules, Firebase config, and the Firebase project itself
  were not touched.
- Passkey/Face ID remain `disabled`, `aria-disabled="true"`, with a
  `preventDefault` click guard and no `navigator.credentials` /
  `PublicKeyCredential` reference anywhere — confirmed honest
  placeholders, not a real capability.

## Files changed

- Modified: `src/store/authStore.js` — `AUTH_ERROR_MAP` translated +
  extended; `resetPassword()` now error-handled.
- Modified: `src/pages/auth/LoginPageV3.jsx` — focus management,
  `aria-busy`, ref-based double-submit guards on both forms.
- Added: `src/design/pr1fLoginV3Gate3AuthIntegration.test.ts` (44 tests).
- Added: `docs/production/PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md` (this file).
- Added: `docs/production/LOGIN_V3_AUTH_PARITY_MATRIX.md`.
- Added: `docs/production/LOGIN_V3_CUTOVER_RUNBOOK.md`.
- **Not modified:** `src/pages/auth/LoginPageV2.jsx`, `src/App.jsx`,
  any Firestore rules/indexes file, `src/services/firebase.js`.

## Tests

- Focused (`pr1fLoginV3Gate3AuthIntegration.test.ts`): 44/44 passing.
- Full regression suite: 348/348 test files, 25,358/25,358 tests
  passing (baseline 347 files/25,314 tests + 1 new file/44 new tests —
  zero regressions).

## TypeScript

- Baseline: 1 pre-existing error (`tsconfig.json`'s `baseUrl`
  deprecation notice, present before any PR-1F change).
- Final: same 1 pre-existing error, zero new errors.
- Delta: zero new TypeScript errors from this gate.

## Build

`npm run build` passed. Pre-existing chunk-size and ineffective-dynamic-import
warnings unrelated to login pages (same as prior gates); no new
warnings introduced by this gate's changes.

## Firestore / Auth changes

**None.** No Firestore rule, no Firestore index, no Firebase Auth
provider, no Firebase config value was added, removed, or modified in
this gate.

## Known limitations

- Live success-path login (real account, real login, real
  role-redirect, real logout) has not yet been performed — it requires
  a real credential the agent does not have and should not be given,
  per the user's own chosen verification process. This is the single
  named gap blocking closure.
- The pre-existing RTL/LTR mirroring characteristic (disclosed in Gate
  2) now has one additional visible instance — the error banner's
  trailing punctuation — not fixed in this gate, consistent with Gate
  2's own decision to leave `dir` handling to whoever owns final
  cutover.
- No physical-device review (Chromium emulation only), same disclosed
  limitation carried from prior gates.
- `LoginPageV2.jsx`'s double-submit guard was not backported (V2 was
  not opened for editing this gate) — V2 keeps its pre-existing,
  state-only guard; only `LoginPageV3.jsx` has the ref-based hardening.
- The full 8-breakpoint structural sweep was not re-run from scratch
  in this gate (Gate 2 already certified it and Gate 3 made no layout
  changes); only the two new states (error, reset-password) were
  re-verified, at two representative breakpoints.

## Gate 4 handoff

Passkey/WebAuthn implementation, Face ID, and any other biometric
capability are explicitly **not started**. Both buttons remain inert,
honestly-labeled placeholders. Gate 4 owns turning them into a real
capability — including capability detection, the WebAuthn
registration/assertion flow, and a real success state — none of which
exists today.

## Gate 3 decision

**PR-1F GATE 3 AUTH INTEGRATION & CONTROLLED CUTOVER NOT CLOSED**

Everything in scope is complete except the one item that was always
designed to require the user directly: confirming a real, successful
login at `/login-v3` with a real account. Once that confirmation is
received, this report's decision line and the cutover runbook's
pre-condition list should be updated, and Step C (the actual route
change) can proceed. No Passkey/WebAuthn (Gate 4) work has been
started.
