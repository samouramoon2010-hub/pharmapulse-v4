// ============================================================
// kpi_entries Permanent Secure Rule — Regression Tests
//
// Root cause confirmed (temporary isAuth() rule proved it):
//   notFutureDate() compared payload.date (Riyadh local YYYY-MM-DD)
//   against request.time.date().toCode() (UTC date).
//   In Saudi Arabia (UTC+3), a save at 01:00 local time sends
//   date="2026-06-04" but UTC is still "2026-06-03".
//   "2026-06-04" <= "2026-06-03" → FALSE → entire create rule denied.
//   A subsequent attempt to fix this with duration.value() caused
//   a Firebase Rules compilation error, deploying deny-all as fallback.
//
// Permanent fix:
//   - Removed notFutureDate() from create/update rules
//   - Date validation stays in app layer (KpiEntryPage)
//   - isOwnData() remains — userId must equal auth.uid
//   - isMgr() path remains — managers can create their own entries
//   - isOwnPharmacy() path remains — pharmacist path via userDoc match
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setDoc } from 'firebase/firestore'

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: '0C8hPmFvHRXp2sst2k41DBe3uV72' } },
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', KPI_ENTRIES: 'kpi_entries',
    TARGETS: 'targets', AUDIT_LOGS: 'audit_logs', NOTIFICATIONS: 'notifications',
    LEADERBOARD: 'leaderboard', KPI_REGISTRY: 'kpi_registry',
    DAILY_SUMMARIES: 'daily_summaries', MONTHLY_SUMMARIES: 'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots', RISK_SNAPSHOTS: 'risk_snapshots',
    RANKING_HISTORY: 'ranking_history', STAGING_ENTRIES: 'staging_entries',
    DISTRICTS: 'districts', REGIONS: 'regions',
    PERSONAL_TARGETS: 'personal_targets',
    EVALUATION_PROFILES: 'evaluation_profiles',
    EVALUATION_RESULTS:  'evaluation_results',
  },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  setDoc:          vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  deleteDoc:       vi.fn(async () => {}),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp:       { now: vi.fn(() => ({ toDate: () => new Date() })) },
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))
vi.mock('../../services/historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

// ── Rule simulation ───────────────────────────────────────────

type User = { uid: string; role: string; pharmacyId: string | null }
type Payload = { userId: string; pharmacyId: string; date: string }
type ExistingDoc = { userId: string; pharmacyId: string } | null

const isAuth = (u: User) => !!u.uid
const uid    = (u: User) => u.uid
const isAdmin = (u: User) => isAuth(u) && u.role === 'admin'
const isMgr   = (u: User) => isAuth(u) && ['admin','manager','branch_manager'].includes(u.role)
const pharmId = (u: User) => u.pharmacyId

const ownsPharmacy = (u: User, pid: string | null) =>
  isAdmin(u) || (isMgr(u) && pharmId(u) === pid)

const isOwnData = (u: User, p: Payload) => p.userId === uid(u)

const isOwnPharmacy = (u: User, p: Payload) =>
  p.pharmacyId === pharmId(u) || isAdmin(u)

// Permanent create rule (no notFutureDate)
const canCreate = (u: User, p: Payload) =>
  isOwnData(u, p) && (isOwnPharmacy(u, p) || isMgr(u))

// Permanent update rule
const canUpdate = (u: User, p: Payload, existing: ExistingDoc) =>
  isAuth(u) && (
    (existing?.userId === uid(u) && isOwnData(u, p)) ||
    ownsPharmacy(u, existing?.pharmacyId ?? null)
  )

// ── 1. Root cause — notFutureDate UTC vs UTC+3 ───────────────

describe('Root cause — notFutureDate UTC mismatch', () => {
  it('UTC date check fails for Riyadh before 03:00 local (UTC+3)', () => {
    // Simulate: client date "2026-06-04", server UTC date "2026-06-03"
    const clientDate = '2026-06-04'
    const serverUtcDate = '2026-06-03'  // before midnight UTC
    const oldNotFutureDate = clientDate <= serverUtcDate
    expect(oldNotFutureDate).toBe(false)  // ← this is why it failed
  })

  it('same save attempt later in UTC day would pass', () => {
    const clientDate = '2026-06-04'
    const serverUtcDate = '2026-06-04'  // after 03:00 Riyadh = midnight UTC
    const oldNotFutureDate = clientDate <= serverUtcDate
    expect(oldNotFutureDate).toBe(true)
  })

  it('removing notFutureDate from rule means UTC time irrelevant', () => {
    // With the new rule: isOwnData() && (isOwnPharmacy() || isMgr())
    // No date check at rule level — app layer validates instead
    const u: User = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: '0C8h', pharmacyId: 'OuPy4', date: '2026-06-04' }
    expect(canCreate(u, p)).toBe(true)
  })
})

// ── 2. Manager create ────────────────────────────────────────

describe('kpi_entries permanent rule — manager create', () => {
  it('manager with matching pharmacyId can create', () => {
    const u: User = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: '0C8h', pharmacyId: 'OuPy4', date: '2026-06-04' }
    expect(canCreate(u, p)).toBe(true)
  })

  it('branch_manager can create own entry', () => {
    const u: User = { uid: 'bm-uid', role: 'branch_manager', pharmacyId: 'ph-abc' }
    const p: Payload = { userId: 'bm-uid', pharmacyId: 'ph-abc', date: '2026-06-04' }
    expect(canCreate(u, p)).toBe(true)
  })

  it('manager cannot create entry for another user', () => {
    const u: User = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: 'OTHER', pharmacyId: 'OuPy4', date: '2026-06-04' }
    expect(canCreate(u, p)).toBe(false)  // isOwnData fails
  })

  it('manager with null pharmacyId still allowed via isMgr()', () => {
    const u: User = { uid: '0C8h', role: 'manager', pharmacyId: null }
    const p: Payload = { userId: '0C8h', pharmacyId: 'OuPy4', date: '2026-06-04' }
    // isOwnPharmacy fails (null != 'OuPy4') but isMgr() passes
    expect(canCreate(u, p)).toBe(true)
  })
})

