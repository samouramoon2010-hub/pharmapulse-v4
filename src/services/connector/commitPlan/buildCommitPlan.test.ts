import { describe, it, expect } from 'vitest'
import { buildCommitPlan } from './buildCommitPlan'
import { resolveCollectionKey, COLLECTION_ALLOWLIST } from './commitOperationTypes'

const CTX = (entityType: any) => ({ jobId: 'job-1', entityType, actorUid: 'admin-1', actorRole: 'admin', planSignature: 'sig-abc' })

function row(overrides: any) {
  return { rowId: 'r1', jobId: 'job-1', rowIndex: 1, identityKey: 'k1', classification: 'VALID', issues: [], state: 'STAGED', ...overrides }
}

describe('Collection allowlist', () => {
  it('resolves a known domain to its collection', () => {
    expect(resolveCollectionKey('REGION')).toBe('regions')
    expect(resolveCollectionKey('KPI_REGISTRY')).toBe('kpi_registry')
  })

  it('throws for an entity type with no allowlisted collection', () => {
    expect(() => resolveCollectionKey('HISTORICAL')).toThrow()
  })

  it('never accepts an arbitrary/unknown collection name — allowlist is a closed, hardcoded map', () => {
    expect(Object.keys(COLLECTION_ALLOWLIST)).not.toContain('users_admin_only')
    expect(typeof COLLECTION_ALLOWLIST).toBe('object')
  })
})

describe('buildCommitPlan — Region', () => {
  it('produces a create operation with a deterministic (code-based) document id', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'RUH', name: 'Riyadh', managerUid: null, active: true } })]
    const plan = buildCommitPlan(CTX('REGION'), rows)
    expect(plan.operations).toHaveLength(1)
    expect(plan.operations[0]).toMatchObject({ type: 'create', collectionKey: 'regions', documentId: 'RUH', identityKey: 'RUH' })
    expect(plan.expectedCreateCount).toBe(1)
  })

  it('produces an update operation for UPDATE-classified rows', () => {
    const rows = [row({ classification: 'UPDATE', staged: { code: 'RUH', name: 'Riyadh Updated', managerUid: null, active: true } })]
    const plan = buildCommitPlan(CTX('REGION'), rows)
    expect(plan.operations[0].type).toBe('update')
    expect(plan.expectedUpdateCount).toBe(1)
  })

  it('the plan signature matches the ctx.planSignature verbatim (bound to the approved preview)', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'RUH', name: 'Riyadh', active: true } })]
    const plan = buildCommitPlan(CTX('REGION'), rows)
    expect(plan.planSignature).toBe('sig-abc')
  })
})

describe('buildCommitPlan — Group', () => {
  it('produces a create operation with a deterministic (code-based) document id and regionId reference preserved', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'GRP1', name: 'Group 1', regionId: 'region-doc-1', active: true } })]
    const plan = buildCommitPlan(CTX('GROUP'), rows)
    expect(plan.operations[0]).toMatchObject({ type: 'create', collectionKey: 'districts', documentId: 'GRP1' })
    expect(plan.operations[0].data.regionId).toBe('region-doc-1')
  })
})

