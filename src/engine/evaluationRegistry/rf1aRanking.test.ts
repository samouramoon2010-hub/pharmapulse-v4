// ============================================================
// RF-1A Ranking Ledger Foundation — Tests
//
// Covers:
//   1. Ranking key builders (branch + pharmacist, validation, round-trip)
//   2. Eligibility rules (branch + pharmacist, all edge cases)
//   3. Tie-break engine (all 5 rules, input immutability)
//   4. Branch ranking engine (cohort grouping, ordering, exclusion trace)
//   5. Pharmacist ranking engine (full-time cohorts, float-pool, exclusions)
//   6. Module boundary (no Firestore, no React in pure modules)
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  buildBranchCohortKey, buildBranchSnapshotDocId,
  buildPharmacistCohortKey, buildPharmacistSnapshotDocId,
  parseBranchCohortKey, parsePharmacistCohortKey,
  safeValidateBranchCohortKey,
} from '../../ranking/ranking-key'

import {
  checkBranchEligibility, checkPharmacistEligibility,
  partitionBranchRecords,
} from '../../ranking/eligibility'

import {
  compareRecords, sortWithTieBreak,
} from '../../ranking/tie-break'

import { generateBranchRankingSnapshots }    from '../../ranking/branch-ranking-engine'
import { generatePharmacistRankingSnapshots } from '../../ranking/pharmacist-ranking-engine'

import {
  UNRANKED_CLASSIFICATION_ID, FLOAT_POOL_COHORT_ID,
  RANKING_KEY_SEP, RANKING_DOC_SEP,
} from '../../ranking/constants'

import type { RankingInputRecord } from '../../ranking/types'

// ── Fixtures ──────────────────────────────────────────────────

const BASE_PERIOD    = '2026-06'
const BASE_PROFILE   = 'smarts-2026-v1'
const BASE_VERSION   = 1

function makeBranchRecord(overrides: Partial<RankingInputRecord> = {}): RankingInputRecord {
  return {
    entityId:           'ph-001',
    entityName:         'Branch 001',
    entityType:         'branch',
    periodId:           BASE_PERIOD,
    profileId:          BASE_PROFILE,
    profileVersion:     BASE_VERSION,
    classificationId:   'destination',
    cappedScore:        85,
    uncappedScore:      4.4,
    sourceEvaluationId: 'eval-001',
    evaluationStatus:   'complete',
    ...overrides,
  }
}

