// ============================================================
// ExecutiveSummaryPanel — dense narrative executive summary
// (Phase UI3-G).
//
// Read-only. Every field is a prop — this component performs no
// scoring, ranking, or aggregation. It exists to give executives a
// single dense readout instead of several large, sparse cards:
// overall performance, best KPI, focus KPI, primary risk, top
// opportunity, narrative recommendation.
// ============================================================
import React from 'react'
import { Award, Target, AlertTriangle, Sparkles } from 'lucide-react'
import { getStatusToken } from '../../design/tokens'

export default function ExecutiveSummaryPanel({
  overallScore, bestKpi, focusKpi, primaryRisk, topOpportunity, narrative,
}) {
  const rows = [
    bestKpi        && { icon: Award,         label: 'Best KPI',        text: bestKpi,        tone: 'positive' },
    focusKpi       && { icon: Target,        label: 'Focus KPI',       text: focusKpi,       tone: 'neutral'  },
    primaryRisk    && { icon: AlertTriangle, label: 'Primary risk',    text: primaryRisk,    tone: 'negative' },
    topOpportunity && { icon: Sparkles,      label: 'Top opportunity', text: topOpportunity, tone: 'positive' },
  ].filter(Boolean)

  if (rows.length === 0 && !narrative && overallScore === undefined) return null

  return (
    <div className="card card-p" data-testid="executive-summary-panel" style={{ borderRadius: '8px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
        <span className="section-title" style={{ fontSize: '14px' }}>Executive Summary</span>
        {typeof overallScore === 'number' && (
          <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {overallScore}<span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>/100</span>
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2" style={{ marginBottom: narrative ? '12px' : 0 }}>
          {rows.map(({ icon: Icon, label, text, tone }) => {
            const token = getStatusToken(tone)
            return (
              <div key={label} style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                background: 'var(--bg-overlay)', border: `1px solid ${token.border}`,
                borderRadius: '8px', padding: '10px 12px',
              }}>
                <Icon style={{ width: 13, height: 13, color: token.color, marginTop: '1px', flexShrink: 0 }} strokeWidth={1.75} />
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {text}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {narrative && (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {narrative}
        </div>
      )}
    </div>
  )
}
