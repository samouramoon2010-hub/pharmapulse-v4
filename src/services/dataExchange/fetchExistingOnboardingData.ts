// ============================================================
// Fetch existing reference data for Organization Onboarding (DX-2/DX-3)
//
// Centralizes the Firestore reads needed to build OnboardingExistingData
// — mirrors the established convention (e.g. kpiImportService's
// caller-supplied `pharmacies` array) of pre-fetching reference data
// once, outside the adapters, rather than letting each adapter issue
// its own ad hoc queries.
// ============================================================

import { collection, getDocs } from 'firebase/firestore'
import { db, COL } from './dxFirebaseTypes'
import type { OnboardingExistingData } from './onboardingOrchestrator'
import type { ExistingPharmacistRecord } from './adapters/pharmacistsAdapter'

export async function fetchExistingOnboardingData(): Promise<OnboardingExistingData> {
  const [districtsSnap, regionsSnap, pharmaciesSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, COL.DISTRICTS)),
    getDocs(collection(db, COL.REGIONS)),
    getDocs(collection(db, COL.PHARMACIES)),
    getDocs(collection(db, COL.USERS)),
  ])

  const groups   = districtsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as { code: string; name: string; regionId: string; active: boolean }) }))
  const regions  = regionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as { code: string }) }))
  const branches = pharmaciesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as { code: string; name: string; active: boolean }) }))

  const byEmployeeId: Map<string, ExistingPharmacistRecord[]> = new Map()
  const pharmacistsByEmployeeId = new Map<string, ExistingPharmacistRecord>()
  const pharmacistsByEmail      = new Map<string, ExistingPharmacistRecord>()
  const primaryAssignmentByEmployeeId = new Map<string, string>()

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data() as Record<string, unknown>
    const employeeId = (data.employeeId as string | undefined)?.trim()
    if (!employeeId) continue

    // A CLAIMED pending record has been superseded by a real Auth-linked
    // document (see pharmacistActivationService.ts) — exclude it so the
    // same employeeId/email never resolves to two different docs.
    if (data.authStatus === 'CLAIMED') continue

    const record: ExistingPharmacistRecord = {
      id: docSnap.id,
      employeeId,
      email: (data.email as string | undefined)?.toLowerCase() || null,
      role: (data.role as string) || 'pharmacist',
      pharmacyId: (data.pharmacyId as string | null) ?? null,
      // Backward-compat default: any existing record WITHOUT an explicit
      // authStatus field predates this bundle and was created via the
      // real createUser()/Firebase-Auth flow — treat it as ACTIVE so it
      // is never silently overwritten by a bulk import.
      authStatus: (data.authStatus as 'ACTIVE' | 'PENDING_INVITATION' | undefined) ?? 'ACTIVE',
      hasIdentityAmbiguity: false,
      // KPI & Targets Bundle (DX-5): operational active flag, distinct
      // from authStatus — defaults to true for legacy docs with no
      // explicit `active` field (never silently treats a pre-existing
      // record as deactivated).
      active: (data.active as boolean | undefined) ?? true,
    }

    if (!byEmployeeId.has(employeeId)) byEmployeeId.set(employeeId, [])
    byEmployeeId.get(employeeId)!.push(record)
  }

  // Part 3 closure patch: a pending record AND an existing active
  // Auth-linked record (or any other duplicate) for the SAME employeeId
  // is itself an identity conflict — never silently resolved by
  // "last one wins" map insertion. Flag every record sharing that
  // employeeId so the Pharmacists adapter can classify it CONFLICT.
  for (const [employeeId, records] of byEmployeeId) {
    const ambiguous = records.length > 1
    for (const record of records) {
      record.hasIdentityAmbiguity = ambiguous
      pharmacistsByEmployeeId.set(employeeId, record)   // last one wins for lookup purposes only
      if (record.email) pharmacistsByEmail.set(record.email, record)
      if (record.pharmacyId) primaryAssignmentByEmployeeId.set(employeeId, record.pharmacyId)
    }
  }

  return { groups, regions, branches, pharmacistsByEmployeeId, pharmacistsByEmail, primaryAssignmentByEmployeeId }
}