function makePharmacistRecord(overrides: Partial<RankingInputRecord> = {}): RankingInputRecord {
  return {
    entityId:           'user-001',
    entityName:         'Dr. Test',
    entityType:         'pharmacist',
    periodId:           BASE_PERIOD,
    profileId:          BASE_PROFILE,
    profileVersion:     BASE_VERSION,
    classificationId:   'destination',
    pharmacistCohortId: 'destination',
    cappedScore:        80,
    uncappedScore:      4.2,
    sourceEvaluationId: 'eval-ph-001',
    evaluationStatus:   'complete',
    employmentType:     'full-time',
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════════
// 1. RANKING KEY
// ════════════════════════════════════════════════════════════════

describe('buildBranchCohortKey', () => {
  it('produces correct separator-delimited key', () => {
    const key = buildBranchCohortKey({
      periodId: '2026-06', profileId: 'smarts-2026-v1',
      profileVersion: 1, classificationId: 'destination',
    })
    expect(key).toBe('2026-06::smarts-2026-v1::1::destination')
  })

  it('is deterministic — same input → same output', () => {
    const c = { periodId: '2026-06', profileId: 'p', profileVersion: 1, classificationId: 'hub' }
    expect(buildBranchCohortKey(c)).toBe(buildBranchCohortKey({ ...c }))
  })

  it('uses the RANKING_KEY_SEP constant', () => {
    const key = buildBranchCohortKey({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, classificationId: 'hub',
    })
    expect(key.includes(RANKING_KEY_SEP)).toBe(true)
  })

  it('throws when periodId is missing', () => {
    expect(() => buildBranchCohortKey({
      periodId: '', profileId: 'p', profileVersion: 1, classificationId: 'hub',
    })).toThrow()
  })

  it('throws when periodId is invalid format', () => {
    expect(() => buildBranchCohortKey({
      periodId: '26-6', profileId: 'p', profileVersion: 1, classificationId: 'hub',
    })).toThrow()
  })

  it('throws when classificationId is missing', () => {
    expect(() => buildBranchCohortKey({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, classificationId: '',
    })).toThrow()
  })

  it('throws when separator appears in profileId', () => {
    expect(() => buildBranchCohortKey({
      periodId: '2026-06', profileId: 'bad::id', profileVersion: 1, classificationId: 'hub',
    })).toThrow()
  })

  it('different classificationId → different key (classification-specific cohort)', () => {
    const base = { periodId: '2026-06', profileId: 'p', profileVersion: 1 }
    const hub  = buildBranchCohortKey({ ...base, classificationId: 'hub' })
    const dest = buildBranchCohortKey({ ...base, classificationId: 'destination' })
    expect(hub).not.toBe(dest)
  })

  it('preserves profileVersion in key', () => {
    const v1 = buildBranchCohortKey({ periodId: '2026-06', profileId: 'p', profileVersion: 1, classificationId: 'hub' })
    const v2 = buildBranchCohortKey({ periodId: '2026-06', profileId: 'p', profileVersion: 2, classificationId: 'hub' })
    expect(v1).not.toBe(v2)
    expect(v1).toContain('::1::')
    expect(v2).toContain('::2::')
  })
})

describe('buildBranchSnapshotDocId', () => {
  it('includes all 5 components with RANKING_DOC_SEP', () => {
    const id = buildBranchSnapshotDocId({
      periodId: '2026-06', profileId: 'p', profileVersion: 1,
      classificationId: 'destination', branchId: 'ph-001',
    })
    expect(id).toBe('2026-06#p#1#destination#ph-001')
    expect(id.includes(RANKING_DOC_SEP)).toBe(true)
  })

  it('throws when branchId is missing', () => {
    expect(() => buildBranchSnapshotDocId({
      periodId: '2026-06', profileId: 'p', profileVersion: 1,
      classificationId: 'hub', branchId: '',
    })).toThrow()
  })
})

describe('buildPharmacistCohortKey', () => {
  it('produces correct key with pharmacistCohortId', () => {
    const key = buildPharmacistCohortKey({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, pharmacistCohortId: 'destination',
    })
    expect(key).toBe('2026-06::p::1::destination')
  })

  it('float-pool produces valid key', () => {
    const key = buildPharmacistCohortKey({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, pharmacistCohortId: FLOAT_POOL_COHORT_ID,
    })
    expect(key).toContain(FLOAT_POOL_COHORT_ID)
  })
})

describe('parseBranchCohortKey', () => {
  it('round-trips a valid key', () => {
    const components = { periodId: '2026-06', profileId: 'p', profileVersion: 1, classificationId: 'hub' }
    const key    = buildBranchCohortKey(components)
    const parsed = parseBranchCohortKey(key)
    expect(parsed).toEqual(components)
  })

  it('returns null for malformed key', () => {
    expect(parseBranchCohortKey('only::three')).toBeNull()
    expect(parseBranchCohortKey('')).toBeNull()
  })
})

describe('safeValidateBranchCohortKey', () => {
  it('valid components → { valid: true }', () => {
    const r = safeValidateBranchCohortKey({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, classificationId: 'hub',
    })
    expect(r.valid).toBe(true)
  })

  it('invalid periodId → { valid: false }', () => {
    const r = safeValidateBranchCohortKey({
      periodId: 'bad', profileId: 'p', profileVersion: 1, classificationId: 'hub',
    })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 2. ELIGIBILITY
// ════════════════════════════════════════════════════════════════

describe('checkBranchEligibility', () => {
  it('valid complete record → eligible', () => {
    const r = checkBranchEligibility(makeBranchRecord())
    expect(r.eligible).toBe(true)
  })

  it('valid partial record → eligible (partial is acceptable)', () => {
    const r = checkBranchEligibility(makeBranchRecord({ evaluationStatus: 'partial' }))
    expect(r.eligible).toBe(true)
  })

  it('unclassified → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ classificationId: UNRANKED_CLASSIFICATION_ID }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toMatch(/unclassified/i)
  })

  it('missing classificationId → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ classificationId: '' }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toMatch(/classificationId/i)
  })

  it('invalid evaluation status → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ evaluationStatus: 'invalid' }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toMatch(/invalid/i)
  })

  it('NaN cappedScore → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ cappedScore: NaN }))
    expect(r.eligible).toBe(false)
  })

  it('cappedScore > 100 → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ cappedScore: 115 }))
    expect(r.eligible).toBe(false)
  })

  it('missing profileId → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ profileId: '' }))
    expect(r.eligible).toBe(false)
  })

  it('missing profileVersion → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ profileVersion: 0 }))
    expect(r.eligible).toBe(false)
  })

  it('missing sourceEvaluationId → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ sourceEvaluationId: '' }))
    expect(r.eligible).toBe(false)
  })

  it('missing periodId → ineligible', () => {
    const r = checkBranchEligibility(makeBranchRecord({ periodId: '' }))
    expect(r.eligible).toBe(false)
  })
})

