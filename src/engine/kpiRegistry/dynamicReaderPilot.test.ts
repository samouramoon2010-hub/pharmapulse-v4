// ============================================================
// Dynamic KPI Controlled Cutover — Phase 2: Production Reader Pilot
// Unit tests for dynamicReaderPilot.ts
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  PILOT_SURFACE,
  buildPilotPolicy,
  readPilotActual,
  readPilotTarget,
  sumPilotActual,
  countDynamicSourcesUsed,
  countLegacyFallbacksUsed,
} from './dynamicReaderPilot'

const SAMPLE_ENTRY: Record<string, unknown> = {
  pharmacyId: 'branch-1',
  date: '2025-01-15',
  wasfaty: 150, omni: 80, wellness: 60, basket: 250, crossSelling: 45,
  sales: 12000, sl: 92, ndf: 14,
}

const SAMPLE_TARGET: Record<string, unknown> = {
  pharmacyId: 'branch-1', month: '2025-01',
  wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80,
  basketTarget: 300, crossSellTarget: 60,
  salesTarget: 15000, slTarget: 95, ndfTarget: 20,
}

describe('dynamicReaderPilot — buildPilotPolicy', () => {
  it('PILOT_SURFACE is the Dashboard', () => {
    expect(PILOT_SURFACE).toBe('dashboard')
  })

  it('covers all 5 named pilot KPIs', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(policy.sources.length).toBe(5)
    const businessKeys = policy.sources.map((s) => s.businessKey).sort()
    expect(businessKeys).toEqual(['ndf', 'omnihealth', 'sales', 'sl', 'wellnessCard'].sort())
  })

  it('uses Dynamic Reader for every pilot KPI when parity proven against a real sample', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(countDynamicSourcesUsed(policy)).toBe(5)
    expect(countLegacyFallbacksUsed(policy)).toBe(0)
    expect(policy.sources.every((s) => s.parity === 'PASS')).toBe(true)
  })

  it('falls back to Legacy Reader for every pilot KPI when no sample is available', () => {
    const policy = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY)
    expect(countDynamicSourcesUsed(policy)).toBe(0)
    expect(countLegacyFallbacksUsed(policy)).toBe(5)
    expect(policy.sources.every((s) => s.parity === 'UNVERIFIED')).toBe(true)
    expect(policy.parityResults).toBeNull()
  })

  it('falls back to Legacy Reader when sample exists but parity check throws', () => {
    const policy = buildPilotPolicy({} as any, undefined as any, DEFAULT_KPI_REGISTRY)
    expect(countDynamicSourcesUsed(policy)).toBe(0)
  })

  it('falls back to Legacy Reader for a pilot KPI whose registry entry is inactive', () => {
    const registry = {
      ...DEFAULT_KPI_REGISTRY,
      sl: { ...DEFAULT_KPI_REGISTRY.sl, isActive: false },
    }
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, registry)
    const sl = policy.sources.find((s) => s.businessKey === 'sl')
    expect(sl?.source).toBe('legacy')
    expect(sl?.reason).toContain('not active')
  })

  it('never mutates the registry or the sample documents', () => {
    const entryBefore = JSON.parse(JSON.stringify(SAMPLE_ENTRY))
    const targetBefore = JSON.parse(JSON.stringify(SAMPLE_TARGET))
    const registryBefore = JSON.parse(JSON.stringify(DEFAULT_KPI_REGISTRY))
    buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(SAMPLE_ENTRY).toEqual(entryBefore)
    expect(SAMPLE_TARGET).toEqual(targetBefore)
    expect(DEFAULT_KPI_REGISTRY).toEqual(registryBefore)
  })
})

