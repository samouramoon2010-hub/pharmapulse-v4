// ============================================================
// Scenario: standard_mixed_environment
// RF-0E v1
//
// 10 branches × 3 pharmacists = 30 pharmacists
// 1 month of data
// Realistic performance variation
// ============================================================

import type { ScenarioDefinition } from './types'

/**
 * Branch distribution:
 *   3 × Destination  (high-footfall, higher targets)
 *   3 × Hub          (anchor, highest targets)
 *   2 × Provider     (prescription-focused)
 *   2 × Neighbourhood (community)
 */
const BRANCHES = [
  // Hub (3)
  { classificationId: 'hub',           namePrefix: 'فرع المركز',     codePrefix: 'HUB', targetMultiplier: 1.4 },
  { classificationId: 'hub',           namePrefix: 'فرع الرئيسي',   codePrefix: 'HUB', targetMultiplier: 1.3 },
  { classificationId: 'hub',           namePrefix: 'فرع المحور',    codePrefix: 'HUB', targetMultiplier: 1.35 },
  // Destination (3)
  { classificationId: 'destination',   namePrefix: 'فرع الوجهة',    codePrefix: 'DST', targetMultiplier: 1.2 },
  { classificationId: 'destination',   namePrefix: 'فرع التجاري',   codePrefix: 'DST', targetMultiplier: 1.15 },
  { classificationId: 'destination',   namePrefix: 'فرع الميلاد',   codePrefix: 'DST', targetMultiplier: 1.1 },
  // Provider (2)
  { classificationId: 'provider',      namePrefix: 'فرع المزود',    codePrefix: 'PRV', targetMultiplier: 1.0 },
  { classificationId: 'provider',      namePrefix: 'فرع الصرف',     codePrefix: 'PRV', targetMultiplier: 0.95 },
  // Neighbourhood (2)
  { classificationId: 'neighbourhood', namePrefix: 'فرع الحي',      codePrefix: 'NBR', targetMultiplier: 0.85 },
  { classificationId: 'neighbourhood', namePrefix: 'فرع السكني',    codePrefix: 'NBR', targetMultiplier: 0.80 },
]

/**
 * Pharmacist performance pattern per branch.
 * 3 pharmacists: [performer_1, performer_2, performer_3]
 *
 * Design: each branch has a mix of performance levels so
 * the ranking engine can produce meaningful differentiation.
 */
const PHARMACIST_PATTERN_BY_CLASS: Record<string, ('high' | 'average' | 'underperformer' | 'missing_data')[]> = {
  hub:           ['high', 'average', 'underperformer'],
  destination:   ['high', 'average', 'underperformer'],
  provider:      ['average', 'average', 'missing_data'],
  neighbourhood: ['high', 'underperformer', 'missing_data'],
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * The standard_mixed_environment scenario.
 * Generates data for the CURRENT month by default.
 * Pass a custom month to seed historical periods.
 */
export function createStandardMixedScenario(month?: string): ScenarioDefinition {
  const targetMonth = month ?? currentMonth()

  return {
    name:                 'standard_mixed_environment',
    month:                targetMonth,
    pharmacistsPerBranch: 3,
    branches:             BRANCHES,
    performerDistribution: ['high', 'average', 'underperformer'],   // default; overridden per classification
  }
}

export { PHARMACIST_PATTERN_BY_CLASS }