describe('checkPharmacistEligibility', () => {
  it('full-time pharmacist → eligible', () => {
    const r = checkPharmacistEligibility(makePharmacistRecord())
    expect(r.eligible).toBe(true)
  })

  it('float pharmacist → eligible (placed in float-pool)', () => {
    const r = checkPharmacistEligibility(makePharmacistRecord({ employmentType: 'float' }))
    expect(r.eligible).toBe(true)
  })

  it('invalid evaluation → ineligible', () => {
    const r = checkPharmacistEligibility(makePharmacistRecord({ evaluationStatus: 'invalid' }))
    expect(r.eligible).toBe(false)
  })

  it('missing score → ineligible', () => {
    const r = checkPharmacistEligibility(makePharmacistRecord({ cappedScore: NaN }))
    expect(r.eligible).toBe(false)
  })
})

describe('partitionBranchRecords', () => {
  it('splits eligible and excluded correctly', () => {
    const records = [
      makeBranchRecord({ entityId: 'ph-1', classificationId: 'destination' }),
      makeBranchRecord({ entityId: 'ph-2', classificationId: UNRANKED_CLASSIFICATION_ID }),
      makeBranchRecord({ entityId: 'ph-3', classificationId: 'hub' }),
      makeBranchRecord({ entityId: 'ph-4', evaluationStatus: 'invalid' }),
    ]
    const { eligible, excluded } = partitionBranchRecords(records)
    expect(eligible).toHaveLength(2)
    expect(excluded).toHaveLength(2)
    expect(eligible.map((r) => r.entityId)).toContain('ph-1')
    expect(eligible.map((r) => r.entityId)).toContain('ph-3')
  })
})

// ════════════════════════════════════════════════════════════════
// 3. TIE-BREAK ENGINE
// ════════════════════════════════════════════════════════════════

