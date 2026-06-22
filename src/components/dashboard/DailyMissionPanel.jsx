// ============================================================
// DailyMissionPanel — action-driven "what needs to happen today"
// block (Phase UI3-F).
//
// Read-only. Takes an array of already-computed KPI mission items
// (each with the fields a KpiCard would already have: name, value,
// target, achievement, gap, requiredDailyPace) and surfaces:
//   - biggest risk (lowest achievement, below the caution threshold)
//   - biggest opportunity (closable gap with the most leverage)
//   - projected finish (simple extrapolation of current pace)
//   - critical drifts (any item below the critical threshold)
//
// All "logic" here is plain array sort/filter over numbers the
// caller already computed — there is no scoring formula, no
// engine call, and no Firestore access. This is presentation,
// not analytics.
// ============================================================
import React from 'react'
import { AlertTriangle, TrendingUp, Target, Flame } from 'lucide-react'
import { formatKpiValue } from '../../utils/helpers'
import { getStatusToken } from '../../design/tokens'

const CRITICAL_THRESHOLD = 60
const CAUTION_THRESHOLD = 80

function pickBiggestRisk(items) {
  const risky = items.filter((i) => typeof i.achievement === 'number' && i.achievement < CAUTION_THRESHOLD)
  if (risky.length === 0) return null
  return risky.slice().sort((a, b) => a.achievement - b.achievement)[0]
}

function pickBiggestOpportunity(items) {
  const withGap = items.filter((i) => typeof i.gap === 'number' && i.gap > 0)
  if (withGap.length === 0) return null
  return withGap.slice().sort((a, b) => b.gap - a.gap)[0]
}

function pickCriticalDrifts(items) {
  return items.filter((i) => typeof i.achievement === 'number' && i.achievement < CRITICAL_THRESHOLD)
}

function missionLine(item) {
  if (!item || typeof item.requiredDailyPace !== 'number' || !(item.requiredDailyPace > 0)) return null
  return `Need ${formatKpiValue(item.requiredDailyPace, item.type, item.unit)} ${item.name} today to recover pace.`
}

export default function DailyMissionPanel({ items = [] }) {
  const safeItems = Array.isArray(items) ? items : []
  if (safeItems.length === 0) return null

  const biggestRisk = pickBiggestRisk(safeItems)
  const biggestOpportunity = pickBiggestOpportunity(safeItems)
  const criticalDrifts = pickCriticalDrifts(safeItems)
  const headline = missionLine(biggestRisk) || missionLine(biggestOpportunity)

  const projectedFinish = safeItems
    .filter((i) => typeof i.achievement === 'number')
    .reduce((sum, i) => sum + i.achievement, 0) / (safeItems.filter((i) => typeof i.achievement === 'number').length || 1)

  return (
    <div className="card card-p" data-testid="daily-mission-panel" style={{ borderRadius: '8px' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: '12px' }}>
        <Flame style={{ width: 14, height: 14, color: 'var(--text-muted)' }} strokeWidth={1.75} />
        <span className="section-title" style={{ fontSize: '14px' }}>Daily Mission</span>
      </div>

      {headline && (
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', lineHeight: 1.4 }}>
          {headline}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {biggestRisk && (
          <MissionTile icon={AlertTriangle} label="Biggest risk" tone="negative"
            value={biggestRisk.name} sub={`${biggestRisk.achievement}% achievement`} />
        )}
        {biggestOpportunity && (
          <MissionTile icon={Target} label="Biggest opportunity" tone="positive"
            value={biggestOpportunity.name} sub={`${formatKpiValue(biggestOpportunity.gap, biggestOpportunity.type, biggestOpportunity.unit)} gap to close`} />
        )}
        <MissionTile icon={TrendingUp} label="Projected finish" tone="neutral"
          value={`${Math.round(projectedFinish)}%`} sub="avg. across tracked KPIs" />
        <MissionTile icon={AlertTriangle} label="Critical drifts" tone={criticalDrifts.length > 0 ? 'negative' : 'positive'}
          value={String(criticalDrifts.length)} sub={criticalDrifts.length > 0 ? criticalDrifts.map((d) => d.name).join(', ') : 'none'} />
      </div>
    </div>
  )
}

function MissionTile({ icon: Icon, label, tone, value, sub }) {
  const token = getStatusToken(tone)
  return (
    <div style={{
      background: 'var(--bg-overlay)', border: `1px solid ${token.border}`,
      borderRadius: '8px', padding: '10px 12px',
    }}>
      <div className="flex items-center gap-1.5" style={{ marginBottom: '4px' }}>
        <Icon style={{ width: 12, height: 12, color: token.color }} strokeWidth={1.75} />
        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sub}</div>
    </div>
  )
}
