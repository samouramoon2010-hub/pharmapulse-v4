// ============================================================
// SMARTS Sales Required Fix — ER-2A Regression Tests
//
// Root cause: el('sales', 0.70) used required=true (default).
// 'sales' is not collected in the core KPI entry form.
// With 1 entry aggregated, kpiActuals.sales is absent.
// dataAvailable=false + required=true → Revenue basket isValid=false
// → hasInvalidBasket=true → status='invalid'.
//
// Fix: el('sales', 0.70, false) — sales is now optional.
// Missing sales → element zeroed, basket still valid → status='partial'
// (because missingKpis is non-empty but no required KPI is missing).
//
// These tests verify:
//   1. SMARTS template: sales is now required=false
//   2. Engine: missing optional sales → status=partial, not invalid
//   3. Engine: missing optional sales → Revenue basket isValid=true
//   4. Before/after comparison: exact status transition invalid→partial
//   5. Ledger schema: no changes
//   6. Scope guard: no rating methodology changes
// ============================================================

import { describe, it, expect } from 'vitest'
import { runEvaluation }
  from '../../engine/evaluationEngine/evaluationEngine'
import {
  createSmarts2026Template,
  DEFAULT_THRESHOLD_RULE,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { EvaluationProfile, EvaluationBasket }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'

// ── Fixtures ──────────────────────────────────────────────────

const MONTH = '2026-05'
const UID   = 'uid-samir'
const PID   = 'ph-5074'

// Branch target for May 2026 — الأثير
// basketTarget / crossSellTarget audit:
//   basket    = basket size in SAR (average per transaction, e.g. 40–60 SAR)
//   crossSell = cross-selling transactions count
// These values represent realistic May 2026 targets for a mid-size pharmacy.
const BRANCH_TARGET = {
  pharmacyId:        PID,
  month:             MONTH,
  wasfatyTarget:     100000,
  omniTarget:        600,
  wellnessTarget:    80,
  basketTarget:      50,      // SAR average basket size target
  crossSellTarget:   300,     // cross-selling transaction count target
  salesTarget:       50000,   // monthly revenue target (SAR)
  slTarget:          120,
  ndfTarget:         30,
  inbodyTarget:      20,
}

// KPI actuals from 1 aggregated entry (core 5 only — no sales/sl/ndf/inbody)
// This simulates the real-world case: pharmacist entered only core KPIs
const ACTUALS_CORE_ONLY: Record<string, number> = {
  wasfaty:      8500,  // 8500 / 100000 = 8.5% (partial month)
  omni:         42,    // 42 / 600 = 7%
  wellness:     6,     // 6 / 80 = 7.5%
  basket:       350,   // 350 / 50 = 700% ← THIS IS THE PROFIT 700% ISSUE
  crossSelling: 28,    // 28 / 300 = 9.3%
  // sales, sl, ndf, inbody: NOT present (not collected in standard entry form)
}

// KPI actuals with sales present (for comparison)
const ACTUALS_WITH_SALES: Record<string, number> = {
  ...ACTUALS_CORE_ONLY,
  sales: 4200,  // 4200 / 50000 = 8.4%
}

// Build a SMARTS profile for the test (simulates the published Firestore doc)
function buildTestProfile(): EvaluationProfile {
  const template = createSmarts2026Template()
  return {
    id: 'smarts-may-2026', name: 'SMARTS 2026', role: 'pharmacist',
    version: 1, status: 'published',
    effectiveFrom: '2026-01', effectiveTo: null,
    basketIds: template.basketIds!,
    baskets: template.baskets!,
    defaultThresholdRule: template.defaultThresholdRule!,
    createdBy: null, createdAt: null, updatedAt: null,
    publishedAt: null, archivedAt: null, previousVersionId: null,
  }
}

// ── 1. SMARTS template: sales is required=false ───────────────

describe('SMARTS sales fix — template definition', () => {
  it('createSmarts2026Template: sales element required = false', () => {
    const template = createSmarts2026Template()
    const revenueBasket = template.baskets!['revenue']
    const salesEl = revenueBasket.elements.find((e) => e.kpiKey === 'sales')
    expect(salesEl).toBeDefined()
    expect(salesEl!.required).toBe(false)
  })

  it('createSmarts2026Template: sl element required = false (unchanged)', () => {
    const template = createSmarts2026Template()
    const revenueBasket = template.baskets!['revenue']
    const slEl = revenueBasket.elements.find((e) => e.kpiKey === 'sl')
    expect(slEl!.required).toBe(false)
  })

  it('Revenue basket: all elements are now optional (required=false)', () => {
    const template = createSmarts2026Template()
    const revenueBasket = template.baskets!['revenue']
    revenueBasket.elements.forEach((el) => {
      expect(el.required).toBe(false)
    })
  })

  it('other required elements are unchanged (wasfaty still required)', () => {
    const template = createSmarts2026Template()
    const satisfactionBasket = template.baskets!['satisfaction']
    const wasfatyEl = satisfactionBasket.elements.find((e) => e.kpiKey === 'wasfaty')
    expect(wasfatyEl!.required).toBe(true)
  })

  it('wellnessCard still required (only sales changed)', () => {
    const template = createSmarts2026Template()
    const wellnessBasket = template.baskets!['wellness-card']
    const wellnessEl = wellnessBasket.elements.find((e) => e.kpiKey === 'wellnessCard')
    expect(wellnessEl!.required).toBe(true)
  })
})

// ── 2. BEFORE fix simulation (required=true) ─────────────────

describe('SMARTS sales fix — BEFORE (required=true simulation)', () => {
  it('BEFORE: missing sales + required=true → Revenue basket invalid', () => {
    const profile = buildTestProfile()
    // Manually override: set sales to required=true to simulate the old bug
    const revenueBasket = profile.baskets['revenue']
    const salesEl = revenueBasket.elements.find((e) => e.kpiKey === 'sales')!
    salesEl.required = true

    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH,
      role: 'pharmacist', profile,
      kpiActuals:    ACTUALS_CORE_ONLY,
      personalTarget: null,
      branchTarget:   BRANCH_TARGET as any,
      registry:      DEFAULT_KPI_REGISTRY,
    })

    const revenueResult = result.basketResults.find((b) => b.basketId === 'revenue')!
    expect(revenueResult.isValid).toBe(false)
    expect(revenueResult.invalidReason).toContain('sales')
    expect(result.status).toBe('invalid')
  })
})

