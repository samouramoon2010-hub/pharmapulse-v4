# Login V3 Auth Parity Matrix — PR-1F Gate 3

Side-by-side comparison of `LoginPageV2.jsx` (production `/login`) and
`LoginPageV3.jsx` (`/login-v3`) after Gate 3 wiring. Confirms the gate's
core requirement: **one auth contract, two shells** — no second
sign-in implementation, no diverging validation, no diverging session
behavior.

## Auth contract

| Behavior | LoginPageV2 | LoginPageV3 | Parity |
|---|---|---|---|
| Sign-in call | `login(form.email, form.password, false)` | identical | ✅ |
| Password reset call | `resetPassword(resetEmail)` | identical | ✅ |
| Email normalization | none (production has none today) | none added | ✅ (neither invents one) |
| Client-side password rules | none beyond `required` | none beyond `required` | ✅ |
| Remember-me | not exposed in UI (`rememberMe` hardcoded `false`) | same | ✅ |
| Role-home redirect map | `ROLE_HOME[profile.role]\|\|'dashboard'` | identical map, identical fallback | ✅ |
| Timeout query param | `params.get('reason') === 'timeout'` | identical | ✅ |
| Authenticated-user-visits-/login guard | none (pre-existing gap) | none added | ✅ (disclosed, shared, not fixed unilaterally — see below) |
| `location.state.from` intended-destination redirect | not consumed | not consumed | ✅ (disclosed, shared) |
| Logout / session lifecycle | unchanged (`authStore.logout`) | not touched, same store | ✅ |
| Firestore/Firebase rule surface | unchanged | unchanged | ✅ |

The two "none added" rows are deliberate. `ProtectedRoute.jsx` already
redirects an *unauthenticated* user away from protected pages to
`/login`; nothing today redirects an *authenticated* user away from
`/login` itself, on either page. Adding that guard to V3 only would
have made the two pages behave differently — directly contradicting
Gate 3's own "side-by-side comparison" requirement — so it was left as
a shared, disclosed characteristic rather than fixed unilaterally in
one shell.

## Error handling

| Behavior | LoginPageV2 | LoginPageV3 |
|---|---|---|
| Error source | `useAuthStore().error` | identical |
| Error taxonomy | single shared `AUTH_ERROR_MAP` in `authStore.js` | identical (same table) |
| Raw Firebase code ever shown | no | no |
| Error live region | `role="alert"` (no focus management) | `role="alert"` + `tabIndex={-1}` + auto-focus on change |
| Error cleared on edit | `clearError()` on input change | identical |

`AUTH_ERROR_MAP` was translated from Arabic to English and extended
with two previously-unmapped codes (`auth/invalid-email`,
`auth/user-disabled`) **for both pages**, since both share the one
table in `authStore.js` — this is a single shared fix, not a
V3-specific divergence. See the
[closure report](PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md) for why the
table is English-only.

## Submit behavior

| Behavior | LoginPageV2 | LoginPageV3 |
|---|---|---|
| `preventDefault()` | yes | yes |
| Disabled while submitting | yes (`disabled={submitting\|\|loading}`) | yes, plus `aria-busy` |
| Double-submit guard | state-only (`submitting` set after click; no guard before Gate 3) | **state + ref** (`loginInFlightRef`) — closes the same-tick double-click race that state alone cannot |
| Typed values survive a failed attempt | yes (no `setForm` in catch) | yes (no `setForm` in catch) |
| Password cleared on failure | no | no (parity preserved — V2 never did this) |

The double-submit ref guard is a **V3-only hardening**, not backported
to V2 in this gate (V2 was not opened for editing, consistent with the
conservative posture carried from Gates 1–2). It does not change V2's
behavior or violate parity in the sense the spec cares about — V2's
behavior is unchanged, and V3's behavior is now demonstrably more
robust against rapid double-clicks, which is what Gate 3 Section 3
("prevent double-submit") explicitly asks for.

## Password reset

| Behavior | LoginPageV2 | LoginPageV3 |
|---|---|---|
| UI pattern | inline mode-toggle (`mode === 'reset'`), not a modal or route | identical pattern |
| Reset call | `resetPassword(resetEmail)` | identical |
| Reset error handling | `authStore.resetPassword` previously let raw Firebase errors escape | now maps through `AUTH_ERROR_MAP` (shared fix, both pages benefit) |
| Reset double-submit guard | none | ref + state guard added (V3-only hardening, same rationale as above) |
| Success state | "Link sent" confirmation panel | identical |

## Accessibility

| Behavior | LoginPageV2 | LoginPageV3 |
|---|---|---|
| `<label htmlFor>` association | adjacent text only | real `htmlFor`/`id` via `useId()` |
| `autoComplete` | absent | `email` / `current-password` |
| Password toggle `aria-label`/`aria-pressed` | present | present |
| Error focus management | absent | `useEffect` moves focus to the alert on change |
| `aria-busy` on submit | absent | present on both submit buttons |

These are Gate 2 shell improvements, re-confirmed still intact after
Gate 3's auth wiring — Gate 3 did not regress any of them.

## Verdict

Every row needed for "one auth contract, two shells" is ✅. The two
intentional V3-only additions (ref-based double-submit guard on both
forms) are hardening, not behavioral divergence from the user's point
of view — they only change what happens during a same-tick double
click, which previously fired two real network requests on V3 and now
fires one. See
[`PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md`](PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md)
for full evidence and the gate's closure decision.
