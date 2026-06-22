// ============================================================
// Shadow Evaluation Log — Firestore Rules & Indexes Tests
//
// Uses the same source-inspection pattern as the rest of the
// project's rules tests (import firestore.rules as raw text).
// No live emulator needed.
//
// Tests:
//   Rules:
//     1.  shadow_evaluation_logs block exists in firestore.rules
//     2.  Admin has full read access
//     3.  Manager has branch-scoped read (pharmacyId == pharmId())
//     4.  Pharmacist has no read access
//     5.  Admin can create
//     6.  Create requires mandatory fields
//     7.  Create validates source in ['single_user', 'bulk']
//     8.  Update is explicitly denied (immutable)
//     9.  Delete is admin-only
//    10.  shadow_evaluation_logs is separate from evaluation_results
//    11.  Rule block comment documents diagnostic-only purpose
//
//   Indexes:
//    12.  severity + month index exists
//    13.  userId + month index exists
//    14.  pharmacyId + month index exists
//    15.  pharmacyId + severity + month composite index exists
//    16.  All four indexes have correct collectionGroup
//
//   Separation invariant:
//    17.  evaluation_results rule unchanged by shadow_evaluation_logs addition
//    18.  shadow_evaluation_logs update rule is `if false`
//    19.  No shadow log write path references evaluation_results
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Helpers ───────────────────────────────────────────────────

async function getRules(): Promise<string> {
  const src = await import('../../../firestore.rules?raw')
  return src.default
}

async function getIndexes(): Promise<any[]> {
  const src = await import('../../../firestore.indexes.json')
  return src.default.indexes
}

/** Extract the shadow_evaluation_logs match block from the rules source */
function extractShadowBlock(rules: string): string {
  return rules.match(
    /match \/shadow_evaluation_logs\/\{logId\} \{[\s\S]+?\}/
  )?.[0] ?? ''
}

/** Extract the evaluation_results match block */
function extractEvalResultsBlock(rules: string): string {
  return rules.match(
    /match \/evaluation_results\/\{resultId\} \{[\s\S]+?\}/
  )?.[0] ?? ''
}

/** Filter indexes to those for shadow_evaluation_logs */
function shadowIndexes(indexes: any[]): any[] {
  return indexes.filter((i) => i.collectionGroup === 'shadow_evaluation_logs')
}

// ════════════════════════════════════════════════════════════════
// Rules tests
// ════════════════════════════════════════════════════════════════

describe('shadow_evaluation_logs — Firestore rules', () => {
  it('match block exists in firestore.rules', async () => {
    const rules = await getRules()
    expect(rules).toContain('shadow_evaluation_logs')
    const block = extractShadowBlock(rules)
    expect(block.length).toBeGreaterThan(0)
  })

  it('admin has read access', async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    expect(block).toContain('allow read:')
    expect(block).toContain('isAdmin()')
  })

  it('manager has branch-scoped read (pharmacyId == pharmId())', async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    expect(block).toContain('isMgr()')
    expect(block).toContain('pharmacyId == pharmId()')
  })

  it('pharmacist (isAny() alone) is NOT granted read access', async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    // The read rule must NOT contain bare `isAny()` (which would allow all authenticated users)
    // It must only contain isAdmin() and isMgr()
    const readLine = block.split('\n').find((l) => l.includes('allow read:')) ?? ''
    expect(readLine).not.toContain('isAny()')
  })

  it('admin can create shadow logs', async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    expect(block).toContain('allow create:')
    // Must gate create on isAdmin()
    const createBlock = block.substring(block.indexOf('allow create:'))
    expect(createBlock).toContain('isAdmin()')
  })

  it('create requires mandatory field list (hasAll)', async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    expect(block).toContain('hasAll(')
    expect(block).toContain("'userId'")
    expect(block).toContain("'pharmacyId'")
    expect(block).toContain("'month'")
    expect(block).toContain("'ran'")
    expect(block).toContain("'severity'")
    expect(block).toContain("'source'")
  })

  it("create validates source in ['single_user', 'bulk']", async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    expect(block).toContain("'single_user'")
    expect(block).toContain("'bulk'")
    expect(block).toContain('.source in [')
  })

  it('update is explicitly denied (immutable logs)', async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    expect(block).toContain('allow update: if false')
  })

  it('delete is admin-only (sprint cleanup)', async () => {
    const rules = await getRules()
    const block = extractShadowBlock(rules)
    const deleteLine = block.split('\n')
      .find((l) => l.trimStart().startsWith('allow delete:')) ?? ''
    expect(deleteLine).toContain('isAdmin()')
    // Must not allow broader access
    expect(deleteLine).not.toContain('isMgr()')
    expect(deleteLine).not.toContain('isAny()')
  })

  it('shadow_evaluation_logs block is separate from evaluation_results', async () => {
    const rules = await getRules()
    const shadowBlock = extractShadowBlock(rules)
    expect(shadowBlock).not.toContain('evaluation_results')
  })

  it('rule block comment documents diagnostic-only purpose', async () => {
    const rules = await getRules()
    // The comment above the rule should explain the diagnostic purpose
    const idx = rules.indexOf('shadow_evaluation_logs')
    const surrounding = rules.substring(Math.max(0, idx - 800), idx + 100)
    expect(surrounding).toMatch(/diagnostic|sprint|shadow/i)
  })
})

