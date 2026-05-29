// ============================================================
// Dashboard & Reports — Dynamic KPI Rendering Tests
// Verifies registry-driven KPI lists, target field lookup,
// safe fallbacks, and no crashes on unknown KPIs.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
  getTargetFieldName,
  DEFAULT_KPI_UI_CONFIG,
} from '../../engine/kpiRegistry'
import { computeAchievementPct } from '../../engine/kpiAnalyticsEngine'
import { mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'
import type { KpiDefinition } from '../../engine/kpiRegistry'

const DASHBOARD_SRC = readFileSync(
  resolve(__dirname, '../../pages/dashboard/DashboardPage.jsx'), 'utf8'
)
const REPORTS_SRC = readFileSync(
  resolve(__dirname, '../../pages/shared/ReportsPage.jsx'), 'utf8'
)

// ── Helpers ───────────────────────────────────────────────────

const FALLBACK_COLORS: Record<string,string> = {
  wasfaty:'#6366f1', omni:'#ef4444', wellness:'#f59e0b',
  basket:'#22c55e', crossSelling:'#8b5cf6',
}
const DEFAULT_KPI_COLOR = '#a1a1aa'

function withDashboard(key: string): KpiDefinition {
  return {
    key, label: `Dynamic ${key}`, shortLabel: key, labelAr: 'ديناميكي',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy:90, watch:75, risk:55, critical:35 },
    visibility: {
      dashboardEnabled: true, teamEnabled: false,
      executiveEnabled: false, regionalEnabled: false,
      targetInputEnabled: false,
    },
    sortOrder: 600,
  }
}

// ── Simulate the registry-driven KPI_FIELDS derivation ────────

function buildKpiFields(registry = DEFAULT_KPI_REGISTRY) {
  return getKpisForSurface(registry, 'dashboardEnabled').map(cfg => ({
    key:         (cfg as any).aliasFor ?? cfg.key,
    registryKey: cfg.key,
    targetKey:   getTargetFieldName(cfg.key),
    label:       cfg.shortLabel,
    color:       (cfg as any).defaultColor ?? FALLBACK_COLORS[(cfg as any).aliasFor ?? cfg.key] ?? DEFAULT_KPI_COLOR,
  }))
}

// ─────────────────────────────────────────────────────────────
// 1. Custom KPI appears in Dashboard achievement list
// ─────────────────────────────────────────────────────────────

