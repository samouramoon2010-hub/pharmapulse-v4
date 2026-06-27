# Login Design Exploration — PR-1F Restart

Login V3 (the cyan→blue→purple glass-card shell from the earlier PR-1F
gates) was rejected by the product owner. This document is a from-scratch
visual exploration, not a refinement of that design — none of its layout,
color system, or markup was reused. Production `/login` still serves
`LoginPageV2.jsx`, untouched. `/login-v3` still serves the rejected shell,
also untouched (kept only as a historical artifact, not as a base for
anything below).

## Identity audit

**What PharmaPulse's real visual identity already is** (read directly from
the live token system, not assumed):

- **Brand color is teal**, not the rejected shell's cyan-to-purple
  gradient — `--brand-300/400/500` = `#5EEAD4 / #2DD4BF / #0D6B74`
  (`src/design/tokens.ts`, mirrored in `src/index.css`).
- **Canvas is dark navy-slate**, not near-black — `--bg-canvas #0F1623`,
  `--bg-surface #1A2235`.
- **Cards are solid, not heavy glass** — the product-wide `.card`/
  `.kpi-card` rule is a solid `--bg-surface` fill, 1px `--border-subtle`,
  `0.75rem` (12px) radius, and a one-line inset top highlight. Glassmorphism
  exists in the codebase (`glassTokens.ts`, `themeEffects.ts`) but is
  reserved for one optional "Apple/Executive" theme — it is not the
  default product language, and the rejected shell's unconditional
  `blur(20px)` ignored that distinction.
- **The real logo** (`src/components/brand/Logo.jsx`) is a small
  rounded-square teal icon with a minimal pulse-line glyph plus a plain
  "PharmaPulse / KPI Analytics" wordmark — calm and specific, not the
  rejected shell's separately-invented gradient "P" mark.
- **The product's actual personality** lives in the KPI-card vocabulary
  (`docs/ui3/kpi-card-blueprint.md`): achievement %, traffic-light status,
  actual/target/gap, sparklines — content-driven cards that "never grow
  taller than their content requires." The UI3 lock
  (`docs/ui3/implementation-rules.md`) explicitly bans canvas/particles/
  WebGL/heavy animation and giant low-content cards across the product.

**Strengths to inherit:** the teal brand system, dark-surface card
language, Inter/Cairo type, the calm/clinical/data-grounded tone, and
content-driven sizing.

**Inconsistencies to avoid repeating:** inventing a new color system
per-surface (what the rejected shell did), decorative visuals with no
operational meaning, fake biometric affordances, and mirroring an entire
composition for RTL instead of adapting content direction-aware.

**Emotional target:** the login should feel like stepping into a serious
operations instrument — calm, precise, trustworthy — not a product
marketing page and not a security-vendor portal.

## Concept A — Operational Intelligence

**Core idea:** branch activity rolling up into one pulse line — the same
visual grammar as the KPI-card sparkline and the Logo's own heartbeat
glyph, just at composition scale.

**Relationship to PharmaPulse:** directly extends the existing brand mark
and the "many branches → one performance view" mental model pharmacists
and regional leaders already have from the Dashboard/Branch Intelligence
surfaces.

**Visual metaphor:** five small nodes connected by a thin gradient line
converging toward one larger node — abstract, no real names, no real
numbers.

**Layout:** desktop split (form physically left, illustration physically
right, pinned with `inset-inline-end` so it never flips under RTL);
mobile collapses the illustration to a 160px band above the form.

**Color treatment:** token-driven — `--bg-canvas`, `--bg-surface`,
`--brand-300/400/500`, solid `--brand-500` button (no invented gradient
on the primary action).

**Mobile behavior:** form dominates below the band; inputs/card scale to
358px width at 390px viewport; no horizontal scroll.

**Strengths:** most directly "PharmaPulse," reuses real brand grammar,
moderate implementation complexity.

**Weaknesses:** of the three, the most visually similar to a generic
"enterprise SaaS with a hero illustration" pattern if the node motif isn't
refined further.

**Accessibility:** real `<label htmlFor>`, `autoComplete`, password-toggle
`aria-label`/`aria-pressed`, 16px inputs, focus-visible rings,
`prefers-reduced-motion` respected (no animation is used at all, so there
is nothing to disable, but the rule is present for any future motion).

**Performance:** pure CSS + 5 SVG lines/circles — no library, no canvas.

**Implementation complexity:** medium (one SVG composition, one media
query for the split→band collapse).

## Concept B — Executive Precision

**Core idea:** no illustration at all. Whitespace, type hierarchy, and one
thin rule do all the work.

**Relationship to PharmaPulse:** leans on the brand's calm/clinical side
rather than its data-density side — the "fewer decorative elements" end
of the brief.

**Visual metaphor:** a precision instrument panel — underline-style
inputs (no boxes), uppercase micro-labels, a single hairline divider.

**Layout:** single centered column at every breakpoint — there is no side
panel to collapse, so mobile and desktop share one structure.

**Color treatment:** almost entirely `--bg-canvas` with one very faint
radial teal glow; the only saturated color in the whole page is the
solid `--brand-500` button.

**Mobile behavior:** identical structure to desktop, just full-width with
padding — nothing to adapt.

**Strengths:** lowest implementation complexity and lowest risk of the
three; reads as immediately premium and enterprise; nothing to get wrong
responsively since there's no split layout.

**Weaknesses:** the least "pharmacy-specific" of the three — it would be
visually at home on almost any enterprise B2B product, trading specificity
for restraint.

