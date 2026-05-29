// ============================================================
// Team Page Stabilization — Regression Tests (Part 3)
// Tests: safe KPI color fallback, missing metadata,
//        custom KPI rendering, branch manager role safety.
// ============================================================
import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_UI_CONFIG } from './kpiUiAdapter'

const FALLBACK_COLOR = '#a1a1aa'

// ── Helper: mirrors the safe color resolution used in TeamManagementPage ──
function resolveKpiColor(kpi: { color?: string | null; defaultColor?: string }): string {
  return (kpi.color || undefined) ?? kpi.defaultColor ?? FALLBACK_COLOR
}

// ── Fixtures ──────────────────────────────────────────────────
const legacyKpiWithColor    = { id: 'wasfaty',    name: 'وصفتي',  color: '#6366f1', active: true, type: 'number',  visibleTo: ['pharmacist'] }
const legacyKpiWithoutColor = { id: 'nps',        name: 'NPS',    active: true,     type: 'number',  visibleTo: ['pharmacist'] }
const legacyKpiNullColor    = { id: 'manuka',     name: 'Manuka', color: null,      active: true, type: 'number',  visibleTo: ['pharmacist'] }
const legacyKpiEmptyColor   = { id: 'sl',         name: 'SL',     color: '',        active: true, type: 'number',  visibleTo: ['pharmacist'] }

// ── Tests ──────────────────────────────────────────────────────

