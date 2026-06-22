// ============================================================
// Branch Name Resolution — Regression Tests
//
// Root cause: useBranchIntelligenceData.js was using
//   users[0]?.pharmacyName ?? branchId
// User documents don't have pharmacyName → always fell back to
// the raw Firestore document ID (e.g. "OuPy4tusCnvfELv1oyb5").
//
// Fix: resolve name from pharmacyStore.getById(branchId) using
//   the hierarchy: nameAr → name → code → id
//
// These tests verify the fix and guard against regression.
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'

let hookSrc: string
let pageSrc: string

beforeAll(async () => {
  hookSrc = (await import('../../pages/branch/useBranchIntelligenceData.js?raw')).default
  pageSrc = (await import('./BranchIntelligencePage.jsx?raw')).default
})

// ─────────────────────────────────────────────────────────────
// 1. Hook — name resolution source
// ─────────────────────────────────────────────────────────────
describe('useBranchIntelligenceData — pharmacy name resolution', () => {
  it('imports usePharmacyStore (required for name lookup)', () => {
    expect(hookSrc).toContain("import { usePharmacyStore } from '../../store/pharmacyStore'")
  })

  it('calls getById from pharmacyStore with branchId', () => {
    expect(hookSrc).toContain('getById: getPharmacyById')
    expect(hookSrc).toContain('branchId ? getPharmacyById(branchId) : null')
  })

  it('follows nameAr → name → code → id fallback hierarchy', () => {
    expect(hookSrc).toContain(
      'pharmacy?.nameAr ?? pharmacy?.name ?? pharmacy?.code ?? branchId'
    )
  })

  it('does NOT use users[0].pharmacyName (the broken fallback)', () => {
    expect(hookSrc).not.toContain('users[0]?.pharmacyName')
  })

  it('does NOT set pharmacyName directly to branchId without a lookup', () => {
    // The old bug: pharmacyName: users[0]?.pharmacyName ?? branchId
    // This pattern must no longer appear
    expect(hookSrc).not.toContain('pharmacyName ?? branchId')
  })

  it('sets BranchInput.pharmacyName from resolvedPharmacyName', () => {
    expect(hookSrc).toContain('pharmacyName: resolvedPharmacyName')
  })

  it('sets BranchInput.pharmacyCode from resolvedPharmacyCode', () => {
    expect(hookSrc).toContain('pharmacyCode: resolvedPharmacyCode')
  })

  it('sets BranchInput.region from pharmacy.region (not hardcoded)', () => {
    expect(hookSrc).toContain("region: pharmacy?.region ?? '—'")
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Fallback hierarchy — unit logic verification
// ─────────────────────────────────────────────────────────────
describe('Name resolution fallback hierarchy — logic verification', () => {
  // Simulate the resolution expression outside of React
  function resolve(pharmacy: any, branchId: string): string {
    return pharmacy?.nameAr ?? pharmacy?.name ?? pharmacy?.code ?? branchId
  }

  it('returns nameAr when available (preferred)', () => {
    expect(resolve({ nameAr: 'صيدلية الأثير', name: 'Al Athir', code: '5074' }, 'doc-id'))
      .toBe('صيدلية الأثير')
  })

  it('falls back to name when nameAr is absent', () => {
    expect(resolve({ name: 'Al Athir', code: '5074' }, 'doc-id'))
      .toBe('Al Athir')
  })

  it('falls back to code when name and nameAr are absent', () => {
    expect(resolve({ code: '5074' }, 'doc-id'))
      .toBe('5074')
  })

  it('falls back to branchId only when pharmacy doc is missing entirely', () => {
    expect(resolve(null, 'OuPy4tusCnvfELv1oyb5'))
      .toBe('OuPy4tusCnvfELv1oyb5')
  })

  it('falls back to branchId when pharmacy exists but has no name fields', () => {
    expect(resolve({ active: true }, 'OuPy4tusCnvfELv1oyb5'))
      .toBe('OuPy4tusCnvfELv1oyb5')
  })

  it('does not expose raw Firestore ID when pharmacy.name is present', () => {
    const result = resolve({ name: 'Al Athir' }, 'OuPy4tusCnvfELv1oyb5')
    expect(result).not.toBe('OuPy4tusCnvfELv1oyb5')
    expect(result).toBe('Al Athir')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Page — render sites use viewModel, not raw branchId
// ─────────────────────────────────────────────────────────────
describe('BranchIntelligencePage — name render sites', () => {
  it('breadcrumb uses viewModel.branchSummary.pharmacyName (not raw branchId string)', () => {
    // The breadcrumb uses the resolved value via the viewModel
    expect(pageSrc).toContain('viewModel?.branchSummary?.pharmacyName ?? branchId')
    // The right side of ?? is branchId — acceptable as last-resort only when
    // the viewModel itself hasn't loaded. Once loaded, pharmacyName is correct.
  })

  it('page title (Section 1) uses viewModel.branchSummary.pharmacyName', () => {
    expect(pageSrc).toContain('viewModel.branchSummary.pharmacyName')
  })

  it('page shows pharmacyCode and region from viewModel (not hardcoded)', () => {
    expect(pageSrc).toContain('viewModel.branchSummary.pharmacyCode')
    expect(pageSrc).toContain('viewModel.branchSummary.region')
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Executive BI — same resolution pattern (no regression)
// ─────────────────────────────────────────────────────────────
describe('useExecutiveReport — pharmacyName resolution (no regression)', () => {
  it('resolves pharmacyName from pharmacy.name in useExecutiveReport', async () => {
    const src = (await import('../../hooks/useExecutiveReport.ts?raw')).default
    // Executive BI already correctly used pharmacy.name from the store
    expect(src).toContain('pharmacy.name ?? pharmacy.id')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Source safety — confirm the fix is in the right place
// ─────────────────────────────────────────────────────────────
describe('Fix location safety', () => {
  it('fix is in useBranchIntelligenceData (data layer), not the page component', () => {
    // The hook is the correct fix location — it sets pharmacyName on BranchInput
    // before passing it to the engine. The page component is a consumer.
    expect(hookSrc).toContain('resolvedPharmacyName')
    expect(hookSrc).toContain('usePharmacyStore')
  })

  it('page component does not need to import usePharmacyStore separately', () => {
    // The name flows through: pharmacyStore → hook → BranchInput → engine → viewModel → page
    // The page only reads viewModel — no direct store access needed
    expect(pageSrc).not.toContain('usePharmacyStore')
  })

  it('no extra Firestore reads introduced — pharmacyStore is already subscribed', () => {
    // AppLayout subscribes to pharmacies on mount.
    // The hook reads from the in-memory store, not Firestore directly.
    expect(hookSrc).not.toContain('getDoc')
    expect(hookSrc).not.toContain('getDocs')
    // The fix only adds getById (synchronous store lookup)
    expect(hookSrc).toContain('getPharmacyById(branchId)')
  })
})
