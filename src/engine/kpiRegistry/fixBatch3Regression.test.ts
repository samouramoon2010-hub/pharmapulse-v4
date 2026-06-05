// ============================================================
// Regression Tests — Fix Batch 3
//
// TD-02  — COL.STAGING_ENTRIES added to firebase.js
// STB-02 — Dead kpiColor() function removed from DashboardPage
// STB-03 — Unused DEFAULT_KPI_UI_CONFIG import removed
// TeamPage — Unsafe || pharmacies[0] fallback removed
//
// ============================================================

import { describe, it, expect } from 'vitest'

// ── TD-02: COL.STAGING_ENTRIES ────────────────────────────────
// Verifies the constant exists, has the correct string value,
// and is co-located with the other ingestion-related constants.

describe('TD-02 — COL.STAGING_ENTRIES constant', () => {
  it('COL object exports STAGING_ENTRIES', async () => {
    // Dynamic import to avoid top-level Firebase initialisation issues
    const { COL } = await import('../../services/firebase')
    expect(COL).toHaveProperty('STAGING_ENTRIES')
  })

  it('COL.STAGING_ENTRIES equals the Firestore collection name used in rules', async () => {
    const { COL } = await import('../../services/firebase')
    // Must match the collection name in firestore.rules:
    //   match /staging_entries/{docId} { ... }
    expect(COL.STAGING_ENTRIES).toBe('staging_entries')
  })

  it('COL.STAGING_ENTRIES is a non-empty string', async () => {
    const { COL } = await import('../../services/firebase')
    expect(typeof COL.STAGING_ENTRIES).toBe('string')
    expect(COL.STAGING_ENTRIES.length).toBeGreaterThan(0)
  })

  it('all existing COL constants are still present (no regression)', async () => {
    const { COL } = await import('../../services/firebase')
    const expected = [
      'USERS', 'PHARMACIES', 'KPI_ENTRIES', 'TARGETS',
      'AUDIT_LOGS', 'NOTIFICATIONS', 'LEADERBOARD', 'KPI_REGISTRY',
      'DAILY_SUMMARIES', 'MONTHLY_SUMMARIES', 'FORECAST_SNAPSHOTS',
      'RISK_SNAPSHOTS', 'RANKING_HISTORY',
    ]
    expected.forEach((key) => {
      expect(COL).toHaveProperty(key)
    })
  })

  it('COL string values contain no typos (spot-check neighbours)', async () => {
    const { COL } = await import('../../services/firebase')
    expect(COL.RANKING_HISTORY).toBe('ranking_history')
    expect(COL.STAGING_ENTRIES).toBe('staging_entries')
  })
})

// ── STB-02: kpiColor() removed ────────────────────────────────
// The function was dead — never called, never exported.
// We verify the source file no longer contains it, and that
// the file still imports and exports its real public symbols.

describe('STB-02 — Dead kpiColor() function removed from DashboardPage', () => {
  it('DashboardPage source does not contain the kpiColor identifier', async () => {
    // Read the source text — if kpiColor appears the function crept back in
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).not.toContain('kpiColor')
  })

  it('DashboardPage still exports a default component (no accidental breakage)', async () => {
    // Verify the module still resolves — this would fail if the removal
    // accidentally broke the surrounding code structure
    const mod = await import('../../pages/dashboard/DashboardPage.jsx')
    expect(typeof mod.default).toBe('function')
  })
})

// ── STB-03: DEFAULT_KPI_UI_CONFIG import removed ──────────────
// The import was the only reference in the file — removing it
// leaves the registry export untouched.

describe('STB-03 — Unused DEFAULT_KPI_UI_CONFIG import removed', () => {
  it('DashboardPage source does not import DEFAULT_KPI_UI_CONFIG', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).not.toContain('DEFAULT_KPI_UI_CONFIG')
  })

  it('DEFAULT_KPI_UI_CONFIG is still exported from the kpiRegistry (no regression)', async () => {
    // The import was removed from DashboardPage but the export must remain
    // intact for any future consumer
    const registry = await import('../../engine/kpiRegistry')
    expect(registry).toHaveProperty('DEFAULT_KPI_UI_CONFIG')
    expect(registry.DEFAULT_KPI_UI_CONFIG).toBeDefined()
  })

  it('getKpisForSurface is still imported and accessible (sibling import not broken)', async () => {
    const registry = await import('../../engine/kpiRegistry')
    expect(typeof registry.getKpisForSurface).toBe('function')
  })
})