describe('dynamicReaderPilot — readPilotActual', () => {
  it('returns the same value via dynamic and legacy paths when parity holds (sl)', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    const dynamicValue = readPilotActual(SAMPLE_ENTRY, 'sl', DEFAULT_KPI_REGISTRY, policy)
    const legacyValue  = Number(SAMPLE_ENTRY.sl) || 0
    expect(dynamicValue).toBe(legacyValue)
  })

  it('uses the exact legacy computation when policy routes to legacy', () => {
    const policy = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY)
    const value = readPilotActual(SAMPLE_ENTRY, 'sl', DEFAULT_KPI_REGISTRY, policy)
    expect(value).toBe(Number(SAMPLE_ENTRY.sl) || 0)
  })

  it('never throws even if the Dynamic Reader path would fail', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    // Pass a malformed registry typed loosely to provoke an internal throw —
    // readPilotActual must still return a number, never propagate an error.
    expect(() => readPilotActual(SAMPLE_ENTRY, 'sl', null as any, policy)).not.toThrow()
  })

  it('non-pilot engine keys (e.g. wasfaty) always use the legacy computation unchanged', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    const value = readPilotActual(SAMPLE_ENTRY, 'wasfaty', DEFAULT_KPI_REGISTRY, policy)
    expect(value).toBe(Number(SAMPLE_ENTRY.wasfaty) || 0)
  })
})

describe('dynamicReaderPilot — readPilotTarget', () => {
  it('matches the legacy fallback value when parity holds (sl)', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    const legacyFallback = () => Number(SAMPLE_TARGET.slTarget) || 0
    const value = readPilotTarget(SAMPLE_TARGET, 'sl', DEFAULT_KPI_REGISTRY, policy, legacyFallback)
    expect(value).toBe(legacyFallback())
  })

  it('calls legacyFallback exactly when source is legacy', () => {
    const policy = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY)
    let called = false
    const legacyFallback = () => { called = true; return 42 }
    const value = readPilotTarget(SAMPLE_TARGET, 'sl', DEFAULT_KPI_REGISTRY, policy, legacyFallback)
    expect(called).toBe(true)
    expect(value).toBe(42)
  })

  it('falls back to legacyFallback when targetDoc is missing, even if source is dynamic', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    const legacyFallback = () => 7
    const value = readPilotTarget(null, 'sl', DEFAULT_KPI_REGISTRY, policy, legacyFallback)
    expect(value).toBe(7)
  })

  it('never throws even if the Dynamic Reader path would fail', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(() => readPilotTarget(SAMPLE_TARGET, 'sl', null as any, policy, () => 0)).not.toThrow()
  })
})

describe('dynamicReaderPilot — multi-surface support (Accelerated Bundle Part A)', () => {
  it('buildPilotPolicy accepts a surface name and records it on the returned policy', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY, 'regionalIntelligence')
    expect(policy.surface).toBe('regionalIntelligence')
  })

  it('defaults to the dashboard surface when no surface argument is given (backward-compat)', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(policy.surface).toBe(PILOT_SURFACE)
  })

  it('sumPilotActual aggregates readPilotActual across multiple entries, matching legacy sum when source is legacy', () => {
    const entries = [
      { ...SAMPLE_ENTRY, sl: 10 },
      { ...SAMPLE_ENTRY, sl: 20 },
      { ...SAMPLE_ENTRY, sl: 30 },
    ]
    const policy = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY) // forces legacy
    const sum = sumPilotActual(entries, 'sl', DEFAULT_KPI_REGISTRY, policy)
    expect(sum).toBe(60)
  })

  it('sumPilotActual produces the same total whether routed dynamic or legacy, when parity holds', () => {
    const entries = [
      { ...SAMPLE_ENTRY, sl: 10 },
      { ...SAMPLE_ENTRY, sl: 20 },
    ]
    const dynamicPolicy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY, 'regionalIntelligence')
    const legacyPolicy  = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY)
    const dynamicSum = sumPilotActual(entries, 'sl', DEFAULT_KPI_REGISTRY, dynamicPolicy)
    const legacySum  = sumPilotActual(entries, 'sl', DEFAULT_KPI_REGISTRY, legacyPolicy)
    expect(dynamicSum).toBe(legacySum)
  })
})
