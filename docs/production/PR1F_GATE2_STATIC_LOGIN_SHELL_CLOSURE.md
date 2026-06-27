# PR-1F Gate 2 — Static Pixel-Locked Shell — Closure Report

Scope: build the visual shell only (no auth integration). See
[`LOGIN_V3_DESIGN_LOCK.md`](LOGIN_V3_DESIGN_LOCK.md) for the reference
this gate is built against, and
[`LOGIN_V3_RESPONSIVE_SPEC.md`](LOGIN_V3_RESPONSIVE_SPEC.md) for the
full breakpoint evidence table.

## Component structure

- [`src/components/login/LoginVisualPanel.jsx`](../../src/components/login/LoginVisualPanel.jsx) —
  new, isolated, presentation-only component. Renders the Gate 1
  WebP assets via a native `<picture>`/`<source>` responsive swap.
  Imports no Firebase, store, or router module.
- [`src/pages/auth/LoginPageV3.jsx`](../../src/pages/auth/LoginPageV3.jsx) —
  new page. Reuses the **exact same** `useAuthStore` destructure,
  `login(email, password, false)` call, `resetPassword(resetEmail)`
  call, `ROLE_HOME` routing map, and timeout-query-param check as the
  production `LoginPageV2.jsx` — no auth logic was invented, modified,
  or duplicated with different behavior. The visual rebuild (right
  panel → image asset; card → 52px inputs/buttons, 24px radius,
  `calc(100vh-80px)` desktop height, real `<label htmlFor>`
  associations, `autoComplete`, `aria-*` wiring) is the only thing
  that's actually new.
- [`src/App.jsx`](../../src/App.jsx) — one additive route,
  `/login-v3 → LoginPageV3`, placed directly after the existing
  `/login → LoginPageV2` route. **`/login` itself is untouched** —
  `LoginPageV2.jsx` was not opened for editing in this gate, confirmed
  by certification test suite section 3 (it still imports
  `DataOceanBackground`/`IdentityPulseLogo` and contains no reference
  to `LoginVisualPanel`).

This is a deliberate, conservative choice: Gate 2's own spec requires
"preserve existing auth contracts... do not remove current login
implementation" and forbids starting Gate 3. Wiring `/login-v3` as an
**additional**, isolated route (rather than replacing `/login`) makes
the shell fully reachable for evidence-gathering and future iteration
while guaranteeing zero behavioral change to the page real users
currently sign in through. The decision to cut `/login` over to this
shell is explicitly left to Gate 3.

## Desktop / tablet-landscape layout (≥1024px)

Split layout: visual panel `flex: 1`, card column
`flex: 0 0 clamp(420px, 32vw, 460px)` (420–460px per spec), card itself
`max-width: 380px`, `height: calc(100vh - 80px)`, `border-radius: 24px`,
`backdrop-filter: blur(20px) saturate(140%)` (restrained, not the
heavier 28px/multi-pseudo-element treatment from `LoginPageV2`'s
original glass card — intentionally toned down per "restrained blur,
no excessive shadow"). Root container uses a definite `height: 100vh`
with `overflow: hidden` at this breakpoint, so there is no page-level
scroll at standard desktop heights; the card itself scrolls internally
(`overflow-y: auto`) if its content ever exceeds the available height.

## Mobile / tablet-portrait layout (<1024px)

No split screen: the visual becomes a `position: fixed; inset: 0`
full-bleed background with a dark gradient overlay for contrast, the
card is centered in a normally-flowing wrapper (`min-height: 100vh`,
16px side padding → card width `calc(100% - 32px)`), padding respects
`env(safe-area-inset-top/bottom)`. No central logo is duplicated in
DOM — the identity mark is already baked into the photographed visual
asset, so there's nothing competing with the form for attention.

## Left card structure (order verified by certification test #5)

Brand mark + "PharmaPulse" wordmark → "Identity Gateway V3" → "Welcome
back" → subtitle → Email address (labeled) → Password (labeled,
toggleable) → "Forgot password?" → "Sign in" → "or" divider → Face
ID / Passkey placeholders → security statement → language selector +
Privacy Policy + Terms of Service. Matches the approved spec order
exactly.

## Honest biometric disclosure

Both Face ID and Passkey buttons are natively `disabled`,
`aria-disabled="true"`, and guarded with `onClick={(e) =>
e.preventDefault()}` — identical pattern to `LoginPageV2`. The Passkey
badge text was changed from `LoginPageV2`'s `"New"` to `"Not yet
available"` — `"New"` could be read as implying the feature is live;
`"Not yet available"` is the spec's own recommended honest phrasing and
removes any ambiguity about live capability.

## Accessibility (certification test section 8)

- Real `<label htmlFor>` / `id` association for email and password
  (not just adjacent visible text, which is what `LoginPageV2` does).
- `autoComplete="email"` / `autoComplete="current-password"` for
  password-manager compatibility (absent in `LoginPageV2`).
- Password-toggle button has `aria-label`
  ("Show password"/"Hide password") and `aria-pressed`.
- Error and timeout banners use `role="alert"`.
- The sign-in `<form>` has `aria-label="Sign in to PharmaPulse"`.
- Explicit `:focus-visible` ring on inputs/buttons.
- `prefers-reduced-motion` respected (card entrance animation disabled).
- Inputs are 16px minimum font size (was 14px in `LoginPageV2`) to
  avoid iOS auto-zoom on focus.
- Decorative visual marked `aria-hidden="true"` with empty `alt=""`.

No WCAG certification is claimed — this is targeted, spec-required
wiring, not a formal audit.

## Performance

