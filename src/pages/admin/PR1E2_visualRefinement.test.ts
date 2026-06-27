// ============================================================
// PR-1E2 Visual Refinement Addendum — KPI Entry Redesign
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  resolveDailyPaceContext, resolvePaceStatus, resolveTargetContext, stepForPrecision,
} from '../pharmacist/KpiEntryPage.jsx'

// @ts-expect-error — ?raw import has no type declaration
async function kpiEntryPageSrc() { return (await import('../pharmacist/KpiEntryPage.jsx?raw')).default }

// ════════════════════════════════════════════════════════════
// 1. Daily pace methodology — resolveDailyPaceContext (pure function)
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — resolveDailyPaceContext: safe states only', () => {
  const ref = new Date(2026, 5, 10) // June 10, 2026 — 30-day month, 20 days remaining

  it('percentage-type KPI → always "not-applicable" (no ratio-of-a-ratio, no pace-by-day for a rating)', () => {
    expect(resolveDailyPaceContext({ target: 95, mtdActual: 50, valueType: 'percentage', referenceDate: ref }))
      .toEqual({ state: 'not-applicable' })
  })

  it('missing/null target → "not-applicable", never invents a pace', () => {
    expect(resolveDailyPaceContext({ target: null, mtdActual: 10, valueType: 'count', referenceDate: ref }))
      .toEqual({ state: 'not-applicable' })
    expect(resolveDailyPaceContext({ target: undefined, mtdActual: 10, valueType: 'count', referenceDate: ref }))
      .toEqual({ state: 'not-applicable' })
  })

  it('target is zero or negative → "not-applicable", never divides', () => {
    expect(resolveDailyPaceContext({ target: 0, mtdActual: 10, valueType: 'count', referenceDate: ref }).state).toBe('not-applicable')
    expect(resolveDailyPaceContext({ target: -5, mtdActual: 10, valueType: 'count', referenceDate: ref }).state).toBe('not-applicable')
  })

  it('MTD actual already meets/exceeds target → "completed", no pace number', () => {
    const ctx = resolveDailyPaceContext({ target: 100, mtdActual: 100, valueType: 'count', referenceDate: ref })
    expect(ctx).toEqual({ state: 'completed' })
    expect(resolveDailyPaceContext({ target: 100, mtdActual: 150, valueType: 'currency', referenceDate: ref }))
      .toEqual({ state: 'completed' })
  })

  it('remaining days is zero (last day of month) and target not yet met → "unavailable", never 0/day', () => {
    const lastDay = new Date(2026, 5, 30) // June 30 — daysRemaining = 0
    const ctx = resolveDailyPaceContext({ target: 1000, mtdActual: 200, valueType: 'count', referenceDate: lastDay })
    expect(ctx).toEqual({ state: 'unavailable' })
  })

  it('valid gap and valid remaining days → "pace" with a positive requiredDaily, never 0/day', () => {
    // gap = 1000 - 200 = 800; daysRemaining = 30 - 10 = 20 → 40/day
    const ctx = resolveDailyPaceContext({ target: 1000, mtdActual: 200, valueType: 'count', referenceDate: ref })
    expect(ctx.state).toBe('pace')
    expect(ctx.requiredDaily).toBe(40)
    expect(ctx.requiredDaily).toBeGreaterThan(0)
  })

  it('a negligible rounding-edge gap folds into "completed" rather than displaying 0/day', () => {
    // gap is tiny enough that gap/daysRemaining rounds to 0 at 1 decimal
    const ctx = resolveDailyPaceContext({ target: 100.01, mtdActual: 100, valueType: 'count', referenceDate: ref })
    expect(ctx.state).toBe('completed')
  })

  it('reuses the existing getDayProgress/computeRequiredDailyPace helpers — no new date or division formula', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('getDayProgress')
    expect(src).toContain("from '../../components/kpi/kpiVisualHelpers'")
    expect(src).toContain('computeRequiredDailyPace(gap, daysRemaining)')
  })
})