// ── 3. Pharmacist create ──────────────────────────────────────

describe('kpi_entries permanent rule — pharmacist create', () => {
  it('pharmacist with matching pharmacyId can create', () => {
    const u: User = { uid: 'ph-uid', role: 'pharmacist', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: 'ph-uid', pharmacyId: 'OuPy4', date: '2026-06-04' }
    // isOwnData + isOwnPharmacy both pass
    expect(canCreate(u, p)).toBe(true)
  })

  it('pharmacist with wrong pharmacyId cannot create', () => {
    const u: User = { uid: 'ph-uid', role: 'pharmacist', pharmacyId: 'ph-OTHER' }
    const p: Payload = { userId: 'ph-uid', pharmacyId: 'OuPy4', date: '2026-06-04' }
    // isOwnPharmacy fails, isMgr() fails (pharmacist not in list)
    expect(canCreate(u, p)).toBe(false)
  })

  it('pharmacist cannot create for another user', () => {
    const u: User = { uid: 'ph-uid', role: 'pharmacist', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: 'OTHER', pharmacyId: 'OuPy4', date: '2026-06-04' }
    expect(canCreate(u, p)).toBe(false)
  })
})

// ── 4. Manager update ─────────────────────────────────────────

describe('kpi_entries permanent rule — manager update', () => {
  it('manager can update their own existing entry', () => {
    const u: User = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: '0C8h', pharmacyId: 'OuPy4', date: '2026-06-04' }
    const existing: ExistingDoc = { userId: '0C8h', pharmacyId: 'OuPy4' }
    expect(canUpdate(u, p, existing)).toBe(true)
  })

  it('manager can update any entry at their branch via ownsPharmacy', () => {
    const u: User = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: 'ph-uid', pharmacyId: 'OuPy4', date: '2026-06-04' }
    const existing: ExistingDoc = { userId: 'ph-uid', pharmacyId: 'OuPy4' }
    // ownsPharmacy('OuPy4') = isMgr() && pharmId() == 'OuPy4' → true
    expect(canUpdate(u, p, existing)).toBe(true)
  })

  it('manager cannot update entry at a different branch', () => {
    const u: User = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: Payload = { userId: 'ph-other', pharmacyId: 'OTHER', date: '2026-06-04' }
    const existing: ExistingDoc = { userId: 'ph-other', pharmacyId: 'OTHER' }
    expect(canUpdate(u, p, existing)).toBe(false)
  })
})

// ── 5. Rule source audit ──────────────────────────────────────

describe('kpi_entries permanent rule — source audit', () => {
  it('create rule does NOT contain notFutureDate()', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    const createLine = block.split('allow create:')[1]?.split('allow update:')[0] ?? ''
    expect(createLine).not.toContain('notFutureDate()')
  })

  it('create rule contains isOwnData()', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    const createLine = block.split('allow create:')[1]?.split('allow update:')[0] ?? ''
    expect(createLine).toContain('isOwnData()')
  })

  it('create rule contains isMgr()', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    const createLine = block.split('allow create:')[1]?.split('allow update:')[0] ?? ''
    expect(createLine).toContain('isMgr()')
  })

  it('no temporary isAuth() diagnostic rule remains', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    // diagnostic was: allow create: if isAuth();
    expect(block).not.toMatch(/allow create:\s*if\s*isAuth\(\)\s*;/)
    expect(block).not.toMatch(/allow update:\s*if\s*isAuth\(\)\s*;/)
  })

  it('no diagnostic bypass for specific UID remains', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).not.toContain('0C8hPmFvHRXp2sst2k41DBe3uV72')
  })
})

// ── 6. saveKpiEntry — no diagnostic noise ────────────────────

describe('saveKpiEntry — clean state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(setDoc).mockResolvedValue(undefined as any)
  })

  it('manager save calls setDoc with correct userId = auth.currentUser.uid', async () => {
    const payloads: unknown[] = []
    vi.mocked(setDoc).mockImplementationOnce(async (_ref, data) => {
      payloads.push(data)
    })
    const { saveKpiEntry } = await import('../../services/kpiService.js')
    await saveKpiEntry({
      userId:    'ignored-old-value',
      pharmacyId: 'OuPy4tusCnvfELv1oyb5',
      date:       '2026-06-04',
      wasfaty:    100,
      actorId:    '0C8hPmFvHRXp2sst2k41DBe3uV72',
      actorRole:  'manager',
    })
    const doc = payloads[0] as Record<string, unknown>
    // auth.currentUser.uid wins over passed userId
    expect(doc.userId).toBe('0C8hPmFvHRXp2sst2k41DBe3uV72')
    expect(doc.pharmacyId).toBe('OuPy4tusCnvfELv1oyb5')
  })

  it('no console STEP or DIAGNOSTIC logs in kpiService', async () => {
    const src = await import('../../services/kpiService.js?raw')
    expect(src.default).not.toContain('STEP 5')
    expect(src.default).not.toContain('ENTRY_ID_ARGS')
    expect(src.default).not.toContain('DIAGNOSTIC')
  })

  it('no diagnostic blocks in KpiEntryPage', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw')
    expect(src.default).not.toContain('permission debug')
    expect(src.default).not.toContain('TEST WRITE')
    expect(src.default).not.toContain('KPIENTRY_SAVE_ARGS')
  })
})