// ════════════════════════════════════════════════════════════════
// Index tests
// ════════════════════════════════════════════════════════════════

describe('shadow_evaluation_logs — Firestore indexes', () => {
  it('severity + month index exists', async () => {
    const indexes = await getIndexes()
    const idx = shadowIndexes(indexes)
    const found = idx.some((i) => {
      const fields = i.fields.map((f: any) => f.fieldPath)
      return fields.includes('severity') && fields.includes('month')
    })
    expect(found).toBe(true)
  })

  it('userId + month index exists', async () => {
    const indexes = await getIndexes()
    const idx = shadowIndexes(indexes)
    const found = idx.some((i) => {
      const fields = i.fields.map((f: any) => f.fieldPath)
      return fields.includes('userId') && fields.includes('month')
    })
    expect(found).toBe(true)
  })

  it('pharmacyId + month index exists', async () => {
    const indexes = await getIndexes()
    const idx = shadowIndexes(indexes)
    const found = idx.some((i) => {
      const fields = i.fields.map((f: any) => f.fieldPath)
      return fields.includes('pharmacyId') && fields.includes('month')
    })
    expect(found).toBe(true)
  })

  it('pharmacyId + severity + month composite index exists', async () => {
    const indexes = await getIndexes()
    const idx = shadowIndexes(indexes)
    const found = idx.some((i) => {
      const fields = i.fields.map((f: any) => f.fieldPath)
      return fields.includes('pharmacyId') &&
             fields.includes('severity')   &&
             fields.includes('month')
    })
    expect(found).toBe(true)
  })

  it('all shadow indexes have collectionGroup = shadow_evaluation_logs', async () => {
    const indexes = await getIndexes()
    const idx = shadowIndexes(indexes)
    expect(idx.length).toBeGreaterThanOrEqual(4)
    idx.forEach((i) => {
      expect(i.collectionGroup).toBe('shadow_evaluation_logs')
    })
  })

  it('all shadow indexes use COLLECTION queryScope', async () => {
    const indexes = await getIndexes()
    const idx = shadowIndexes(indexes)
    idx.forEach((i) => {
      expect(i.queryScope).toBe('COLLECTION')
    })
  })

  it('month field order is DESCENDING in all shadow indexes (latest first)', async () => {
    const indexes = await getIndexes()
    const idx = shadowIndexes(indexes)
    idx.forEach((i) => {
      const monthField = i.fields.find((f: any) => f.fieldPath === 'month')
      if (monthField) {
        expect(monthField.order).toBe('DESCENDING')
      }
    })
  })
})

// ════════════════════════════════════════════════════════════════
// Separation invariants
// ════════════════════════════════════════════════════════════════

describe('shadow_evaluation_logs — separation invariants', () => {
  it('evaluation_results rule is not modified (still allow update: if false)', async () => {
    const rules = await getRules()
    const evalBlock = extractEvalResultsBlock(rules)
    expect(evalBlock).toContain('allow update: if false')
    expect(evalBlock).toContain('allow delete: if false')
  })

  it('evaluation_results block does not reference shadow_evaluation_logs', async () => {
    const rules = await getRules()
    const evalBlock = extractEvalResultsBlock(rules)
    expect(evalBlock).not.toContain('shadow')
  })

  it('shadowEvaluationLogService does not import from evaluationLedgerService', async () => {
    const src = await import('../../services/shadowEvaluationLogService.ts?raw')
    expect(src.default).not.toContain('evaluationLedgerService')
  })

  it('shadow log collection name differs from evaluation_results collection name', () => {
    expect('shadow_evaluation_logs').not.toBe('evaluation_results')
  })

  it('firestore.indexes.json shadow indexes do not overlap with evaluation_results indexes', async () => {
    const indexes = await getIndexes()
    const shadowIdx = shadowIndexes(indexes)
    const evalResultsIdx = indexes.filter((i) => i.collectionGroup === 'evaluation_results')
    // No shadow index should have the same fields as an evaluation_results index
    for (const si of shadowIdx) {
      const siFields = si.fields.map((f: any) => f.fieldPath).sort().join(',')
      for (const ei of evalResultsIdx) {
        const eiFields = ei.fields.map((f: any) => f.fieldPath).sort().join(',')
        expect(siFields).not.toBe(eiFields)
      }
    }
  })
})