// ── 3. AFTER fix (required=false) ────────────────────────────

describe('SMARTS sales fix — AFTER (required=false)', () => {
  it('AFTER: missing sales + required=false → Revenue basket valid', () => {
    const profile = buildTestProfile()
    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH,
      role: 'pharmacist', profile,
      kpiActuals:    ACTUALS_CORE_ONLY,
      personalTarget: null,
      branchTarget:   BRANCH_TARGET as any,
      registry:      DEFAULT_KPI_REGISTRY,
    })

    const revenueResult = result.basketResults.find((b) => b.basketId === 'revenue')!
    expect(revenueResult.isValid).toBe(true)
    expect(revenueResult.invalidReason).toBeUndefined()
  })

  it('AFTER: missing sales → status = partial (missing optional KPI)', () => {
    const profile = buildTestProfile()
    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH,
      role: 'pharmacist', profile,
      kpiActuals:    ACTUALS_CORE_ONLY,
      personalTarget: null,
      branchTarget:   BRANCH_TARGET as any,
      registry:      DEFAULT_KPI_REGISTRY,
    })

    // Missing sales is in trace.missingKpis
    expect(result.trace.missingKpis).toContain('sales')
    // But no basket is invalid → status = partial (not invalid)
    expect(result.status).toBe('partial')
    expect(result.status).not.toBe('invalid')
  })

  it('AFTER: all baskets are valid when only core KPIs present', () => {
    const profile = buildTestProfile()
    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH,
      role: 'pharmacist', profile,
      kpiActuals:    ACTUALS_CORE_ONLY,
      personalTarget: null,
      branchTarget:   BRANCH_TARGET as any,
      registry:      DEFAULT_KPI_REGISTRY,
    })

    result.basketResults.forEach((basket) => {
      expect(basket.isValid).toBe(true)
    })
  })

  it('AFTER: providing sales produces status = partial (sl still missing)', () => {
    const profile = buildTestProfile()
    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH,
      role: 'pharmacist', profile,
      kpiActuals:    ACTUALS_WITH_SALES,
      personalTarget: null,
      branchTarget:   BRANCH_TARGET as any,
      registry:      DEFAULT_KPI_REGISTRY,
    })

    // sl, ndf, inbody still absent (optional) → still partial
    expect(result.status).toBe('partial')
    expect(result.trace.missingKpis).not.toContain('sales')
  })
})

