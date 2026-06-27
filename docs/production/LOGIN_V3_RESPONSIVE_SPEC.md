# Login V3 Responsive Spec — PR-1F Gate 2

Documents the actual implemented behavior of `LoginPageV3.jsx` +
`LoginVisualPanel.jsx`, certified live in-browser at every required
breakpoint. See [`LOGIN_V3_DESIGN_LOCK.md`](LOGIN_V3_DESIGN_LOCK.md) for
the reference image this shell is built against, and
[`PR1F_GATE2_STATIC_LOGIN_SHELL_CLOSURE.md`](PR1F_GATE2_STATIC_LOGIN_SHELL_CLOSURE.md)
for the closure decision.

## Layout modes

| Range | Mode | Visual panel | Card |
|---|---|---|---|
| < 1024px | Stacked / overlay | `position: fixed; inset: 0`, full-bleed, dark gradient overlay (`rgba(2,6,17,0.5)` → `rgba(2,6,17,0.74)`) | Centered in a `min-height: 100vh` flex wrapper, width = `100% - 32px` (16px wrapper padding × 2), `border-radius: 24px` |
| ≥ 1024px | Split (desktop / tablet-landscape) | `position: relative; flex: 1`, left-edge blend gradient (`rgba(2,6,17,0.4)` → transparent at 16%) | Fixed-width column, `flex: 0 0 clamp(420px, 32vw, 460px)`, `height: calc(100vh - 80px)`, internally scrollable (`overflow-y: auto`) if content exceeds that height |

Both modes share the same DOM (`LoginVisualPanel` + the glass card) —
only CSS position/sizing changes at the breakpoint, so there is no
duplicate markup and no extra image request beyond the `<picture>`
source swap.

## Image asset selection

`<picture>` with one `<source media="(max-width: 1023px)">` pointing at
`login-v3-visual-mobile.webp`, falling back to
`login-v3-visual-desktop.webp` for everything ≥1024px — a native
browser mechanism, no JS-driven selection, no layout shift (explicit
`width`/`height` attributes on the `<img>` plus `object-fit: cover`).
`object-position: 50% 54%` keeps the reference's focal point (the
central PharmaPulse identity mark) visible at every aspect ratio — see
[`LOGIN_V3_DESIGN_LOCK.md`](LOGIN_V3_DESIGN_LOCK.md) for how that value
was derived from the source image's luminance centroid.

## Certified breakpoints

