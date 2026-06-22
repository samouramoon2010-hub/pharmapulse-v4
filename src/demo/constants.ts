// ============================================================
// Demo Data Constants — RF-0E
// ============================================================

/** Firestore collection for demo batch metadata documents. */
export const DEMO_BATCHES_COLLECTION = 'demo_batches'

/**
 * KPI engine field names used in kpi_entries documents.
 * These match what the evaluation engine reads from Firestore.
 * Note: omnihealth → 'omni', wellnessCard → 'wellness' (aliased).
 */
export const DEMO_KPI_ENGINE_KEYS = [
  'wasfaty',
  'omni',        // omnihealth alias
  'wellness',    // wellnessCard alias
  'basket',
  'crossSelling',
  'sales',
  'sl',
  'ndf',
  'inbody',
] as const

export type DemoKpiEngineKey = typeof DEMO_KPI_ENGINE_KEYS[number]

/**
 * Target field names in the `targets` collection.
 * Convention: registryKey + 'Target', EXCEPT aliases which use engine key.
 */
export const DEMO_TARGET_FIELDS: Record<DemoKpiEngineKey, string> = {
  wasfaty:      'wasfatyTarget',
  omni:         'omniTarget',
  wellness:     'wellnessTarget',
  basket:       'basketTarget',
  crossSelling: 'crossSellingTarget',
  sales:        'salesTarget',
  sl:           'slTarget',
  ndf:          'ndfTarget',
  inbody:       'inbodyTarget',
}

/**
 * Realistic monthly base targets per KPI.
 * These are scaled by BranchSpec.targetMultiplier.
 */
export const BASE_BRANCH_TARGETS: Record<DemoKpiEngineKey, number> = {
  wasfaty:      500,
  omni:         300,
  wellness:     200,
  basket:       150,
  crossSelling: 100,
  sales:        50_000,
  sl:           80,
  ndf:          60,
  inbody:       40,
}

/**
 * Achievement % ranges by performer type.
 * Used to scale KPI actuals vs personal targets.
 */
export const PERFORMER_ACHIEVEMENT: Record<string, [number, number]> = {
  high:          [110, 130],
  average:       [85, 105],
  underperformer:[50, 80],
  missing_data:  [30, 60],
}

/**
 * Active days per month by performer type.
 */
export const PERFORMER_ACTIVE_DAYS: Record<string, [number, number]> = {
  high:          [24, 26],
  average:       [22, 25],
  underperformer:[20, 24],
  missing_data:  [10, 18],   // fewer entries = missing data
}

/**
 * Saudi city names for demo branches.
 */
export const DEMO_CITIES = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'مكة', 'المدينة', 'تبوك', 'أبها', 'القصيم', 'حائل']

/**
 * Demo pharmacist name pool (Arabic).
 */
export const DEMO_PHARMACIST_NAMES = [
  'أحمد الزهراني', 'سارة العمري', 'محمد القحطاني', 'نورة الغامدي',
  'عبدالله الحربي', 'رنا المالكي', 'خالد الشهري', 'منى الدوسري',
  'فيصل البلوي', 'ريم السبيعي', 'عمر الجهني', 'لمياء العتيبي',
  'ياسر الرشيدي', 'دلال الصاعدي', 'سعد الأحمدي', 'هدى التميمي',
  'عبدالعزيز الشمري', 'نوف القرني', 'تركي الحازمي', 'أميرة الزبيدي',
  'وليد الحميدي', 'أروى الباحوث', 'سلطان العصيمي', 'ميساء الخالدي',
  'ناصر الصالح', 'بسمة العبدلي', 'زياد المغامسي', 'حنان القريني',
  'راشد السالم', 'ابتسام الثبيتي',
]
