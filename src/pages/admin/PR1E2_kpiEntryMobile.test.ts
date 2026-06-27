// ============================================================
// PR-1E2 — KPI Entry Mobile Workflow — focused certification
// ============================================================
import { describe, it, expect } from 'vitest'
import { resolveTargetContext, stepForPrecision } from '../pharmacist/KpiEntryPage.jsx'

// @ts-expect-error — ?raw import has no type declaration
async function kpiEntryPageSrc() { return (await import('../pharmacist/KpiEntryPage.jsx?raw')).default }

// ════════════════════════════════════════════════════════════
// 1. Target/progress context — resolveTargetContext (pure function)
// ════════════════════════════════════════════════════════════
describe('PR-1E2 — resolveTargetContext: no target / zero target / mislead guards', () => {
  it('no target document → state "none" (renders "بدون هدف", never 0%)', () => {
    expect(resolveTargetContext({ targetValue: null, actualRaw: '10', valueType: 'count' }))
      .toEqual({ state: 'none' })
    expect(resolveTargetContext({ targetValue: undefined, actualRaw: '10', valueType: 'count' }))
      .toEqual({ state: 'none' })
    expect(resolveTargetContext({ targetValue: '', actualRaw: '10', valueType: 'count' }))
      .toEqual({ state: 'none' })
  })

  it('target is exactly zero → state "zero", never divides, never computes a percentage', () => {
    const ctx = resolveTargetContext({ targetValue: 0, actualRaw: '10', valueType: 'count' })
    expect(ctx.state).toBe('zero')
    expect(ctx).not.toHaveProperty('pct')
  })

  it('target is a negative/garbage value → also "zero" (unavailable for percentage)', () => {
    expect(resolveTargetContext({ targetValue: -5, actualRaw: '10', valueType: 'count' }).state).toBe('zero')
  })

  it('valid target but actual not yet entered (blank) → "target-only", no percentage shown', () => {
    const ctx = resolveTargetContext({ targetValue: 100, actualRaw: '', valueType: 'count' })
    expect(ctx).toEqual({ state: 'target-only', target: 100 })
  })

  it('valid target, percentage-type KPI, actual entered → "target-only" (no ratio-of-ratio)', () => {
    const ctx = resolveTargetContext({ targetValue: 90, actualRaw: '85', valueType: 'percentage' })
    expect(ctx).toEqual({ state: 'target-only', target: 90 })
  })

  it('valid target, non-percentage KPI, actual entered (incl. explicit 0) → real achievement %', () => {
    const ctx = resolveTargetContext({ targetValue: 200, actualRaw: '100', valueType: 'count' })
    expect(ctx.state).toBe('achievement')
    expect(ctx.pct).toBe(50)
    // explicit zero is a real entered value — must still compute (0%), not fall back to "target-only"
    const zeroActual = resolveTargetContext({ targetValue: 200, actualRaw: '0', valueType: 'count' })
    expect(zeroActual.state).toBe('achievement')
    expect(zeroActual.pct).toBe(0)
  })

  it('currency-type KPI with a valid target and entered actual computes achievement like count', () => {
    const ctx = resolveTargetContext({ targetValue: 1000, actualRaw: '1200', valueType: 'currency' })
    expect(ctx.state).toBe('achievement')
    expect(ctx.pct).toBeGreaterThan(0)
  })
})

describe('PR-1E2 — stepForPrecision: reuses the registry precision rule, no invented decimals', () => {
  it('precision 0 (count/number) → step "1"', () => { expect(stepForPrecision(0)).toBe('1') })
  it('precision 1 (percentage) → step "0.1"', () => { expect(stepForPrecision(1)).toBe('0.1') })
  it('precision 2 (currency) → step "0.01"', () => { expect(stepForPrecision(2)).toBe('0.01') })
})

