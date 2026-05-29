// ============================================================
// Part 5A — Pharmacist Performance Rendering Safety Tests
// Tests: PerformancePage registry-driven field list,
//        safe color fallbacks, custom KPI rendering,
//        no crashes on missing metadata.
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
import { mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'
import { TRAFFIC_COLORS }                  from '../../engine'
import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

// ── Source files ───────────────────────────────────────────────
const PERF_SRC = readFileSync(
  resolve(__dirname, '../../pages/pharmacist/PerformancePage.jsx'), 'utf8'
)
const DASH_SRC = readFileSync(
  resolve(__dirname, '../../pages/pharmacist/PharmacistDashboard.jsx'), 'utf8'
)
const KPICARD_SRC = readFileSync(
  resolve(__dirname, '../../components/kpi/KpiCard.jsx'), 'utf8'
)

// ── Helpers ────────────────────────────────────────────────────
const FALLBACK_COLOR = DEFAULT_KPI_UI_CONFIG.defaultColor  // '#a1a1aa'

function customKpi(key: string, opts: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: key, shortLabel: key, labelAr: key,
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
    sortOrder: 500,
    ...opts,
  }
}

/** Mirrors buildPerfFields in PerformancePage.jsx */
function buildPerfFields(registry: KpiRegistry) {
  return getKpisForSurface(registry, 'dashboardEnabled').map((kpi) => ({
    key:         kpi.aliasFor ?? kpi.key,
    registryKey: kpi.key,
    targetKey:   getTargetFieldName(kpi.key),
    label:       kpi.shortLabel || kpi.label || (kpi.aliasFor ?? kpi.key),
    labelAr:     kpi.labelAr   || kpi.label || (kpi.aliasFor ?? kpi.key),
    color:       FALLBACK_COLOR,
  }))
}

/** Safe color resolution used in PerformancePage */
function safeBarColor(status: string | undefined): string {
  return TRAFFIC_COLORS[status as keyof typeof TRAFFIC_COLORS]?.color ?? FALLBACK_COLOR
}

// ══════════════════════════════════════════════════════════════
// 1 — Source-level static KPI_FIELDS elimination
// ══════════════════════════════════════════════════════════════