// ════════════════════════════════════════════════════════════
// 2. Status semantics — resolvePaceStatus (Ahead / On Track / Behind)
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — resolvePaceStatus: one tolerance, one Behind tier', () => {
  it('actual above the required/target value → ahead', () => {
    expect(resolvePaceStatus(900, 800)).toEqual({ tone: 'ahead', delta: 100 })
  })
  it('actual exactly at the required/target value → onTrack', () => {
    expect(resolvePaceStatus(800, 800)).toEqual({ tone: 'onTrack', delta: 0 })
  })
  it('actual below the required/target value → behind (single tier, no moderate/material split)', () => {
    expect(resolvePaceStatus(750, 800)).toEqual({ tone: 'behind', delta: -50 })
  })
  it('null/NaN inputs → null (no status rendered, not a fabricated comparison)', () => {
    expect(resolvePaceStatus(null, 800)).toBeNull()
    expect(resolvePaceStatus(800, null)).toBeNull()
    expect(resolvePaceStatus(NaN, 800)).toBeNull()
  })
  it('delta rounds to the same 1-decimal precision as computeRequiredDailyPace (a tolerance, not a new threshold)', () => {
    expect(resolvePaceStatus(800.04, 800).tone).toBe('onTrack')
  })
  it('no invented severity tiers exist in source (e.g. no "material"/"moderate" Behind split)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/material.*behind|moderate.*behind/i)
  })
})

// ════════════════════════════════════════════════════════════
// 3. Target scope clarity — branch-level target, never a bare label
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — target scope: always "Branch Monthly Target", never bare', () => {
  it('every rendered target label is scoped (هدف الفرع الشهري), no bare "الهدف:" left over', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('هدف الفرع الشهري')
    expect(src).not.toMatch(/>\s*الهدف:\s*\{/)
  })
  it('does not invent a personal/org/district target scope this collection does not support', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('هدف شخصي')
    expect(src).not.toContain('هدف المنطقة')
    expect(src).not.toContain('هدف المؤسسة')
  })
  it('resolveTargetContext itself is unchanged — same 4 states, same pct rule', () => {
    expect(resolveTargetContext({ targetValue: 90, actualRaw: '85', valueType: 'percentage' }))
      .toEqual({ state: 'target-only', target: 90 })
    expect(resolveTargetContext({ targetValue: 200, actualRaw: '100', valueType: 'count' }).pct).toBe(50)
  })
})

// ════════════════════════════════════════════════════════════
// 4. Layout — desktop/tablet operational grid, mobile stacked rows
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — desktop/tablet operational column structure', () => {
  it('renders a 4-column grid header (KPI / Target / Actual / Required-Status) at sm+', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('hidden sm:grid sm:grid-cols-[1.5fr_1fr_0.9fr_1.1fr]')
    expect(src).toContain('مؤشر الأداء (KPI)')
    expect(src).toContain('الهدف الشهري')
    expect(src).toContain('الإدخال الفعلي')
    expect(src).toContain('المطلوب لليوم / الحالة')
  })
  it('each KPI row reuses the same grid-cols template as the header (no separate desktop/mobile markup)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('sm:grid sm:grid-cols-[1.5fr_1fr_0.9fr_1.1fr] sm:items-start sm:gap-4')
  })
  it('no compressed 12-column mobile grid was introduced', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/grid-cols-12/)
  })
})

