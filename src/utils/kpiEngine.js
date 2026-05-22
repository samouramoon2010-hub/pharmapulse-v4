// ============================================================
// KPI Engine — Traffic Light + Run Rate + Daily Mission
// Rule-based (AI-ready: swap getMission() for API call later)
// ============================================================

// ── 1. Day progress calculation ───────────────────────────────
export function getDayProgress() {
  const today = new Date()
  const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysPassed = today.getDate()
  return { daysPassed, totalDays, ratio: daysPassed / totalDays }
}

// ── 2. Traffic Light ─────────────────────────────────────────
// Returns: 'excellent' | 'good' | 'warning' | 'critical'
// Logic:
//   - Expected achievement by now = dayProgress.ratio * 100%
//   - Compare actual % vs expected %
//   - Ahead ≥ 5% → excellent
//   - Between -5% to +5% → good
//   - Behind 5–15% → warning
//   - Behind > 15% → critical
export function getTrafficLight(actualPct, dayRatio) {
  if (actualPct == null || dayRatio == null) return 'critical'
  const expected  = dayRatio * 100           // what we should have by today
  const delta     = actualPct - expected     // how far ahead/behind

  if (delta >= 5)          return 'excellent'
  if (delta >= -5)         return 'good'
  if (delta >= -15)        return 'warning'
  return 'critical'
}

export const TRAFFIC_COLORS = {
  excellent: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  label: 'Excellent', labelAr: 'ممتاز',  icon: '🟢' },
  good:      { color: '#1a9a7e', bg: 'rgba(26,154,126,0.12)', border: 'rgba(26,154,126,0.25)', label: 'On Track',  labelAr: 'على المسار', icon: '🔵' },
  warning:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', label: 'Warning',   labelAr: 'تحذير', icon: '🟡' },
  critical:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)',  label: 'Critical',  labelAr: 'حرج',   icon: '🔴' },
}

// ── 3. Run Rate Forecast ─────────────────────────────────────
// Given actual value so far + days passed → project end of month
export function getRunRateForecast(actualValue, target, daysPassed, totalDays) {
  if (!daysPassed || !totalDays || !target) return null
  const dailyRate        = actualValue / daysPassed
  const projected        = dailyRate * totalDays
  const projectedAchPct  = Math.round((projected / target) * 100)
  const actualAchPct     = Math.round((actualValue / target) * 100)
  const dayRatio         = daysPassed / totalDays
  const status           = getTrafficLight(actualAchPct, dayRatio)

  return {
    dailyRate:      Math.round(dailyRate * 10) / 10,
    projected:      Math.round(projected),
    projectedAchPct,
    actualAchPct,
    status,
    colors:         TRAFFIC_COLORS[status],
  }
}

// ── 4. Compute KPI stats from entries ─────────────────────────
export function computeKpiStats(entries, kpiKey, target, daysPassed, totalDays) {
  const total  = entries.reduce((s, e) => s + (e[kpiKey] || 0), 0)
  const achPct = target > 0 ? Math.round((total / target) * 100) : 0
  const dayRatio = daysPassed / totalDays
  const status   = getTrafficLight(achPct, dayRatio)
  const forecast = getRunRateForecast(total, target, daysPassed, totalDays)

  return { total, achPct, status, forecast, colors: TRAFFIC_COLORS[status] }
}

// ── 5. Daily Mission (Rule-based, AI-ready) ──────────────────
// Returns a mission object for a pharmacist based on their weakest KPI
const KPI_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
const KPI_LABELS = {
  wasfaty:      { en: 'Wasfaty', ar: 'وصفتي' },
  omni:         { en: 'OmniHealth', ar: 'أومني هيلث' },
  wellness:     { en: 'Wellness', ar: 'ويلنس' },
  basket:       { en: 'Basket Size', ar: 'متوسط السلة' },
  crossSelling: { en: 'Cross Selling', ar: 'البيع المتقاطع' },
}

const MOTIVATIONAL = [
  "Every prescription is a patient's trust — make it count.",
  'Small consistent efforts compound into great results.',
  "Today's effort is tomorrow's achievement.",
  'Focus on one thing: be better than yesterday.',
  'Your team is counting on you. Lead by example.',
  'Consistency beats intensity every day.',
]

const ACTIONS = {
  wasfaty:      'Review pending e-prescriptions and process them before midday.',
  omni:         'Offer OmniHealth options to every customer with a chronic condition.',
  wellness:     'Display wellness products at the counter and mention them proactively.',
  basket:       'Suggest complementary items for each purchase (vitamins, supplements).',
  crossSelling: 'For every transaction, identify one cross-sell opportunity.',
}

export function getDailyMission(todayEntries, monthEntries, targets) {
  // Find weakest KPI by achievement %
  const kpiStats = KPI_KEYS.map((k) => {
    const todayVal = todayEntries.reduce((s, e) => s + (e[k] || 0), 0)
    const monthVal = monthEntries.reduce((s, e) => s + (e[k] || 0), 0)
    const target   = targets?.[`${k}Target`] || 0
    const ach      = target > 0 ? Math.round((monthVal / target) * 100) : 0
    return { key: k, ach, todayVal, monthVal, target }
  })

  const weakest = [...kpiStats].sort((a, b) => a.ach - b.ach)[0]
  if (!weakest) return null

  const gap   = Math.max(0, (weakest.target || 0) - weakest.monthVal)
  const msg   = MOTIVATIONAL[new Date().getDate() % MOTIVATIONAL.length]
  const action = ACTIONS[weakest.key] || 'Focus on your weakest KPI today.'

  return {
    weakestKpi:   weakest.key,
    kpiLabel:     KPI_LABELS[weakest.key],
    achievement:  weakest.ach,
    targetGap:    gap,
    todayValue:   weakest.todayVal,
    action,
    message:      msg,
    status:       getTrafficLight(weakest.ach, new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth()+1,0).getDate()),
    allKpis:      kpiStats,
    // AI hook: replace this function's body with an API call when ready
    _aiReady:     true,
  }
}
