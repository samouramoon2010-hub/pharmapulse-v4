# PR-1F Gate 1 — Asset Preparation — Closure Report

Scope: produce the production-bound right-panel visual assets for Login
V3 from the approved reference image, with the left login-card content
fully excluded. No component code, no auth logic, no routing was touched
in this gate. See [`LOGIN_V3_DESIGN_LOCK.md`](LOGIN_V3_DESIGN_LOCK.md)
for the full reference-image analysis this gate is based on.

## Official reference

`design-reference/login-v3-reference.png.png` — 1536×1024 PNG,
2,062,761 bytes, user-supplied and approved as the Login V3 Design Lock.
Used directly (file-based pixel processing), not recreated from
description or CSS.

## Tooling decision

No image-processing dependency exists in this repo (`package.json`
checked — no PIL/sharp/jimp/ImageMagick/`vite-imagetools`), and the task
explicitly forbids adding one. Used the browser's native Canvas 2D API
(`drawImage` for cropping, `canvas.toBlob('image/webp', q)` for WebP
encoding) via the already-available Claude Preview browser-automation
tooling — a zero-new-dependency, build-time/script-equivalent approach.

A temporary dev-only Vite middleware (`/__save-asset` POST endpoint in
`vite.config.js`) was used so the browser could stream the canvas blob
directly to disk, avoiding a wasteful base64 round-trip through the
session transcript. **This middleware has been fully removed** —
confirmed via `git diff vite.config.js`, which now shows only the
pre-existing, unrelated PR-1E5 PWA-manifest diff.

The source PNG was temporarily staged at `public/_gate1-source/` so the
dev server could load it same-origin (avoiding canvas tainting). **This
staged copy has been deleted** — it is not present in `public/` and will
not ship in any build.

## Crop boundary analysis

Computed column-wise luminance variance across sparse row samples to
find the objective boundary between the dark, low-variance left card
region and the brighter, higher-variance right visual region: the last
card-content variance spike was at x≈420–424 of the 1536px source width,
with a clean dark gap through x≈464. Crop boundary set at **x=430**
(10px margin past the last detected card-content pixel), height
unchanged (full 0–1024). This fully excludes the sample email
(`samir@alathirpharmacy.com`, rendered at x<420 in the reference) and
every other card element from both output assets.

## Output assets

| File | Dimensions | Size | Encoding |
|---|---|---|---|
| `public/assets/login-v3-visual-desktop.webp` | 1106×1024 | 240,956 bytes (~235 KB) | WebP, quality 0.88, full-height crop at x=430 |
| `public/assets/login-v3-visual-mobile.webp` | 820×759 | 115,714 bytes (~113 KB) | WebP, quality 0.82, same crop region downscaled |

Both verified on disk via `file`: `RIFF (little-endian) data, Web/P
image, ICC profile` at the stated dimensions, and verified served
correctly by the dev server (`fetch` → `200`, `content-type:
image/webp`, correct `content-length`) after a full server restart with
the temporary middleware removed — confirming the assets are static
files, not dependent on any export tooling.

No tablet-specific crop was produced — the desktop asset (1106×1024,
~1.08:1 aspect) is used at tablet widths in Gate 2; this is the
"optional" tablet asset explicitly allowed by the task.

## Privacy / content check

- Left-card content (email, password field, all card text/buttons):
  **fully excluded** — crop starts at x=430, all card content is at
  x<424.
- No personal email, password, name, branch, or role text is present in
  either output asset.
- No fake/interactive UI embedded in the image — both crops contain only
  the right-panel visual (identity mark, data-river, decorative label
  chips already part of the original artwork).
- Central PharmaPulse identity mark: preserved in both crops (focal
  centroid at ≈49.5%/54.3% of the cropped frame, well within bounds at
  both output sizes).
- Main data-river flow: preserved (crop only removes the card region;
  the visual's own composition is untouched, no rebuild).
- No glow reduction was applied — visual inspection of both outputs
  showed no readability issue requiring the optional 15–20% glow
  reduction.

## Asset validation summary

- Source size: 1536×1024, 2,062,761 bytes.
- Desktop output: 1106×1024, 240,956 bytes, WebP q0.88. Expected use:
  ≥768px viewports (tablet portrait through wide desktop) as the
  right-panel background/image in the split layout.
- Mobile output: 820×759, 115,714 bytes, WebP q0.82, downscaled to
  reduce mobile payload while remaining sharp at typical 2x DPR phone
  widths (~375–430px CSS width). Expected use: <768px viewports as a
  full-screen background behind the centered login card.
- Fallback behavior: none implemented in Gate 1 (no `<picture>`/`source`
  wiring yet — that is Gate 2 scope, consuming these two files).
- Compression method: native browser WebP encoder (`canvas.toBlob`), no
  external CLI or library.
- Asset paths are stable, public, and project-relative
  (`/assets/login-v3-visual-{desktop,mobile}.webp`), consistent with
  other static assets already in `public/assets/` style usage elsewhere
  in the repo.

## Files changed

- Added: `public/assets/login-v3-visual-desktop.webp`
- Added: `public/assets/login-v3-visual-mobile.webp`
- Added: `design-reference/login-v3-reference.png.png` (design source,
  not a production asset — kept under `design-reference/` outside
  `public/` and `src/` so it is never bundled)
- Added: `docs/production/LOGIN_V3_DESIGN_LOCK.md`
- Added: `docs/production/PR1F_GATE1_ASSET_PREPARATION_CLOSURE.md` (this
  file)
- No other files changed. `vite.config.js`'s temporary middleware was
  added and then fully reverted within this gate — net diff against the
  prior commit is zero for that change (confirmed via `git diff`).

## Gate 1 acceptance criteria

| Criterion | Status |
|---|---|
| Desktop visual asset exists | ✅ `login-v3-visual-desktop.webp`, 1106×1024 |
| Mobile visual asset exists | ✅ `login-v3-visual-mobile.webp`, 820×759 |
| Left-card content fully removed from the asset | ✅ crop starts at x=430, all card content at x<424 |
| No personal email or password remains | ✅ confirmed by crop boundary + visual check |
| Image quality is acceptable | ✅ q0.88/q0.82 WebP, no visible artifacting at intended viewport sizes |
| File size is reasonable | ✅ 235 KB desktop / 113 KB mobile |
| Asset paths are stable | ✅ static files under `public/assets/`, served at fixed `/assets/...` URLs |
| No unrelated files changed | ✅ confirmed via `git status`/`git diff` — only the files listed above |

## Gate 1 decision

**PR-1F GATE 1 ASSET PREPARATION CLOSED**