// ════════════════════════════════════════════════════════════
// 2. Input semantics — source assertions
// ════════════════════════════════════════════════════════════
describe('PR-1E2 — KPI input: mobile-correct semantics, no new decimal/min/max logic', () => {
  it('reuses toKpiUiConfig from the registry instead of inventing precision/min/max', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("toKpiUiConfig,")
    expect(src).toContain('toKpiUiConfig(kpi, idx + 1)')
  })
  it('inputMode switches between numeric and decimal based on registry precision', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("inputMode={precision > 0 ? 'decimal' : 'numeric'}")
  })
  it('step/min/max are wired from the registry, not hardcoded', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('step={stepForPrecision(precision)}')
    expect(src).toContain('min={minAllowedValue}')
    expect(src).toContain('max={maxAllowedValue ?? undefined}')
  })
  it('every input keeps the existing 16px-equivalent text-base class (no iOS zoom regression)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toMatch(/className=\{`text-base/)
  })
  it('label uses htmlFor matching the input id (real label association, not just visual proximity)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('htmlFor={inputId}')
    expect(src).toContain('id={inputId}')
  })
  it('no pilot-tracking editable input was reintroduced', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('buildPilotEntryFields')
    expect(src).not.toContain('pilotEntryFields')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Category collapse — source assertions
// ════════════════════════════════════════════════════════════
describe('PR-1E2 — category collapse: real registry categories, no data loss on collapse', () => {
  it('category header exposes aria-expanded/aria-controls and a visible count', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('aria-expanded={isOpen}')
    expect(src).toContain('aria-controls={panelId}')
    expect(src).toContain('{group.items.length}')
  })
  it('toggling a category only flips a Set membership — never touches form/payload state', async () => {
    const src = await kpiEntryPageSrc()
    const fnStart = src.indexOf('const toggleCategory = useCallback')
    const fnEnd   = src.indexOf('}, [])', fnStart)
    const fnBody  = src.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain('setForm')
    expect(fnBody).not.toContain('setErrors')
  })
  it('collapsed categories are skipped in render only — group.items is never filtered/sliced', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/group\.items\.filter/)
    expect(src).not.toMatch(/group\.items\.slice/)
  })
  it('error categories are force-opened via an effect keyed on errors/entryFields', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toMatch(/useEffect\(\(\) => \{\s*const errorKeys/)
    expect(src).toContain('}, [errors, entryFields])')
  })
  it('single-group registries render no collapse header at all (no no-op toggle)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('const showHeader = categoryGroups.length > 1')
  })
  it('dirty/error indicators are derived per category from dirtyKeys/errors, not invented state', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('group.items.some((f) => dirtyKeys.has(f.key))')
    expect(src).toContain('group.items.some((f) => errors[f.key])')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Blank-versus-zero — hard regression boundary, unchanged
// ════════════════════════════════════════════════════════════
describe('PR-1E2 — blank-versus-zero guarantee: unchanged payload contract', () => {
  it('the save-payload loop still skips blank/null fields rather than coercing to 0', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("if (form[key] === '' || form[key] == null) continue")
    expect(src).toContain('payload[key] = Number(form[key])')
  })
  it('setField still writes the raw typed value into form, not Number(value)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toMatch(/setForm\(\(f\) => \(\{ \.\.\.f, \[k\]: v \}\)\)/)
  })
  it('dirty-tracking is additive — setField never short-circuits the existing setForm/setErrors/setSaveState calls', async () => {
    const src = await kpiEntryPageSrc()
    const fnStart = src.indexOf('const setField = useCallback')
    const fnEnd   = src.indexOf('}, [])', fnStart)
    const fnBody  = src.slice(fnStart, fnEnd)
    expect(fnBody).toContain('setForm')
    expect(fnBody).toContain('setErrors')
    expect(fnBody).toContain("setSaveState('unsaved')")
  })
  it('the existing-entry reload effect is untouched in shape (still resets errors/saveState per date+entry)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("v != null ? String(v) : ''")
  })
})

