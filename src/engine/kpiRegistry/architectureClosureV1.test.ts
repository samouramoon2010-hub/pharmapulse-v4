// ============================================================
// Final Stabilization / Architecture Closure Bundle — Certification
//
// Proves the 10 required proofs from the bundle spec. Documentation-
// only module under test — no protected engine, registry behavior, or
// Firestore contract is exercised here beyond reading structured data.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  FINAL_ARCHITECTURE_AUDIT,
  isFinalArchitectureAuditClean,
  DEAD_CODE_AUDIT_FINDINGS,
  isDeadCodeAuditComplete,
  FROZEN_ARCHITECTURE_LAYERS,
  ARCHITECTURE_CLOSED_V1,
  POST_ARCHITECTURE_ROADMAP,
  getArchitectureClosureStatus,
  EVALUATION_ENGINE_EXCEPTION,
  IMPORT_ENGINE_EXCEPTION,
  REGISTRY_AUTHORITY_DECLARATION,
} from './architectureClosureV1'
import {
  isRegistryAuthoritative,
  COMPATIBILITY_LAYER_FROZEN,
  CORE_KPI_FIELDS_FROZEN,
  getCoreKpiRetirementStatus,
} from './coreKpiRetirement'
import readFs from 'node:fs'
import path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../')

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readFs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(full, out)
    } else if (/\.(ts|tsx|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

function toRelative(absPath: string): string {
  return 'src/' + absPath.slice(SRC_ROOT.length + 1).replace(/\\/g, '/')
}

describe('Final Stabilization / Architecture Closure Bundle', () => {
  // Proof 1: Registry architecture is authoritative
  it('proof 1: registry architecture is authoritative across every declared surface', () => {
    expect(isRegistryAuthoritative()).toBe(true)
    expect(REGISTRY_AUTHORITY_DECLARATION.every((s) => s.authoritative)).toBe(true)
    expect(REGISTRY_AUTHORITY_DECLARATION.length).toBeGreaterThan(0)
  })

  // Proof 2: Core KPI remain compatibility-only
  it('proof 2: Core KPI layer remains frozen and compatibility-only', () => {
    expect(COMPATIBILITY_LAYER_FROZEN).toBe(true)
    expect(CORE_KPI_FIELDS_FROZEN).toBe(true)
    const retirement = getCoreKpiRetirementStatus()
    expect(retirement.coreKpiStatus).toBe('COMPATIBILITY_LAYER')
  })

  // Proof 3: Evaluation Engine exception documented
  it('proof 3: Evaluation Engine exception is documented as permanent', () => {
    expect(EVALUATION_ENGINE_EXCEPTION.consumer).toMatch(/Evaluation Engine/i)
    expect(EVALUATION_ENGINE_EXCEPTION.permanent).toBe(true)
  })

  // Proof 4: Import Engine exception documented
  it('proof 4: Import Engine exception is documented as a non-permanent, out-of-scope exception', () => {
    expect(IMPORT_ENGINE_EXCEPTION.consumer).toMatch(/Import/i)
    expect(IMPORT_ENGINE_EXCEPTION.permanent).toBe(false)
  })

  // Proof 5: No score drift exists
  it('proof 5: Core KPI weights still sum to 1.0 — no scoring formula drift', async () => {
    const { DEFAULT_KPI_REGISTRY } = await import('./defaultKpiRegistry')
    const coreEntries = Object.values(DEFAULT_KPI_REGISTRY).filter((k: { isCore?: boolean }) => k.isCore)
    const weightSum = coreEntries.reduce((sum: number, k: { weight?: number }) => sum + (k.weight ?? 0), 0)
    expect(weightSum).toBeCloseTo(1.0, 5)
  })

  // Proof 6: No Firestore contract drift exists
  it('proof 6: this module performs zero Firestore reads/writes', () => {
    const selfSource = readFs.readFileSync(path.join(__dirname, 'architectureClosureV1.ts'), 'utf-8')
    expect(selfSource).not.toMatch(/firebase\/firestore/)
    expect(selfSource).not.toMatch(/collection\(|doc\(|setDoc|getDoc|updateDoc/)
  })

  // Proof 7: Full suite remains green — structural smoke check here;
  // actual full-suite execution is verified out-of-band (Part C / Task #85).
  it('proof 7: every dead-code audit finding has a recorded disposition (audit completeness)', () => {
    expect(isDeadCodeAuditComplete()).toBe(true)
    expect(DEAD_CODE_AUDIT_FINDINGS.length).toBeGreaterThan(0)
  })

  // Proof 8: Architecture freeze flags are active
  it('proof 8: architecture freeze flags are active for all 6 named layers', () => {
    expect(ARCHITECTURE_CLOSED_V1).toBe(true)
    expect(FROZEN_ARCHITECTURE_LAYERS).toEqual([
      'Core KPI Layer',
      'Registry Architecture',
      'Dynamic Reader Layer',
      'Evaluation Engine',
      'Profile Studio',
      'Offline Layer',
    ])
  })

  // Proof 9: Post-architecture roadmap is declared
  it('proof 9: post-architecture roadmap declares Data Exchange Studio as next phase', () => {
    const nextPhase = POST_ARCHITECTURE_ROADMAP.filter((m) => m.status === 'NEXT_PHASE')
    expect(nextPhase.map((m) => m.name)).toEqual([
      'Data Exchange Studio — Import Studio V1',
      'Data Exchange Studio — Export Studio V1',
      'Data Exchange Studio — Template Library',
      'Data Exchange Studio — Validation Engine',
    ])
    const future = POST_ARCHITECTURE_ROADMAP.filter((m) => m.status === 'FUTURE_ROADMAP')
    expect(future.map((m) => m.name)).toEqual(['AI Assistant V1'])
    const parkingLot = POST_ARCHITECTURE_ROADMAP.filter((m) => m.status === 'PARKING_LOT')
    expect(parkingLot).toHaveLength(5)
  })

  // Proof 10: Architecture Closed V1 status is achieved
  it('proof 10: getArchitectureClosureStatus() reports ARCHITECTURE_CLOSED_V1 achieved', () => {
    const status = getArchitectureClosureStatus()
    expect(status.architectureClosedV1).toBe(true)
    expect(status.registryAuthoritative).toBe(true)
    expect(status.coreKpiCompatibilityOnly).toBe(true)
    expect(status.evaluationEngineException).toBe('ACTIVE')
    expect(status.importEngineException).toBe('ACTIVE')
    expect(status.finalAuditClean).toBe(true)
    expect(status.deadCodeAuditComplete).toBe(true)
    expect(status.nextPhase).toBe('DATA_EXCHANGE_STUDIO')
  })

  // ── Part A re-audit structural checks ──────────────────────
  it('Part A: all 13 named surfaces are present in the final audit', () => {
    const surfaces = FINAL_ARCHITECTURE_AUDIT.map((e) => e.surface)
    expect(surfaces).toEqual([
      'Dashboard',
      'Regional Intelligence',
      'Branch Intelligence',
      'Team Intelligence',
      'Ranking Engine',
      'Executive BI',
      'Trend Engine',
      'Risk Engine',
      'Live Analytics',
      'Dynamic KPI Foundation',
      'Profile Studio',
      'Offline First',
      'Login V3',
    ])
  })

  it('Part A: final architecture audit is clean (no regressions, no unresolved findings)', () => {
    expect(isFinalArchitectureAuditClean()).toBe(true)
  })

  it('Part A: Profile Studio, Offline First, and Login V3 are confirmed out of scope, not migrated', () => {
    const outOfScope = FINAL_ARCHITECTURE_AUDIT.filter((e) => e.status === 'OUT_OF_SCOPE_CONFIRMED')
    expect(outOfScope.map((e) => e.surface)).toEqual(['Profile Studio', 'Offline First', 'Login V3'])
  })

  // ── Part B dead-code audit checks ──────────────────────────
  it('Part B: legacyEntryAdapter.ts comment-fix finding is recorded with COMMENT_CORRECTED disposition', () => {
    const finding = DEAD_CODE_AUDIT_FINDINGS.find((f) => f.file.includes('legacyEntryAdapter.ts'))
    expect(finding).toBeDefined()
    expect(finding!.disposition).toBe('COMMENT_CORRECTED')
  })

  it('Part B: no finding has a DELETE disposition — nothing was mass-deleted', () => {
    const dispositions = DEAD_CODE_AUDIT_FINDINGS.map((f) => f.disposition)
    expect(dispositions).not.toContain('DELETED')
  })

  it('Part B: the corrected legacyEntryAdapter.ts comment accurately reflects production wiring', () => {
    const source = readFs.readFileSync(
      path.resolve(__dirname, '../kpiCompatibility/legacyEntryAdapter.ts'),
      'utf-8',
    )
    expect(source).toMatch(/IS wired into production/)
    expect(source).not.toMatch(/NOT yet wired into any production read path\./)
  })

  // ── KPI_KEYS / isCoreKpiKey expansion-freeze guard ─────────
  // This file mentions "KPI_KEYS" once in prose (Part A note on Profile
  // Studio) — a documentation mention, not functional code. Same
  // precedent as dynamicKpiFoundation.ts / coreKpiDeprecationPrep.ts /
  // coreKpiRetirement.ts: it must be registered in the KPI_KEYS_IMPORTER_
  // BASELINE for the codebase-wide scan below to stay green. It must not
  // reference isCoreKpiKey at all (no allowlist entry needed for that).
  it('expansion freeze: architectureClosureV1.ts is registered in KPI_KEYS_IMPORTER_BASELINE and does not reference isCoreKpiKey', async () => {
    const { KPI_KEYS_IMPORTER_BASELINE } = await import('./coreKpiDeprecationPrep')
    const source = readFs.readFileSync(path.join(__dirname, 'architectureClosureV1.ts'), 'utf-8')
    expect(KPI_KEYS_IMPORTER_BASELINE).toContain('src/engine/kpiRegistry/architectureClosureV1.ts')
    expect(source.includes('isCoreKpiKey')).toBe(false)
  })

  it('expansion freeze: KPI_KEYS importers across the codebase are still a subset of the frozen baseline', async () => {
    const { KPI_KEYS_IMPORTER_BASELINE } = await import('./coreKpiDeprecationPrep')
    const files = collectSourceFiles(SRC_ROOT)
    const liveImporters = files
      .filter((f) => /\bKPI_KEYS\b/.test(readFs.readFileSync(f, 'utf-8')))
      .map(toRelative)
    for (const f of liveImporters) {
      expect(KPI_KEYS_IMPORTER_BASELINE).toContain(f)
    }
  })
})