All measured live via Claude Preview (Chromium, CDP) against the local
dev server, using `document.documentElement.scrollWidth ===
clientWidth` (no horizontal overflow) and, at desktop sizes,
`scrollHeight === clientHeight` (no page-level vertical overflow either
— the spec's "no page scroll at standard desktop height" requirement).

| Viewport | Class | scrollWidth = clientWidth | scrollHeight = clientHeight | Notes |
|---|---|---|---|---|
| 320×650 | phone (min required) | ✅ 320=320 | n/a (intentional page scroll, content taller than viewport) | Card width 288px (320−32), all content reachable by scroll, no clipped footer |
| 375×812 | phone | ✅ 375=375 | n/a | Full content fits without scroll at this height |
| 390×844 | phone | ✅ 390=390 | n/a | — |
| 430×932 | phone | ✅ 430=430 | n/a | — |
| 768×1024 | tablet portrait | ✅ 768=768 | n/a | Full-bleed background mode (same as phone), card width capped at `max-width:380px` |
| 1024×768 | tablet landscape | ✅ 1024=1024 | ✅ 768=768 | First split-layout breakpoint; visual 604px / card 420px observed |
| 1440×900 | desktop | ✅ 1440=1440 | ✅ 900=900 | Visual 970px / card-wrap 460px (clamp ceiling) |
| 1920×1080 | wide desktop | ✅ 1910=1910 (scrollbar gutter) | ✅ 1080=1080 | Visual 1460px / card-wrap 460px |

## Defect found and fixed during certification

At 1920×1080 the first implementation showed **vertical overflow**
(`scrollHeight` 1342px against a 1080px viewport): `.lgv3-visual-img`
used `width:100%; height:100%` inside a flex item whose own height was
only resolved via flex stretch (not a definite value), so the
percentage height failed to resolve in time and the `<img>` fell back
to sizing by its intrinsic aspect ratio (1106:1024) against its
resolved width — inflating the whole page's height. Fixed by making
`.lgv3-root` use a definite `height: 100vh` (not `min-height`) at the
desktop breakpoint, and switching `.lgv3-visual-img` to
`position: absolute; inset: 0` so it sizes against its positioned
ancestor's already-resolved box instead of depending on percentage
resolution timing. Re-verified clean at 1024, 1440, and 1920px after
the fix (table above reflects the corrected state).

## RTL/LTR behavior

The app's `<html dir>` defaults to `rtl`/`ar`. Neither `LoginPageV2.jsx`
(the existing production page) nor the new `LoginPageV3.jsx` forces
`dir="ltr"` — both rely on plain DOM source order with no `order`
overrides relative to direction, so **in RTL the visual panel and the
card mirror sides** (visual moves to the inline-start edge, which is
the *left* in RTL; the card moves to the inline-end edge, the *right*).
This was verified to be **pre-existing, identical behavior already
shipped in `LoginPageV2.jsx`** — confirmed by screenshotting `/login`
at the same 1024×768 viewport and observing the same mirroring. This is
not a new defect introduced by Gate 2; it is disclosed here because the
approved reference image's literal "card-left/visual-right" composition
is the **LTR** presentation. Forcing the shell to always render
LTR-oriented (ignoring the app's RTL default) was not done in Gate 2 —
that would be a deliberate art-direction decision belonging to whoever
owns the eventual Gate 3 cutover, not an implicit side effect of a
visual-shell pass.

## Known limitations

- No physical-device review — Chromium viewport emulation only, same
  disclosed limitation carried from PR-1E6.
- The `preview_screenshot` tool in this session rendered a visibly
  truncated/scaled image at several wide viewports (1440×900,
  1920×1080) even though all DOM measurements (`getBoundingClientRect`,
  `scrollWidth`/`scrollHeight`) confirmed correct full-viewport layout.
  This reproduced **identically** on the already-shipped, unmodified
  `LoginPageV2.jsx` at the same viewport, proving it is a pre-existing
  tool/embedding quirk in this environment, not a defect in the new
  shell. Genuine, correctly-rendered screenshots were captured at
  375×812, 390×844, 768×1024, and 1024×768; the 1440×900 and 1920×1080
  rows above are certified by DOM measurement only, consistent with the
  evidentiary standard already accepted in
  [`MOBILE_CERTIFICATION_MATRIX.md`](MOBILE_CERTIFICATION_MATRIX.md)
  ("Pass/fail per cell was `scrollWidth === clientWidth`... plus a
  visual screenshot review").
- No tablet-specific (third) crop was produced in Gate 1 — the desktop
  asset is reused at tablet widths, which is explicitly allowed by the
  Gate 1 spec ("optional tablet asset").
- **Gate 3 addendum:** wiring the real error banner exposed one more
  instance of the RTL/LTR mirroring characteristic documented above —
  the trailing period in "Incorrect email or password." renders
  *before* the word, because the app's `<html dir>` defaults to `rtl`
  and neither login page forces `dir="ltr"` on its English content.
  Same root cause as the card/visual mirroring already disclosed
  above; not fixed in Gate 3 for the same reason forcing `dir` wasn't
  fixed in Gate 2 — it's an art-direction decision for whoever owns
  final cutover, not an implicit side effect of wiring auth states.
  Re-verified clean (no overflow, no clipped footer) at 375×812 and
  1440×900 for both the error state and the reset-password mode — see
  [`PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md`](PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md).
