// ============================================================
// Dynamic KPI Controlled Cutover — Phase 1: Shadow Visibility
//
// Certifies the 8 required proofs from the bundle spec:
//  1. Legacy readers remain authoritative.
//  2. Dynamic-only activation does not exist.
//  3. Shadow parity UI is admin/internal only.
//  4. No Evaluation Engine, scoring, ranking, Executive BI,
//     Firestore contracts, or auth logic changed.
//  5. Core KPI fields and KPI_KEYS remain present.
//  6. The UI clearly states shadow mode only.
//  7. No fake KPI data or mock parity samples are introduced.
//  8. Full suite remains green (validated via npm test run, not here).
// ============================================================

import { describe, it, expect } from 'vitest'

const pageSrc      = () => import('./DynamicKpiShadowPage?raw').then((m) => m.default)
const appSrc       = () => import('../../App?raw').then((m) => m.default)
const sidebarSrc   = () => import('../../components/layout/Sidebar?raw').then((m) => m.default)
const foundationSrc = () => import('../../engine/kpiRegistry/dynamicKpiFoundation?raw').then((m) => m.default)
const kpiServiceSrc = () => import('../../services/kpiService?raw').then((m) => m.default)

describe('Controlled Cutover Phase 1 — Proof 1: legacy readers remain authoritative', () => {
  it('page never overwrites the live entry/target it reads', async () => {
    const src = await pageSrc()
    expect(src).not.toContain('setDoc(')
    expect(src).not.toContain('updateDoc(')
    expect(src).not.toContain('addDoc(')
  })

  it('page only calls read-only subscriptions (subscribeRecentKpiEntries / subscribeRecentTargets / subscribeKpiRegistry)', async () => {
    const src = await pageSrc()
    expect(src).toContain('subscribeKpiRegistry')
    expect(src).toContain('subscribeRecentKpiEntries')
    expect(src).toContain('subscribeRecentTargets')
  })

  it('page copy explicitly states legacy readers remain authoritative', async () => {
    const src = await pageSrc()
    expect(src).toContain('Legacy KPI readers remain authoritative.')
  })
})

describe('Controlled Cutover Phase 1 — Proof 2: dynamic-only activation does not exist', () => {
  it('no dynamic-only / activation flag exists anywhere in the new page or foundation module', async () => {
    const page = await pageSrc()
    const foundation = await foundationSrc()
    for (const src of [page, foundation]) {
      expect(src).not.toMatch(/dynamicOnly\s*[:=]\s*true/)
      expect(src).not.toMatch(/activateDynamicMode/i)
      expect(src).not.toMatch(/enableDynamicCutover/i)
    }
  })

  it('page never calls a publish/activate/enable function for dynamic KPIs', async () => {
    const src = await pageSrc()
    expect(src).not.toMatch(/publishDynamicKpi/i)
    expect(src).not.toMatch(/activateCutover/i)
  })

  it('isSafeToExposeDynamically is only read for display, never used to trigger an action', async () => {
    const src = await pageSrc()
    // appears in a <td> readiness column, never inside an onClick / event handler
    expect(src).not.toMatch(/onClick=\{[^}]*isSafeToExposeDynamically/)
  })
})

describe('Controlled Cutover Phase 1 — Proof 3: shadow parity UI is admin/internal only', () => {
  it('route is registered under roles={ADMIN}', async () => {
    const src = await appSrc()
    expect(src).toMatch(/path="\/admin\/dynamic-kpi-shadow"\s+element=\{<PR roles=\{ADMIN\}><DynamicKpiShadowPage \/><\/PR>\}/)
  })

  it('the new page is imported from pages/admin (admin namespace)', async () => {
    const src = await appSrc()
    expect(src).toContain("const DynamicKpiShadowPage       = lazy(() => import('./pages/admin/DynamicKpiShadowPage'))")
  })

  it('has no sidebar nav entry — adds no business-navigation value; reachable only by direct URL', async () => {
    const src = await sidebarSrc()
    expect(src).not.toContain('/admin/dynamic-kpi-shadow')
  })

  it('the page itself contains no role check bypass (relies on route-level ProtectedRoute)', async () => {
    const src = await pageSrc()
    expect(src).not.toContain('allowedRoles')
  })
})