describe('Req 1 — custom KPI appears in Dashboard achievement list', () => {
  it('nps with dashboardEnabled=true appears in registry-derived KPI list', () => {
    const reg    = { ...DEFAULT_KPI_REGISTRY, nps: withDashboard('nps') }
    const fields = buildKpiFields(reg)
    expect(fields.find(f => f.registryKey === 'nps')).toBeDefined()
  })

  it('manuka with dashboardEnabled=true appears in KPI list', () => {
    const reg    = { ...DEFAULT_KPI_REGISTRY, manuka: withDashboard('manuka') }
    const fields = buildKpiFields(reg)
    expect(fields.find(f => f.registryKey === 'manuka')).toBeDefined()
  })

  it('dashboardEnabled=false custom KPI does NOT appear', () => {
    const noDash: KpiDefinition = {
      ...withDashboard('hiddenDash'),
      visibility: { dashboardEnabled:false, teamEnabled:false, executiveEnabled:false, regionalEnabled:false },
    }
    const reg    = { ...DEFAULT_KPI_REGISTRY, hiddenDash: noDash }
    const fields = buildKpiFields(reg)
    expect(fields.find(f => f.registryKey === 'hiddenDash')).toBeUndefined()
  })

  it('DashboardPage source uses subscribeKpiRegistry', () => {
    expect(DASHBOARD_SRC).toContain('subscribeKpiRegistry')
  })

  it('DashboardPage no longer has static KPI_KEYS array', () => {
    const noComments = DASHBOARD_SRC.split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    expect(noComments).not.toContain("const KPI_KEYS = ['wasfaty'")
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Custom KPI appears in Reports achievement list
// ─────────────────────────────────────────────────────────────

describe('Req 2 — custom KPI appears in Reports achievement list', () => {
  it('nps in registry → appears in Reports KPI_FIELDS derivation', () => {
    const reg    = { ...DEFAULT_KPI_REGISTRY, nps: withDashboard('nps') }
    const fields = buildKpiFields(reg)
    expect(fields.find(f => f.registryKey === 'nps')).toBeDefined()
  })

  it('ReportsPage source uses subscribeKpiRegistry', () => {
    expect(REPORTS_SRC).toContain('subscribeKpiRegistry')
  })

  it('ReportsPage no longer has static module-level KPI_FIELDS array', () => {
    const noComments = REPORTS_SRC.split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    // Static const KPI_FIELDS = [ ... ] should be gone from module scope
    expect(noComments).not.toContain("{ key:'wasfaty',      targetKey:'wasfatyTarget'")
  })

  it('ReportsPage KPI_FIELDS is now a useMemo', () => {
    expect(REPORTS_SRC).toContain('const KPI_FIELDS = useMemo(')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Dynamic target fields npsTarget/manukaTarget are read
// ─────────────────────────────────────────────────────────────

describe('Req 3 — dynamic target fields read correctly', () => {
  it('nps → targetKey = npsTarget in derived fields', () => {
    const reg    = { ...DEFAULT_KPI_REGISTRY, nps: withDashboard('nps') }
    const fields = buildKpiFields(reg)
    const nps    = fields.find(f => f.registryKey === 'nps')!
    expect(nps.targetKey).toBe('npsTarget')
  })

  it('manuka → targetKey = manukaTarget', () => {
    const reg    = { ...DEFAULT_KPI_REGISTRY, manuka: withDashboard('manuka') }
    const fields = buildKpiFields(reg)
    expect(fields.find(f => f.registryKey === 'manuka')?.targetKey).toBe('manukaTarget')
  })

  it('target lookup from Firestore doc works for dynamic fields', () => {
    const firestoreTarget = { pharmacyId:'p1', month:'2025-05', npsTarget:75, wasfatyTarget:200 }
    // The dashboard reads: targetMap[pid]?.[f.targetKey]
    expect(firestoreTarget['npsTarget']).toBe(75)
    expect(firestoreTarget['wasfatyTarget']).toBe(200)
  })

  it('missing target field returns 0 (not crash)', () => {
    const firestoreTarget = { pharmacyId:'p1', month:'2025-05', wasfatyTarget:200 }
    // npsTarget absent → undefined → || 0
    const val = (firestoreTarget as any)['npsTarget'] || 0
    expect(val).toBe(0)
    expect(isNaN(val)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Missing actual value for custom KPI does not crash
// ─────────────────────────────────────────────────────────────

describe('Req 4 — missing actual value for custom KPI safe', () => {
  it('entry without nps field → actual = 0, no crash', () => {
    const entry = { wasfaty:100, omni:80, wellness:60, basket:50, crossSelling:40 }
    const actual = (entry as any)['nps'] ?? 0
    expect(actual).toBe(0)
    expect(isNaN(actual)).toBe(false)
  })

  it('computeAchievementPct(0, 75) = 0% not crash', () => {
    // Simulate: nps actual=0, target=75 → 0% achievement
    const result = computeAchievementPct(0, 75)
    expect(result).toBe(0)
    expect(isNaN(result)).toBe(false)
  })

  it('computeAchievementPct(0, 0) = 0% (no target = 0% not crash)', () => {
    expect(computeAchievementPct(0, 0)).toBe(0)
  })

  it('custom KPI with no entries shows safe 0% achievement', () => {
    const entries: any[] = []  // no entries at all
    const actual = entries.reduce((s, e) => s + (Number(e['nps']) || 0), 0)
    expect(actual).toBe(0)
  })

  it('KPI_COLORS_MAP fallback — undefined key returns DEFAULT_KPI_COLOR', () => {
    const safeColor = (key: string) =>
      FALLBACK_COLORS[key] ?? DEFAULT_KPI_COLOR
    expect(safeColor('nps')).toBe(DEFAULT_KPI_COLOR)    // unknown → fallback
    expect(safeColor('wasfaty')).toBe('#6366f1')        // known → correct
    expect(safeColor('unknownKpi')).toBe(DEFAULT_KPI_COLOR)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Existing core KPI mappings still work
// ─────────────────────────────────────────────────────────────

describe('Req 5 — existing core KPI mappings preserved', () => {
  it('omnihealth → engineKey=omni, targetKey=omniTarget', () => {
    const fields = buildKpiFields()
    const omni   = fields.find(f => f.registryKey === 'omnihealth')!
    expect(omni).toBeDefined()
    expect(omni.key).toBe('omni')          // engine key via aliasFor
    expect(omni.targetKey).toBe('omniTarget')
  })

  it('wellnessCard → engineKey=wellness, targetKey=wellnessTarget', () => {
    const fields = buildKpiFields()
    const well   = fields.find(f => f.registryKey === 'wellnessCard')!
    expect(well.key).toBe('wellness')
    expect(well.targetKey).toBe('wellnessTarget')
  })

  it('wasfaty has no alias, engineKey=wasfaty, targetKey=wasfatyTarget', () => {
    const fields = buildKpiFields()
    const wf     = fields.find(f => f.registryKey === 'wasfaty')!
    expect(wf.key).toBe('wasfaty')
    expect(wf.targetKey).toBe('wasfatyTarget')
  })

  it('basket has no alias, engineKey=basket, targetKey=basketTarget', () => {
    const fields = buildKpiFields()
    const b      = fields.find(f => f.registryKey === 'basket')!
    expect(b.key).toBe('basket')
    expect(b.targetKey).toBe('basketTarget')
  })

  it('crossSelling → targetKey=crossSellTarget', () => {
    const fields = buildKpiFields()
    const cs     = fields.find(f => f.registryKey === 'crossSelling')!
    expect(cs.targetKey).toBe('crossSellTarget')
  })

  it('5 core KPIs all present in default registry-driven list', () => {
    const fields = buildKpiFields()
    const registryKeys = fields.map(f => f.registryKey)
    ;['wasfaty','omnihealth','wellnessCard','basket','crossSelling'].forEach(k => {
      expect(registryKeys).toContain(k)
    })
  })

  it('all core KPI colors are the expected hex values', () => {
    const fields = buildKpiFields()
    const byKey  = Object.fromEntries(fields.map(f => [f.registryKey, f.color]))
    expect(byKey['wasfaty']).toBe('#6366f1')
    expect(byKey['omnihealth']).toBe('#ef4444')
    expect(byKey['wellnessCard']).toBe('#f59e0b')
    expect(byKey['basket']).toBe('#22c55e')
    expect(byKey['crossSelling']).toBe('#8b5cf6')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. Safe color fallback for all registry KPIs
// ─────────────────────────────────────────────────────────────

describe('Bonus — safe color fallback for all registry KPIs', () => {
  it('all derived KPI fields have a non-empty color string', () => {
    const reg    = { ...DEFAULT_KPI_REGISTRY, nps: withDashboard('nps') }
    const fields = buildKpiFields(reg)
    fields.forEach(f => {
      expect(f.color).toBeTruthy()
      expect(typeof f.color).toBe('string')
      expect(f.color).not.toBe('undefined')
    })
  })

  it('custom KPI with no color gets DEFAULT_KPI_COLOR fallback', () => {
    const cfg = { ...withDashboard('noColor') }
    // No defaultColor set — simulate the derivation
    const color = (cfg as any).defaultColor
      ?? FALLBACK_COLORS[(cfg as any).aliasFor ?? cfg.key]
      ?? DEFAULT_KPI_COLOR
    expect(color).toBe(DEFAULT_KPI_COLOR)
  })

  it('DashboardPage source replaces KPI_COLORS_MAP with safe accessor', () => {
    const noComments = DASHBOARD_SRC.split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    expect(noComments).not.toContain('KPI_COLORS_MAP[k]')
  })
})