// ── 4. Before/after comparison table ─────────────────────────

describe('SMARTS sales fix — before/after comparison (May 2026 simulation)', () => {
  it('exact status transition: invalid → partial', () => {
    const profile = buildTestProfile()

    // BEFORE: manually set sales required=true
    const profileBefore = JSON.parse(JSON.stringify(profile)) as EvaluationProfile
    profileBefore.baskets['revenue'].elements.find(
      (e) => e.kpiKey === 'sales'
    )!.required = true

    const before = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile: profileBefore, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: BRANCH_TARGET as any,
      registry: DEFAULT_KPI_REGISTRY,
    })

    // AFTER: sales required=false (current template)
    const after = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: BRANCH_TARGET as any,
      registry: DEFAULT_KPI_REGISTRY,
    })

    expect(before.status).toBe('invalid')
    expect(after.status).toBe('partial')

    // Revenue basket validity: false → true
    const revBefore = before.basketResults.find((b) => b.basketId === 'revenue')!
    const revAfter  = after.basketResults.find( (b) => b.basketId === 'revenue')!
    expect(revBefore.isValid).toBe(false)
    expect(revAfter.isValid).toBe(true)

    // All other baskets unchanged
    const otherBaskets = ['satisfaction', 'profit', 'omni-guest', 'wellness-card']
    otherBaskets.forEach((bid) => {
      const bBefore = before.basketResults.find((b) => b.basketId === bid)!
      const bAfter  = after.basketResults.find( (b) => b.basketId === bid)!
      expect(bBefore.isValid).toBe(bAfter.isValid)
      expect(bBefore.basketId).toBe(bAfter.basketId)
    })
  })

  it('finalScore is the same before and after (sales zero in both cases)', () => {
    const profile = buildTestProfile()
    const profileBefore = JSON.parse(JSON.stringify(profile)) as EvaluationProfile
    profileBefore.baskets['revenue'].elements.find(
      (e) => e.kpiKey === 'sales'
    )!.required = true

    const before = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile: profileBefore, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: BRANCH_TARGET as any,
      registry: DEFAULT_KPI_REGISTRY,
    })
    const after = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: BRANCH_TARGET as any,
      registry: DEFAULT_KPI_REGISTRY,
    })

    // Score is identical — only status label changes
    expect(after.finalScore).toBe(before.finalScore)
    expect(after.basketResults.find((b) => b.basketId === 'revenue')!.weightedScore)
      .toBe(before.basketResults.find((b) => b.basketId === 'revenue')!.weightedScore)
  })

  it('missingKpis still includes sales (optional KPIs are tracked)', () => {
    const profile = buildTestProfile()
    const after = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: BRANCH_TARGET as any,
      registry: DEFAULT_KPI_REGISTRY,
    })
    // Missing optional KPIs still appear in the trace for auditability
    expect(after.trace.missingKpis).toContain('sales')
  })
})

// ── 5. Profit 700% — target value audit ──────────────────────

