// ============================================================
// DailyMissionHero — Strong Daily Mission Hero (Phase UI3.2-B)
//
// Display-only. Every value rendered here is either passed in
// directly (mission, dayRatio, criticalCount, projectedFinishPct)
// or trivial presentation arithmetic (Math.round). No new business
// logic, no Firestore access — mission/projectedFinishPct are both
// already computed in DashboardPage.jsx from kpiStats/paceMap/
// forecastMap, all pre-existing memoized values.
//
// Theme-aware gradient only — no external image asset, matching
// the reference image's premium dark hero card without a runtime
// background photo.
// ============================================================
import React from 'react'
import { Compass, AlertTriangle, Flag, Calendar } from 'lucide-react'
import { TRAFFIC_COLORS, getTrafficLight } from '../../engine'

// Static tone-of-voice copy keyed off mission.difficulty (already
// computed) — presentational headline only, not a new data field.
const HEADLINE_BY_DIFFICULTY = {
  EASY:        'On pace. Keep the streak going.',
  MODERATE:    'Stay sharp. Hit today’s target.',
  CHALLENGING: 'Push hard. Close the gap.',
  STRETCH:     'Close the gap. Win the day.',
}

export default function DailyMissionHero({ mission, dayRatio, criticalCount, projectedFinishPct }) {
  if (!mission) return null

  const focusStatus = getTrafficLight(mission.achievementPct, dayRatio)
  const cfg = TRAFFIC_COLORS[focusStatus] || TRAFFIC_COLORS.warning
  const finishStatus = getTrafficLight(projectedFinishPct ?? 0, 1)
  const finishCfg = TRAFFIC_COLORS[finishStatus] || TRAFFIC_COLORS.warning
  const headline = HEADLINE_BY_DIFFICULTY[mission.difficulty] || HEADLINE_BY_DIFFICULTY.MODERATE
  const monthProgressPct = Math.round((dayRatio ?? 0) * 100)

  return (
    <div
      data-testid="daily-mission-hero"
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-card, 12px)',
        border: '1px solid var(--border-subtle)',
        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-canvas) 65%, var(--bg-canvas) 100%)',
        overflow: 'hidden',
        padding: 'var(--density-card-padding, 18px)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.16), 0 8px 24px rgba(0,0,0,0.10)',
      }}
    >
      {/* Header row: title badge + status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '3px 10px', borderRadius: '99px',
          background: 'rgba(0,210,173,0.10)', border: '1px solid rgba(0,210,173,0.22)',
          color: 'var(--brand-300)', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          <Compass style={{ width: 12, height: 12 }} />
          Daily Mission
        </span>

        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          fontSize: '11px', fontWeight: 600, color: cfg.color,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
          {cfg.label}
        </span>
      </div>

      {/* Headline + action statement */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: 'var(--font-title, 18px)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25, marginBottom: '4px' }}>
          {headline}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {mission.action}
        </div>
      </div>

      {/* Stat row: Need / Critical Drifts / Projected Finish / Month Progress */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '18px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Need</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: 'var(--font-display, 28px)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {(mission.requiredToday || 0).toLocaleString()}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {mission.kpiLabel?.en || mission.focusKpi} today
            </span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <AlertTriangle style={{ width: 11, height: 11 }} />
            Critical Drifts
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: 'var(--font-display, 28px)', fontWeight: 700, color: criticalCount > 0 ? TRAFFIC_COLORS.critical.color : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {criticalCount ?? 0}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {criticalCount > 0 ? 'require attention' : 'all clear'}
            </span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <Flag style={{ width: 11, height: 11 }} />
            Projected Finish
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: 'var(--font-display, 28px)', fontWeight: 700, color: finishCfg.color, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(projectedFinishPct ?? 0)}%
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {finishCfg.label}
            </span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <Calendar style={{ width: 11, height: 11 }} />
            Month Progress
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: 'var(--font-display, 28px)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {monthProgressPct}%
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              of month elapsed
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