describe('compareRecords', () => {
  it('cappedScore wins — higher cappedScore ranks first', () => {
    const a = makeBranchRecord({ cappedScore: 90, uncappedScore: 4.0 })
    const b = makeBranchRecord({ cappedScore: 80, uncappedScore: 4.5 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)   // a ranks higher
    expect(trace.rule).toBe('cappedScore')
  })

  it('uncappedScore breaks tie when cappedScore equal', () => {
    const a = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.5 })
    const b = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.2 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)
    expect(trace.rule).toBe('uncappedScore')
  })

  it('strategicKpiScore breaks tie when both previous tied', () => {
    const a = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.2, strategicKpiScore: 95 })
    const b = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.2, strategicKpiScore: 80 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)
    expect(trace.rule).toBe('strategicKpi')
  })

  it('consistencyScore breaks tie (preferred over volatility)', () => {
    const a = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.2, consistencyScore: 0.9 })
    const b = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.2, consistencyScore: 0.7 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)
    expect(trace.rule).toBe('consistency')
  })

  it('volatilityScore breaks tie when consistency absent', () => {
    const a = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.2, volatilityScore: 0.05 })
    const b = makeBranchRecord({ cappedScore: 85, uncappedScore: 4.2, volatilityScore: 0.20 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)   // a wins: lower volatility
    expect(trace.rule).toBe('volatility')
  })

  it('entityId alphabetic fallback resolves all-equal scores', () => {
    const a = makeBranchRecord({ entityId: 'aaa', cappedScore: 85, uncappedScore: 4.2 })
    const b = makeBranchRecord({ entityId: 'zzz', cappedScore: 85, uncappedScore: 4.2 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)   // 'aaa' before 'zzz'
    expect(trace.rule).toBe('entityId')
  })

  it('is always deterministic — symmetric comparison', () => {
    const a = makeBranchRecord({ entityId: 'x', cappedScore: 85 })
    const b = makeBranchRecord({ entityId: 'y', cappedScore: 85 })
    const ab = compareRecords(a, b).order
    const ba = compareRecords(b, a).order
    expect(Math.sign(ab)).toBe(-Math.sign(ba))
  })
})

