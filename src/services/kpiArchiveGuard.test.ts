// ============================================================
// PR-1C — KPI archive dependency guard certification
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

const docsByCollection = new Map<string, Array<Record<string, unknown>>>()

vi.mock('./firebase', () => ({
  db: {},
  COL: {
    EVALUATION_PROFILES: 'evaluation_profiles',
    TARGETS:             'targets',
    KPI_ENTRIES:         'kpi_entries',
    EVALUATION_RESULTS:  'evaluation_results',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  getDocs: vi.fn(async (ref: { name: string }) => {
    const docs = docsByCollection.get(ref.name) ?? []
    return { forEach: (cb: (d: { data: () => Record<string, unknown> }) => void) => docs.forEach((data) => cb({ data: () => data })) }
  }),
}))

import { checkKpiArchiveDependencies } from './kpiArchiveGuard'

beforeEach(() => { docsByCollection.clear() })

describe('PR-1C — checkKpiArchiveDependencies', () => {
  it('reports safe with no dependencies when the KPI key appears nowhere', async () => {
    const result = await checkKpiArchiveDependencies('untouchedKpi')
    expect(result.safe).toBe(true)
    expect(result.dependencies).toEqual([])
  })

  it('blocks archive when used in a published (active) evaluation profile', async () => {
    docsByCollection.set('evaluation_profiles', [
      { status: 'published', baskets: { b1: { elements: [{ kpiKey: 'wasfaty' }] } } },
    ])
    const result = await checkKpiArchiveDependencies('wasfaty')
    expect(result.safe).toBe(false)
    const dep = result.dependencies.find((d) => d.type === 'active_profile')
    expect(dep).toBeTruthy()
    expect(dep?.count).toBe(1)
    expect(dep?.reason).toContain('1 active evaluation profile')
  })

  it('blocks archive when used only in a draft evaluation profile', async () => {
    docsByCollection.set('evaluation_profiles', [
      { status: 'draft', baskets: { b1: { elements: [{ kpiKey: 'nps' }] } } },
    ])
    const result = await checkKpiArchiveDependencies('nps')
    expect(result.safe).toBe(false)
    expect(result.dependencies.find((d) => d.type === 'draft_profile')?.count).toBe(1)
  })

  it('does not block on targets/actuals/evaluation results — informational only', async () => {
    docsByCollection.set('targets', [{ wasfaty: 100 }, { wasfaty: 200 }])
    docsByCollection.set('kpi_entries', [{ wasfaty: 5 }])
    docsByCollection.set('evaluation_results', [
      { basketResults: [{ elements: [{ kpiKey: 'wasfaty' }] }] },
    ])
    const result = await checkKpiArchiveDependencies('wasfaty')
    expect(result.safe).toBe(true)
    expect(result.dependencies.map((d) => d.type).sort()).toEqual(['actuals', 'evaluation_results', 'targets'])
    for (const dep of result.dependencies) {
      expect(dep.reason.length).toBeGreaterThan(0)
      expect(dep.recommendedAction.length).toBeGreaterThan(0)
    }
  })

  it('counts targets/actuals correctly and ignores unrelated KPI keys', async () => {
    docsByCollection.set('targets', [{ wasfaty: 1 }, { nps: 1 }, { wasfaty: 2 }])
    const result = await checkKpiArchiveDependencies('wasfaty')
    expect(result.dependencies.find((d) => d.type === 'targets')?.count).toBe(2)
  })

  it('returns every dependency at once, not just the first match', async () => {
    docsByCollection.set('evaluation_profiles', [
      { status: 'published', baskets: { b1: { elements: [{ kpiKey: 'wasfaty' }] } } },
      { status: 'draft',     baskets: { b1: { elements: [{ kpiKey: 'wasfaty' }] } } },
    ])
    docsByCollection.set('targets', [{ wasfaty: 1 }])
    const result = await checkKpiArchiveDependencies('wasfaty')
    expect(result.dependencies).toHaveLength(3)
    expect(result.safe).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 2026-07-07 — Owner decision: PROTECTED_CORE_KEYS no longer blocks
// archiveKpiDefinition() for wasfaty/omnihealth/wellnessCard/basket/
// crossSelling. This guard function was never core-key-aware to begin
// with (it treats every KPI key identically) — these tests make that
// explicit for the 5 previously-protected keys specifically, since
// they are the ones this decision applies to.
// ─────────────────────────────────────────────────────────────
describe('Core KPI keys — same guard behavior as any other KPI key', () => {
  const coreKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']

  it.each(coreKeys)('"%s" is still blocked while referenced by an active (published) profile', async (key) => {
    docsByCollection.set('evaluation_profiles', [
      { status: 'published', baskets: { b1: { elements: [{ kpiKey: key }] } } },
    ])
    const result = await checkKpiArchiveDependencies(key)
    expect(result.safe).toBe(false)
    expect(result.dependencies.find((d) => d.type === 'active_profile')).toBeTruthy()
  })

  it.each(coreKeys)('"%s" is still blocked while referenced by a draft profile', async (key) => {
    docsByCollection.set('evaluation_profiles', [
      { status: 'draft', baskets: { b1: { elements: [{ kpiKey: key }] } } },
    ])
    const result = await checkKpiArchiveDependencies(key)
    expect(result.safe).toBe(false)
    expect(result.dependencies.find((d) => d.type === 'draft_profile')).toBeTruthy()
  })

  it.each(coreKeys)('"%s" is safe to archive once its only referencing profile is archived', async (key) => {
    docsByCollection.set('evaluation_profiles', [
      { status: 'archived', baskets: { b1: { elements: [{ kpiKey: key }] } } },
    ])
    const result = await checkKpiArchiveDependencies(key)
    expect(result.safe).toBe(true)
    expect(result.dependencies.find((d) => d.type === 'active_profile' || d.type === 'draft_profile')).toBeUndefined()
  })

  it.each(coreKeys)('"%s" historical targets/actuals/evaluation_results remain informational-only, never block archive', async (key) => {
    docsByCollection.set('targets', [{ [key]: 100 }])
    docsByCollection.set('kpi_entries', [{ [key]: 5 }])
    docsByCollection.set('evaluation_results', [
      { basketResults: [{ elements: [{ kpiKey: key }] }] },
    ])
    const result = await checkKpiArchiveDependencies(key)
    expect(result.safe).toBe(true)
  })
})