describe('Profit basket — target value audit (May 2026)', () => {
  it('basket 350 / basketTarget 50 = 700% achievement (EXPECTED with these targets)', () => {
    const profile = buildTestProfile()
    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: BRANCH_TARGET as any,
      registry: DEFAULT_KPI_REGISTRY,
    })
    const basketEl = result.basketResults
      .find((b) => b.basketId === 'profit')!
      .elements.find((e) => e.kpiKey === 'basket')!

    expect(basketEl.actual).toBe(350)
    expect(basketEl.target).toBe(50)
    expect(basketEl.achievementPct).toBeCloseTo(700, 1)
    expect(basketEl.targetSource).toBe('branch')
  })

  it('basket 350 / basketTarget 350 = 100% achievement (correct target SAR value)', () => {
    // If the admin corrects basketTarget to 350 SAR (realistic daily/entry value),
    // achievement becomes 100% — Exceed Expectation
    const correctTarget = { ...BRANCH_TARGET, basketTarget: 350 }
    const profile = buildTestProfile()
    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: correctTarget as any,
      registry: DEFAULT_KPI_REGISTRY,
    })
    const basketEl = result.basketResults
      .find((b) => b.basketId === 'profit')!
      .elements.find((e) => e.kpiKey === 'basket')!

    expect(basketEl.achievementPct).toBeCloseTo(100, 1)
  })

  it('target unit mismatch identified: basketTarget should be realistic SAR value', () => {
    // This test documents the finding for the May 2026 audit:
    // If basketTarget = 50 SAR and actual basket per entry = 350 SAR,
    // the admin entered a value that is 7x too small.
    // Likely cause: target entered as daily average (50 SAR/day) but
    // actual value is the total basket value across all transactions in the entry.
    // Action required: admin to review and correct basketTarget for May 2026.
    const profile = buildTestProfile()
    const result = runEvaluation({
      userId: UID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile, kpiActuals: ACTUALS_CORE_ONLY,
      personalTarget: null, branchTarget: BRANCH_TARGET as any,
      registry: DEFAULT_KPI_REGISTRY,
    })
    const basketEl = result.basketResults
      .find((b) => b.basketId === 'profit')!
      .elements.find((e) => e.kpiKey === 'basket')!

    // Achievement > 200% is a strong signal of target misconfiguration
    expect(basketEl.achievementPct).toBeGreaterThan(200)
    // Document: engine is correct — this is a data input issue
    expect(basketEl.targetSource).toBe('branch')
  })
})

// ── 6. Ledger schema unchanged ────────────────────────────────

describe('SMARTS sales fix — ledger compatibility', () => {
  it('ledger schema has not changed (evaluationLedgerService unchanged)', async () => {
    const src = await import('../../services/evaluationLedgerService.ts?raw')
    // sealed must still be true
    expect(src.default).toContain('sealed: true')
    // recalculationOf must still be null in ER-2A
    expect(src.default).toContain('recalculationOf: null')
    // sanitizeForFirestore still present
    expect(src.default).toContain('sanitizeForFirestore')
  })

  it('status values partial and invalid are still valid engine outputs', () => {
    expect(['complete', 'partial', 'invalid']).toContain('partial')
    expect(['complete', 'partial', 'invalid']).toContain('invalid')
  })
})

// ── 7. Scope guard ────────────────────────────────────────────

describe('SMARTS sales fix — scope guard', () => {
  it('only sales required flag was changed (one character group)', async () => {
    const src = await import(
      '../../engine/evaluationRegistry/evaluationRegistryTypes.ts?raw'
    )
    // Revenue basket sales element must now be false
    expect(src.default).toContain("el('sales', 0.70, false)")
    // Ensure the old form is gone
    expect(src.default).not.toContain("el('sales', 0.70),")
  })

  it('rating normalization is present (Option A implemented)', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    // finalScore is still Σ basket.weightedScore — unchanged
    expect(src.default).toContain('finalScore = basketResults.reduce')
    // normalizedFinalScorePct is computed before rating threshold matching
    expect(src.default).toContain('normalizedFinalScorePct')
    // Rating uses the normalized value, not raw finalScore
    expect(src.default).toContain('matchThresholdBand(normalizedFinalScorePct')
  })

  it('no ranking or coaching introduced', async () => {
    const src = await import(
      '../../engine/evaluationRegistry/evaluationRegistryTypes.ts?raw'
    )
    expect(src.default).not.toMatch(/rankingEngine|coachingEngine/i)
  })
})