describe('sortWithTieBreak — input immutability', () => {
  it('does not mutate the original array', () => {
    const records = [
      makeBranchRecord({ entityId: 'c', cappedScore: 70 }),
      makeBranchRecord({ entityId: 'a', cappedScore: 90 }),
      makeBranchRecord({ entityId: 'b', cappedScore: 80 }),
    ]
    const originalOrder = records.map((r) => r.entityId)
    sortWithTieBreak(records)
    expect(records.map((r) => r.entityId)).toEqual(originalOrder)
  })

  it('returns records in correct descending score order', () => {
    const records = [
      makeBranchRecord({ entityId: 'c', cappedScore: 70 }),
      makeBranchRecord({ entityId: 'a', cappedScore: 90 }),
      makeBranchRecord({ entityId: 'b', cappedScore: 80 }),
    ]
    const sorted = sortWithTieBreak(records)
    expect(sorted.map((s) => s.record.entityId)).toEqual(['a', 'b', 'c'])
  })

  it('single record returns noTie trace', () => {
    const sorted = sortWithTieBreak([makeBranchRecord()])
    expect(sorted).toHaveLength(1)
    expect(sorted[0].tieBreakTrace.rule).toBe('noTie')
  })

  it('empty array returns empty array', () => {
    expect(sortWithTieBreak([])).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 4. BRANCH RANKING ENGINE
// ════════════════════════════════════════════════════════════════

describe('generateBranchRankingSnapshots', () => {
  const PERIOD = '2026-06'
  const PROF   = 'smarts-2026-v1'
  const VER    = 1

  it('ranks branches within the same classification', () => {
    const records = [
      makeBranchRecord({ entityId: 'ph-1', classificationId: 'destination', cappedScore: 90 }),
      makeBranchRecord({ entityId: 'ph-2', classificationId: 'destination', cappedScore: 75 }),
      makeBranchRecord({ entityId: 'ph-3', classificationId: 'destination', cappedScore: 85 }),
    ]
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    expect(outputs).toHaveLength(1)
    const { snapshots } = outputs[0]
    expect(snapshots).toHaveLength(3)
    expect(snapshots[0].currentRank).toBe(1)
    expect(snapshots[0].entityId).toBe('ph-1')   // highest score
    expect(snapshots[1].currentRank).toBe(2)
    expect(snapshots[1].entityId).toBe('ph-3')
    expect(snapshots[2].currentRank).toBe(3)
    expect(snapshots[2].entityId).toBe('ph-2')
  })

  it('does NOT compare hub with destination (separate cohorts)', () => {
    const records = [
      makeBranchRecord({ entityId: 'ph-hub',  classificationId: 'hub',         cappedScore: 70 }),
      makeBranchRecord({ entityId: 'ph-dest', classificationId: 'destination', cappedScore: 90 }),
    ]
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    expect(outputs).toHaveLength(2)
    // each cohort has 1 member ranked #1
    for (const out of outputs) {
      expect(out.snapshots[0].currentRank).toBe(1)
    }
  })

  it('excludes unclassified branches', () => {
    const records = [
      makeBranchRecord({ entityId: 'ph-ok',   classificationId: 'destination' }),
      makeBranchRecord({ entityId: 'ph-unc',  classificationId: UNRANKED_CLASSIFICATION_ID }),
    ]
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    const allSnapshots = outputs.flatMap((o) => o.snapshots)
    expect(allSnapshots.map((s) => s.entityId)).not.toContain('ph-unc')
    const excluded = outputs.flatMap((o) => o.excluded)
    expect(excluded.map((e) => e.entityId)).toContain('ph-unc')
  })

  it('preserves periodId and profileVersion in every snapshot', () => {
    const records = [makeBranchRecord({ classificationId: 'hub' })]
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    const snap = outputs[0].snapshots[0]
    expect(snap.periodId).toBe(PERIOD)
    expect(snap.profileVersion).toBe(VER)
    expect(snap.profileId).toBe(PROF)
  })

  it('cohortSize equals number of eligible members in that cohort', () => {
    const records = [
      makeBranchRecord({ entityId: 'a', classificationId: 'destination' }),
      makeBranchRecord({ entityId: 'b', classificationId: 'destination' }),
      makeBranchRecord({ entityId: 'c', classificationId: 'destination' }),
    ]
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    expect(outputs[0].snapshots[0].cohortSize).toBe(3)
  })

  it('snapshotId is deterministic and includes pharmacyId', () => {
    const records = [makeBranchRecord({ entityId: 'ph-001', classificationId: 'hub' })]
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    const { snapshotId } = outputs[0].snapshots[0]
    expect(snapshotId).toContain('ph-001')
    expect(snapshotId).toContain(PERIOD)
    expect(snapshotId).toContain('hub')
  })

  it('empty input produces output with empty snapshots (not a crash)', () => {
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records: [] })
    expect(outputs).toHaveLength(1)
    expect(outputs[0].snapshots).toHaveLength(0)
  })

  it('exclusion trace contains reason for each excluded branch', () => {
    const records = [
      makeBranchRecord({ entityId: 'good', classificationId: 'hub' }),
      makeBranchRecord({ entityId: 'bad',  classificationId: UNRANKED_CLASSIFICATION_ID }),
    ]
    const outputs = generateBranchRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    const excluded = outputs.flatMap((o) => o.excluded)
    const badEntry = excluded.find((e) => e.entityId === 'bad')
    expect(badEntry).toBeDefined()
    expect(badEntry?.reason).toBeTruthy()
  })
})

// ════════════════════════════════════════════════════════════════
// 5. PHARMACIST RANKING ENGINE
// ════════════════════════════════════════════════════════════════

describe('generatePharmacistRankingSnapshots', () => {
  const PERIOD = '2026-06'
  const PROF   = 'smarts-2026-v1'
  const VER    = 1

  it('full-time pharmacists grouped by home branch classificationId', () => {
    const records = [
      makePharmacistRecord({ entityId: 'u1', pharmacistCohortId: 'destination', cappedScore: 90 }),
      makePharmacistRecord({ entityId: 'u2', pharmacistCohortId: 'destination', cappedScore: 80 }),
      makePharmacistRecord({ entityId: 'u3', pharmacistCohortId: 'hub',         cappedScore: 85 }),
    ]
    const outputs = generatePharmacistRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    expect(outputs).toHaveLength(2)   // destination + hub
    const destOutput = outputs.find((o) => o.cohort.classificationId === 'destination')
    expect(destOutput?.snapshots).toHaveLength(2)
    expect(destOutput?.snapshots[0].entityId).toBe('u1')
  })

  it('float pharmacists go into float-pool cohort', () => {
    const records = [
      makePharmacistRecord({ entityId: 'full', employmentType: 'full-time', pharmacistCohortId: 'destination' }),
      makePharmacistRecord({ entityId: 'float', employmentType: 'float' }),
    ]
    const outputs = generatePharmacistRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    const floatOutput = outputs.find((o) => o.cohort.classificationId === FLOAT_POOL_COHORT_ID)
    expect(floatOutput).toBeDefined()
    expect(floatOutput?.snapshots[0].entityId).toBe('float')
    expect(floatOutput?.snapshots[0].employmentType).toBe('float')
  })

  it('excludes pharmacists with invalid evaluation', () => {
    const records = [
      makePharmacistRecord({ entityId: 'good', evaluationStatus: 'complete' }),
      makePharmacistRecord({ entityId: 'bad',  evaluationStatus: 'invalid'  }),
    ]
    const outputs = generatePharmacistRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    const allSnaps = outputs.flatMap((o) => o.snapshots)
    expect(allSnaps.map((s) => s.entityId)).not.toContain('bad')
    const excluded = outputs.flatMap((o) => o.excluded)
    expect(excluded.map((e) => e.entityId)).toContain('bad')
  })

  it('is deterministic — same input = same rank order', () => {
    const records = [
      makePharmacistRecord({ entityId: 'u3', cappedScore: 70 }),
      makePharmacistRecord({ entityId: 'u1', cappedScore: 90 }),
      makePharmacistRecord({ entityId: 'u2', cappedScore: 80 }),
    ]
    const out1 = generatePharmacistRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records })
    const out2 = generatePharmacistRankingSnapshots({ periodId: PERIOD, profileId: PROF, profileVersion: VER, records: [...records] })
    expect(out1[0].snapshots.map((s) => s.entityId))
      .toEqual(out2[0].snapshots.map((s) => s.entityId))
  })
})

