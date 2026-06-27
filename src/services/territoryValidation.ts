// ============================================================
// Territory Validation Utilities — Phase 1B-3F
//
// Read-only utilities that detect drift in the assignedPharmacyIds
// cache. Never writes — never triggers repair automatically.
//
// validateAssignedPharmacyIds(uid):
//   Compares user.assignedPharmacyIds (cache) against the value
//   freshly computed from the hierarchy (source of truth).
//   Returns a ValidationReport with a status and drift breakdown.
//
// auditAllAssignedPharmacyIds():
//   Runs validateAssignedPharmacyIds for every district_supervisor
//   and regional_manager. Returns a summary with per-user reports.
//
// Status semantics:
//   not_applicable  — role is not a territory role (admin, GM, …)
//   ok              — cache matches hierarchy (order-insensitive)
//   missing         — territory role but cache is null (never set)
//   stale           — cache differs from hierarchy
//   error           — user not found or hierarchy read failed
//
// Drift semantics:
//   leaked  — ids in cache but NOT in hierarchy (access expansion — serious)
//   missing — ids in hierarchy but NOT in cache (access gap)
//
// Does NOT repair. Does NOT contain UI. Does NOT contain Scope Resolver.
// ============================================================

import {
  collection, doc, getDoc, getDocs,
  query, where,
} from 'firebase/firestore'
import { db, COL }                          from './firebase'
import { computeAssignedPharmacyIdsForUser } from './territorySync'

// ── Role constants ────────────────────────────────────────────

const TERRITORY_ROLES    = ['district_supervisor', 'regional_manager'] as const
const NOT_APPLICABLE_ROLES = [
  'admin', 'general_manager', 'manager', 'branch_manager', 'pharmacist',
] as const

// ── Types ─────────────────────────────────────────────────────

export type ValidationStatus =
  | 'not_applicable'
  | 'ok'
  | 'missing'
  | 'stale'
  | 'error'

export interface ValidationReport {
  uid:      string
  role:     string
  status:   ValidationStatus
  current:  string[] | null
  expected: string[] | null
  drift:    { leaked: string[]; missing: string[] }
}

export interface AuditSummary {
  total:   number
  ok:      number
  missing: number
  stale:   number
  errors:  number
  reports: ValidationReport[]
}

// ── validateAssignedPharmacyIds ───────────────────────────────

export async function validateAssignedPharmacyIds(
  uid: string,
): Promise<ValidationReport> {
  try {
    const snap = await getDoc(doc(db, COL.USERS, uid))
    if (!snap.exists()) {
      return {
        uid, role: '', status: 'error',
        current: null, expected: null,
        drift: { leaked: [], missing: [] },
      }
    }

    const data    = snap.data() as Record<string, unknown>
    const role    = (data.role as string) || ''
    const current = (data.assignedPharmacyIds ?? null) as string[] | null

    // Roles that never hold a territory cache
    if ((NOT_APPLICABLE_ROLES as readonly string[]).includes(role)) {
      return {
        uid, role, status: 'not_applicable',
        current, expected: null,
        drift: { leaked: [], missing: [] },
      }
    }

    // Compute expected value from hierarchy
    const expected = await computeAssignedPharmacyIdsForUser(uid)

    // Cache is absent — territory role user whose cache was never computed
    if (current === null) {
      return {
        uid, role, status: 'missing',
        current: null, expected,
        drift: {
          leaked:  [],
          missing: expected ?? [],
        },
      }
    }

    // Compare order-insensitively
    const expectedArr     = expected ?? []
    const currentSorted   = [...current].sort()
    const expectedSorted  = [...expectedArr].sort()
    const isEqual         = currentSorted.length === expectedSorted.length &&
      currentSorted.every((v, i) => v === expectedSorted[i])

    if (isEqual) {
      return {
        uid, role, status: 'ok',
        current, expected,
        drift: { leaked: [], missing: [] },
      }
    }

    // Arrays differ — compute per-direction drift
    const expectedSet = new Set(expectedArr)
    const currentSet  = new Set(current)
    const leaked  = current.filter((id) => !expectedSet.has(id))
    const missing = expectedArr.filter((id) => !currentSet.has(id))

    return {
      uid, role, status: 'stale',
      current, expected,
      drift: { leaked, missing },
    }
  } catch {
    return {
      uid, role: '', status: 'error',
      current: null, expected: null,
      drift: { leaked: [], missing: [] },
    }
  }
}

// ── auditAllAssignedPharmacyIds ───────────────────────────────

export async function auditAllAssignedPharmacyIds(): Promise<AuditSummary> {
  // Throws if Firestore is unreachable — caller must handle.
  const snap = await getDocs(
    query(collection(db, COL.USERS), where('role', 'in', TERRITORY_ROLES)),
  )

  const summary: AuditSummary = {
    total: 0, ok: 0, missing: 0, stale: 0, errors: 0,
    reports: [],
  }

  // Closure Patch Part 2: exclude CLAIMED pending-onboarding artifacts
  // (see services/dataExchange/pharmacistActivationService.ts) — never
  // an operational territory-role user to audit.
  const docs = snap.docs.filter((d) => d.data().authStatus !== 'CLAIMED')

  for (const userDoc of docs) {
    summary.total++
    const report = await validateAssignedPharmacyIds(userDoc.id)
    summary.reports.push(report)
    if      (report.status === 'ok')      summary.ok++
    else if (report.status === 'missing') summary.missing++
    else if (report.status === 'stale')   summary.stale++
    else if (report.status === 'error')   summary.errors++
    // 'not_applicable' is excluded from counters (cannot appear for territory-role users)
  }

  return summary
}
