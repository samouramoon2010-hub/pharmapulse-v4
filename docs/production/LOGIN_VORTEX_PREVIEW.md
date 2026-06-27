# Login Vortex Preview — `/login-vortex-preview`

A second background option, built from a real cropped piece of the
original reference artwork rather than the fully code-generated network
loop used in `/login-network-preview`.

## Why this exists alongside `/login-network-preview`

The product owner asked to use `design-reference/login-v3-reference.png`
(the rejected Login V3 mockup) directly as the login background. That
image could not be used as-is — see
[`LOGIN_STATIC_BACKGROUND_PREVIEW.md`](LOGIN_STATIC_BACKGROUND_PREVIEW.md)
for the full Phase-0 rejection reasoning (it bakes in a real email address
and rendered login fields/Face ID/Passkey buttons). Given a choice between
supplying a different image, cropping just the abstract portion, or
keeping the existing code-built background, the product owner chose to
crop the abstract portion. This page is that result, kept as an additive
alternative — `/login-network-preview` is untouched.

## Source, crop, and composite

**Source:** `design-reference/login-v3-reference.png` (1536×1024 PNG,
2.06 MB) — the rejected Login V3 mockup.

**Crop:** every full-width or full-height crop attempt still caught at
least one of the seven labeled callouts ("SECURE CONNECTION", "DATA
ENCRYPTED", "AI INSIGHTS", "PHARMACY NETWORK", "INTELLIGENCE FLOW",
"PERFORMANCE ANALYTICS", "OPERATIONAL EXCELLENCE" — they sit at multiple
heights on both sides of the artwork). The only crop region with zero text
is a near-square 480×600 region centered on the glowing "P" mark and its
immediate spiral (`crop=480:600:790:190` in source coordinates). A few
small *unlabeled* decorative icon glyphs remain woven directly into the
spiral's texture at varying distances from center — these could not be
separated from the spiral by cropping alone, and this limitation was
disclosed to and accepted by the product owner before proceeding.

**Composite (not a destructive stretch):** the clean crop is placed as an
inset graphic — scaled up preserving its original aspect ratio (no
distortion) — on a flat `--bg-canvas` (`#0F1623`), with two blending
passes so it doesn't read as a pasted rectangle:
1. A radial alpha-feather mask applied to the artwork's own edges (full
   opacity at center, fading to fully transparent before the bounding
   box edge).
2. A separately blurred, enlarged, lower-opacity copy of the same artwork
   placed behind it as a soft glow halo.

Both passes were built and inspected iteratively (3 desktop revisions) via
ffmpeg `geq`/`alphamerge`/`gblur` filters before arriving at the shipped
result.

## Output assets

| File | Dimensions | Format | Size |
|---|---|---|---|
| `login-bg-vortex-desktop-1920x1080.png` | 1920×1080 | lossless PNG | 749 KB |
| `login-bg-vortex-desktop-1920x1080.webp` | 1920×1080 | lossy q90 WebP | 78 KB |
| `login-bg-vortex-mobile-1080x1920.png` | 1080×1920 | lossless PNG | 729 KB |
| `login-bg-vortex-mobile-1080x1920.webp` | 1080×1920 | lossy q90 WebP | 77 KB |

Source of record: `design-assets/login-background-vortex/`. Served from
`public/login-vortex-preview/` (the WebP pair only — the page always
requests WebP, so the PNGs were not duplicated into `public/`).

**Composition:**
- Desktop: artwork inset at 760×950 (aspect-preserved), right side,
  vertically centered, ~140px margin from the right edge; everything left
  of it is flat, unanimated canvas — the calm zone for the panel.
- Mobile: artwork inset at 760×950 near the top (~5% to ~53% of the
  1920px-tall canvas); everything below is flat canvas — the calm zone.

## Form placement and layout

**Desktop (≥768px):** identical panel anchoring to
`/login-network-preview` — physically left, `padding-inline-start: 64px`,
420px max-width, content-driven height (~589px), no scroll at any tested
size (confirmed at 768/1024/1440/1920px widths).

**Mobile (<768px):** this is the one real layout difference from
`/login-network-preview`. The panel's content-driven height (~589–605px)
does not reliably fit in the calm space below the artwork on short
viewports (e.g. at 390×844 the artwork's visible bottom edge lands at
≈444px, leaving only ~400px before the viewport bottom). Centering the
panel or anchoring it to the viewport bottom both risked overlapping the
artwork. Instead:
- The panel is anchored by a **fixed `padding-top: 57vh`** (just below the
  artwork's bottom edge), not viewport-relative centering.
- `.lvp-bg` is `position: fixed` so the background still fills the
  viewport even as the page scrolls.
- `.lvp-root` only constrains `overflow-x`, not `overflow-y` — the page is
  allowed to scroll vertically when the panel doesn't fully fit, per this
  brief's own allowance ("content may scroll vertically if required").

Verified live: 390×844 (panel y=481, no overlap, page scrolls ~249px),
360×640 (panel y=365, no overlap, page scrolls ~354px) — no horizontal
overflow at either size.

## Login panel, motion, accessibility, RTL/LTR, performance

Identical to `/login-network-preview` (same component structure, same
`lvp-`-prefixed CSS instead of `lnp-`): solid `--bg-surface` card, full
required field order, simulated loading/success states, localized shake
on empty submit, full `prefers-reduced-motion` coverage, real
`useI18n()`-driven `dir`/`lang` with a macro layout pinned via
`direction: 'ltr'` so the artwork/panel split doesn't mirror under RTL.
The only difference is the background itself: a static `<img>` (no
`<video>`, since the source is a single composited still, not an
animation) — confirmed no new dependency, no canvas/WebGL.

## Known limitations

- A few small, unlabeled decorative icon glyphs remain inside the cropped
  artwork's own spiral texture — disclosed and accepted before cropping;
  not addressable without re-drawing the artwork, which was explicitly out
  of scope ("do not redraw it").
- No physical-device review — Chromium viewport emulation only.
- `preview_screenshot` visual capture is unreliable in this environment
  (documented in earlier phases); DOM measurement
  (`getBoundingClientRect`, `scrollHeight`/`scrollWidth`) was used instead
  to certify panel position/overlap/overflow at every tested size.
- No real auth call exists anywhere on this page.
- Production `/login`, `/login-network-preview`, Firebase Auth, and route
  guards are unchanged.