**Accessibility:** same label/autoComplete/toggle/focus coverage as
Concept A; underline inputs still meet the 16px font-size and have a
visible focus state (`border-bottom-color` change + the shared
`:focus-visible` ring).

**Performance:** the lightest of the three — one radial-gradient
background, zero SVG, zero icons beyond the existing Logo/Mail/Lock/Eye
set.

**Implementation complexity:** low.

## Concept C — Human Pharmacy Network

**Core idea:** the same teal system, warmed slightly — an organic cluster
of soft circles standing in for branches/teams, rather than a clinical
grid.

**Relationship to PharmaPulse:** speaks to the people side of "Pharmacy
Operations Intelligence" — the branch managers and pharmacist teams the
product is built for, not just the data.

**Visual metaphor:** five soft blurred circles (mostly teal, one faint
warning-amber accent for warmth) behind two simple line icons (a storefront
and a people glyph from the already-installed `lucide-react` set).

**Layout:** desktop split, same physical-right-pinned illustration
technique as Concept A; mobile collapses to a 150px soft band.

**Color treatment:** still token-driven, with one deliberate accent
borrowed from the existing `--warning` token family for the single amber
blob — not a new color invented for this page.

**Mobile behavior:** same pattern as Concept A — band above, full-width
card below.

**Strengths:** warmest, most human-feeling option without abandoning the
brand palette; rounder 20px card radius gives it a distinct tactile feel
from A and B.

**Weaknesses:** the closest of the three to "decorative" — the blob
cluster carries less explicit operational meaning than Concept A's
node-and-line motif, so its relevance has to be carried more by copy
("support your pharmacy team today") than by the visual alone.

**Accessibility:** identical coverage to A/B.

**Performance:** CSS radial blobs (`filter: blur(2px)` on five small
`<span>`s) plus two static lucide icons — no library, no canvas.

**Implementation complexity:** medium (same split/collapse pattern as A).

## Comparison matrix

| Criterion | Concept A | Concept B | Concept C |
|---|---|---|---|
| PharmaPulse identity | High — reuses Logo's pulse motif directly | Medium — relies on type/restraint, not product-specific imagery | Medium-High — people/branch metaphor matches the product's audience |
| Enterprise trust | High | Highest — most restrained | High |
| Pharmacy relevance | High — "network rolling up" mirrors real Branch Intelligence mental model | Low-Medium — generic enterprise feel | High — explicitly "your pharmacy team" |
| Visual clarity | High | Highest — nothing competes with the form | High |
| Mobile quality | Good — band collapses cleanly, 358px card, no overflow | Best — nothing to collapse, identical structure everywhere | Good — same pattern as A |
| Accessibility | Full coverage (labels, autoComplete, toggle, focus, 16px) | Full coverage | Full coverage |
| Performance | Light (5 SVG lines/circles) | Lightest (one gradient, no SVG) | Light (5 CSS blobs + 2 icons) |
| Implementation risk | Medium | Low | Medium |

## Recommended concept

**Concept A** is the recommendation — it has the strongest direct tie to
PharmaPulse's existing brand grammar (the pulse-line motif already exists
in the real Logo) while still being calm and enterprise-appropriate, and
its implementation risk is no higher than Concept C's. This is a
recommendation only; no concept has been promoted to production or wired
to authentication.

## Screenshot evidence

`preview_screenshot` hung with a 30-second timeout on every attempt during
this session (a different failure mode than the wide-viewport
scaling/truncation quirk disclosed in the earlier PR-1F gates — this was a
full non-response, reproduced consistently across all three concepts and
both required viewports, including after a full page reload). Console logs
showed no page-level error during the hangs. Per this project's established
fallback when the screenshot tool is unavailable, each concept was instead
certified live at both required viewports using DOM measurement
(`getBoundingClientRect`, `scrollWidth`/`clientWidth`,
`scrollHeight`/viewport height) plus an accessibility-tree snapshot
(`preview_snapshot`) confirming correct semantic structure:

| Concept | 390×844 card/column width | 390×844 height | 1440×900 card/column width | 1440×900 height | Overflow |
|---|---|---|---|---|---|
| A | 358px | 530px | 420px | 530px | None (both axes) |
| B | 350px | 494px | 400px | 477px | None (both axes) |
| C | 358px | 510px | 420px | 510px | None (both axes) |

All three desktop card/column widths fall inside the requested 400–460px
range (A and C land on 420px; B, having no side panel, uses its own
`max-width: 400px`). No screenshot image files were exported to
`docs/production/evidence/login-design-exploration/` for the same
no-export-mechanism reason already disclosed in every prior PR-1F gate —
this directory is created with a `.gitkeep` placeholder and a note
pointing back to this table as the evidentiary record.

## Known limitations

- No physical-device review — Chromium viewport emulation only.
- No real Arabic copy or live i18n wiring — each concept hard-authors
  English and explicitly sets `dir="ltr"` for that reason (see the comment
  in each file). The CSS itself uses logical properties
  (`inset-inline-start/end`, `text-align: start`, `padding-inline-*`)
  specifically so that swapping in real Arabic copy + `dir="rtl"` later
  would correctly adapt text and control alignment without touching the
  composition — but that real-locale verification has not been performed,
  since it requires the actual i18n wiring this exploration was scoped to
  exclude.
- `preview_screenshot` failure (see above) — DOM measurement +
  accessibility snapshot used instead, consistent with this project's
  established evidentiary fallback.
- None of the three concepts has been reviewed against a real production
  account, a real password-reset flow, or any other authenticated
  behavior, because none of them call any auth service — by design, this
  phase is visual-only.