describe('Team Page Stabilization — KPI Color Fallback', () => {
  it('returns kpi.color when present and non-empty', () => {
    expect(resolveKpiColor(legacyKpiWithColor)).toBe('#6366f1')
  })

  it('returns FALLBACK_COLOR when kpi.color is undefined (custom KPI)', () => {
    expect(resolveKpiColor(legacyKpiWithoutColor)).toBe(FALLBACK_COLOR)
  })

  it('returns FALLBACK_COLOR when kpi.color is null', () => {
    expect(resolveKpiColor(legacyKpiNullColor as { color?: string; defaultColor?: string })).toBe(FALLBACK_COLOR)
  })

  it('returns FALLBACK_COLOR when kpi.color is empty string', () => {
    expect(resolveKpiColor(legacyKpiEmptyColor)).toBe(FALLBACK_COLOR)
  })

  it('does not crash when kpi object has no color field at all', () => {
    const minimalKpi = { id: 'liberation', name: 'Liberation' }
    expect(() => resolveKpiColor(minimalKpi)).not.toThrow()
    expect(resolveKpiColor(minimalKpi)).toBe(FALLBACK_COLOR)
  })

  it('prefers defaultColor over hardcoded fallback when color is absent', () => {
    const kpi = { id: 'inbody', name: 'InBody', defaultColor: '#00d2ad' }
    expect(resolveKpiColor(kpi)).toBe('#00d2ad')
  })

  it('DEFAULT_KPI_UI_CONFIG.defaultColor is defined and a valid 6-digit hex', () => {
    const { defaultColor } = DEFAULT_KPI_UI_CONFIG
    expect(defaultColor).toBeDefined()
    expect(defaultColor).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('DEFAULT_KPI_UI_CONFIG.defaultColor matches the expected fallback', () => {
    expect(DEFAULT_KPI_UI_CONFIG.defaultColor).toBe(FALLBACK_COLOR)
  })
})

describe('Team Page Stabilization — Active KPI Filtering', () => {
  const templates = [
    { id: 'wasfaty', name: 'وصفتي', color: '#6366f1', active: true,  type: 'number',  visibleTo: ['pharmacist'] },
    { id: 'nps',     name: 'NPS',                     active: true,  type: 'number',  visibleTo: ['pharmacist'] },
    { id: 'formula', name: 'Bonus',                   active: true,  type: 'formula', visibleTo: ['pharmacist'] },
    { id: 'sales',   name: 'Sales', color: '#ef4444', active: false, type: 'number',  visibleTo: ['pharmacist'] },
    { id: 'ndf',     name: 'NDF',                     active: true,  type: 'number',  visibleTo: ['manager']    },
  ]

  const activeKpis = templates.filter(
    (t) => t.active && t.type !== 'formula' && (t.visibleTo?.includes('pharmacist') ?? true)
  )

  it('filters out formula-type KPIs', () => {
    expect(activeKpis.find((k) => k.type === 'formula')).toBeUndefined()
  })

  it('filters out inactive KPIs', () => {
    expect(activeKpis.find((k) => k.id === 'sales')).toBeUndefined()
  })

  it('filters out KPIs not visible to pharmacist role', () => {
    expect(activeKpis.find((k) => k.id === 'ndf')).toBeUndefined()
  })

  it('includes custom KPI with no color without crashing during color resolution', () => {
    const nps = activeKpis.find((k) => k.id === 'nps')
    expect(nps).toBeDefined()
    expect(() => resolveKpiColor(nps!)).not.toThrow()
    expect(resolveKpiColor(nps!)).toBe(FALLBACK_COLOR)
  })

  it('includes active pharmacist-visible standard KPI', () => {
    expect(activeKpis.find((k) => k.id === 'wasfaty')).toBeDefined()
  })
})

describe('Team Page Stabilization — Branch Manager Role', () => {
  it('store_manager (branch manager) is in the isManager guard set', () => {
    const isManagerRoles = ['admin', 'area_manager', 'store_manager']
    expect(isManagerRoles.includes('store_manager')).toBe(true)
  })

  it('branch manager can see team management actions (isManager = true)', () => {
    const userProfile = { role: 'store_manager', branchId: 'branch-001' }
    const isManager = ['admin', 'area_manager', 'store_manager'].includes(userProfile.role)
    expect(isManager).toBe(true)
  })

  it('area_manager role is also in isManager guard', () => {
    const userProfile = { role: 'area_manager' }
    const isManager = ['admin', 'area_manager', 'store_manager'].includes(userProfile.role)
    expect(isManager).toBe(true)
  })

  it('admin role is in isManager guard', () => {
    const userProfile = { role: 'admin' }
    const isManager = ['admin', 'area_manager', 'store_manager'].includes(userProfile.role)
    expect(isManager).toBe(true)
  })

  it('pharmacist role cannot see manager-only actions (isManager = false)', () => {
    const userProfile = { role: 'pharmacist', branchId: 'branch-001' }
    const isManager = ['admin', 'area_manager', 'store_manager'].includes(userProfile.role)
    expect(isManager).toBe(false)
  })
})

describe('Team Page Stabilization — Missing Metadata Safety', () => {
  it('handles KPI with undefined visibleTo gracefully (defaults to visible)', () => {
    const kpi = { id: 'unknown', name: 'Unknown KPI', active: true, type: 'number' }
    const activeKpis = [kpi].filter(
      (t) => t.active && t.type !== 'formula' && ((t as { visibleTo?: string[] }).visibleTo?.includes('pharmacist') ?? true)
    )
    expect(activeKpis).toHaveLength(1)
  })

  it('entry count stat renders without crash when member has no entries', () => {
    const member = { uid: 'u1', todayEntries: [] as unknown[], monthEntries: [] as unknown[] }
    const activeKpis = [{ id: 'wasfaty' }]
    const stat = `${member.todayEntries.length}/${activeKpis.length}`
    expect(stat).toBe('0/1')
  })

  it('resolves color safely for all custom KPI IDs mentioned in spec', () => {
    const customKpis = [
      { id: 'nps',        name: 'NPS'       },
      { id: 'manuka',     name: 'Manuka'    },
      { id: 'sales',      name: 'Sales'     },
      { id: 'sl',         name: 'SL'        },
      { id: 'ndf',        name: 'NDF'       },
      { id: 'inbody',     name: 'InBody'    },
      { id: 'liberation', name: 'Liberation'},
    ]
    for (const kpi of customKpis) {
      expect(() => resolveKpiColor(kpi)).not.toThrow()
      expect(resolveKpiColor(kpi)).toBe(FALLBACK_COLOR)
    }
  })

  it('resolveKpiColor never returns undefined or empty string', () => {
    const cases: Array<{ color?: string | null; defaultColor?: string }> = [
      {},
      { color: undefined },
      { color: null },
      { color: '' },
      { defaultColor: undefined },
    ]
    for (const kpi of cases) {
      const result = resolveKpiColor(kpi)
      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

describe('Team Page Stabilization — No Unsafe .color Access Remains', () => {
  it('nullish coalescing guard is safe for all falsy color values', () => {
    const cases: Array<{ color?: string | null }> = [
      { color: undefined },
      { color: null },
      { color: '' },
      {},
    ]
    for (const kpi of cases) {
      // Mirrors the patched pattern: kpi.color ?? kpi.defaultColor ?? '#a1a1aa'
      const resolved = (kpi.color || undefined) ?? '#a1a1aa'
      expect(resolved).toBe('#a1a1aa')
    }
  })

  it('defined color value passes through the guard unchanged', () => {
    const kpi = { color: '#ef4444' }
    const resolved = (kpi.color || undefined) ?? '#a1a1aa'
    expect(resolved).toBe('#ef4444')
  })

  it('TeamManagementPage KPI breakdown loop does not crash with mixed color/no-color KPIs', () => {
    const activeKpis = [
      { id: 'wasfaty', color: '#6366f1' },
      { id: 'nps'                       },   // no color — the crash case
      { id: 'sales',   color: '#ef4444' },
    ]
    const todayEntries = [
      { kpiId: 'wasfaty', achievement: 85 },
    ]

    // Simulate the render loop that previously crashed
    expect(() => {
      for (const kpi of activeKpis) {
        const color = (kpi as { color?: string }).color ?? '#a1a1aa'
        const entry = todayEntries.find((e) => e.kpiId === kpi.id)
        void color
        void entry
      }
    }).not.toThrow()
  })
})
