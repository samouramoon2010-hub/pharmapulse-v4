# Login V3 Design Lock — PR-1F

This is the official design reference for PR-1F (Login V3). It is locked:
do not reinterpret, do not substitute a different visual concept, do not
replace the right-side visual with an unrelated gradient/abstract SVG/
particle library/generic CSS waves.

## Official reference image

- Source: `design-reference/login-v3-reference.png.png` (user-supplied,
  approved design lock — note the on-disk filename has a double `.png`
  extension; this is the actual filename, not a typo to fix).
- Format: PNG, 8-bit RGB, non-interlaced.
- Dimensions: **1536 × 1024px**.
- Size: 2,062,761 bytes (~2.0 MB).
- This file is a **design reference only**. It is not bundled into the
  app and is not imported by any component — see Gate 1 asset
  preparation below for the production-bound derivatives.

## Visual composition (as observed in the reference)

Split-screen layout, two regions:

- **Left region (~x: 0–424px of 1536px width)** — a dark glass login
  card: PharmaPulse brand mark + wordmark ("Pharma" white / "Pulse"
  cyan), "Identity Gateway V3" subtitle, "Welcome back" heading,
  supporting subtitle, email field (reference render showed a sample
  email — excluded from all derived assets, see Gate 1), password field,
  "Forgot password?" link, gradient "Sign in →" button, "or" divider,
  "Continue with Face ID" button, "Sign in with Passkey [New]" button,
  security footer ("Protected by PharmaPulse Identity" / "Your data is
  encrypted and secure"), language selector, Privacy Policy / Terms of
  Service links.
- **Dark gap (~x: 424–464px)** — neutral transition between card and
  visual, no content.
- **Right region (~x: 464–1536px of 1536px width)** — the intelligence /
  data-river visual: a central cyan-purple "P" + pulse-line PharmaPulse
  identity mark, radiating spiral particle streams, 7 decorative label
  chips scattered around the edges (SECURE CONNECTION, DATA ENCRYPTED,
  AI INSIGHTS, PHARMACY NETWORK, INTELLIGENCE FLOW, PERFORMANCE
  ANALYTICS, OPERATIONAL EXCELLENCE).

## Palette

Navy/near-black background, cyan and blue accents on the brand mark and
primary button gradient, purple in the secondary glow of the visual
panel. No additional accent colors.

## Card geometry (reference)

- Card left-edge content ends at approximately x=420–424px (measured via
  column-luminance-variance analysis, see Gate 1 below).
- Visual panel proper begins at approximately x=468px+.
- This gives a safe crop boundary at **x=430px** (10px past the last
  detected card-content pixel spike) for deriving the right-panel-only
  asset with zero card content retained.

## Focal point

Luminance-weighted centroid of the bright/glow region (luma > 200,
x > 460) sits at **(977, 556)** in the original 1536×1024 frame. In
coordinates relative to the x=430 crop (1106×1024), that is **≈49.5%
horizontal / 54.3% vertical** — i.e. CSS `object-position: 50% 54%`
(effectively "center") keeps the identity mark visible across the
varying right-panel aspect ratios used at different breakpoints.

## Existing prior implementation (for context, not the design lock)

`src/pages/auth/LoginPageV2.jsx` already implements this same visual
concept's left card and decorative label chips in hand-built CSS/SVG
(via `DataOceanBackground.jsx` + `IdentityPulseLogo.jsx` for the right
panel). PR-1F's explicit mandate is to replace **only the right-panel
rendering technique** (CSS/SVG → optimized image asset) while preserving
the left card's real React form components and all existing auth logic.
This document records the reference's true visual target; it does not
imply `LoginPageV2.jsx` is being deleted or that its auth wiring changes.

## Gate 3 note

Gate 3 (auth integration) made **no changes to this lock** — no
layout, spacing, asset, or color change. It only wired the
already-built shell to the real auth contract and added focus
management + `aria-busy` to existing elements. See
[`PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md`](PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md).
