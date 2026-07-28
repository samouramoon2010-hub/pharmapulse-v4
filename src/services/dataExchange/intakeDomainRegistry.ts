// ============================================================
// Universal AI Intake — per-domain adapter registry (Phase 1)
//
// Wires each of the 8 supported entity domains to its existing,
// already-tested adapter factory + the existing reference-data
// loaders this codebase already has (fetchExistingOnboardingData,
// fetchKpiRegistryOnce) — no new Firestore collections, no
// duplicated adapter logic. REGION is the one genuinely new domain
// (regionsAdapter.ts, added this phase).
//
// Known Phase 1 limitation for BRANCH_TARGET/PHARMACIST_TARGET/
// BRANCH_ACTUALS/PHARMACIST_ACTUALS: their adapters already perform
// their own live, per-row Firestore duplicate-period lookups inside
// loadExistingRecords() (see e.g. branchTargetsAdapter.ts) — this
// registry only needs to supply existingBranches/registry/pharmacist
// lookups up front, which it does for all four; there is no
// additional gap for those domains specifically.
// ============================================================

import { collection, getDocs } from 'firebase/firestore'
import { db, COL } from './dxFirebaseTypes'
import { fetchExistingOnboardingData } from './fetchExistingOnboardingData'
import { fetchKpiRegistryOnce } from '../kpiRegistryService'
import type { GuardContext } from '../security/accessGuard'
import type { KpiRegistry } from '../../engine/kpiRegistry'
import type { ImportDomain } from './importJobTypes'
import type { ImportDomainAdapter } from './importDomainAdapter'
import type { OnboardingExistingData } from './onboardingOrchestrator'
import type { ExistingRegionRecord } from './adapters/regionsAdapter'

import { createRegionsAdapter } from './adapters/regionsAdapter'
import { createGroupsAdapter } from './adapters/groupsAdapter'
import { createBranchesAdapter } from './adapters/branchesAdapter'
import { createPharmacistsAdapter } from './adapters/pharmacistsAdapter'
import { createAssignmentsAdapter } from './adapters/assignmentsAdapter'
import { createDraftOnlyKpiRegistryAdapter } from './adapters/kpiRegistryDraftOnlyAdapter'
import { createBranchTargetsAdapter } from './adapters/branchTargetsAdapter'
import { createPharmacistTargetsAdapter } from './adapters/pharmacistTargetsAdapter'
import { createBranchActualsAdapter } from './adapters/branchActualsAdapter'
import { createPharmacistActualsAdapter } from './adapters/pharmacistActualsAdapter'

export interface IntakeExistingData {
  onboarding:  OnboardingExistingData
  regions:     ExistingRegionRecord[]
  kpiRegistry: KpiRegistry
}

/** One Firestore read pass covering every domain this registry supports. */
export async function fetchIntakeExistingData(): Promise<IntakeExistingData> {
  const [onboarding, regionsSnap, kpiRegistry] = await Promise.all([
    fetchExistingOnboardingData(),
    getDocs(collection(db, COL.REGIONS)),
    fetchKpiRegistryOnce(),
  ])
  const regions: ExistingRegionRecord[] = regionsSnap.docs.map((d) => {
    const data = d.data() as { code: string; name: string; active?: boolean }
    return { id: d.id, code: data.code, name: data.name, active: data.active !== false }
  })
  return { onboarding, regions, kpiRegistry }
}

export const SUPPORTED_INTAKE_DOMAINS: ImportDomain[] = [
  'REGION', 'GROUP', 'BRANCH', 'PHARMACIST', 'ASSIGNMENT',
  'KPI_REGISTRY', 'BRANCH_TARGET', 'PHARMACIST_TARGET', 'BRANCH_ACTUALS', 'PHARMACIST_ACTUALS',
]

