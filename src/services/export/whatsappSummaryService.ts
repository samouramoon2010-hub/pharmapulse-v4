// ============================================================
// Export Studio — WhatsApp Summary Builder (DX-11)
//
// Pure: ExportDataset -> formatted WhatsApp message + wa.me share
// URL. Follows the Export Studio pipeline convention: this module
// never fetches data, never recalculates KPIs, and never decides
// scope — it only formats an already-built, already-validated
// dataset. Sending is the user's explicit action (opening the
// wa.me link), never automatic.
//
// Content policy (mirrors CLAUDE.design.md):
// - No raw document IDs, no debug labels.
// - No fabricated thresholds: "top" and "lowest" groups are pure
//   rank positions within the dataset, not invented benchmarks.
// ============================================================
import type { ExportDataset, ExportSheetData, ExportMetricColumn, ExportValueUnit } from './exportTypes'

export type WhatsappSummaryLocale = 'ar' | 'en'

export interface WhatsappSummaryOptions {
  locale?: WhatsappSummaryLocale
  /** Rows shown in each of the top/lowest groups. */
  groupSize?: number
  /** Pre-filled recipient in international format, digits only (e.g. "9665xxxxxxxx"). */
  phone?: string
}

export interface WhatsappSummary {
  text: string
  shareUrl: string
  /** True when rows were omitted to respect the length budget. */
  truncated: boolean
}

/** WhatsApp renders poorly past a few screens; keep summaries scannable. */
export const WHATSAPP_TEXT_BUDGET = 3000

const LABELS: Record<WhatsappSummaryLocale, {
  scope: string; period: string; highlights: string; top: string; lowest: string;
  warnings: string; footer: string; rowsOmitted: (n: number) => string;
}> = {
  ar: {
    scope: 'النطاق',
    period: 'الفترة',
    highlights: 'أبرز النتائج',
    top: 'الأعلى أداءً',
    lowest: 'الأقل أداءً',
    warnings: 'تنبيهات',
    footer: 'تقرير PharmaPulse — للاستخدام الإداري الداخلي',
    rowsOmitted: (n) => `(+${n} صفوف أخرى في الملف الكامل)`,
  },
  en: {
    scope: 'Scope',
    period: 'Period',
    highlights: 'Highlights',
    top: 'Top performers',
    lowest: 'Lowest performers',
    warnings: 'Warnings',
    footer: 'PharmaPulse report — internal management use',
    rowsOmitted: (n) => `(+${n} more rows in the full file)`,
  },
}

export function formatWhatsappValue(value: string | number | null, unit: ExportValueUnit): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value !== 'number') return String(value)
  if (unit === 'percentage') return `${(Math.round(value * 10) / 10).toLocaleString('en-US')}%`
  if (unit === 'currency') return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`
  return value.toLocaleString('en-US')
}

/** First sheet with both a label column and a percentage column wins;
 *  falls back to the first sheet with any numeric column. */
export function pickPrimarySheet(dataset: ExportDataset): ExportSheetData | null {
  const hasLabel = (s: ExportSheetData) => s.columns.some((c) => !c.numeric)
  const withPct = dataset.sheets.find((s) => hasLabel(s) && s.columns.some((c) => c.numeric && c.unit === 'percentage') && s.rows.length > 0)
  if (withPct) return withPct
  return dataset.sheets.find((s) => hasLabel(s) && s.columns.some((c) => c.numeric) && s.rows.length > 0) ?? null
}

export function pickMetricColumn(sheet: ExportSheetData): ExportMetricColumn | null {
  return sheet.columns.find((c) => c.numeric && c.unit === 'percentage')
    ?? sheet.columns.find((c) => c.numeric)
    ?? null
}

export function pickLabelColumn(sheet: ExportSheetData): ExportMetricColumn | null {
  return sheet.columns.find((c) => !c.numeric) ?? null
}

function rankedRows(sheet: ExportSheetData, metricKey: string) {
  return [...sheet.rows]
    .filter((r) => typeof r[metricKey] === 'number')
    .sort((a, b) => (b[metricKey] as number) - (a[metricKey] as number))
}

export function buildWhatsappSummary(dataset: ExportDataset, options: WhatsappSummaryOptions = {}): WhatsappSummary {
  const locale = options.locale ?? 'ar'
  const groupSize = Math.max(1, options.groupSize ?? 3)
  const L = LABELS[locale]

  const lines: string[] = []
  lines.push(`📊 *${dataset.meta.templateName}*`)
  lines.push(`🏢 ${L.scope}: ${dataset.meta.scopeLabel}`)
  lines.push(`📅 ${L.period}: ${dataset.meta.periodLabel}`)

  let truncated = false
  const sheet = pickPrimarySheet(dataset)
  if (sheet) {
    const metric = pickMetricColumn(sheet)
    const label = pickLabelColumn(sheet)
    if (metric && label) {
      const ranked = rankedRows(sheet, metric.key)
      if (ranked.length > 0) {
        lines.push('')
        lines.push(`*${L.highlights}* — ${metric.header}`)
        const top = ranked.slice(0, groupSize)
        lines.push(`🏆 ${L.top}:`)
        top.forEach((r, i) => {
          lines.push(`  ${i + 1}. ${r[label.key] ?? '—'} — ${formatWhatsappValue(r[metric.key], metric.unit)}`)
        })
        // Show a lowest group only when it doesn't overlap the top group.
        if (ranked.length > groupSize * 2) {
          const bottom = ranked.slice(-groupSize).reverse()
          lines.push(`⚠️ ${L.lowest}:`)
          bottom.forEach((r) => {
            lines.push(`  • ${r[label.key] ?? '—'} — ${formatWhatsappValue(r[metric.key], metric.unit)}`)
          })
          const shown = groupSize * 2
          if (ranked.length > shown) {
            truncated = true
            lines.push(`  _${L.rowsOmitted(ranked.length - shown)}_`)
          }
        }
      }
    }
  }

  if (dataset.meta.warnings.length > 0) {
    lines.push('')
    lines.push(`⚠️ *${L.warnings}:*`)
    dataset.meta.warnings.forEach((w) => lines.push(`  • ${w}`))
  }

  lines.push('')
  lines.push(`_${L.footer}_`)

  let text = lines.join('\n')
  if (text.length > WHATSAPP_TEXT_BUDGET) {
    text = `${text.slice(0, WHATSAPP_TEXT_BUDGET - 1)}…`
    truncated = true
  }

  const base = options.phone ? `https://wa.me/${options.phone}` : 'https://wa.me/'
  const shareUrl = `${base}?text=${encodeURIComponent(text)}`
  return { text, shareUrl, truncated }
}