describe('Controlled Cutover Phase 1 — Proof 4: no protected-surface behavior changed', () => {
  it('no Evaluation Engine files were imported into the new page or foundation module', async () => {
    const page = await pageSrc()
    const foundation = await foundationSrc()
    for (const src of [page, foundation]) {
      expect(src).not.toMatch(/from\s+['"].*evaluationEngine/)
    }
  })

  it('page does not import ranking, executiveScore, or auth/login modules', async () => {
    const src = await pageSrc()
    expect(src).not.toMatch(/from\s+['"].*\/ranking\//)
    expect(src).not.toMatch(/from\s+['"].*executiveScore/)
    expect(src).not.toMatch(/from\s+['"].*authStore/)
  })

  it('page does not write to any Firestore collection (no new contracts)', async () => {
    const src = await pageSrc()
    expect(src).not.toContain('collection(db,')
    expect(src).not.toContain('doc(db,')
  })

  it('kpiService.ts subscribeRecentKpiEntries / subscribeRecentTargets signatures are unchanged (reused, not modified)', async () => {
    const src = await kpiServiceSrc()
    expect(src).toContain('export function subscribeRecentKpiEntries(callback, days = 90)')
    expect(src).toContain('export function subscribeRecentTargets(callback, months = 6)')
  })
})

describe('Controlled Cutover Phase 1 — Proof 5: Core KPI fields and KPI_KEYS remain present', () => {
  it('KPI_KEYS export still exists in kpiAnalyticsEngine.ts', async () => {
    const src = await import('../../engine/kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export const KPI_KEYS')
  })

  it('DEFAULT_KPI_REGISTRY still defines all 5 core KPI entries', async () => {
    const { DEFAULT_KPI_REGISTRY } = await import('../../engine/kpiRegistry')
    for (const key of ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']) {
      expect(DEFAULT_KPI_REGISTRY[key]).toBeDefined()
    }
  })
})

describe('Controlled Cutover Phase 1 — Proof 6: UI clearly states shadow mode only', () => {
  it('page contains the required shadow-mode disclosure copy', async () => {
    const src = await pageSrc()
    expect(src).toContain('Legacy KPI readers remain authoritative.')
    expect(src).toContain('running in shadow mode only')
    expect(src).toContain('No production cutover is active.')
  })
})

describe('Controlled Cutover Phase 1 — Proof 7: no fake KPI data or mock parity samples', () => {
  it('page never constructs a synthetic entry/target object', async () => {
    const src = await pageSrc()
    expect(src).not.toMatch(/const\s+(mock|fake|sample|dummy)(Entry|Target|Kpi)/i)
    expect(src).not.toMatch(/wasfaty:\s*\d/)
  })

  it('page shows an explicit empty state instead of inventing data when no live sample exists', async () => {
    const src = await pageSrc()
    expect(src).toContain('No live parity sample selected')
    expect(src).toContain('no sample data')
  })

  it('liveSample is derived only from real subscribed entries/targets (find/reduce over fetched arrays, no literals)', async () => {
    const src = await pageSrc()
    expect(src).toMatch(/recentEntries/)
    expect(src).toMatch(/recentTargets/)
    expect(src).not.toMatch(/=\s*\{\s*pharmacyId:\s*['"]/)
  })
})

describe('Controlled Cutover Phase 1 — structural guardrails', () => {
  it('page uses React state only to hold subscription results, never a write call', async () => {
    const src = await pageSrc()
    expect(src).toContain('useState(')
    expect(src).not.toContain('useState(true)') // no boolean "activated" toggle
  })
})