/** Human-readable label for the domain selector / preview header. */
export const INTAKE_DOMAIN_LABELS: Record<string, string> = {
  REGION: 'Regions', GROUP: 'Groups', BRANCH: 'Pharmacies', PHARMACIST: 'Users',
  ASSIGNMENT: 'User-to-Pharmacy Assignments', KPI_REGISTRY: 'KPI Definitions',
  BRANCH_TARGET: 'KPI Targets (Branch)', PHARMACIST_TARGET: 'KPI Targets (Pharmacist)',
  BRANCH_ACTUALS: 'KPI Actuals (Branch)', PHARMACIST_ACTUALS: 'KPI Actuals (Pharmacist)',
}

export function createAdapterForDomain(
  domain:    ImportDomain,
  existing:  IntakeExistingData,
  guardCtx:  GuardContext,
  actorRole: string,
): ImportDomainAdapter<any, any, any> {
  switch (domain) {
    case 'REGION':
      return createRegionsAdapter({ guardCtx, actorRole, existingRegions: existing.regions })
    case 'GROUP':
      return createGroupsAdapter({
        guardCtx, actorRole,
        existingGroups: existing.onboarding.groups,
        existingRegions: existing.regions.map((r) => ({ id: r.id, code: r.code })),
      })
    case 'BRANCH': {
      const resolvableGroupCodes = new Map(existing.onboarding.groups.map((g) => [g.code.toUpperCase(), g.id]))
      return createBranchesAdapter({
        guardCtx, actorRole,
        existingBranches: existing.onboarding.branches,
        resolvableGroupCodes,
      })
    }
    case 'PHARMACIST': {
      const resolvableBranchCodes = new Map(existing.onboarding.branches.map((b) => [b.code, b.id]))
      return createPharmacistsAdapter({
        guardCtx, actorRole,
        existingByEmployeeId: existing.onboarding.pharmacistsByEmployeeId,
        existingByEmail: existing.onboarding.pharmacistsByEmail,
        resolvableBranchCodes,
      })
    }
    case 'ASSIGNMENT': {
      const resolvableBranchCodes = new Map(existing.onboarding.branches.map((b) => [b.code, b.id]))
      const resolvablePharmacistIds = new Map(
        [...existing.onboarding.pharmacistsByEmployeeId.entries()].map(([empId, rec]) => [empId, rec.id]),
      )
      return createAssignmentsAdapter({
        guardCtx, actorRole, resolvablePharmacistIds, resolvableBranchCodes,
        existingPrimaryByEmployeeId: existing.onboarding.primaryAssignmentByEmployeeId,
      })
    }
    case 'KPI_REGISTRY':
      return createDraftOnlyKpiRegistryAdapter({ actorRole, existingRegistry: existing.kpiRegistry })
    case 'BRANCH_TARGET':
      return createBranchTargetsAdapter({
        actorRole, existingBranches: existing.onboarding.branches, registry: existing.kpiRegistry,
      } as any)
    case 'PHARMACIST_TARGET':
      return createPharmacistTargetsAdapter({
        actorRole, existingBranches: existing.onboarding.branches, registry: existing.kpiRegistry,
        pharmacistsByEmployeeId: existing.onboarding.pharmacistsByEmployeeId,
        pharmacistsByEmail: existing.onboarding.pharmacistsByEmail,
      } as any)
    case 'BRANCH_ACTUALS':
      return createBranchActualsAdapter({
        actorRole, existingBranches: existing.onboarding.branches, registry: existing.kpiRegistry,
      } as any)
    case 'PHARMACIST_ACTUALS':
      return createPharmacistActualsAdapter({
        actorRole, existingBranches: existing.onboarding.branches, registry: existing.kpiRegistry,
        pharmacistsByEmployeeId: existing.onboarding.pharmacistsByEmployeeId,
        pharmacistsByEmail: existing.onboarding.pharmacistsByEmail,
      } as any)
    default:
      throw new Error(`Universal AI Intake does not support domain "${domain}" in Phase 1`)
  }
}
