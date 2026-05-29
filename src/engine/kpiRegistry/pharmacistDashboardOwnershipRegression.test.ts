// ============================================================
// Pharmacist Dashboard Ownership — Regression Tests
//
// ROOT CAUSE:
//   authStore._fetchProfile() returned { id: snap.id, ...snap.data() }.
//   If the Firestore user document does NOT store a 'uid' field in its
//   data(), then userProfile.uid is undefined.
//   DashboardPage used: const uid = userProfile?.uid
//   saveKpiEntry used:  const resolvedUserId = auth?.currentUser?.uid || userId
//
//   Entry saved with:   userId = auth.currentUser.uid   (always the Auth UID)
//   Dashboard filtered: e.userId === undefined            (because userProfile.uid missing)
//   → pharmacist always saw 0 entries → 0% achievement
//
//   Manager worked because isManager → filters by pharmacyId, not uid
//
// FIXES:
//   1. authStore._fetchProfile: always injects { uid: snap.id } into profile
//   2. DashboardPage:   uid = userProfile?.uid ?? userProfile?.id
//   3. PerformancePage: uid = userProfile?.uid ?? userProfile?.id
//   4. KpiEntryPage:    uid = auth?.currentUser?.uid || userProfile?.uid || userProfile?.id
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

const AUTHSTORE_SRC     = readFileSync(resolve(__dirname, '../../store/authStore.js'),           'utf8')
const DASHBOARD_SRC     = readFileSync(resolve(__dirname, '../../pages/dashboard/DashboardPage.jsx'), 'utf8')
const PERFORMANCE_SRC   = readFileSync(resolve(__dirname, '../../pages/pharmacist/PerformancePage.jsx'), 'utf8')
const ENTRY_SRC         = readFileSync(resolve(__dirname, '../../pages/pharmacist/KpiEntryPage.jsx'),    'utf8')

// ── Helpers — simulate the data path ──────────────────────

/** Simulate _fetchProfile with the old behavior (no uid field) */
function fetchProfileOld(snapId: string, snapData: Record<string, unknown>) {
  return { id: snapId, ...snapData }
}

/** Simulate _fetchProfile with the fixed behavior */
function fetchProfileFixed(snapId: string, snapData: Record<string, unknown>) {
  return { id: snapId, uid: snapId, ...snapData }
}

/** Simulate DashboardPage uid resolution — old */
function resolveUidOld(userProfile: Record<string, unknown> | null) {
  return (userProfile as { uid?: string } | null)?.uid
}

/** Simulate DashboardPage uid resolution — fixed */
function resolveUidFixed(userProfile: Record<string, unknown> | null) {
  return (userProfile as { uid?: string; id?: string } | null)?.uid
      ?? (userProfile as { uid?: string; id?: string } | null)?.id
}

/** Simulate saveKpiEntry uid resolution */
function resolveEntryUserId(authUid: string | null, passedUserId: string | undefined) {
  return authUid || passedUserId
}

/** Simulate myEntries filter for pharmacist */
function filterMyEntries(
  entries: Array<{ userId: string; pharmacyId: string; date: string }>,
  uid: string | undefined,
  pharmacyId: string | undefined,
  isManager: boolean,
) {
  if (isManager && pharmacyId) return entries.filter((e) => e.pharmacyId === pharmacyId)
  return entries.filter((e) => e.userId === uid)
}

// ══════════════════════════════════════════════════════════════
// 1 — Root cause reproduction
// ══════════════════════════════════════════════════════════════

