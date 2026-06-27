# Login Background Preview — `/login-network-preview`

## Why this isn't built on the originally-supplied static image

A static login-screen mockup image was supplied as the intended background
source. Phase 0 inspection stopped before any code was written, because the
image tripped two explicit stop conditions:

- It already contained rendered login fields baked into the pixels: an email
  input pre-filled with `samir@alathirpharmacy.com`, a password input, a
  "Sign in" button, and active-looking "Continue with Face ID" / "Sign in
  with Passkey" buttons.
- It contained personal data — the email address rendered as permanent
  pixel text.

It was also, visually, the previously-rejected Login V3 shell (cyan→purple
particle vortex, glowing gradient "P" mark, floating icon/label chips) that
the product owner had already rejected earlier in this engagement, and that
an earlier brief for this same background work explicitly listed as
something to avoid.

Given a choice between supplying a clean image, cropping the abstract
portion of the rejected image, or reusing the already-built code-generated
background, **the code-built animated network background was selected.**
That background (`design-assets/login-background/`) is a calm navy/teal
network animation with no particles, no baked-in UI, and no personal data —
already reviewed earlier in this engagement.

## Source assets

| File | Dimensions | Format | Size |
|---|---|---|---|
| `login-bg-desktop-1920x1080.mp4` | 1920×1080 | H.264 MP4, 30fps, 9.000s seamless loop | 546 KB |
| `login-bg-desktop-1920x1080.webp` | 1920×1080 | static poster (frame 0) | 129 KB |
| `login-bg-mobile-1080x1920.mp4` | 1080×1920 | H.264 MP4, 30fps, 9.000s seamless loop | 465 KB |
| `login-bg-mobile-1080x1920.webp` | 1080×1920 | static poster (frame 0) | 111 KB |

Served from `public/login-network-preview/` (copied from
`design-assets/login-background/`, the source of record). No text, UI
elements, logos, or personal data exist anywhere in these files.

**Focal point / calm area:**
- Desktop composition: a flat, unanimated calm zone occupies the left ~43%
  of the frame (no nodes, no lines, no glow); the network (7 nodes
  converging on one hub, gradient connector lines, ambient glow) occupies
  the right ~57%.
- Mobile composition: the network is split into two small bands at the very
  top and bottom edges; the vertical center (~42% of height) is a flat,
  unanimated calm zone.

## Form placement decision

**Desktop:** the panel is anchored to the physical left side (inside the
calm zone), independent of the active locale — see "RTL/LTR behavior"
below. **Mobile:** the panel is centered, sitting in the calm vertical
middle band.

## Desktop behavior (≥768px)

- Full-viewport `<video>` (`object-fit: cover`), the 1920×1080 desktop loop.
- The panel wrapper uses `justify-content: flex-start` with
  `padding-inline-start: 64px`, placing the 420px-wide panel inside the
  calm zone.
- Panel height is content-driven (~589px measured live), never a forced
  full-height card.
- No page scroll at 1024×768, 1440×900, or 1920×1080 (verified live — panel
  bottom edge stays 80–400px above the viewport bottom at each size).

## Mobile behavior (<768px)