- No new dependency, no particle library, no canvas/WebGL animation.
- `<img>` has explicit `width`/`height` attributes — no layout shift.
- Native `<picture>` source swap — exactly one image request per page
  load, decided by the browser before paint.
- No route-level code-splitting was added (pre-existing, disclosed gap
  carried from PR-1E5 — out of scope here).

## Defect found and fixed during this gate

See [`LOGIN_V3_RESPONSIVE_SPEC.md`](LOGIN_V3_RESPONSIVE_SPEC.md#defect-found-and-fixed-during-certification)
for the full account: a real vertical-overflow bug at 1920×1080 caused
by a flex-item percentage-height resolution timing issue, found during
breakpoint certification and fixed by making the desktop visual image
`position: absolute; inset: 0` and giving the desktop root a definite
`height: 100vh`. Re-verified clean at every required breakpoint after
the fix.

## Visual evidence

Genuine, correctly-rendered live-browser screenshots were captured at
**375×812, 390×844, 768×1024, and 1024×768** showing: correct card
proportions, correct image crop/focal point, no clipping, the full
section order, honest biometric placeholders, and (at 1024×768) the
desktop split composition. At **1440×900 and 1920×1080** the
`preview_screenshot` tool produced a visibly truncated/scaled image —
reproduced identically on the unmodified, already-shipped
`LoginPageV2.jsx` at the same viewport, proving this is a pre-existing
tool/environment limitation, not a defect in the new shell (see the
Known Limitations section of the responsive spec for the full
explanation). Those two breakpoints are certified by direct DOM
measurement (`getBoundingClientRect`, `scrollWidth`/`scrollHeight`)
instead, consistent with the evidentiary standard already accepted for
desktop breakpoints in PR-1E6's `MOBILE_CERTIFICATION_MATRIX.md`. No
screenshot image files were exported to
`docs/production/evidence/pr1f-login-v3-gate2/` — same disclosed
no-export-mechanism limitation as every prior PR-1E6 pass.

## Comparison to the approved reference (measurable, not subjective)

| Element | Reference | Implemented shell |
|---|---|---|
| Card width (desktop) | ~430px region of 1536px source | `clamp(420px, 32vw, 460px)` column, 380px card — within spec's 420–460px range |
| Card radius | visually soft/rounded | 24px (spec's exact recommendation) |
| Right visual composition | central mark + radiating streams + 7 label chips | identical — it's the same artwork, used as an image, not redrawn |
| Sample email in card | `samir@alathirpharmacy.com` (reference only) | neutral `you@pharmacy.com` placeholder; no personal email anywhere in the shell |
| Passkey badge | `"New"` | `"Not yet available"` — intentional change for honesty, not a visual-fidelity miss |
| Mobile adaptation | not shown in the static reference (desktop-only image) | full-bleed background + centered card, derived independently per the mobile spec requirements |

Unavoidable browser differences: system font rendering
(`'Inter', sans-serif` falls back to the OS default since no
`@font-face`/web-font was bundled — `LoginPageV2` has this same
characteristic, not a regression); exact backdrop-blur rendering varies
slightly by GPU/compositor.

## Files changed

- Added: `src/components/login/LoginVisualPanel.jsx`
- Added: `src/pages/auth/LoginPageV3.jsx`
- Modified: `src/App.jsx` (one new import, one new additive route —
  `/login` line is unchanged)
- Added: `src/design/pr1fLoginV3Gate1Gate2.test.ts` (40 tests)
- Added: `docs/production/LOGIN_V3_DESIGN_LOCK.md`
- Added: `docs/production/LOGIN_V3_RESPONSIVE_SPEC.md`
- Added: `docs/production/PR1F_GATE1_ASSET_PREPARATION_CLOSURE.md`
- Added: `docs/production/PR1F_GATE2_STATIC_LOGIN_SHELL_CLOSURE.md` (this file)
- No Firestore rules, Firestore indexes, Firebase config, auth store,
  route guard, or session logic changed.

## Validation

- Focused suite (`pr1fLoginV3Gate1Gate2.test.ts`): 40/40 passing.
- Full regression suite: 347/347 test files, 25,314/25,314 tests
  passing (baseline 346/25,274 + 1 new file/40 new tests — zero
  regressions).
- TypeScript: 1 pre-existing baseline error (`tsconfig.json`'s
  `baseUrl` deprecation notice, unrelated to this gate, present before
  any PR-1F change), zero errors referencing `LoginPageV3.jsx`,
  `LoginVisualPanel.jsx`, `App.jsx`, or the new test file.
- Production build: passed. Both WebP assets confirmed present in
  `dist/assets/` at their documented sizes; the design-reference source
  PNG confirmed absent from `dist/`.
- No functional regression to `/login` — `LoginPageV2.jsx` untouched,
  confirmed by both the certification suite and the full regression
  suite passing unchanged.

## Known limitations

- RTL mirrors the visual/card sides (pre-existing app-wide behavior,
  not a new defect — see the responsive spec's RTL/LTR section).
- No physical-device review (Chromium emulation only).
- `preview_screenshot` tool limitation at wide viewports — DOM
  measurement used instead, per the responsive spec.
- No tablet-specific (third) image crop — desktop asset reused at
  tablet widths (explicitly allowed by Gate 1 spec).
- `/login-v3` is reachable but is **not** the production login route.
  Cutting `/login` over to this shell, and any decision about whether
  `LoginPageV2.jsx` is retired or kept as a fallback, is explicit Gate
  3 scope — not performed, not implied, not started here.

## Gate 2 decision

**PR-1F GATE 2 STATIC PIXEL-LOCKED SHELL CLOSED**