describe('Root cause — userProfile.uid undefined when Firestore doc has no uid field', () => {
  it('old _fetchProfile returns profile WITHOUT uid when doc data lacks uid', () => {
    const profile = fetchProfileOld('auth-uid-123', { displayName: 'Ahmed', role: 'pharmacist', pharmacyId: 'ph1' })
    expect(profile.id).toBe('auth-uid-123')
    expect((profile as { uid?: string }).uid).toBeUndefined()   // ← the bug
  })

  it('old uid resolution returns undefined when userProfile has no uid field', () => {
    const profile = fetchProfileOld('auth-uid-123', { displayName: 'Ahmed', role: 'pharmacist' })
    expect(resolveUidOld(profile)).toBeUndefined()   // ← causes empty entries filter
  })

  it('pharmacist sees 0 entries when uid is undefined (the crash scenario)', () => {
    const entries = [
      { userId: 'auth-uid-123', pharmacyId: 'ph1', date: '2025-05-20' },
      { userId: 'auth-uid-123', pharmacyId: 'ph1', date: '2025-05-19' },
    ]
    const result = filterMyEntries(entries, undefined, 'ph1', false)  // uid=undefined
    expect(result).toHaveLength(0)   // ← pharmacist sees nothing → 0%
  })

  it('manager sees entries even when uid is undefined (explains why manager worked)', () => {
    const entries = [
      { userId: 'auth-uid-123', pharmacyId: 'ph1', date: '2025-05-20' },
      { userId: 'auth-uid-456', pharmacyId: 'ph1', date: '2025-05-19' },
    ]
    const result = filterMyEntries(entries, undefined, 'ph1', true)   // isManager=true
    expect(result).toHaveLength(2)   // manager sees all pharmacy entries regardless of uid
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — Fix: authStore._fetchProfile injects uid
// ══════════════════════════════════════════════════════════════

describe('authStore._fetchProfile — fix: uid always injected', () => {
  it('fixed _fetchProfile always includes uid = snap.id', () => {
    const profile = fetchProfileFixed('auth-uid-123', { displayName: 'Ahmed', role: 'pharmacist' })
    expect(profile.uid).toBe('auth-uid-123')
  })

  it('fixed _fetchProfile uid equals id (both are the Auth UID)', () => {
    const profile = fetchProfileFixed('auth-uid-123', { displayName: 'Ahmed' })
    expect(profile.uid).toBe(profile.id)
  })

  it('fixed _fetchProfile does not override existing uid in doc data', () => {
    // If doc data already has uid, the spread order means snap.data() uid comes after
    // our injected uid — but snap.id IS the Auth UID, so they should be equal
    const profile = fetchProfileFixed('auth-uid-123', { uid: 'auth-uid-123', displayName: 'Ahmed' })
    expect(profile.uid).toBe('auth-uid-123')
  })

  it('source: _fetchProfile now includes uid: snap.id in returned object', () => {
    expect(AUTHSTORE_SRC).toMatch(/uid:\s*snap\.id/)
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Fix: uid resolution with ?? fallback chain
// ══════════════════════════════════════════════════════════════

describe('uid resolution — fixed fallback chain', () => {
  it('returns uid when userProfile has uid field', () => {
    const profile = fetchProfileFixed('auth-uid-123', { uid: 'auth-uid-123', pharmacyId: 'ph1' })
    expect(resolveUidFixed(profile)).toBe('auth-uid-123')
  })

  it('falls back to id when uid field is missing', () => {
    const profileWithoutUid = fetchProfileOld('auth-uid-123', { pharmacyId: 'ph1' })
    // Fixed pattern: uid ?? id
    const resolved = profileWithoutUid.uid ?? profileWithoutUid.id
    expect(resolved).toBe('auth-uid-123')
  })

  it('returns undefined only when both uid and id are missing (impossible in practice)', () => {
    expect(resolveUidFixed(null)).toBeUndefined()
  })

  it('pharmacist sees own entries when uid resolves correctly', () => {
    const entries = [
      { userId: 'auth-uid-123', pharmacyId: 'ph1', date: '2025-05-20' },
      { userId: 'auth-uid-456', pharmacyId: 'ph1', date: '2025-05-20' },
    ]
    const profile  = fetchProfileFixed('auth-uid-123', { pharmacyId: 'ph1', role: 'pharmacist' })
    const uid      = resolveUidFixed(profile)
    const myEntries = filterMyEntries(entries, uid, 'ph1', false)
    expect(myEntries).toHaveLength(1)
    expect(myEntries[0].userId).toBe('auth-uid-123')
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Source patch verification
// ══════════════════════════════════════════════════════════════

describe('Source patches — uid resolution verified in all affected files', () => {
  it('DashboardPage uses userProfile?.uid ?? userProfile?.id', () => {
    expect(DASHBOARD_SRC).toMatch(/userProfile\?\.uid\s*\?\?\s*userProfile\?\.id/)
  })

  it('PerformancePage uses userProfile?.uid ?? userProfile?.id', () => {
    expect(PERFORMANCE_SRC).toMatch(/userProfile\?\.uid\s*\?\?\s*userProfile\?\.id/)
  })

  it('KpiEntryPage includes userProfile?.id in uid fallback chain', () => {
    expect(ENTRY_SRC).toContain('userProfile?.id')
    expect(ENTRY_SRC).toMatch(/auth\?\.currentUser\?\.uid.*userProfile\?\.uid.*userProfile\?\.id|auth\?\.currentUser\?\.uid.*userProfile\?\.id/)
  })

  it('authStore _fetchProfile injects uid field', () => {
    expect(AUTHSTORE_SRC).toMatch(/uid:\s*snap\.id/)
    // Should come before the spread of snap.data() so explicit uid in doc data takes precedence
    expect(AUTHSTORE_SRC).toMatch(/uid:\s*snap\.id[^}]*\.\.\.snap\.data\(\)/)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Entry ownership: saveKpiEntry always uses Auth UID
// ══════════════════════════════════════════════════════════════

describe('saveKpiEntry — entry ownership always uses Auth UID', () => {
  it('entry userId is auth.currentUser.uid when available', () => {
    const resolved = resolveEntryUserId('auth-uid-123', undefined)
    expect(resolved).toBe('auth-uid-123')
  })

  it('entry userId falls back to passed userId when auth.currentUser is null', () => {
    const resolved = resolveEntryUserId(null, 'passed-uid-456')
    expect(resolved).toBe('passed-uid-456')
  })

  it('kpiService uses resolvedUserId in Firestore doc userId field', () => {
    const KPISERVICE_SRC = readFileSync(resolve(__dirname, '../../services/kpiService.js'), 'utf8')
    expect(KPISERVICE_SRC).toContain('resolvedUserId')
    expect(KPISERVICE_SRC).toMatch(/userId:\s*resolvedUserId/)
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Pharmacist sees own entries (full data path simulation)
// ══════════════════════════════════════════════════════════════

describe('Full data path simulation — pharmacist dashboard ownership', () => {
  it('pharmacist entry submitted and visible in myEntries after fix', () => {
    // Step 1: pharmacist logs in — _fetchProfile returns profile with uid injected
    const authUid  = 'pharmacist-uid-789'
    const profile  = fetchProfileFixed(authUid, { role: 'pharmacist', pharmacyId: 'ph-main' })

    // Step 2: pharmacist saves entry — saveKpiEntry uses auth.currentUser.uid
    const entryUserId = resolveEntryUserId(authUid, undefined)
    const savedEntry  = { userId: entryUserId!, pharmacyId: 'ph-main', date: '2025-05-20', wasfaty: 15 }

    // Step 3: subscribePharmacyEntries returns all pharmacy entries
    const allPharmacyEntries = [
      savedEntry,
      { userId: 'another-pharmacist-111', pharmacyId: 'ph-main', date: '2025-05-20', wasfaty: 12 },
    ]

    // Step 4: DashboardPage filters with fixed uid resolution
    const uid      = resolveUidFixed(profile)
    const myEntries = filterMyEntries(allPharmacyEntries, uid, 'ph-main', false)

    expect(myEntries).toHaveLength(1)
    expect(myEntries[0].userId).toBe(authUid)
    expect(myEntries[0].wasfaty).toBe(15)
  })

  it('pharmacist does NOT see other pharmacists entries', () => {
    const authUid = 'pharmacist-uid-789'
    const profile = fetchProfileFixed(authUid, { role: 'pharmacist', pharmacyId: 'ph-main' })
    const allEntries = [
      { userId: authUid,                 pharmacyId: 'ph-main', date: '2025-05-20', wasfaty: 15 },
      { userId: 'other-pharmacist',      pharmacyId: 'ph-main', date: '2025-05-20', wasfaty: 10 },
      { userId: 'another-pharmacist',    pharmacyId: 'ph-main', date: '2025-05-20', wasfaty: 8  },
    ]
    const uid      = resolveUidFixed(profile)
    const myEntries = filterMyEntries(allEntries, uid, 'ph-main', false)
    expect(myEntries).toHaveLength(1)
    expect(myEntries[0].wasfaty).toBe(15)
  })

  it('manager sees all pharmacy entries (unchanged behavior)', () => {
    const authUid = 'manager-uid-001'
    const profile = fetchProfileFixed(authUid, { role: 'manager', pharmacyId: 'ph-main' })
    const allEntries = [
      { userId: 'pharmacist-a', pharmacyId: 'ph-main', date: '2025-05-20', wasfaty: 15 },
      { userId: 'pharmacist-b', pharmacyId: 'ph-main', date: '2025-05-20', wasfaty: 10 },
    ]
    const uid      = resolveUidFixed(profile)
    const myEntries = filterMyEntries(allEntries, uid, 'ph-main', true)  // isManager=true
    expect(myEntries).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Month and date filtering correctness
// ══════════════════════════════════════════════════════════════

describe('Month/date filtering — pharmacist entries', () => {
  const authUid = 'pharmacist-uid-789'
  const allEntries = [
    { userId: authUid, pharmacyId: 'ph1', date: '2025-05-01', wasfaty: 10 },
    { userId: authUid, pharmacyId: 'ph1', date: '2025-05-15', wasfaty: 12 },
    { userId: authUid, pharmacyId: 'ph1', date: '2025-04-30', wasfaty: 8  },  // previous month
    { userId: 'other', pharmacyId: 'ph1', date: '2025-05-10', wasfaty: 5  },  // other user
  ]

  it('myEntries filtered by uid returns only this pharmacist entries', () => {
    const myEntries = allEntries.filter((e) => e.userId === authUid)
    expect(myEntries).toHaveLength(3)
  })

  it('monthEntries filtered by date range returns this month only', () => {
    const myEntries    = allEntries.filter((e) => e.userId === authUid)
    const monthEntries = myEntries.filter((e) => e.date >= '2025-05-01' && e.date <= '2025-05-31')
    expect(monthEntries).toHaveLength(2)
  })

  it('todayEntries filters to single day', () => {
    const myEntries   = allEntries.filter((e) => e.userId === authUid)
    const todayEntries = myEntries.filter((e) => e.date === '2025-05-15')
    expect(todayEntries).toHaveLength(1)
    expect(todayEntries[0].wasfaty).toBe(12)
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Dynamic KPI field inclusion
// ══════════════════════════════════════════════════════════════

describe('Dynamic KPI values — pharmacist dashboard renders correctly', () => {
  it('entry with custom KPI fields visible in myEntries after uid fix', () => {
    const authUid = 'pharmacist-uid-789'
    const entries = [
      {
        userId: authUid, pharmacyId: 'ph1', date: '2025-05-20',
        wasfaty: 15, omni: 8, wellness: 10, basket: 200, crossSelling: 5,
        nps: 85, sales: 45000, sl: 3, ndf: 7,
      },
    ]
    const myEntries = entries.filter((e) => e.userId === authUid)
    expect(myEntries).toHaveLength(1)
    expect(myEntries[0].nps).toBe(85)
    expect(myEntries[0].sales).toBe(45000)
  })

  it('monthEntries sum includes custom KPI fields', () => {
    const authUid = 'pharmacist-uid-789'
    const entries = [
      { userId: authUid, pharmacyId: 'ph1', date: '2025-05-20', wasfaty: 15, nps: 85 },
      { userId: authUid, pharmacyId: 'ph1', date: '2025-05-19', wasfaty: 12, nps: 90 },
    ]
    const myEntries = entries.filter((e) => e.userId === authUid)
    const totalWasfaty = myEntries.reduce((s, e) => s + (Number(e.wasfaty) || 0), 0)
    const totalNps     = myEntries.reduce((s, e) => s + (Number(e.nps)     || 0), 0)
    expect(totalWasfaty).toBe(27)
    expect(totalNps).toBe(175)
  })
})