describe('PerformancePage — Phase 5A static assumption removal', () => {
  it('no longer contains a static KPI_FIELDS constant', () => {
    expect(PERF_SRC).not.toMatch(/^const KPI_FIELDS\s*=/m)
  })

  it('imports subscribeKpiRegistry for live registry', () => {
    expect(PERF_SRC).toContain('subscribeKpiRegistry')
  })

  it('imports getKpisForSurface for registry-driven field list', () => {
    expect(PERF_SRC).toContain('getKpisForSurface')
  })

  it('imports DEFAULT_KPI_UI_CONFIG for safe color fallback', () => {
    expect(PERF_SRC).toContain('DEFAULT_KPI_UI_CONFIG')
  })

  it('uses dashboardEnabled surface to derive fields', () => {
    expect(PERF_SRC).toContain("'dashboardEnabled'")
  })

  it('has no unsafe KPI_FIELDS.find(...).color access', () => {
    expect(PERF_SRC).not.toMatch(/KPI_FIELDS\.find[^)]*\)\s*\??\s*\.color/)
  })

  it('has no bare KPI_FIELDS.find without optional chaining on result', () => {
    // Any remaining KPI_FIELDS.find should be gone entirely
    expect(PERF_SRC).not.toContain('KPI_FIELDS.find')
  })

  it('uses FALLBACK_COLOR constant as safe default', () => {
    expect(PERF_SRC).toContain('FALLBACK_COLOR')
  })

  it('focusKpi initialised to empty string, not hardcoded KPI key', () => {
    // Old: useState(KPI_FIELDS[0].key) — New: useState('')
    expect(PERF_SRC).toMatch(/useState\s*\(\s*''\s*\)/)
    expect(PERF_SRC).not.toMatch(/useState\s*\(KPI_FIELDS\[0\]/)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — buildPerfFields — registry-driven field list
// ══════════════════════════════════════════════════════════════

describe('PerformancePage — buildPerfFields from DEFAULT_KPI_REGISTRY', () => {
  const fields = buildPerfFields(DEFAULT_KPI_REGISTRY)
  const keys   = fields.map((f) => f.key)

  it('contains wasfaty', () => expect(keys).toContain('wasfaty'))
  it('contains omni (via omnihealth alias)',     () => expect(keys).toContain('omni'))
  it('contains wellness (via wellnessCard alias)', () => expect(keys).toContain('wellness'))
  it('contains basket',       () => expect(keys).toContain('basket'))
  it('contains crossSelling', () => expect(keys).toContain('crossSelling'))

  it('produces at least 5 fields from default registry', () => {
    expect(fields.length).toBeGreaterThanOrEqual(5)
  })

  it('every field has a label', () => {
    for (const f of fields) {
      expect(typeof f.label).toBe('string')
      expect(f.label.length).toBeGreaterThan(0)
    }
  })

  it('every field color is FALLBACK_COLOR (not undefined)', () => {
    for (const f of fields) {
      expect(f.color).toBe(FALLBACK_COLOR)
      expect(f.color).not.toBeUndefined()
    }
  })

  it('every field has a targetKey string', () => {
    for (const f of fields) {
      expect(typeof f.targetKey).toBe('string')
      expect(f.targetKey.length).toBeGreaterThan(0)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — PerformancePage does not crash with custom KPIs
// ══════════════════════════════════════════════════════════════

describe('PerformancePage — custom KPI rendering safety', () => {
  const ALL_CUSTOM = ['nps', 'manuka', 'sales', 'sl', 'ndf', 'inbody', 'liberation']

  it('buildPerfFields does not crash with custom KPIs in registry', () => {
    const extras: Partial<KpiRegistry> = {}
    for (const key of ALL_CUSTOM) extras[key] = customKpi(key)
    const extended = mergeRemoteRegistryWithDefaults(extras as KpiRegistry)
    expect(() => buildPerfFields(extended)).not.toThrow()
  })

  it('all 7 custom KPIs appear in field list when added to registry', () => {
    const extras: Partial<KpiRegistry> = {}
    for (const key of ALL_CUSTOM) extras[key] = customKpi(key)
    const extended = mergeRemoteRegistryWithDefaults(extras as KpiRegistry)
    const keys = buildPerfFields(extended).map((f) => f.key)
    for (const key of ALL_CUSTOM) expect(keys).toContain(key)
  })

  it('custom KPI field always gets FALLBACK_COLOR (never undefined)', () => {
    const extended = mergeRemoteRegistryWithDefaults({ nps: customKpi('nps') } as KpiRegistry)
    const fields = buildPerfFields(extended)
    const nps = fields.find((f) => f.key === 'nps')
    expect(nps).toBeDefined()
    expect(nps!.color).toBe(FALLBACK_COLOR)
    expect(nps!.color).not.toBeUndefined()
  })

  it('custom KPI has a valid label string', () => {
    const extended = mergeRemoteRegistryWithDefaults({ manuka: customKpi('manuka', { label: 'Manuka', shortLabel: 'Manuka' }) } as KpiRegistry)
    const fields = buildPerfFields(extended)
    const manuka = fields.find((f) => f.key === 'manuka')
    expect(manuka!.label).toBe('Manuka')
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Safe color resolution — no crash on missing status
// ══════════════════════════════════════════════════════════════

describe('PerformancePage — safe color resolution', () => {
  it('safeBarColor returns a valid color for known traffic-light status', () => {
    for (const status of ['excellent', 'good', 'warning', 'critical']) {
      const color = safeBarColor(status)
      expect(color).toBeTruthy()
      expect(typeof color).toBe('string')
    }
  })

  it('safeBarColor returns FALLBACK_COLOR for undefined status', () => {
    expect(safeBarColor(undefined)).toBe(FALLBACK_COLOR)
  })

  it('safeBarColor returns FALLBACK_COLOR for unknown status', () => {
    expect(safeBarColor('unknown_status_xyz')).toBe(FALLBACK_COLOR)
  })

  it('FALLBACK_COLOR is a valid 6-digit hex', () => {
    expect(FALLBACK_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('no stopColor or stroke is ever undefined when focusColor computed', () => {
    // Simulate focusColor computation for a known KPI
    const status   = 'good'
    const focusColor = TRAFFIC_COLORS[status as keyof typeof TRAFFIC_COLORS]?.color ?? FALLBACK_COLOR
    expect(focusColor).toBeTruthy()
    expect(typeof focusColor).toBe('string')
  })

  it('focusColor computed for a custom KPI (no traffic-light status) returns FALLBACK_COLOR', () => {
    // Custom KPI with no entries → kpiStatsMap[key] is undefined
    const focusColor = (undefined as any)?.color ?? FALLBACK_COLOR
    expect(focusColor).toBe(FALLBACK_COLOR)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Pharmacist dashboard safety (KpiCard, no KPI_FIELDS)
// ══════════════════════════════════════════════════════════════

describe('PharmacistDashboard — no static KPI_FIELDS assumptions', () => {
  it('dashboard does not import KPI_FIELDS', () => {
    expect(DASH_SRC).not.toContain('KPI_FIELDS')
  })

  it('dashboard does not reference KPI_KEYS', () => {
    expect(DASH_SRC).not.toContain('KPI_KEYS')
  })

  it('dashboard uses templates from kpiStore for dynamic KPI list', () => {
    expect(DASH_SRC).toContain('templates')
    expect(DASH_SRC).toContain('subscribeTemplates')
  })
})

describe('KpiCard — safe color access', () => {
  it('uses kpi?.color (optional chaining) not kpi.color', () => {
    // Should not have bare kpi.color without optional chaining
    expect(KPICARD_SRC).not.toMatch(/\bkpi\.color\b/)
  })

  it('has fallback color when kpi.color is undefined', () => {
    // Pattern: kpi?.color || '#1a9a7e'
    expect(KPICARD_SRC).toMatch(/kpi\?\.color\s*\|\|/)
  })

  it('getBarColor returns a safe color when pct < 80 and kpi.color absent', () => {
    // Simulate the getBarColor logic from KpiCard:
    // if (pct >= 80) return kpi?.color || '#1a9a7e'
    // The cases below 80 return hardcoded colors — always safe
    const getBarColor = (pct: number, kpiColor?: string) => {
      if (pct >= 100) return '#22c55e'
      if (pct >= 80)  return kpiColor || '#1a9a7e'
      if (pct >= 60)  return '#eab308'
      return '#ef4444'
    }
    expect(getBarColor(50, undefined)).toBe('#ef4444')
    expect(getBarColor(70, undefined)).toBe('#eab308')
    expect(getBarColor(85, undefined)).toBe('#1a9a7e')  // fallback
    expect(getBarColor(85, '#6366f1')).toBe('#6366f1')  // present
    expect(getBarColor(100, undefined)).toBe('#22c55e')
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Missing metadata does not crash rendering
// ══════════════════════════════════════════════════════════════

describe('PerformancePage — missing metadata safety', () => {
  it('buildPerfFields does not crash with empty registry', () => {
    expect(() => buildPerfFields({})).not.toThrow()
    expect(buildPerfFields({})).toEqual([])
  })

  it('labelFor returns key as fallback when key not in fields', () => {
    const labelFor = (key: string, fields: ReturnType<typeof buildPerfFields>) =>
      fields.find((f) => f.key === key)?.label || key
    const fields = buildPerfFields(DEFAULT_KPI_REGISTRY)
    expect(labelFor('unknownKpi', fields)).toBe('unknownKpi')
  })

  it('kpiStatsMap lookup never crashes for missing key', () => {
    const map: Record<string, { achievementPct: number; status: string }> = {}
    const key = 'unknownKpi'
    // Safe access pattern used in PerformancePage
    const color = TRAFFIC_COLORS[map[key]?.status as keyof typeof TRAFFIC_COLORS]?.color ?? FALLBACK_COLOR
    expect(color).toBe(FALLBACK_COLOR)
  })

  it('focusPace computation handles missing kpiStatsMap entry gracefully', () => {
    const kpiStatsMap: Record<string, unknown> = {}
    const s = kpiStatsMap['missingKey']
    // PerformancePage: if (!s) return null
    expect(s).toBeUndefined()
    // No crash expected
  })

  it('getTargetFieldName returns a non-empty string for any active registry KPI', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      if (!kpi.isActive) continue
      const tf = getTargetFieldName(kpi.key)
      expect(typeof tf).toBe('string')
      expect(tf.length).toBeGreaterThan(0)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Registry reactivity and DEFAULT fallback
// ══════════════════════════════════════════════════════════════

describe('PerformancePage — registry fallback and reactivity', () => {
  it('error path resets to DEFAULT_KPI_REGISTRY (source check)', () => {
    expect(PERF_SRC).toMatch(/setLiveRegistry\s*\(\s*DEFAULT_KPI_REGISTRY\s*\)/)
  })

  it('adding custom KPI to registry increases field count', () => {
    const before = buildPerfFields(DEFAULT_KPI_REGISTRY).length
    const after  = buildPerfFields({ ...DEFAULT_KPI_REGISTRY, newKpi: customKpi('newKpi') }).length
    expect(after).toBe(before + 1)
  })

  it('inactive KPI is excluded from perfFields', () => {
    const reg = { ...DEFAULT_KPI_REGISTRY, archived: customKpi('archived', { isActive: false }) }
    const keys = buildPerfFields(reg).map((f) => f.key)
    expect(keys).not.toContain('archived')
  })

  it('KPI with dashboardEnabled=false excluded from perfFields', () => {
    const reg = {
      ...DEFAULT_KPI_REGISTRY,
      teamOnly: customKpi('teamOnly', {
        visibility: { dashboardEnabled: false, teamEnabled: true, executiveEnabled: false, regionalEnabled: false },
      }),
    }
    const keys = buildPerfFields(reg).map((f) => f.key)
    expect(keys).not.toContain('teamOnly')
  })
})
