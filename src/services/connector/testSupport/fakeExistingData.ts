// ============================================================
// Universal AI Intake — Phase 2 test/simulator fixture
//
// A minimal, valid IntakeExistingData object with no live Firestore
// dependency — used by connector unit tests and the local simulator.
// Not imported by production code.
// ============================================================

import type { IntakeExistingData } from '../../dataExchange/intakeDomainRegistry'

export function makeFakeExistingData(overrides: Partial<IntakeExistingData> = {}): IntakeExistingData {
  return {
    onboarding: {
      groups: [], regions: [], branches: [],
      pharmacistsByEmployeeId: new Map(), pharmacistsByEmail: new Map(),
      primaryAssignmentByEmployeeId: new Map(),
    },
    regions: [],
    kpiRegistry: {},
    ...overrides,
  }
}
