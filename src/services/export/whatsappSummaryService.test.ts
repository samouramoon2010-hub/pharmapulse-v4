// ============================================================
// Export Studio — WhatsApp Summary Builder tests (DX-11)
// ============================================================
import { describe, it, expect } from 'vitest'
import type { ExportDataset } from './exportTypes'
import {
  buildWhatsappSummary, formatWhatsappValue,
  pickPrimarySheet, pickMetricColumn, pickLabelColumn,
  WHATSAPP_TEXT_BUDGET,
} from './whatsappSummaryService'

function makeDataset(overrides: Partial<ExportDataset> = {}): ExportDataset {
  return {
    meta: {
      templateId: 'branch-performance',
      templateName: 'Branch Performance',
      workbookVersion: 'v1',
      scopeLabel: 'فرع مدينة الرياض',
      periodLabel: '2026-06',
      generatedAt: '2026-07-02 10:00',
      generatedBy: 'admin-1',
      rowCount: 5,
      warnings: [],
    },
    sheets: [{
      sheetName: 'KPI Summary',
      columns: [
        { key: 'kpi', header: 'KPI', unit: 'number', numeric: false },
        { key: 'ach', header: 'Achievement %', unit: 'percentage', numeric: true },
      ],
      rows: [
        { kpi: 'Wasfaty', ach: 92.4 },
        { kpi: 'OmniHealth', ach: 71.0 },
        { kpi: 'Baskets', ach: 55.5 },
        { kpi: 'Cross Selling', ach: 44.2 },
        { kpi: 'Referrals', ach: 103.8 },
        { kpi: 'Digital', ach: 12.5 },
        { kpi: 'Consultation', ach: 88.0 },
      ],
    }],
    definitions: [],
    ...overrides,
  }
}

describe('DX-11 — WhatsApp summary builder', () => {
  it('produces a bold title, scope, and period header', () => {
    const { text } = buildWhatsappSummary(makeDataset())
    expect(text).toContain('*Branch Performance*')
    expect(text).toContain('فرع مدينة الرياض')
    expect(text).toContain('2026-06')
  })

  it('ranks top performers descending and lowest ascending-from-worst', () => {
    const { text } = buildWhatsappSummary(makeDataset())
    const topIdx = text.indexOf('Referrals')     // 103.8 — highest
    const secondIdx = text.indexOf('Wasfaty')    // 92.4 — second
    expect(topIdx).toBeGreaterThan(-1)
    expect(topIdx).toBeLessThan(secondIdx)
    expect(text).toContain('Digital — 12.5%')    // worst appears in lowest group
  })

  it('percentage values render on the 0-100 scale with a % sign', () => {
    const { text } = buildWhatsappSummary(makeDataset())
    expect(text).toContain('103.8%')
    expect(text).not.toContain('10380')
  })

  it('omits the lowest group when rows would overlap the top group', () => {
    const ds = makeDataset()
    ds.sheets[0].rows = ds.sheets[0].rows.slice(0, 4) // 4 rows, groupSize 3 → overlap
    const { text } = buildWhatsappSummary(ds)
    expect(text).toContain('🏆')
    expect(text).not.toContain('⚠️ الأقل أداءً')
  })

  it('includes dataset warnings verbatim', () => {
    const ds = makeDataset()
    ds.meta.warnings = ['3 branches missing targets']
    const { text } = buildWhatsappSummary(ds)
    expect(text).toContain('3 branches missing targets')
  })

  it('supports English locale labels', () => {
    const { text } = buildWhatsappSummary(makeDataset(), { locale: 'en' })
    expect(text).toContain('Top performers')
    expect(text).toContain('Period')
  })

  it('builds a wa.me share URL with the text URL-encoded', () => {
    const { shareUrl } = buildWhatsappSummary(makeDataset())
    expect(shareUrl.startsWith('https://wa.me/?text=')).toBe(true)
    expect(shareUrl).not.toContain('\n')
    expect(decodeURIComponent(shareUrl.split('?text=')[1])).toContain('*Branch Performance*')
  })

  it('prefixes the phone number when provided', () => {
    const { shareUrl } = buildWhatsappSummary(makeDataset(), { phone: '966500000000' })
    expect(shareUrl.startsWith('https://wa.me/966500000000?text=')).toBe(true)
  })

  it('never exceeds the text budget', () => {
    const ds = makeDataset()
    ds.meta.warnings = Array.from({ length: 200 }, (_, i) => `warning ${i} `.repeat(5))
    const summary = buildWhatsappSummary(ds)
    expect(summary.text.length).toBeLessThanOrEqual(WHATSAPP_TEXT_BUDGET)
    expect(summary.truncated).toBe(true)
  })

  it('handles a dataset with no usable sheet gracefully', () => {
    const ds = makeDataset({ sheets: [] })
    const { text } = buildWhatsappSummary(ds)
    expect(text).toContain('*Branch Performance*')
    expect(text).not.toContain('🏆')
  })

  it('formatWhatsappValue formats units correctly', () => {
    expect(formatWhatsappValue(87.55, 'percentage')).toBe('87.6%')
    expect(formatWhatsappValue(12500, 'count')).toBe('12,500')
    expect(formatWhatsappValue(999.5, 'currency')).toBe('999.50 SAR')
    expect(formatWhatsappValue(null, 'number')).toBe('—')
  })

  it('column pickers prefer percentage metric and non-numeric label', () => {
    const sheet = makeDataset().sheets[0]
    expect(pickMetricColumn(sheet)?.key).toBe('ach')
    expect(pickLabelColumn(sheet)?.key).toBe('kpi')
    expect(pickPrimarySheet(makeDataset())?.sheetName).toBe('KPI Summary')
  })
})