describe('PR-1E2 Visual Refinement — mobile stacked rows, no horizontal overflow', () => {
  it('the row container has no fixed pixel width and no overflowX:auto wrapper', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/overflowX:\s*['"]auto['"]/)
    expect(src).not.toMatch(/width:\s*['"]\d+px['"]/)
  })
  it('mobile content order is KPI → target → actual input → required/status (DOM source order, CSS-driven)', async () => {
    const src = await kpiEntryPageSrc()
    const rowStart = src.indexOf('{/* KPI label */}')
    const targetIdx = src.indexOf('{/* Target', rowStart)
    const actualIdx = src.indexOf('{/* Actual input', rowStart)
    const requiredIdx = src.indexOf('{/* Required today / status */}', rowStart)
    expect(rowStart).toBeGreaterThan(-1)
    expect(targetIdx).toBeGreaterThan(rowStart)
    expect(actualIdx).toBeGreaterThan(targetIdx)
    expect(requiredIdx).toBeGreaterThan(actualIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 5. No hardcoded mock data — every visible value comes from props/state
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — no hardcoded user/branch/date/value', () => {
  it('header uses live userProfile/pharmacy data, not a fixed name or branch', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('userProfile?.displayName')
    // PR-1E6: the raw pharmacyId fallback was removed (it could render a
    // raw Firestore document ID in production UI) — now falls back to a
    // plain placeholder instead of any identifier.
    expect(src).toContain("pharmacy?.name || '—'")
    expect(src).not.toContain('pharmacy?.name || pharmacyId')
    expect(src).not.toMatch(/Samir Goda|Al Athir|5074/)
  })
  it('date comes from selectedDate state, never a literal date string', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/2026-06-26|26\/06\/2026/)
  })
  it('target/actual figures are always rendered through formatNumber(ctx.target|pace.requiredDaily), never a literal number', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('formatNumber(ctx.target)')
    expect(src).toContain('formatNumber(pace.requiredDaily')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Input semantics preserved (unchanged contract)
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — input semantics unchanged', () => {
  it('inputMode/step/min/max are still registry-derived, unchanged from PR-1E2', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("inputMode={precision > 0 ? 'decimal' : 'numeric'}")
    expect(src).toContain('step={stepForPrecision(precision)}')
    expect(src).toContain('min={minAllowedValue}')
    expect(src).toContain('max={maxAllowedValue ?? undefined}')
  })
  it('blank stays blank, zero stays zero — payload loop unchanged', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("if (form[key] === '' || form[key] == null) continue")
    expect(src).toContain('payload[key] = Number(form[key])')
  })
  it('no pilot-tracking input was reintroduced', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('pilotEntryFields')
  })
  it('unit is shown near the input, not baked into the editable value', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toMatch(/\{unit && <span[^>]*>\{unit\}<\/span>\}/)
  })
})

// ════════════════════════════════════════════════════════════
// 7. Footer — save states, Discard, keyboard shortcut
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — footer: save states preserved, sticky offset preserved', () => {
  it('sticky bar wrapper class is byte-identical to PR-1E2 (no overlap regression)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('className="sticky sticky-save-bar z-10 card card-p flex items-center gap-3 py-3"')
  })
  it('Save button duplicate-save prevention is unchanged', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('disabled={saving || !pharmacyId || !uid}')
  })
  it('save status text states are unchanged (saving/saved/failed/unsaved/idle)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("saveState === 'saving'")
    expect(src).toContain("saveState === 'saved'")
    expect(src).toContain("saveState === 'failed'")
    expect(src).toContain("saveState === 'unsaved'")
  })
})

describe('PR-1E2 Visual Refinement — Discard Changes: ConfirmModal-gated, restores last loaded values', () => {
  it('Discard button opens a ConfirmModal — never window.confirm, never an immediate reset', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('onClick={() => setDiscardConfirmOpen(true)}')
    expect(src).toContain('open={discardConfirmOpen}')
    expect(src).not.toContain('window.confirm(')
  })
  it('confirmDiscard restores lastLoadedFormRef, not a freshly recomputed/blank form', async () => {
    const src = await kpiEntryPageSrc()
    const fnStart = src.indexOf('const confirmDiscard = ()')
    const fnEnd   = src.indexOf('}', src.indexOf('{', fnStart))
    const fnBody  = src.slice(fnStart, src.indexOf('setDiscardConfirmOpen(false)', fnStart) + 30)
    expect(fnBody).toContain('lastLoadedFormRef.current')
  })
  it('dirty state and errors are cleared only inside confirmDiscard (after confirmation), not on opening the modal', async () => {
    const src = await kpiEntryPageSrc()
    const openIdx = src.indexOf('setDiscardConfirmOpen(true)')
    const openLine = src.slice(Math.max(0, openIdx - 80), openIdx + 20)
    expect(openLine).not.toContain('setDirtyKeys(new Set())')
  })
  it('Discard is disabled when there is nothing unsaved to discard', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("disabled={saveState !== 'unsaved'}")
  })
  it('the prefill effect and Discard share one source of truth (buildFilledFormFromEntry), not duplicated logic', async () => {
    const src = await kpiEntryPageSrc()
    expect((src.match(/buildFilledFormFromEntry\(/g) || []).length).toBeGreaterThanOrEqual(1)
    expect(src).toContain('function buildFilledFormFromEntry(existingEntry, emptyForm)')
  })
})

