// ============================================================
// Default KPI Registry
// Single source of truth for all KPI definitions in PharmaPulse.
//
// PRODUCTION KPIs (active + core, weights sum to 1.0):
//   wasfaty, omnihealth, wellnessCard, basket, crossSelling
//
// PRODUCTION KPIs NOT YET ENGINE-INTEGRATED (active, weight 0):
//   sales, sl, ndf, inbody, liberation
//
// ALIAS MAPPING:
//   omnihealth.aliasFor = 'omni'       (engine field name)
//   wellnessCard.aliasFor = 'wellness'  (engine field name)
//   All other keys are identical in registry and engine.
//
// Rules:
//   • Never remove or deactivate existing production KPIs
//   • Weights of isActive+isCore KPIs must sum to 1.0
//   • isActive: false only for KPIs not yet collected at all
//   • aliasFor = internal engine field when name differs from key
// ============================================================

import type { KpiRegistry } from './kpiRegistryTypes'

// ── Shared threshold presets ──────────────────────────────────

const PRESCRIPTION_THRESHOLDS = { healthy: 95, watch: 80, risk: 65, critical: 45 } as const
const STANDARD_THRESHOLDS     = { healthy: 95, watch: 80, risk: 60, critical: 40 } as const
const PROGRAMME_THRESHOLDS    = { healthy: 90, watch: 70, risk: 50, critical: 30 } as const
const REVENUE_THRESHOLDS      = { healthy: 95, watch: 85, risk: 70, critical: 50 } as const
const SERVICE_THRESHOLDS      = { healthy: 98, watch: 95, risk: 90, critical: 85 } as const

// ── Visibility presets ────────────────────────────────────────

const ALL_SURFACES    = { dashboardEnabled: true,  teamEnabled: true,  executiveEnabled: true,  regionalEnabled: true  } as const
const BRANCH_ONLY     = { dashboardEnabled: true,  teamEnabled: true,  executiveEnabled: false, regionalEnabled: false } as const
const DASHBOARD_ONLY  = { dashboardEnabled: true,  teamEnabled: false, executiveEnabled: false, regionalEnabled: false } as const

// ── Default Registry ─────────────────────────────────────────
//
// Weights for active core KPIs:
//   wasfaty:      0.25
//   omnihealth:   0.20  (engine alias: omni)
//   wellnessCard: 0.20  (engine alias: wellness)
//   basket:       0.20
//   crossSelling: 0.15
//   ─────────────────
//   Total:        1.00  ✓

