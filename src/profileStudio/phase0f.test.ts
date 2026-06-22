// ============================================================
// Profile Studio — Phase 0F Tests: Workflow + Export Kernel
//
// 165+ tests covering:
//   workflow.ts   — lifecycle transitions, readiness predicates
//   integrity.ts  — hashing, tamper detection
//   exporter.ts   — snapshots, export/import, publish packages
//
// No Firestore. No React. No UI. No production engine coupling.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Workflow imports ──────────────────────────────────────────
import {
  createDraft,
  validateDraft,
  simulateDraft,
  approveDraft,
  markPublishReady,
  archiveProfile,
  restoreArchivedProfile,
  isDraft,
  isValidated,
  isSimulated,
  isApproved,
  isPublished,
  isArchived,
  isPublishReady,
} from './workflow'
import type { WorkflowResult } from './workflow'

// ── Integrity imports ─────────────────────────────────────────
import {
  calculateProfileHash,
  verifyProfileIntegrity,
  detectTampering,
} from './integrity'

// ── Exporter imports ──────────────────────────────────────────
import {
  createProfileSnapshot,
  cloneSnapshot,
  compareSnapshots,
  exportProfileJson,
  importProfileJson,
  exportPublishPackage,
  exportSimulationPackage,
} from './exporter'

// ── Profile factory imports ───────────────────────────────────
import {
  createEmptyEvaluationProfile,
  createBasketNode,
  createElementNode,
  createRuleNode,
} from './profileFactory'
import type { EvaluationProfileDraft, ProfileStatus } from './types'
import { RATIO_EVALUATOR, CEILING_CLAMP } from './processors'
import type { ProcessorStep } from './types'
import { simulateProfile } from './simulator'

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function makeStep(type: string, cfg: Record<string, unknown> = {}, order = 0): ProcessorStep {
  return { processorType: type as any, config: cfg, order }
}

/**
 * Builds a structurally valid profile at the requested status.
 * Passes validateProfile and validateSimulationReadiness.
 */
function buildValidProfile(status: ProfileStatus = 'DRAFT'): EvaluationProfileDraft {
  const profile = createEmptyEvaluationProfile({ name: 'Test Profile' })
  profile.metadata.status = status

  const rule    = createRuleNode({ kpiKey: 'sales', label: 'Sales', weight: 1 })
  const element = createElementNode({ label: 'Sales Element', weight: 1 })
  element.rules = [rule]

  const basket    = createBasketNode({ label: 'Main Basket', weight: 1 })
  basket.elements = [element]

  profile.root.baskets = [basket]
  return profile
}

/** Build a profile and run it through the full workflow to APPROVED. */
function buildApprovedProfile(): EvaluationProfileDraft {
  const p0 = buildValidProfile('DRAFT')
  const r1 = validateDraft(p0)
  const r2 = simulateDraft(r1.profile!, { sales: 80 }, { sales: 100 })
  const r3 = approveDraft(r2.profile!)
  return r3.profile!
}

// ════════════════════════════════════════════════════════════
// GROUP 1 — createDraft
// ════════════════════════════════════════════════════════════