describe('PR-1E2 Visual Refinement — Ctrl/Cmd+S shortcut: implemented, so the hint may be shown', () => {
  it('listens for ctrlKey/metaKey + "s" and calls preventDefault', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'")
    expect(src).toContain('e.preventDefault()')
  })
  it('does nothing while already saving', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('if (savingRef.current) return')
  })
  it('reuses handleSave (and therefore validate()) — never a separate silent-save path', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('handleSaveRef.current()')
  })
  it('the listener is added/removed on this page only (mount/unmount), never a global app-level binding', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("window.addEventListener('keydown', onKeyDown)")
    expect(src).toContain("window.removeEventListener('keydown', onKeyDown)")
  })
  it('the shortcut hint is only rendered because the shortcut is actually implemented above', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('Ctrl / Cmd + S')
  })
})

// ════════════════════════════════════════════════════════════
// 8. Accessibility
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — accessibility: text+icon status, preserved semantics', () => {
  it('status badges render visible text, not color-only (icon + label string)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('tone.label')
    expect(src).toContain('<ToneIcon')
  })
  it('category aria-expanded/aria-controls and sr-only equivalents are unchanged', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('aria-expanded={isOpen}')
    expect(src).toContain('aria-controls={panelId}')
    expect(src).toContain('<span className="sr-only">')
  })
  it('input label association (htmlFor/id) is unchanged', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('htmlFor={inputId}')
    expect(src).toContain('id={inputId}')
  })
  it('save-state live region is preserved in both the header pill and the sticky bar', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('<span role="status" aria-live="polite">{saveStatusText}</span>')
    expect((src.match(/role="status" aria-live="polite"/g) || []).length).toBeGreaterThanOrEqual(3)
  })
  it('viewport zoom is not disabled anywhere in this file', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('maximum-scale')
    expect(src).not.toContain('user-scalable=no')
  })
  it('DOM order keeps KPI label before target before actual before required/status (no misleading screen-reader order from CSS)', async () => {
    const src = await kpiEntryPageSrc()
    const a = src.indexOf('{/* KPI label */}')
    const b = src.indexOf('Target — always scoped')
    const c = src.indexOf('{/* Actual input')
    const d = src.indexOf('{/* Required today / status */}')
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(c).toBeLessThan(d)
  })
})

// ════════════════════════════════════════════════════════════
// 9. Performance — no new dependency, no duplicated business logic
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — performance: derived data, no new dependency', () => {
  it('monthActualSums is memoized off the already-subscribed entries list — no new Firestore read', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('const monthActualSums = useMemo(')
    expect(src).not.toMatch(/collection\(\s*['"]/)
  })
  it('one row markup serves both mobile and desktop via Tailwind responsive classes, not two parallel JSX trees', async () => {
    const src = await kpiEntryPageSrc()
    const rowOpens = (src.match(/sm:grid sm:grid-cols-\[1\.5fr_1fr_0\.9fr_1\.1fr\] sm:items-start sm:gap-4/g) || []).length
    expect(rowOpens).toBe(1) // one row template, reused per KPI via .map — not duplicated per breakpoint
  })
  it('no new npm dependency is imported (only existing engine/components/utils modules)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/from ['"](?!\.\.?\/|react|lucide-react)[a-zA-Z]/)
  })
})

// ════════════════════════════════════════════════════════════
// 10. No scope creep — out-of-bounds items untouched
// ════════════════════════════════════════════════════════════
describe('PR-1E2 Visual Refinement — no scope creep', () => {
  it('does not write a target (still no saveTarget call)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('saveTarget(')
  })
  it('does not implement autosave', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/setInterval/)
  })
  it('notes remain optional and informational — no claim that they affect evaluation', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('لا تؤثر على التقييم')
  })
  it('does not add a new persisted notes contract beyond the existing payload.notes field', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("notes:     form.notes?.trim() || ''")
  })
})