describe('buildCommitPlan — Branch', () => {
  it('produces a create operation with a deterministic (code-based) document id', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'BR1', name: 'Branch 1', region: 'Riyadh', active: true } })]
    const plan = buildCommitPlan(CTX('BRANCH'), rows)
    expect(plan.operations).toHaveLength(1)
    expect(plan.operations[0]).toMatchObject({ type: 'create', collectionKey: 'pharmacies', documentId: 'BR1' })
  })

  it('with no groupCode, never touches a district (no second operation)', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'BR2', name: 'Branch 2', groupCode: null, active: true } })]
    const plan = buildCommitPlan(CTX('BRANCH'), rows, { resolveDistrictByGroupCode: () => ({ districtId: 'should-not-be-called', regionId: null }) })
    expect(plan.operations).toHaveLength(1)
  })

  it('with a resolved groupCode, denormalizes districtId/regionId onto the branch AND emits an arrayUnion op onto the district (Phase 2.2 parity fix)', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'BR3', name: 'Branch 3', groupCode: 'GRP1', active: true } })]
    const plan = buildCommitPlan(CTX('BRANCH'), rows, {
      resolveDistrictByGroupCode: (code) => (code === 'GRP1' ? { districtId: 'district-doc-1', regionId: 'region-doc-1' } : null),
    })
    expect(plan.operations).toHaveLength(2)

    const branchOp = plan.operations.find((o) => o.documentId === 'BR3')!
    expect(branchOp.data.districtId).toBe('district-doc-1')
    expect(branchOp.data.regionId).toBe('region-doc-1')

    const linkOp = plan.operations.find((o) => o.documentId === 'district-doc-1')!
    expect(linkOp.collectionKey).toBe('districts')
    expect(linkOp.arrayUnionField).toEqual({ path: 'pharmacyIds', value: 'BR3' })
    expect(linkOp.type).toBe('update')
  })

  it('the district-link operation has its own distinct idempotency key from the branch operation', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'BR4', name: 'Branch 4', groupCode: 'GRP1', active: true } })]
    const plan = buildCommitPlan(CTX('BRANCH'), rows, {
      resolveDistrictByGroupCode: () => ({ districtId: 'district-doc-1', regionId: null }),
    })
    const [branchOp, linkOp] = plan.operations
    expect(branchOp.idempotencyKey).not.toBe(linkOp.idempotencyKey)
  })

  it('when resolveDistrictByGroupCode is not injected, a groupCode is simply ignored (no crash, single operation)', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'BR5', name: 'Branch 5', groupCode: 'GRP1', active: true } })]
    const plan = buildCommitPlan(CTX('BRANCH'), rows)
    expect(plan.operations).toHaveLength(1)
  })
})

describe('buildCommitPlan — Pharmacist Actuals (nested map field, mirrors Branch Actuals)', () => {
  it('resolves userId from the pharmacist row itself and accumulates into kpiValues', () => {
    const rows = [row({ classification: 'VALID', staged: { userId: 'u1', pharmacyId: 'ph1', date: '2026-07-01', kpiKey: 'wasfaty', actualField: 'wasfaty', value: 8 } })]
    const plan = buildCommitPlan(CTX('PHARMACIST_ACTUALS'), rows)
    expect(plan.operations[0].documentId).toBe('u1_ph1_2026-07-01')
    expect(plan.operations[0].nestedMapField).toEqual({ path: 'kpiValues', key: 'wasfaty', value: 8 })
  })
})

describe('buildCommitPlan — classification handling (no business-rule re-derivation)', () => {
  it('ERROR rows go to validationFailures, never become an operation', () => {
    const rows = [row({ classification: 'ERROR', issues: [{ message: 'Missing name', blocksCommit: true }] })]
    const plan = buildCommitPlan(CTX('REGION'), rows)
    expect(plan.operations).toHaveLength(0)
    expect(plan.validationFailures).toHaveLength(1)
  })

  it('SKIP/DUPLICATE rows go to skips', () => {
    const rows = [row({ classification: 'DUPLICATE', staged: { code: 'X', name: 'X' } })]
    const plan = buildCommitPlan(CTX('REGION'), rows)
    expect(plan.skips).toHaveLength(1)
    expect(plan.operations).toHaveLength(0)
  })

  it('CONFLICT rows go to conflicts, never auto-resolved into a write', () => {
    const rows = [row({ classification: 'CONFLICT', staged: { code: 'X', name: 'Conflicting Name' } })]
    const plan = buildCommitPlan(CTX('REGION'), rows)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.operations).toHaveLength(0)
  })
})

describe('buildCommitPlan — KPI Definitions', () => {
  it('forwards the already-draft-forced staged values unchanged (guard already applied upstream)', () => {
    const rows = [row({ classification: 'VALID', staged: { key: 'newKpi', normalizedKey: 'newkpi', label: 'New KPI', isActive: false, lifecycleStage: 'draft' } })]
    const plan = buildCommitPlan(CTX('KPI_REGISTRY'), rows)
    expect(plan.operations[0].documentId).toBe('newKpi')
    expect(plan.operations[0].data.isActive).toBe(false)
    expect(plan.operations[0].data.lifecycleStage).toBe('draft')
    expect(plan.operations[0].data.uiStatus).toBe('ARCHIVED')
  })
})