// ════════════════════════════════════════════════════════════════
// 6. MODULE BOUNDARY
// ════════════════════════════════════════════════════════════════

describe('RF-1A module boundary', () => {
  it('ranking modules have no firebase imports', async () => {
    const files = [
      '../../ranking/types.ts?raw',
      '../../ranking/constants.ts?raw',
      '../../ranking/ranking-key.ts?raw',
      '../../ranking/eligibility.ts?raw',
      '../../ranking/tie-break.ts?raw',
      '../../ranking/branch-ranking-engine.ts?raw',
      '../../ranking/pharmacist-ranking-engine.ts?raw',
    ]
    for (const path of files) {
      const src = await import(path)
      expect(src.default, `${path} must not import firebase`).not.toMatch(/from ['"]firebase/)
    }
  })

  it('ranking modules have no React imports', async () => {
    const files = [
      '../../ranking/ranking-key.ts?raw',
      '../../ranking/eligibility.ts?raw',
      '../../ranking/tie-break.ts?raw',
      '../../ranking/branch-ranking-engine.ts?raw',
    ]
    for (const path of files) {
      const src = await import(path)
      expect(src.default, `${path} must not import react`).not.toMatch(/from ['"]react/)
    }
  })

  it('no Firestore collection names in pure engine files', async () => {
    const files = [
      '../../ranking/branch-ranking-engine.ts?raw',
      '../../ranking/pharmacist-ranking-engine.ts?raw',
    ]
    for (const path of files) {
      const src = await import(path)
      expect(src.default).not.toMatch(/ranking_results|ranking_snapshots|addDoc|setDoc/)
    }
  })

  it('constants are exportable and have expected values', () => {
    expect(UNRANKED_CLASSIFICATION_ID).toBe('unclassified')
    expect(FLOAT_POOL_COHORT_ID).toBe('float-pool')
    expect(RANKING_KEY_SEP).toBe('::')
    expect(RANKING_DOC_SEP).toBe('#')
  })
})