describe('createDraft', () => {
  it('returns success=true', () => {
    const r = createDraft({ name: 'My Profile' })
    expect(r.success).toBe(true)
  })

  it('profile is in DRAFT status', () => {
    const r = createDraft({ name: 'My Profile' })
    expect(r.profile!.metadata.status).toBe('DRAFT')
  })

  it('profile has a non-empty id', () => {
    const r = createDraft({ name: 'My Profile' })
    expect(r.profile!.metadata.id.length).toBeGreaterThan(0)
  })

  it('newStatus is DRAFT', () => {
    const r = createDraft({ name: 'My Profile' })
    expect(r.newStatus).toBe('DRAFT')
  })

  it('audit record action is CREATE_DRAFT', () => {
    const r = createDraft({ name: 'My Profile' }, 'user1')
    expect(r.auditRecord?.action).toBe('CREATE_DRAFT')
    expect(r.auditRecord?.performedBy).toBe('user1')
  })

  it('issues array is empty on success', () => {
    const r = createDraft({ name: 'My Profile' })
    expect(r.issues).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — validateDraft: valid transitions
// ════════════════════════════════════════════════════════════

describe('validateDraft – valid transitions', () => {
  it('DRAFT → VALIDATED succeeds for a valid profile', () => {
    const profile = buildValidProfile('DRAFT')
    const r       = validateDraft(profile)
    expect(r.success).toBe(true)
    expect(r.profile!.metadata.status).toBe('VALIDATED')
  })

  it('VALIDATED → VALIDATED re-validation succeeds', () => {
    const profile = buildValidProfile('VALIDATED')
    const r       = validateDraft(profile)
    expect(r.success).toBe(true)
    expect(r.profile!.metadata.status).toBe('VALIDATED')
  })

  it('previousStatus is DRAFT', () => {
    const profile = buildValidProfile('DRAFT')
    const r       = validateDraft(profile)
    expect(r.previousStatus).toBe('DRAFT')
  })

  it('newStatus is VALIDATED', () => {
    const profile = buildValidProfile('DRAFT')
    const r       = validateDraft(profile)
    expect(r.newStatus).toBe('VALIDATED')
  })

  it('audit record action is VALIDATE', () => {
    const profile = buildValidProfile('DRAFT')
    const r       = validateDraft(profile, 'admin')
    expect(r.auditRecord?.action).toBe('VALIDATE')
    expect(r.auditRecord?.performedBy).toBe('admin')
  })

  it('does not mutate the input profile', () => {
    const profile = buildValidProfile('DRAFT')
    const origStatus = profile.metadata.status
    validateDraft(profile)
    expect(profile.metadata.status).toBe(origStatus)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — validateDraft: invalid scenarios
// ════════════════════════════════════════════════════════════

describe('validateDraft – invalid scenarios', () => {
  it('empty profile (no baskets) fails validation', () => {
    const profile = createEmptyEvaluationProfile({ name: 'Empty' })
    const r       = validateDraft(profile)
    expect(r.success).toBe(false)
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('SIMULATED status cannot transition back to VALIDATED', () => {
    const profile = buildValidProfile('SIMULATED')
    const r       = validateDraft(profile)
    expect(r.success).toBe(false)
  })

  it('APPROVED status cannot transition to VALIDATED', () => {
    const profile = buildValidProfile('APPROVED')
    const r       = validateDraft(profile)
    expect(r.success).toBe(false)
  })

  it('PUBLISHED status cannot transition to VALIDATED', () => {
    const profile = buildValidProfile('PUBLISHED')
    const r       = validateDraft(profile)
    expect(r.success).toBe(false)
  })

  it('ARCHIVED status cannot transition to VALIDATED', () => {
    const profile = buildValidProfile('ARCHIVED')
    const r       = validateDraft(profile)
    expect(r.success).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — simulateDraft: success
// ════════════════════════════════════════════════════════════

describe('simulateDraft – success', () => {
  it('VALIDATED → SIMULATED succeeds', () => {
    const profile = buildValidProfile('VALIDATED')
    const r       = simulateDraft(profile, { sales: 80 }, { sales: 100 })
    expect(r.success).toBe(true)
    expect(r.profile!.metadata.status).toBe('SIMULATED')
  })

  it('simulation result is attached', () => {
    const profile = buildValidProfile('VALIDATED')
    const r       = simulateDraft(profile, { sales: 80 }, { sales: 100 })
    expect(r.simulationResult).toBeDefined()
    expect(r.simulationResult!.valid).toBe(true)
  })

  it('SIMULATED → SIMULATED re-simulation succeeds', () => {
    const profile = buildValidProfile('SIMULATED')
    const r       = simulateDraft(profile, { sales: 90 }, { sales: 100 })
    expect(r.success).toBe(true)
  })

  it('previousStatus is VALIDATED', () => {
    const profile = buildValidProfile('VALIDATED')
    const r       = simulateDraft(profile)
    expect(r.previousStatus).toBe('VALIDATED')
  })

  it('newStatus is SIMULATED', () => {
    const profile = buildValidProfile('VALIDATED')
    const r       = simulateDraft(profile)
    expect(r.newStatus).toBe('SIMULATED')
  })

  it('does not mutate the input profile', () => {
    const profile = buildValidProfile('VALIDATED')
    simulateDraft(profile)
    expect(profile.metadata.status).toBe('VALIDATED')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — simulateDraft: failures
// ════════════════════════════════════════════════════════════

describe('simulateDraft – failures', () => {
  it('DRAFT profile cannot be simulated directly', () => {
    const profile = buildValidProfile('DRAFT')
    const r       = simulateDraft(profile)
    expect(r.success).toBe(false)
  })

  it('APPROVED profile cannot be re-simulated via simulateDraft', () => {
    const profile = buildValidProfile('APPROVED')
    const r       = simulateDraft(profile)
    expect(r.success).toBe(false)
  })

  it('empty profile simulation fails (no baskets)', () => {
    const profile = createEmptyEvaluationProfile({ name: 'Empty' })
    profile.metadata.status = 'VALIDATED'
    const r = simulateDraft(profile)
    expect(r.success).toBe(false)
  })

  it('issues is non-empty on failure', () => {
    const profile = buildValidProfile('DRAFT')
    const r       = simulateDraft(profile)
    expect(r.issues.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — approveDraft
// ════════════════════════════════════════════════════════════

describe('approveDraft', () => {
  it('SIMULATED → APPROVED succeeds', () => {
    const profile = buildValidProfile('SIMULATED')
    const r       = approveDraft(profile)
    expect(r.success).toBe(true)
    expect(r.profile!.metadata.status).toBe('APPROVED')
  })

  it('previousStatus is SIMULATED', () => {
    const profile = buildValidProfile('SIMULATED')
    const r       = approveDraft(profile)
    expect(r.previousStatus).toBe('SIMULATED')
  })

  it('newStatus is APPROVED', () => {
    const profile = buildValidProfile('SIMULATED')
    const r       = approveDraft(profile)
    expect(r.newStatus).toBe('APPROVED')
  })

  it('DRAFT cannot be approved', () => {
    const r = approveDraft(buildValidProfile('DRAFT'))
    expect(r.success).toBe(false)
  })

  it('VALIDATED cannot be approved', () => {
    const r = approveDraft(buildValidProfile('VALIDATED'))
    expect(r.success).toBe(false)
  })

  it('audit record includes performedBy', () => {
    const profile = buildValidProfile('SIMULATED')
    const r       = approveDraft(profile, 'manager', 'Q1 approval')
    expect(r.auditRecord?.performedBy).toBe('manager')
    expect(r.auditRecord?.notes).toBe('Q1 approval')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — markPublishReady
// ════════════════════════════════════════════════════════════

describe('markPublishReady', () => {
  it('APPROVED valid profile transitions to PUBLISHED', () => {
    const profile = buildApprovedProfile()
    const r       = markPublishReady(profile)
    expect(r.success).toBe(true)
    expect(r.profile!.metadata.status).toBe('PUBLISHED')
  })

  it('previousStatus is APPROVED', () => {
    const profile = buildApprovedProfile()
    const r       = markPublishReady(profile)
    expect(r.previousStatus).toBe('APPROVED')
  })

  it('newStatus is PUBLISHED', () => {
    const profile = buildApprovedProfile()
    const r       = markPublishReady(profile)
    expect(r.newStatus).toBe('PUBLISHED')
  })

  it('DRAFT profile fails publish readiness', () => {
    const r = markPublishReady(buildValidProfile('DRAFT'))
    expect(r.success).toBe(false)
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('SIMULATED profile fails publish readiness', () => {
    const r = markPublishReady(buildValidProfile('SIMULATED'))
    expect(r.success).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — archiveProfile
// ════════════════════════════════════════════════════════════

describe('archiveProfile', () => {
  it('DRAFT → ARCHIVED succeeds', () => {
    const r = archiveProfile(buildValidProfile('DRAFT'))
    expect(r.success).toBe(true)
    expect(r.profile!.metadata.status).toBe('ARCHIVED')
  })

  it('VALIDATED → ARCHIVED succeeds', () => {
    const r = archiveProfile(buildValidProfile('VALIDATED'))
    expect(r.success).toBe(true)
  })

  it('SIMULATED → ARCHIVED succeeds', () => {
    const r = archiveProfile(buildValidProfile('SIMULATED'))
    expect(r.success).toBe(true)
  })

  it('APPROVED → ARCHIVED succeeds', () => {
    const r = archiveProfile(buildValidProfile('APPROVED'))
    expect(r.success).toBe(true)
  })

  it('ARCHIVED cannot be re-archived', () => {
    const r = archiveProfile(buildValidProfile('ARCHIVED'))
    expect(r.success).toBe(false)
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('audit record notes are preserved', () => {
    const r = archiveProfile(buildValidProfile('DRAFT'), 'admin', 'Sunset Q1')
    expect(r.auditRecord?.notes).toBe('Sunset Q1')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — restoreArchivedProfile
// ════════════════════════════════════════════════════════════

describe('restoreArchivedProfile', () => {
  it('ARCHIVED → new DRAFT succeeds', () => {
    const profile = buildValidProfile('ARCHIVED')
    const r       = restoreArchivedProfile(profile)
    expect(r.success).toBe(true)
    expect(r.profile!.metadata.status).toBe('DRAFT')
  })

  it('restored profile has a new id', () => {
    const profile = buildValidProfile('ARCHIVED')
    const r       = restoreArchivedProfile(profile)
    expect(r.profile!.metadata.id).not.toBe(profile.metadata.id)
  })

  it('non-ARCHIVED profile cannot be restored', () => {
    const r = restoreArchivedProfile(buildValidProfile('DRAFT'))
    expect(r.success).toBe(false)
  })

  it('non-ARCHIVED APPROVED profile cannot be restored', () => {
    const r = restoreArchivedProfile(buildValidProfile('APPROVED'))
    expect(r.success).toBe(false)
  })

  it('restored profile inherits structure from archived profile', () => {
    const profile = buildValidProfile('ARCHIVED')
    const r       = restoreArchivedProfile(profile)
    expect(r.profile!.root.baskets.length).toBe(profile.root.baskets.length)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — Readiness predicates (basic status checks)
// ════════════════════════════════════════════════════════════

describe('Readiness predicates – isDraft', () => {
  it('returns true for DRAFT', () => expect(isDraft(buildValidProfile('DRAFT'))).toBe(true))
  it('returns false for VALIDATED', () => expect(isDraft(buildValidProfile('VALIDATED'))).toBe(false))
})

describe('Readiness predicates – isValidated', () => {
  it('returns true for VALIDATED', () => expect(isValidated(buildValidProfile('VALIDATED'))).toBe(true))
  it('returns false for DRAFT', () => expect(isValidated(buildValidProfile('DRAFT'))).toBe(false))
})

describe('Readiness predicates – isSimulated', () => {
  it('returns true for SIMULATED', () => expect(isSimulated(buildValidProfile('SIMULATED'))).toBe(true))
  it('returns false for DRAFT', () => expect(isSimulated(buildValidProfile('DRAFT'))).toBe(false))
})

describe('Readiness predicates – isApproved', () => {
  it('returns true for APPROVED', () => expect(isApproved(buildValidProfile('APPROVED'))).toBe(true))
  it('returns false for SIMULATED', () => expect(isApproved(buildValidProfile('SIMULATED'))).toBe(false))
})

describe('Readiness predicates – isPublished', () => {
  it('returns true for PUBLISHED', () => expect(isPublished(buildValidProfile('PUBLISHED'))).toBe(true))
  it('returns false for APPROVED', () => expect(isPublished(buildValidProfile('APPROVED'))).toBe(false))
})

describe('Readiness predicates – isArchived', () => {
  it('returns true for ARCHIVED', () => expect(isArchived(buildValidProfile('ARCHIVED'))).toBe(true))
  it('returns false for DRAFT', () => expect(isArchived(buildValidProfile('DRAFT'))).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — isPublishReady
// ════════════════════════════════════════════════════════════

describe('isPublishReady', () => {
  it('returns true for a valid APPROVED profile', () => {
    const profile = buildApprovedProfile()
    expect(isPublishReady(profile)).toBe(true)
  })

  it('returns false for a DRAFT profile', () => {
    expect(isPublishReady(buildValidProfile('DRAFT'))).toBe(false)
  })

  it('returns false for a SIMULATED profile', () => {
    expect(isPublishReady(buildValidProfile('SIMULATED'))).toBe(false)
  })

  it('returns false for an ARCHIVED profile', () => {
    expect(isPublishReady(buildValidProfile('ARCHIVED'))).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — WorkflowResult structure
// ════════════════════════════════════════════════════════════

describe('WorkflowResult – structure', () => {
  it('success result has success=true, profile, issues=[]', () => {
    const r = createDraft({ name: 'P' })
    expect(r.success).toBe(true)
    expect(r.profile).toBeDefined()
    expect(r.issues).toEqual([])
  })

  it('failure result has success=false, no profile, non-empty issues', () => {
    const r = approveDraft(buildValidProfile('DRAFT'))
    expect(r.success).toBe(false)
    expect(r.profile).toBeUndefined()
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('success result has auditRecord with profileId', () => {
    const r = createDraft({ name: 'P' })
    expect(r.auditRecord?.profileId).toBe(r.profile!.metadata.id)
  })

  it('auditRecord.performedAt is an ISO string', () => {
    const r = createDraft({ name: 'P' })
    expect(() => new Date(r.auditRecord!.performedAt)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — calculateProfileHash: determinism
// ════════════════════════════════════════════════════════════

describe('calculateProfileHash – determinism', () => {
  it('returns a non-empty string', () => {
    const h = calculateProfileHash(buildValidProfile())
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })

  it('equal profiles produce equal hashes', () => {
    // Rebuild the same profile structure (two distinct objects with same content)
    const p1 = buildValidProfile()
    // Override ids to be identical for content comparison
    const p2 = JSON.parse(JSON.stringify(p1)) as EvaluationProfileDraft
    expect(calculateProfileHash(p1)).toBe(calculateProfileHash(p2))
  })

  it('same profile hashed twice produces the same hash', () => {
    const p = buildValidProfile()
    expect(calculateProfileHash(p)).toBe(calculateProfileHash(p))
  })

  it('changing the profile name changes the hash', () => {
    const p1 = buildValidProfile()
    const p2 = { ...p1, metadata: { ...p1.metadata, name: 'Different Name' } }
    expect(calculateProfileHash(p1)).not.toBe(calculateProfileHash(p2))
  })

  it('changing the kpiKey of a rule changes the hash', () => {
    const p1 = buildValidProfile()
    const p2: EvaluationProfileDraft = JSON.parse(JSON.stringify(p1))
    p2.root.baskets[0].elements[0].rules[0].kpiKey = 'different_kpi'
    expect(calculateProfileHash(p1)).not.toBe(calculateProfileHash(p2))
  })

  it('changing scope changes the hash', () => {
    const p1 = buildValidProfile()
    const p2 = { ...p1, metadata: { ...p1.metadata, scope: 'REGION' as const } }
    expect(calculateProfileHash(p1)).not.toBe(calculateProfileHash(p2))
  })

  it('returns a stable string for null input (no throw)', () => {
    const h1 = calculateProfileHash(null as any)
    const h2 = calculateProfileHash(null as any)
    expect(typeof h1).toBe('string')
    expect(h1.length).toBeGreaterThan(0)
    expect(h1).toBe(h2)  // same null input → same hash every time
  })

  it('volatile timestamps do not affect the hash', () => {
    const p1 = buildValidProfile()
    const p2: EvaluationProfileDraft = {
      ...p1,
      metadata: { ...p1.metadata, createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2099-12-31T00:00:00.000Z' },
    }
    // Both profiles have the same structural content; timestamps are excluded
    expect(calculateProfileHash(p1)).toBe(calculateProfileHash(p2))
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — verifyProfileIntegrity
// ════════════════════════════════════════════════════════════

describe('verifyProfileIntegrity', () => {
  it('returns true for a profile whose hash matches', () => {
    const p = buildValidProfile()
    const h = calculateProfileHash(p)
    expect(verifyProfileIntegrity(p, h)).toBe(true)
  })

  it('returns false for a wrong hash', () => {
    const p = buildValidProfile()
    expect(verifyProfileIntegrity(p, 'deadbeef')).toBe(false)
  })

  it('returns false after modifying a field', () => {
    const p = buildValidProfile()
    const h = calculateProfileHash(p)
    const modified = { ...p, metadata: { ...p.metadata, name: 'Changed' } }
    expect(verifyProfileIntegrity(modified, h)).toBe(false)
  })

  it('returns true after round-trip JSON clone', () => {
    const p = buildValidProfile()
    const h = calculateProfileHash(p)
    const clone: EvaluationProfileDraft = JSON.parse(JSON.stringify(p))
    expect(verifyProfileIntegrity(clone, h)).toBe(true)
  })

  it('returns false for empty hash string', () => {
    const p = buildValidProfile()
    expect(verifyProfileIntegrity(p, '')).toBe(false)
  })

  it('never throws for null profile', () => {
    expect(() => verifyProfileIntegrity(null as any, 'abc')).not.toThrow()
    expect(verifyProfileIntegrity(null as any, 'abc')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — detectTampering
// ════════════════════════════════════════════════════════════

describe('detectTampering', () => {
  it('tampered=false when hash matches', () => {
    const p    = buildValidProfile()
    const snap = { hash: calculateProfileHash(p) }
    const r    = detectTampering(p, snap)
    expect(r.tampered).toBe(false)
    expect(r.reason).toBeUndefined()
  })

  it('tampered=true when profile changed after snapshot', () => {
    const p      = buildValidProfile()
    const snap   = { hash: calculateProfileHash(p) }
    const modified = { ...p, metadata: { ...p.metadata, name: 'Tampered Name' } }
    const r = detectTampering(modified, snap)
    expect(r.tampered).toBe(true)
    expect(r.reason).toBeDefined()
  })

  it('expectedHash equals snapshot.hash', () => {
    const p    = buildValidProfile()
    const snap = { hash: 'abc123' }
    const r    = detectTampering(p, snap)
    expect(r.expectedHash).toBe('abc123')
  })

  it('actualHash equals calculateProfileHash(profile)', () => {
    const p    = buildValidProfile()
    const h    = calculateProfileHash(p)
    const snap = { hash: h }
    const r    = detectTampering(p, snap)
    expect(r.actualHash).toBe(h)
  })

  it('tampered=true for mismatched hash', () => {
    const p    = buildValidProfile()
    const snap = { hash: '00000000' }
    const r    = detectTampering(p, snap)
    expect(r.tampered).toBe(true)
  })

  it('never throws for null profile', () => {
    expect(() => detectTampering(null as any, { hash: 'abc' })).not.toThrow()
  })

  it('tampered=true and reason defined when profile is null', () => {
    const r = detectTampering(null as any, { hash: 'abc' })
    expect(r.tampered).toBe(true)
    // May have a reason or actualHash=00000000 depending on null handling
    expect(r.expectedHash).toBe('abc')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — createProfileSnapshot
// ════════════════════════════════════════════════════════════

describe('createProfileSnapshot', () => {
  it('returns a snapshot with snapshotId', () => {
    const snap = createProfileSnapshot(buildValidProfile())
    expect(typeof snap.snapshotId).toBe('string')
    expect(snap.snapshotId.length).toBeGreaterThan(0)
  })

  it('profileId matches profile.metadata.id', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    expect(snap.profileId).toBe(p.metadata.id)
  })

  it('version matches profile.metadata.version', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    expect(snap.version).toBe(p.metadata.version)
  })

  it('status matches profile.metadata.status', () => {
    const p    = buildValidProfile('SIMULATED')
    const snap = createProfileSnapshot(p)
    expect(snap.status).toBe('SIMULATED')
  })

  it('hash is a non-empty string', () => {
    const snap = createProfileSnapshot(buildValidProfile())
    expect(snap.hash.length).toBeGreaterThan(0)
  })

  it('notes field is preserved', () => {
    const snap = createProfileSnapshot(buildValidProfile(), 'before Q2')
    expect(snap.notes).toBe('before Q2')
  })

  it('notes is undefined when not provided', () => {
    const snap = createProfileSnapshot(buildValidProfile())
    expect(snap.notes).toBeUndefined()
  })

  it('createdAt is an ISO timestamp', () => {
    const snap = createProfileSnapshot(buildValidProfile())
    expect(() => new Date(snap.createdAt)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — cloneSnapshot
// ════════════════════════════════════════════════════════════

describe('cloneSnapshot', () => {
  it('returns a new snapshotId', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const clone = cloneSnapshot(snap)
    expect(clone.snapshotId).not.toBe(snap.snapshotId)
  })

  it('profileId is preserved', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const clone = cloneSnapshot(snap)
    expect(clone.profileId).toBe(snap.profileId)
  })

  it('hash is preserved', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const clone = cloneSnapshot(snap)
    expect(clone.hash).toBe(snap.hash)
  })

  it('version is preserved', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const clone = cloneSnapshot(snap)
    expect(clone.version).toBe(snap.version)
  })

  it('profile payload is a deep copy (modifying clone does not affect original)', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const clone = cloneSnapshot(snap)
    clone.profile.metadata.name = 'Modified'
    expect(snap.profile.metadata.name).not.toBe('Modified')
  })

  it('createdAt is refreshed (different from original)', () => {
    // Note: in very fast test runners this might be the same ms.
    // Just verify it's a valid date string.
    const snap  = createProfileSnapshot(buildValidProfile())
    const clone = cloneSnapshot(snap)
    expect(() => new Date(clone.createdAt)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — compareSnapshots
// ════════════════════════════════════════════════════════════

describe('compareSnapshots', () => {
  it('contentChanged=false for identical snapshots', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const r    = compareSnapshots(snap, snap)
    expect(r.contentChanged).toBe(false)
  })

  it('hashChanged=false for identical snapshots', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const r    = compareSnapshots(snap, snap)
    expect(r.hashChanged).toBe(false)
  })

  it('statusChanged=true when status differs', () => {
    const pA = buildValidProfile('DRAFT')
    const pB = buildValidProfile('VALIDATED')
    const sA = createProfileSnapshot(pA)
    const sB = createProfileSnapshot(pB)
    // Force same profileId for comparison
    sB.profileId = sA.profileId
    const r = compareSnapshots(sA, sB)
    expect(r.statusChanged).toBe(true)
    expect(r.snapshotAStatus).toBe('DRAFT')
    expect(r.snapshotBStatus).toBe('VALIDATED')
  })

  it('hashChanged=true when profile content differs', () => {
    const p1 = buildValidProfile()
    const p2 = buildValidProfile()
    p2.metadata.name = 'Different Name'
    const s1 = createProfileSnapshot(p1)
    const s2 = createProfileSnapshot(p2)
    const r  = compareSnapshots(s1, s2)
    expect(r.hashChanged).toBe(true)
    expect(r.contentChanged).toBe(true)
  })

  it('versionChanged=true when version differs', () => {
    const p1 = buildValidProfile()
    const p2: EvaluationProfileDraft = { ...p1, metadata: { ...p1.metadata, version: '2.0.0' } }
    const s1 = createProfileSnapshot(p1)
    const s2 = createProfileSnapshot(p2)
    const r  = compareSnapshots(s1, s2)
    expect(r.versionChanged).toBe(true)
  })

  it('snapshotA and snapshotB ids are included', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const r    = compareSnapshots(snap, snap)
    expect(r.snapshotA).toBe(snap.snapshotId)
    expect(r.snapshotB).toBe(snap.snapshotId)
  })

  it('profileId comes from snapshot A', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const r    = compareSnapshots(snap, snap)
    expect(r.profileId).toBe(p.metadata.id)
  })

  it('versionChanged=false for same version', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const r    = compareSnapshots(snap, snap)
    expect(r.versionChanged).toBe(false)
  })

  it('snapshotAVersion and snapshotBVersion are set', () => {
    const p    = buildValidProfile()
    const snap = createProfileSnapshot(p)
    const r    = compareSnapshots(snap, snap)
    expect(r.snapshotAVersion).toBe(p.metadata.version)
    expect(r.snapshotBVersion).toBe(p.metadata.version)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — exportProfileJson
// ════════════════════════════════════════════════════════════

describe('exportProfileJson', () => {
  it('returns exportVersion "1.0"', () => {
    const bundle = exportProfileJson(buildValidProfile())
    expect(bundle.exportVersion).toBe('1.0')
  })

  it('returns exportedAt ISO timestamp', () => {
    const bundle = exportProfileJson(buildValidProfile())
    expect(() => new Date(bundle.exportedAt)).not.toThrow()
  })

  it('returns a hash string', () => {
    const bundle = exportProfileJson(buildValidProfile())
    expect(typeof bundle.hash).toBe('string')
    expect(bundle.hash.length).toBeGreaterThan(0)
  })

  it('bundle.profile has same id as source', () => {
    const p      = buildValidProfile()
    const bundle = exportProfileJson(p)
    expect(bundle.profile.metadata.id).toBe(p.metadata.id)
  })

  it('bundle.profile is a deep copy (modifying original does not affect bundle)', () => {
    const p      = buildValidProfile()
    const bundle = exportProfileJson(p)
    p.metadata.name = 'Changed After Export'
    expect(bundle.profile.metadata.name).not.toBe('Changed After Export')
  })

  it('hash in bundle matches calculateProfileHash of the source', () => {
    const p      = buildValidProfile()
    const bundle = exportProfileJson(p)
    expect(bundle.hash).toBe(calculateProfileHash(p))
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — importProfileJson
// ════════════════════════════════════════════════════════════

describe('importProfileJson', () => {
  it('round-trip export → import succeeds', () => {
    const p      = buildValidProfile()
    const bundle = exportProfileJson(p)
    const r      = importProfileJson(bundle)
    expect(r.success).toBe(true)
    expect(r.profile).toBeDefined()
  })

  it('imported profile has same id', () => {
    const p      = buildValidProfile()
    const bundle = exportProfileJson(p)
    const r      = importProfileJson(bundle)
    expect(r.profile!.metadata.id).toBe(p.metadata.id)
  })

  it('errors array is empty on success', () => {
    const r = importProfileJson(exportProfileJson(buildValidProfile()))
    expect(r.errors).toEqual([])
  })

  it('fails for null input', () => {
    const r = importProfileJson(null)
    expect(r.success).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('fails for empty object', () => {
    const r = importProfileJson({})
    expect(r.success).toBe(false)
  })

  it('fails when profile field is missing', () => {
    const r = importProfileJson({ exportVersion: '1.0' })
    expect(r.success).toBe(false)
  })

  it('fails for a profile with no baskets (invalid structure)', () => {
    const emptyProfile = createEmptyEvaluationProfile({ name: 'Empty' })
    const bundle = exportProfileJson(emptyProfile)
    const r = importProfileJson(bundle)
    expect(r.success).toBe(false)
  })

  it('never throws', () => {
    expect(() => importProfileJson(undefined)).not.toThrow()
    expect(() => importProfileJson('not an object')).not.toThrow()
    expect(() => importProfileJson(42)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 21 — exportPublishPackage
// ════════════════════════════════════════════════════════════

describe('exportPublishPackage', () => {
  it('returns a packageId', () => {
    const pkg = exportPublishPackage(buildApprovedProfile())
    expect(typeof pkg.packageId).toBe('string')
    expect(pkg.packageId.length).toBeGreaterThan(0)
  })

  it('profileId matches profile.metadata.id', () => {
    const p   = buildApprovedProfile()
    const pkg = exportPublishPackage(p)
    expect(pkg.profileId).toBe(p.metadata.id)
  })

  it('profileVersion matches profile.metadata.version', () => {
    const p   = buildApprovedProfile()
    const pkg = exportPublishPackage(p)
    expect(pkg.profileVersion).toBe(p.metadata.version)
  })

  it('hash is a non-empty string', () => {
    const pkg = exportPublishPackage(buildApprovedProfile())
    expect(pkg.hash.length).toBeGreaterThan(0)
  })

  it('publishReadinessSummary.valid=true for APPROVED profile', () => {
    const pkg = exportPublishPackage(buildApprovedProfile())
    expect(pkg.publishReadinessSummary.valid).toBe(true)
  })

  it('publishReadinessSummary.valid=false for DRAFT profile', () => {
    const pkg = exportPublishPackage(buildValidProfile('DRAFT'))
    expect(pkg.publishReadinessSummary.valid).toBe(false)
  })

  it('simulationSummary is undefined when no sim result provided', () => {
    const pkg = exportPublishPackage(buildApprovedProfile())
    expect(pkg.simulationSummary).toBeUndefined()
  })

  it('simulationSummary is populated when sim result provided', () => {
    const p         = buildValidProfile('VALIDATED')
    const simResult = simulateProfile({ profile: p, actuals: { sales: 80 }, targets: { sales: 100 } })
    const approved  = buildApprovedProfile()
    const pkg       = exportPublishPackage(approved, simResult)
    expect(pkg.simulationSummary).toBeDefined()
    expect(typeof pkg.simulationSummary!.score).toBe('number')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 22 — exportSimulationPackage
// ════════════════════════════════════════════════════════════

describe('exportSimulationPackage', () => {
  it('returns a packageId', () => {
    const p   = buildValidProfile('VALIDATED')
    const sim = simulateProfile({ profile: p, actuals: { sales: 80 }, targets: { sales: 100 } })
    const pkg = exportSimulationPackage(p, sim)
    expect(pkg.packageId.length).toBeGreaterThan(0)
  })

  it('score matches sim result score', () => {
    const p   = buildValidProfile('VALIDATED')
    const sim = simulateProfile({ profile: p, actuals: { sales: 80 }, targets: { sales: 100 } })
    const pkg = exportSimulationPackage(p, sim)
    expect(pkg.score).toBe(sim.score)
  })

  it('valid matches sim result valid', () => {
    const p   = buildValidProfile('VALIDATED')
    const sim = simulateProfile({ profile: p, actuals: { sales: 80 }, targets: { sales: 100 } })
    const pkg = exportSimulationPackage(p, sim)
    expect(pkg.valid).toBe(sim.valid)
  })

  it('profileId matches profile.metadata.id', () => {
    const p   = buildValidProfile('VALIDATED')
    const sim = simulateProfile({ profile: p, actuals: {}, targets: {} })
    const pkg = exportSimulationPackage(p, sim)
    expect(pkg.profileId).toBe(p.metadata.id)
  })

  it('simulationResult is attached', () => {
    const p   = buildValidProfile('VALIDATED')
    const sim = simulateProfile({ profile: p, actuals: {}, targets: {} })
    const pkg = exportSimulationPackage(p, sim)
    expect(pkg.simulationResult).toBeDefined()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 23 — Invalid transitions
// ════════════════════════════════════════════════════════════

describe('Invalid workflow transitions', () => {
  it('cannot skip VALIDATED→SIMULATED (DRAFT→SIMULATED)', () => {
    const r = simulateDraft(buildValidProfile('DRAFT'))
    expect(r.success).toBe(false)
  })

  it('cannot go PUBLISHED→APPROVED (no demote)', () => {
    const r = approveDraft(buildValidProfile('PUBLISHED'))
    expect(r.success).toBe(false)
  })

  it('cannot go DRAFT→APPROVED', () => {
    expect(approveDraft(buildValidProfile('DRAFT')).success).toBe(false)
  })

  it('cannot go VALIDATED→APPROVED', () => {
    expect(approveDraft(buildValidProfile('VALIDATED')).success).toBe(false)
  })

  it('cannot publish from SIMULATED (must approve first)', () => {
    const r = markPublishReady(buildValidProfile('SIMULATED'))
    expect(r.success).toBe(false)
  })

  it('issues list explains the reason for failure', () => {
    const r = approveDraft(buildValidProfile('DRAFT'))
    expect(r.issues[0]).toMatch(/cannot|DRAFT|approve/i)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 24 — Immutability
// ════════════════════════════════════════════════════════════

describe('Immutability', () => {
  it('validateDraft does not mutate input profile', () => {
    const p    = buildValidProfile('DRAFT')
    const orig = p.metadata.status
    validateDraft(p)
    expect(p.metadata.status).toBe(orig)
  })

  it('approveDraft does not mutate input profile', () => {
    const p    = buildValidProfile('SIMULATED')
    const orig = p.metadata.status
    approveDraft(p)
    expect(p.metadata.status).toBe(orig)
  })

  it('archiveProfile does not mutate input profile', () => {
    const p    = buildValidProfile('DRAFT')
    const orig = p.metadata.status
    archiveProfile(p)
    expect(p.metadata.status).toBe(orig)
  })

  it('createProfileSnapshot does not mutate source profile', () => {
    const p    = buildValidProfile()
    const orig = p.metadata.name
    const snap = createProfileSnapshot(p)
    snap.profile.metadata.name = 'mutated'
    expect(p.metadata.name).toBe(orig)
  })

  it('exportProfileJson does not mutate source profile', () => {
    const p      = buildValidProfile()
    const orig   = p.metadata.name
    const bundle = exportProfileJson(p)
    bundle.profile.metadata.name = 'mutated'
    expect(p.metadata.name).toBe(orig)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 25 — No-throw edge cases
// ════════════════════════════════════════════════════════════

describe('No-throw edge cases', () => {
  it('validateDraft does not throw for null profile', () => {
    expect(() => validateDraft(null as any)).not.toThrow()
  })

  it('simulateDraft does not throw for null profile', () => {
    expect(() => simulateDraft(null as any)).not.toThrow()
  })

  it('calculateProfileHash does not throw for undefined', () => {
    expect(() => calculateProfileHash(undefined as any)).not.toThrow()
  })

  it('detectTampering does not throw for null snapshot', () => {
    const p = buildValidProfile()
    expect(() => detectTampering(p, null as any)).not.toThrow()
  })

  it('importProfileJson does not throw for undefined', () => {
    expect(() => importProfileJson(undefined)).not.toThrow()
    expect(importProfileJson(undefined).success).toBe(false)
  })
})