export const DEFAULT_KPI_REGISTRY: KpiRegistry = {

  // ════════════════════════════════════════════════════════
  // SECTION A — ACTIVE CORE KPIs
  // Integrated in Firestore + kpiAnalyticsEngine + all engines
  // ════════════════════════════════════════════════════════

  wasfaty: {
    key:        'wasfaty',
    label:      'Wasfaty',
    shortLabel: 'Wasfaty',
    labelAr:    'وصفتي',
    // aliasFor: undefined — registry key IS the engine key
    category:   'prescription',
    valueType:  'count',
    unit:       'prescriptions',
    unitAr:     'وصفة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0.25,
    isActive:   true,
    isCore:     true,
    thresholds: PRESCRIPTION_THRESHOLDS,
    visibility: ALL_SURFACES,
    sortOrder:  10,
    description: 'Wasfaty e-prescription fulfilment — count of digital prescriptions processed per month.',
  },

  omnihealth: {
    key:        'omnihealth',
    label:      'OmniHealth',
    shortLabel: 'Omni',
    labelAr:    'أومني هيلث',
    // aliasFor: 'omni' — engine reads/writes the 'omni' Firestore field;
    // the platform uses 'omnihealth' as the business-facing key.
    aliasFor:   'omni',
    category:   'digital',
    valueType:  'count',
    unit:       'units',
    unitAr:     'وحدة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0.20,
    isActive:   true,
    isCore:     true,
    thresholds: STANDARD_THRESHOLDS,
    visibility: ALL_SURFACES,
    sortOrder:  20,
    description: 'OmniHealth digital health programme — units dispensed or enrolled per month. Engine field: omni.',
  },

  wellnessCard: {
    key:        'wellnessCard',
    label:      'Wellness Card',
    shortLabel: 'Wellness',
    labelAr:    'بطاقة ويلنس',
    // aliasFor: 'wellness' — engine reads/writes the 'wellness' Firestore field;
    // the platform uses 'wellnessCard' as the business-facing key.
    aliasFor:   'wellness',
    category:   'wellness',
    valueType:  'count',
    unit:       'units',
    unitAr:     'وحدة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0.20,
    isActive:   true,
    isCore:     true,
    thresholds: STANDARD_THRESHOLDS,
    visibility: ALL_SURFACES,
    sortOrder:  30,
    description: 'Wellness product sales and wellness card activations. Engine field: wellness.',
  },

  basket: {
    key:        'basket',
    label:      'Basket Size',
    shortLabel: 'Basket',
    labelAr:    'متوسط السلة',
    // aliasFor: undefined — registry key IS the engine key
    category:   'commercial',
    valueType:  'currency',
    unit:       'SAR',
    unitAr:     'ر.س',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0.20,
    isActive:   true,
    isCore:     true,
    thresholds: REVENUE_THRESHOLDS,
    visibility: ALL_SURFACES,
    sortOrder:  40,
    description: 'Average transaction basket size in SAR — measures upsell and product mix effectiveness.',
  },

  crossSelling: {
    key:        'crossSelling',
    label:      'Cross Selling',
    shortLabel: 'Cross-Sell',
    labelAr:    'البيع المتقاطع',
    // aliasFor: undefined — registry key IS the engine key
    category:   'commercial',
    valueType:  'count',
    unit:       'transactions',
    unitAr:     'معاملة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0.15,
    isActive:   true,
    isCore:     true,
    thresholds: STANDARD_THRESHOLDS,
    visibility: ALL_SURFACES,
    sortOrder:  50,
    description: 'Cross-selling transactions — count of transactions where a complementary product was added.',
  },

  // ════════════════════════════════════════════════════════
  // SECTION B — ACTIVE NON-CORE KPIs
  // Recognised production KPIs not yet in the weighted composite.
  // Collected and tracked but weight=0 until formally promoted.
  // ════════════════════════════════════════════════════════

  sales: {
    key:        'sales',
    label:      'Sales Revenue',
    shortLabel: 'Sales',
    labelAr:    'المبيعات',
    category:   'commercial',
    valueType:  'currency',
    unit:       'SAR',
    unitAr:     'ر.س',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,
    thresholds: REVENUE_THRESHOLDS,
    visibility: BRANCH_ONLY,
    sortOrder:  60,
    description: 'Total sales revenue in SAR — overall monthly pharmacy revenue target.',
  },

  sl: {
    key:        'sl',
    label:      'Service Level',
    shortLabel: 'SL',
    labelAr:    'مستوى الخدمة',
    category:   'operational',
    valueType:  'percentage',
    unit:       '%',
    unitAr:     '٪',
    direction:  'higher_is_better',
    targetType: 'percentage',
    weight:     0,
    isActive:   true,
    isCore:     false,
    thresholds: SERVICE_THRESHOLDS,
    visibility: BRANCH_ONLY,
    sortOrder:  70,
    description: 'Service level — percentage of customer requests fulfilled without stock-outs or delays.',
  },

  ndf: {
    key:        'ndf',
    label:      'NDF Programme',
    shortLabel: 'NDF',
    labelAr:    'برنامج السكري',
    category:   'health_program',
    valueType:  'count',
    unit:       'patients',
    unitAr:     'مريض',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,
    thresholds: PROGRAMME_THRESHOLDS,
    visibility: BRANCH_ONLY,
    sortOrder:  80,
    description: 'National Diabetes Framework — patients enrolled or followed up under the NDF programme.',
  },

  inbody: {
    key:        'inbody',
    label:      'InBody Scan',
    shortLabel: 'InBody',
    labelAr:    'جهاز إن بودي',
    category:   'health_program',
    valueType:  'count',
    unit:       'scans',
    unitAr:     'فحص',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,
    thresholds: PROGRAMME_THRESHOLDS,
    visibility: DASHBOARD_ONLY,
    sortOrder:  90,
    description: 'InBody body composition scans — number of InBody assessments conducted per month.',
  },

  liberation: {
    key:        'liberation',
    label:      'Liberation',
    shortLabel: 'Lib',
    labelAr:    'ليبريشن',
    category:   'prescription',
    valueType:  'count',
    unit:       'prescriptions',
    unitAr:     'وصفة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,
    thresholds: PRESCRIPTION_THRESHOLDS,
    visibility: BRANCH_ONLY,
    sortOrder:  100,
    description: 'Liberation — branded e-prescription programme fulfilment count.',
  },

} satisfies KpiRegistry

// ── Engine alias map ──────────────────────────────────────────
/**
 * Forward lookup: business key → engine key.
 * Used by Phase 4C-0B engine integration to translate KPI keys
 * when reading from / writing to the kpiAnalyticsEngine layer.
 *
 * Keys not present in this map are identical in both registry and engine.
 */
export const KPI_ENGINE_ALIAS_MAP: Record<string, string> = {
  omnihealth:   'omni',
  wellnessCard: 'wellness',
} as const

/**
 * Reverse lookup: engine key → business key.
 * Used when translating engine output back to registry terminology.
 */
export const KPI_ENGINE_REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(KPI_ENGINE_ALIAS_MAP).map(([biz, eng]) => [eng, biz]),
) as Record<string, string>

// ── Derived constants ─────────────────────────────────────────

/** All registry keys sorted by sortOrder */
export const DEFAULT_ALL_KPI_KEYS: string[] = Object.values(DEFAULT_KPI_REGISTRY)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((kpi) => kpi.key)

/** Active KPI keys (all sections A + B) */
export const DEFAULT_ACTIVE_KPI_KEYS: string[] = Object.values(DEFAULT_KPI_REGISTRY)
  .filter((kpi) => kpi.isActive)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((kpi) => kpi.key)

/** Core KPI keys (Section A only — weighted composite) */
export const DEFAULT_CORE_KPI_KEYS: string[] = Object.values(DEFAULT_KPI_REGISTRY)
  .filter((kpi) => kpi.isCore)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((kpi) => kpi.key)

/** Engine keys for all active core KPIs (resolving aliases) */
export const DEFAULT_CORE_ENGINE_KEYS: string[] = Object.values(DEFAULT_KPI_REGISTRY)
  .filter((kpi) => kpi.isCore)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((kpi) => kpi.aliasFor ?? kpi.key)