- Full-viewport `<video>`, the 1080×1920 mobile loop, swapped in via a
  `matchMedia('(min-width: 768px)')` check (only one `<video>` is ever
  mounted — the other composition's video is never requested).
- Panel width is `calc(100% - 32px)` (16px wrapper padding each side) —
  measured 358px at 390px viewport, 398px at 430px viewport.
- No horizontal overflow at any tested width (`body.scrollWidth ===
  document.documentElement.clientWidth` confirmed at 390/430/768px).
- Safe-area bottom inset respected via
  `padding-bottom: max(24px, env(safe-area-inset-bottom))`.
- The solid `--bg-surface` card (not a transparent/glass panel) keeps input
  text readable regardless of what's moving behind it.

## Login panel design

Solid surface card (not glass) — matches PharmaPulse's default `.card`
pattern, since the dark, sparse network background doesn't need or benefit
from glass blur: `var(--bg-surface)` fill, 1px `var(--border-subtle)`
border, 12px radius, restrained shadow
(`0 0 0 1px rgba(255,255,255,0.04), 0 12px 32px rgba(0,0,0,0.35)`).

Content order (matches the required structure): brand mark → eyebrow line
→ heading → subtitle → email input → password input → remember-me /
forgot-password row → sign-in button → security note → language toggle.

Dimensions: 420px max-width, 32px padding, 50px input/button height, 14px
inter-field gap — all within the requested 400–440 / 28–36 / 50–52 / 12–18
ranges. No biometric controls, no sample credentials, no decorative extra
cards.

## Motion and micro-interactions

| Interaction | Implementation |
|---|---|
| Page entrance | panel fade + 14px upward translate, 620ms ease-out |
| Brand entrance | scale 0.92→1 + opacity reveal, 500ms, 80ms delay |
| Input focus | border-color + box-shadow transition (0.15s) |
| Button hover | 1px lift + brightness + arrow translates 3px (mirrors under RTL) |
| Loading state | spinner icon + "Signing in…" text, `aria-busy="true"`, button disabled |
| Success state | checkmark + "Signed in" text (auto-reverts after 1.3s) |
| Error state | 420ms localized shake on the panel only + inline error text — no full-page movement |
| Reduced motion | a single `@media (prefers-reduced-motion: reduce)` block removes all of the above transforms/animations; the background also swaps from `<video>` to a static `<img>` poster |

All loading/success/error states are simulated locally (no Firebase call) so
the micro-interactions can be reviewed before any auth wiring exists.

## Accessibility

Real `<label htmlFor>` for email, password, and the remember-me checkbox;
`aria-label` on the form; `autoComplete="email"` / `"current-password"`;
accessible, `aria-pressed` password-visibility toggle; 16px input font-size
(no iOS zoom-on-focus); visible `:focus-visible` rings
(`var(--brand-400)` outline); `aria-live="polite"` error region;
`aria-busy` during the simulated submit; logical DOM order matching the
required panel structure (verified by the certification test suite).

## RTL/LTR behavior

This preview uses the app's **real** locale state via `useI18n()`
(`src/hooks/useI18n.ts`) — `lang`, `dir`, and `setLang` are the same values
and action used by Settings elsewhere in the app, not a hardcoded locale.

Two layers:
- **Macro layout** (background split + which physical side the panel sits
  on) is pinned with an explicit CSS `direction: 'ltr'` on the root — this
  keeps the panel inside the calm zone (physically left) and stops the
  whole composition from mirroring just because the locale changes, per
  the background asset's fixed, baked-in composition.
- **Panel content** (`dir={dir}`) carries the *real* locale — text
  alignment, icon position, and button-arrow direction all flip correctly
  for Arabic. Verified live: switching the real app language to English
  re-renders the heading as "Welcome back" with `dir="ltr"`; switching back
  to Arabic restores `dir="rtl"` and the Arabic copy, while the panel's
  `x` position relative to the viewport does not change in either case.

The in-panel language toggle (EN/AR) calls the same `setLang` used by the
rest of the app — it is a real, working control, not a decorative one, and
it was switched back to the app's original language after testing so this
preview leaves no persisted side effect.

## Performance

- No new runtime dependency — `lucide-react`, `react`, and the existing
  `useI18n` hook only.
- No canvas, no WebGL, no particle library, no video library.
- Only one `<video>` element is ever mounted (breakpoint-gated), so the
  unused composition's ~500KB file is never requested.
- Total weight if both compositions were ever loaded across a session:
  ~1.1MB MP4 + ~240KB WebP combined; in practice a single page view loads
  one ~550KB video and its ~130KB poster.
- `prefers-reduced-motion` swaps the `<video>` for a static `<img>`,
  avoiding decode/playback cost entirely for users who've opted out of
  motion.
- No layout shift: the background box is always `width: 100%; height: 100%`
  regardless of video metadata load state; the panel's dimensions don't
  depend on image/video load completion.

## Screenshot evidence

`preview_screenshot` exhibited the same wide-viewport rendering quirk
documented in earlier phases of this project (the captured JPEG visually
under-represents the rendered viewport), and this environment has no
mechanism to persist the tool's inline screenshot output as files on disk.
Per this project's established fallback, the page was instead certified
live at all six required breakpoints using DOM measurement
(`getBoundingClientRect`, `scrollWidth`/`clientWidth`) plus an
accessibility-tree snapshot confirming semantic structure:

| Viewport | Panel width | Panel height | Panel x | Overflow |
|---|---|---|---|---|
| 390×844 | 358px | 589px | 16px | None |
| 430×932 | 398px | 589px | 16px | None |
| 768×1024 | 420px | 589px | 64px | None |
| 1024×768 | 420px | 589px | 64px | None |
| 1440×900 | 420px | 589px | 64px | None |
| 1920×1080 | 420px | 589px | 64px | None |

Also confirmed live: background video swaps from the mobile to the desktop
composition exactly at the 768px breakpoint; the validation shake + error
text fire on empty submit; the simulated loading→success sequence renders
correctly; and switching the real app language between English and Arabic
flips panel `dir`/copy without moving the panel's `x` position.

No screenshot image files were exported to
`docs/production/evidence/login-network-preview/` for the reason stated
above — this directory holds a README pointing back to this table as the
evidentiary record, consistent with the fallback already used in the Login
Design Exploration and PR-1F gates.

## Known limitations

- No physical-device review — Chromium viewport emulation only.
- `preview_screenshot` visual capture is unreliable in this environment
  (see above); DOM measurement + accessibility snapshot used instead.
- The language toggle changes the real, persisted app language setting
  (same store used by Settings) — this is a deliberate, disclosed choice
  since the brief required using the real app locale, not a fabricated
  control; it was reset to the original value after testing.
- No real auth call exists anywhere on this page — loading/success states
  are locally simulated for review purposes only.
- Production `/login` (`LoginPageV2.jsx`), Firebase Auth, password reset,
  redirect/session logic, and route guards are unchanged.