// ── TeamPage pharmacy fallback ────────────────────────────────
// The old code: pharmacies.find(p => p.id === pharmacyId) || pharmacies[0]
// would silently return an unrelated branch when pharmacyId was absent.
// The fix: return undefined when pharmacyId is absent or unmatched.
//
// We test the pure logic of the lookup function since the component
// itself cannot be mounted without Firebase in this environment.

type Pharmacy = { id: string; name: string }

function resolvePharmacy(
  pharmacies: Pharmacy[],
  pharmacyId: string | undefined | null,
): Pharmacy | undefined {
  // Mirrors the fixed useMemo: pharmacies.find(p => p.id === pharmacyId)
  return pharmacies.find((p) => p.id === pharmacyId)
}

function resolvePharmacyUnsafe(
  pharmacies: Pharmacy[],
  pharmacyId: string | undefined | null,
): Pharmacy | undefined {
  // Mirrors the OLD (broken) useMemo: find(...) || pharmacies[0]
  return pharmacies.find((p) => p.id === pharmacyId) || pharmacies[0]
}

const PHARMACIES: Pharmacy[] = [
  { id: 'pharmacy-aaa', name: 'Branch Alpha' },
  { id: 'pharmacy-bbb', name: 'Branch Beta'  },
  { id: 'pharmacy-ccc', name: 'Branch Gamma' },
]

describe('TeamPage — pharmacy fallback safety fix', () => {

  describe('correct resolution when pharmacyId is valid', () => {
    it('returns the matching pharmacy for a known pharmacyId', () => {
      const result = resolvePharmacy(PHARMACIES, 'pharmacy-bbb')
      expect(result).toBeDefined()
      expect(result?.name).toBe('Branch Beta')
    })

    it('returns the correct branch regardless of position in array', () => {
      expect(resolvePharmacy(PHARMACIES, 'pharmacy-aaa')?.name).toBe('Branch Alpha')
      expect(resolvePharmacy(PHARMACIES, 'pharmacy-ccc')?.name).toBe('Branch Gamma')
    })
  })

  describe('fixed behaviour — returns undefined for missing pharmacyId', () => {
    it('returns undefined when pharmacyId is undefined', () => {
      expect(resolvePharmacy(PHARMACIES, undefined)).toBeUndefined()
    })

    it('returns undefined when pharmacyId is null', () => {
      expect(resolvePharmacy(PHARMACIES, null)).toBeUndefined()
    })

    it('returns undefined when pharmacyId does not match any branch', () => {
      expect(resolvePharmacy(PHARMACIES, 'pharmacy-zzz')).toBeUndefined()
    })

    it('returns undefined when pharmacyId is an empty string', () => {
      expect(resolvePharmacy(PHARMACIES, '')).toBeUndefined()
    })
  })

  describe('broken old behaviour — documents the bug being fixed', () => {
    it('old code returned pharmacies[0] when pharmacyId was undefined (wrong branch)', () => {
      const result = resolvePharmacyUnsafe(PHARMACIES, undefined)
      // Old code returned Branch Alpha even for a user with no pharmacy assigned
      expect(result?.name).toBe('Branch Alpha')
      // This is WRONG — it silently showed the first branch in the list
    })

    it('old code returned pharmacies[0] when pharmacyId was null (wrong branch)', () => {
      const result = resolvePharmacyUnsafe(PHARMACIES, null)
      expect(result?.name).toBe('Branch Alpha')
    })

    it('old code returned pharmacies[0] when pharmacyId was unrecognised (wrong branch)', () => {
      const result = resolvePharmacyUnsafe(PHARMACIES, 'deleted-pharmacy-id')
      expect(result?.name).toBe('Branch Alpha')
    })
  })

  describe('edge cases — empty pharmacy list', () => {
    it('returns undefined when pharmacy list is empty (no crash)', () => {
      expect(resolvePharmacy([], 'pharmacy-aaa')).toBeUndefined()
    })

    it('old code also returned undefined for empty list (no regression here)', () => {
      // Both old and new return undefined for empty list — no behaviour change
      expect(resolvePharmacyUnsafe([], 'pharmacy-aaa')).toBeUndefined()
    })
  })

  describe('TeamPage source — confirms fallback is removed', () => {
    it('TeamPage source does not contain the || pharmacies[0] fallback', async () => {
      const src = await import('../../pages/manager/TeamPage.jsx?raw')
      // The exact unsafe pattern must not exist
      expect(src.default).not.toContain('|| pharmacies[0]')
    })

    it('TeamPage source still uses pharmacies.find for pharmacy resolution', async () => {
      const src = await import('../../pages/manager/TeamPage.jsx?raw')
      expect(src.default).toContain('pharmacies.find')
    })
  })
})
