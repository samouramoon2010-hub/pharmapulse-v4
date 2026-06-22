// ============================================================
// FocusKpiCommandCard — Focus KPI Command Card (shared presentational component)
// Phase 5A extraction.
//
// Extracted verbatim from DashboardPage.jsx's Focus KPI Command Card
// (Enterprise UX Sprint Phase Next, Priority 3). Vertical
// command-card layout: KPI name → Achievement % → Remaining →
// Required Pace → Variance vs expected, in that exact visual order.
//
// All inputs are explicit props — no closure over page-level state.
// ============================================================

import { kpiBadge, kpiVsExpected } from './kpiVisualHelpers'
import { formatNumber } from '../../utils/helpers'

/**
 * @param {string} kpiKey       — KpiKey (e.g. 'omni')
 * @param {object} stats        — kpiStats[kpiKey] / equivalent:
 *                                  { _label, target, achievementPct, remainingToTarget }
 * @param {object} pace         — paceMap[kpiKey]: { requiredDailyPace, paceStatus } | undefined
 * @param {number} expectedPct  — Math.round(dayRatio*100) (Dashboard) or
 *                                  viewModel.expectedPace.kpiExpectedPct[kpiKey] (Branch Intelligence)
 */
export function FocusKpiCommandCard({ kpiKey, stats, pace, expectedPct }) {
  const fk     = stats
  const fp     = pace
  const fBadge = kpiBadge(fk, fp)
  const fVs    = kpiVsExpected(fk, expectedPct)
  const fColor = fBadge?.color ?? '#ef4444'

  return (
    <div style={{
      borderRadius:'10px', marginBottom:'16px', overflow:'hidden',
      border: `1px solid ${fColor}35`,
      boxShadow: `0 2px 8px ${fColor}18`,
      maxWidth: '320px',
    }} className="animate-fade-in">
      {/* Header bar */}
      <div style={{
        display:'flex', alignItems:'center', gap:'8px',
        padding:'8px 14px',
        background: `linear-gradient(135deg, ${fColor}14 0%, ${fColor}06 100%)`,
        borderBottom: `1px solid ${fColor}20`,
      }}>
        <span style={{ fontSize:'13px' }}>🔥</span>
        <span style={{ fontSize:'9px', fontWeight:700, color: fColor,
                       textTransform:'uppercase', letterSpacing:'0.10em',
                       fontFamily:"'Inter',sans-serif" }}>
          Focus KPI
        </span>
      </div>
      {/* Body — vertical stack: name → achievement → remaining → pace → variance */}
      <div style={{ padding:'12px 14px', background:'var(--bg-elevated)' }}>
        {/* 1. KPI name */}
        <div style={{ fontSize:'15px', fontWeight:700, color: fColor, lineHeight:1.1,
                      textTransform:'uppercase', letterSpacing:'0.02em' }}>
          {fk?._label ?? kpiKey}
        </div>
        {/* 2. Achievement % — largest element, primary anchor */}
        <div style={{ fontSize:'36px', fontWeight:700, color: fColor,
                      fontVariantNumeric:'tabular-nums', lineHeight:1, marginTop:'4px' }}>
          {fk?.achievementPct ?? 0}%
        </div>
        {/* 3. Remaining */}
        {(fk?.remainingToTarget ?? 0) > 0 && (
          <div style={{ display:'flex', alignItems:'baseline', gap:'5px', marginTop:'8px' }}>
            <span style={{ fontSize:'15px', fontWeight:600, color:'var(--text-primary)',
                           fontVariantNumeric:'tabular-nums' }}>
              {formatNumber(fk.remainingToTarget)}
            </span>
            <span style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase',
                           letterSpacing:'0.04em', fontFamily:"'Inter',sans-serif" }}>
              Remaining
            </span>
          </div>
        )}
        {/* 4. Required pace */}
        {fp?.requiredDailyPace > 0 && (
          <div style={{ display:'flex', alignItems:'baseline', gap:'5px', marginTop:'4px' }}>
            <span style={{ fontSize:'15px', fontWeight:700, color: fColor,
                           fontVariantNumeric:'tabular-nums' }}>
              {formatNumber(fp.requiredDailyPace, { maximumFractionDigits: 1 })}/day
            </span>
            <span style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase',
                           letterSpacing:'0.04em', fontFamily:"'Inter',sans-serif" }}>
              Required
            </span>
          </div>
        )}
        {/* 5. Variance vs expected */}
        {fVs && (
          <div style={{
            marginTop:'10px', paddingTop:'8px', borderTop:'1px solid var(--border-subtle)',
            fontSize:'11px', fontWeight:500, color: fVs.color,
          }}>
            {fVs.text}
          </div>
        )}
      </div>
    </div>
  )
}
