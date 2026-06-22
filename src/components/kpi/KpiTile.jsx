// ============================================================
// KpiTile — shared presentational component
// Phase 5A extraction.
//
// Extracted verbatim from DashboardPage.jsx's KPI Tile Grid
// (KPI Card Polish Sprint / Enterprise UX Sprint Phase Next /
// Segmented Bar). DashboardPage (UI3.2-C) and BranchIntelligencePage
// (Branch Intelligence Visual Migration) have since both migrated
// their KPI grids to the official KpiCard template — this component
// has no remaining page consumer but is kept (not deleted) since it
// is still covered by existing regression tests.
//
// All inputs are explicit props — no closure over page-level state.
// ============================================================

import { kpiBadge, kpiVsExpected, FALLBACK_COLORS, DEFAULT_KPI_COLOR } from './kpiVisualHelpers'
import { formatNumber } from '../../utils/helpers'

/**
 * @param {string} kpiKey       — KpiKey (e.g. 'omni')
 * @param {object} stats        — kpiStats[kpiKey]: { _label, _color, target, actual,
 *                                  achievementPct, remainingToTarget }
 * @param {object} pace         — paceMap[kpiKey]: { requiredDailyPace, paceStatus } | undefined
 * @param {number} expectedPct  — Math.round(dayRatio*100) (Dashboard) or
 *                                  viewModel.expectedPace.kpiExpectedPct[kpiKey] (Branch Intelligence)
 * @param {number} [animationDelayMs] — stagger delay for animate-slide-up (default 0)
 */
export function KpiTile({ kpiKey, stats, pace, expectedPct, animationDelayMs = 0 }) {
  const s = stats
  const badge = kpiBadge(s, pace)
  const vsExp = kpiVsExpected(s, expectedPct)
  const accentColor = s?._color ?? FALLBACK_COLORS[kpiKey] ?? DEFAULT_KPI_COLOR
  const achPct      = s?.achievementPct ?? 0
  const remaining   = s?.remainingToTarget ?? 0
  // De-emphasize achieved cards — opacity + muted border
  const isAchieved  = s?.target > 0 && remaining <= 0
  const cardBorder  = badge
    ? `1px solid ${badge.border}`
    : '1px solid var(--border-subtle)'

  return (
    <div className="kpi-tile animate-slide-up"
      style={{ animationDelay:`${animationDelayMs}ms`, border: cardBorder, padding:'8px 10px',
               borderRadius:'8px', background:'var(--bg-elevated)',
               display:'flex', flexDirection:'column', gap:'0',
               opacity: isAchieved ? 0.72 : 1,
               transition:'opacity 0.3s' }}>

      {/* Row 1: KPI name + status badge — compact header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    marginBottom:'3px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'5px',
                      fontSize:'10px', fontWeight:600, color:'var(--text-secondary)',
                      textTransform:'uppercase', letterSpacing:'0.06em',
                      fontFamily:"'Inter',sans-serif" }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:accentColor, flexShrink:0 }} />
          {s?._label ?? kpiKey}
        </div>
        {badge && s?.target > 0 && (
          <span style={{ fontSize:'8px', fontWeight:600, padding:'1px 5px',
                         borderRadius:'99px', whiteSpace:'nowrap', flexShrink:0,
                         background: badge.bg, color: badge.color,
                         border: `1px solid ${badge.border}`,
                         fontFamily:"'Inter',sans-serif", letterSpacing:'0.02em' }}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Row 2: Achievement % — primary value (compact: 22px) */}
      <div style={{ fontSize:'22px', fontWeight:700, lineHeight:1.1,
                    fontVariantNumeric:'tabular-nums',
                    color: s?.target > 0 ? (badge?.color ?? 'var(--text-muted)') : 'var(--text-muted)',
                    fontStyle: s?.target > 0 ? 'normal' : 'italic',
                    marginBottom:'2px' }}>
        {s?.target > 0 ? `${achPct}%` : 'No target'}
      </div>

      {/* Row 3: Remaining — promoted to its own compact line */}
      {s?.target > 0 && (
        <div style={{ fontSize:'11px', fontWeight:600, marginBottom:'2px',
                      color: remaining > 0 ? (badge?.color ?? 'var(--text-primary)') : '#6b9c84' }}>
          {remaining > 0
            ? <>{formatNumber(remaining)} <span style={{ fontSize:'9px', fontWeight:400, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.03em' }}>Remaining</span></>
            : <>✓ <span style={{ fontSize:'9px', fontWeight:400, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.03em' }}>Target Achieved</span></>
          }
        </div>
      )}

      {/* Row 4: Required pace — compact inline (no boxed pill) */}
      {pace && s?.target > 0 && remaining > 0 && (
        <div style={{ fontSize:'10px', color:'var(--text-secondary)', marginBottom:'2px' }}>
          <span style={{ fontWeight:700, color: badge?.color ?? 'var(--text-primary)',
                         fontVariantNumeric:'tabular-nums' }}>
            {pace.requiredDailyPace > 0 ? `${formatNumber(pace.requiredDailyPace, { maximumFractionDigits: 1 })}/day` : '—'}
          </span>
          {' '}<span style={{ color:'var(--text-muted)' }}>required</span>
        </div>
      )}

      {/* Row 5: Actual / Target — single compact line */}
      {s?.target > 0 && (
        <div style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'2px',
                      fontVariantNumeric:'tabular-nums' }}>
          {formatNumber(s?.actual||0)} / {formatNumber(s?.target||0)}
        </div>
      )}

      {/* Row 6: Variance vs expected — inline */}
      {vsExp && s?.target > 0 && !isAchieved && (
        <div style={{ fontSize:'9px', color: vsExp.color, marginBottom:'4px',
                      fontFamily:"'Inter',sans-serif", fontWeight:500 }}>
          {vsExp.text}
        </div>
      )}

      {/* Row 7: Segmented progress bar — 10 segments, filled = floor(achPct/10) */}
      {(() => {
        const SEGS      = 10
        const filled    = Math.min(Math.floor(Math.max(achPct, 0) / SEGS), SEGS)
        const fillColor = badge?.color ?? accentColor
        return (
          <div style={{ display:'flex', gap:'2px', alignItems:'center' }}
               role="progressbar" aria-valuenow={achPct} aria-valuemin={0} aria-valuemax={100}
               aria-label={`${s?._label ?? kpiKey}: ${achPct}%`}>
            {Array.from({ length: SEGS }, (_, idx) => (
              <div key={idx} style={{
                flex: 1, height:'4px', borderRadius:'2px',
                background: idx < filled ? fillColor : 'var(--border-subtle)',
                opacity:    idx < filled ? 1 : 0.45,
                transition: `background 0.4s ease ${idx * 30}ms`,
              }} />
            ))}
          </div>
        )
      })()}
    </div>
  )
}
