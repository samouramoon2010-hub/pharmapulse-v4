// ============================================================
// Universal AI Intake — Phase 2 UI integration certification
//
// Source-scan checks for the read-only Connector Sessions section
// added to AiIntakePage.jsx — same `?raw` convention as
// aiIntakePhase1Certification.test.ts. Complements the real-logic
// connector test suite under src/services/connector/.
// ============================================================
import { describe, it, expect } from 'vitest'

async function pageSource() {
  return (await import('./AiIntakePage.jsx?raw')).default
}

describe('1 — Connector Sessions section is read-only', () => {
  it('reuses the existing listRecentImportJobs read, not a new access path', async () => {
    const src = await pageSource()
    expect(src).toContain("import { listRecentImportJobs } from '../../services/dataExchange/firestoreStagingRepository'")
    expect(src).toContain('listRecentImportJobs(25)')
  })

  it('never calls a write function (setDoc/addDoc/updateDoc/deleteDoc/commitJob) from ConnectorSessionsSection', async () => {
    const src = await pageSource()
    const sectionStart = src.indexOf('function ConnectorSessionsSection()')
    expect(sectionStart).toBeGreaterThan(-1)
    const sectionSrc = src.slice(sectionStart, src.indexOf('\n}', src.lastIndexOf('return (', src.length)) + 2)
    expect(sectionSrc).not.toMatch(/setDoc|addDoc|updateDoc|deleteDoc|commitJob/)
  })
})

describe('2 — sessions are labeled by connector source type, not the browser upload path', () => {
  it('filters on the connector-specific source type vocabulary', async () => {
    const src = await pageSource()
    expect(src).toContain("'chatgpt_structured', 'excel_extracted', 'csv_extracted', 'pdf_extracted', 'image_extracted', 'plain_text_extracted'")
  })

  it('displays "ChatGPT Connector" as the source label', async () => {
    const src = await pageSource()
    expect(src).toContain('ChatGPT Connector')
  })
})

describe('3 — the section renders an explicit empty state, not a silent blank', () => {
  it('shows EmptyState when no connector sessions exist', async () => {
    const src = await pageSource()
    expect(src).toContain('title="No connector sessions yet"')
  })
})

describe('4 — the page does not redesign unrelated existing sections', () => {
  it('ConnectorSessionsSection is additive — appended after the step wizard, not replacing it', async () => {
    const src = await pageSource()
    const wizardIdx = src.indexOf("step === 'result'")
    const sectionIdx = src.indexOf('<ConnectorSessionsSection')
    expect(wizardIdx).toBeGreaterThan(-1)
    expect(sectionIdx).toBeGreaterThan(wizardIdx)
  })
})