describe('buildCommitPlan — KPI Targets/Actuals (nested map field)', () => {
  it('Branch Target produces an upsert with a nestedMapField for exactly one KPI key', () => {
    const rows = [row({ classification: 'VALID', staged: { pharmacyId: 'ph1', month: '2026-07', kpiKey: 'wasfaty', targetField: 'wasfatyTarget', value: 100 } })]
    const plan = buildCommitPlan(CTX('BRANCH_TARGET'), rows)
    const op = plan.operations[0]
    expect(op.type).toBe('upsert')
    expect(op.documentId).toBe('ph1_2026-07')
    expect(op.nestedMapField).toEqual({ path: '', key: 'wasfatyTarget', value: 100 })
  })

  it('Pharmacist Target accumulates into a targets sub-map path, not a flat field', () => {
    const rows = [row({ classification: 'VALID', staged: { userId: 'u1', pharmacyId: 'ph1', month: '2026-07', kpiKey: 'wasfaty', targetField: 'wasfatyTarget', value: 50 } })]
    const plan = buildCommitPlan(CTX('PHARMACIST_TARGET'), rows)
    expect(plan.operations[0].nestedMapField?.path).toBe('targets')
    expect(plan.operations[0].documentId).toBe('u1_ph1_2026-07')
  })

  it('Branch Actuals resolves userId from managerUid (not a pharmacist id)', () => {
    const rows = [row({ classification: 'VALID', staged: { branchCode: 'B1', pharmacyId: 'ph1', managerUid: 'mgr1', date: '2026-07-01', kpiKey: 'wasfaty', actualField: 'wasfaty', value: 5 } })]
    const plan = buildCommitPlan(CTX('BRANCH_ACTUALS'), rows)
    expect(plan.operations[0].documentId).toBe('mgr1_ph1_2026-07-01')
    expect(plan.operations[0].data.userId).toBe('mgr1')
  })
})

describe('buildCommitPlan — Assignment (requires an existing resolvable user)', () => {
  it('produces an update against the resolved existing user doc id', () => {
    const rows = [row({ classification: 'VALID', staged: { employeeId: 'E1', pharmacyId: 'ph1', startDate: null, endDate: null } })]
    const plan = buildCommitPlan(CTX('ASSIGNMENT'), rows, { resolveExistingUserId: () => 'real-uid-1' })
    expect(plan.operations[0]).toMatchObject({ type: 'update', documentId: 'real-uid-1', data: { pharmacyId: 'ph1' } })
  })

  it('fails validation when no existing user can be resolved (never fabricates a doc id)', () => {
    const rows = [row({ classification: 'VALID', staged: { employeeId: 'UNKNOWN', pharmacyId: 'ph1' } })]
    const plan = buildCommitPlan(CTX('ASSIGNMENT'), rows, { resolveExistingUserId: () => null })
    expect(plan.operations).toHaveLength(0)
    expect(plan.validationFailures).toHaveLength(1)
  })
})

describe('buildCommitPlan — Pharmacist (deterministic pending_ id when no existing record)', () => {
  it('uses pending_<employeeId> for a new pharmacist', () => {
    const rows = [row({ classification: 'VALID', staged: { employeeId: 'E9', displayName: 'New Pharmacist', email: 'a@b.com', role: 'pharmacist', active: true } })]
    const plan = buildCommitPlan(CTX('PHARMACIST'), rows)
    expect(plan.operations[0].documentId).toBe('pending_E9')
    expect(plan.operations[0].data.authStatus).toBe('PENDING_INVITATION')
  })

  it('reuses the real existing doc id when one is resolved', () => {
    const rows = [row({ classification: 'UPDATE', staged: { employeeId: 'E9', displayName: 'Updated Name', role: 'pharmacist', active: true } })]
    const plan = buildCommitPlan(CTX('PHARMACIST'), rows, { resolveExistingUserId: () => 'existing-real-uid' })
    expect(plan.operations[0].documentId).toBe('existing-real-uid')
  })
})

describe('buildCommitPlan — every operation carries an idempotency key and audit metadata', () => {
  it('idempotencyKey is derived from jobId + identityKey (buildCommitOperationKey)', () => {
    const rows = [row({ classification: 'VALID', staged: { code: 'RUH', name: 'Riyadh', active: true } })]
    const plan = buildCommitPlan(CTX('REGION'), rows)
    expect(plan.operations[0].idempotencyKey).toBe('job-1:RUH')
    expect(plan.operations[0].audit).toEqual({ entityType: 'REGION', sourceRowId: 'r1', actorUid: 'admin-1', actorRole: 'admin' })
  })
})