// ════════════════════════════════════════════════════════════
// 5. Validation UX — max check, scroll/focus-first-error
// ════════════════════════════════════════════════════════════
describe('PR-1E2 — validation UX: registry max check, focus-first-error, no raw internals exposed', () => {
  it('validate() now also enforces maxAllowedValue (e.g. percentage cap), unchanged NaN/negative rules', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("e[key] = 'يجب أن يكون رقماً'")
    expect(src).toContain("e[key] = 'لا يمكن أن تكون القيمة سالبة'")
    expect(src).toContain('if (maxAllowedValue != null && Number(v) > maxAllowedValue)')
  })
  it('failed validation scrolls to and focuses the first invalid field in render order', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('const firstInvalid = entryFields.find((f) => errs[f.key])')
    expect(src).toContain('el.scrollIntoView(')
    expect(src).toContain('el.focus()')
  })
  it('scroll respects prefers-reduced-motion without a new hook/dependency', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("window.matchMedia?.('(prefers-reduced-motion: reduce)').matches")
  })
  it('inputs expose aria-invalid and aria-describedby tied to the error message id', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("aria-invalid={errors[key] ? 'true' : undefined}")
    expect(src).toContain('aria-describedby={errors[key] ? errorId : undefined}')
  })
  it('no raw internal field/registry key names are exposed in user-facing error strings', async () => {
    const src = await kpiEntryPageSrc()
    // every error string literal in this file is Arabic business copy
    const errorStrings = [...src.matchAll(/e\[key\] = `?'?([^`'\n]+)/g)].map((m) => m[1])
    for (const s of errorStrings) {
      expect(s).not.toMatch(/registryKey|engineKey|targetField|lifecycleStage/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// 6. Sticky save / context-change / accessibility — source assertions
// ════════════════════════════════════════════════════════════
describe('PR-1E2 — sticky save bar: status semantics preserved, no duplicate-save regression', () => {
  it('save bar still uses the PR-1E0/E1 sticky-save-bar offset class (no overlap regression)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('className="sticky sticky-save-bar z-10 card card-p flex items-center gap-3 py-3"')
  })
  it('save status text is exposed via a live region', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('role="status" aria-live="polite"')
  })
  it('the save button is still disabled while saving / without pharmacyId / without uid (duplicate-save prevention, unchanged)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('disabled={saving || !pharmacyId || !uid}')
  })
  it('root container adds defensive bottom padding so the last field is never trapped under the sticky bar', async () => {
    const src = await kpiEntryPageSrc()
    // PR-1E2 Visual Refinement Addendum widened the container from
    // max-w-2xl to max-w-4xl to fit the new 4-column operational
    // table layout at sm+ — the defensive bottom padding is unchanged.
    expect(src).toContain('className="max-w-4xl mx-auto space-y-6 pb-4"')
  })
})

describe('PR-1E2 — date-change guard: reuses ConfirmModal, no window.confirm, no silent discard', () => {
  it('imports and renders the existing ConfirmModal rather than window.confirm', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("import ConfirmModal")
    expect(src).not.toContain('window.confirm(')
  })
  it('date changes route through requestDateChange, which defers when saveState is unsaved', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('onChange={(e) => requestDateChange(e.target.value)}')
    expect(src).toContain("if (saveState === 'unsaved') { setPendingDate(newDate); return }")
  })
  it('confirming applies the pending date; cancelling discards the pending change without altering selectedDate', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('if (pendingDate != null) setSelectedDate(pendingDate)')
    expect(src).toContain('onCancel={() => setPendingDate(null)}')
  })
})

describe('PR-1E2 — accessibility: visible-text status, no color-only signaling', () => {
  it('mobile header status line is a live region, not color-only', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('<span role="status" aria-live="polite">{saveStatusText}</span>')
  })
  it('category dirty/error indicators carry an sr-only text equivalent', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('<span className="sr-only">')
  })
  it('viewport zoom is not disabled anywhere in this file', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('maximum-scale')
    expect(src).not.toContain('user-scalable=no')
  })
})

// ════════════════════════════════════════════════════════════
// 7. Regression — out-of-scope items not touched
// ════════════════════════════════════════════════════════════
describe('PR-1E2 — no scope creep', () => {
  it('does not read or write a new Firestore collection for targets (reuses existing useKpiStore.subscribeMyTargets)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('subscribeMyTargets(pharmacyId)')
    expect(src).not.toMatch(/collection\(\s*['"]/)
  })
  it('does not implement autosave (handleSave is still only called from the explicit save button)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toMatch(/setInterval/)
    expect(src).not.toMatch(/useEffect\([^)]*handleSave/)
  })
  it('does not add target *editing* — no input/save call writes a target field', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('saveTarget(')
  })
})
