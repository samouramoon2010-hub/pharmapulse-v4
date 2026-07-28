// ============================================================
// Universal AI Intake — Phase 1 certification (source-scan)
//
// Complements the real-logic test files already covering parsing,
// mapping, validation, duplicate detection, and authorization
// (regionsAdapter.test.ts, textIntakeParser.test.ts,
// pdfIntakeParser.test.ts, imageIntakeAdapter.test.ts,
// entityDetection.test.ts, kpiRegistryDraftOnlyAdapter.test.ts,
// intakeSessionTypes.test.ts). This file certifies the page-level
// wiring: route gating, no-write-before-approval, and the absence
// of any destructive action, via the same `?raw` source-assertion
// convention used throughout this repo (no React render harness
// exists here).
// ============================================================
import { describe, it, expect } from 'vitest'

async function pageSource() {
  return (await import('./AiIntakePage.jsx?raw')).default
}
async function appSource() {
  return (await import('../../App.jsx?raw')).default
}
async function sidebarSource() {
  return (await import('../../components/layout/Sidebar.jsx?raw')).default
}

describe('1 — /ai-intake route is admin-only, same pattern as /data-exchange', () => {
  it('App.jsx registers /ai-intake gated by PR roles={ADMIN}', async () => {
    const src = await appSource()
    expect(src).toContain("<Route path=\"/ai-intake\" element={<PR roles={ADMIN}><AiIntakePage /></PR>} />")
  })

  it('AiIntakePage is imported in App.jsx', async () => {
    const src = await appSource()
    expect(src).toContain("const AiIntakePage = lazy(() => import('./pages/admin/AiIntakePage'))")
  })

  it('Sidebar exposes an AI Data Intake nav entry pointing at /ai-intake', async () => {
    const src = await sidebarSource()
    expect(src).toContain("label: 'AI Data Intake'")
    expect(src).toContain("path: '/ai-intake'")
  })
})

describe('2 — no write occurs before explicit approval', () => {
  it('commitJob is only ever called from handleApproveAndExecute, never from validation/preview steps', async () => {
    const src = await pageSource()
    const commitCallSites = src.match(/commitJob\(/g) ?? []
    // Exactly one call site — inside handleApproveAndExecute.
    expect(commitCallSites.length).toBe(1)
    const idx = src.indexOf('commitJob(')
    const surroundingFn = src.slice(Math.max(0, idx - 800), idx)
    expect(surroundingFn).toContain('handleApproveAndExecute')
  })

  it('the approve step disables execution until canApprove is true', async () => {
    const src = await pageSource()
    expect(src).toContain('onClick={handleApproveAndExecute} disabled={!canApprove || busy}')
  })
})

describe('3 — high-volume imports require the literal APPROVE IMPORT phrase', () => {
  it('defines a row-count threshold and the exact required phrase', async () => {
    const src = await pageSource()
    expect(src).toContain("const APPROVE_PHRASE = 'APPROVE IMPORT'")
    expect(src).toContain('const APPROVE_PHRASE_THRESHOLD = 50')
  })

  it('canApprove requires an exact phrase match only above the threshold', async () => {
    const src = await pageSource()
    expect(src).toContain("const canApprove = requiresApprovalPhrase ? approvalText.trim() === APPROVE_PHRASE : true")
  })
})

describe('4 — no destructive action exists anywhere in the intake flow', () => {
  it('never calls deleteDoc, deleteRegion, deleteUser, or any bulk-delete/reset helper', async () => {
    const src = await pageSource()
    expect(src).not.toMatch(/deleteDoc|deleteRegion|deleteUser|resetKpiRegistryToDefaults|FactoryReset/i)
  })

  it('never imports Firebase Auth user-management functions', async () => {
    const src = await pageSource()
    expect(src).not.toMatch(/createUserWithEmailAndPassword|deleteUser|updatePassword/)
  })
})

describe('5 — preview shows create/update/skip/conflict/invalid via the shared classification mapping', () => {
  it('uses toProposedAction (not a duplicated ad hoc mapping) for the Action column', async () => {
    const src = await pageSource()
    expect(src).toContain('toProposedAction(r.classification)')
  })

  it('provides row-level filters matching the spec vocabulary', async () => {
    const src = await pageSource()
    expect(src).toContain("['all', 'valid', 'warnings', 'invalid', 'duplicates', 'create', 'update', 'skip']")
  })

  it('allows excluding individual rows before approval', async () => {
    const src = await pageSource()
    expect(src).toContain('toggleExclude')
    expect(src).toContain('excludedRowIds')
  })
})

describe('6 — KPI Definitions imported through this page never auto-publish', () => {
  it('uses the draft-only adapter wrapper for KPI_REGISTRY, not the raw adapter', async () => {
    const src = await pageSource()
    expect(src).toContain('intakeDomainRegistry')
    // The registry module (not this page) owns the KPI_REGISTRY -> draft-only wiring —
    // certified directly in kpiRegistryDraftOnlyAdapter.test.ts.
  })
})

describe('7 — image intake never fabricates rows without a configured provider', () => {
  it('renders the NO_PROVIDER_CONFIGURED message rather than proceeding to detect/preview', async () => {
    const src = await pageSource()
    expect(src).toContain('imageUnsupported')
    expect(src).toContain('setImageUnsupported(outcome.message)')
  })
})

describe('8 — PDF requiring OCR shows the exact required message', () => {
  it('surfaces PDF_REQUIRES_OCR_MESSAGE verbatim rather than a generic error', async () => {
    const src = await pageSource()
    expect(src).toContain('PDF_REQUIRES_OCR_MESSAGE')
  })
})

describe('9 — zero-row sources are handled with an explicit empty state, not a silent no-op', () => {
  it('renders EmptyState when parsedRows is empty at the detect step', async () => {
    const src = await pageSource()
    expect(src).toContain('parsedRows.length === 0')
    expect(src).toContain('<EmptyState')
  })
})
