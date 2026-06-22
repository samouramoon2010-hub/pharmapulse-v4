// ============================================================
// ActivityFeedPanel — Today's Activities (Phase UI3.2-E/F)
//
// Display-only. Extracted from DashboardPage.jsx's existing inline
// "Live Operational Feed" block (same data shape, same styling)
// into a reusable, capped, compact panel. No new activity logic —
// items come from the existing generateLiveAnalytics() engine call.
// ============================================================
import React from 'react'
import { Activity } from 'lucide-react'
import EmptyState from '../ui/EmptyState'

const SEVERITY_STYLE = {
  success:  { bg: 'rgba(34,197,94,0.08)',  color: '#4ade80', border: 'rgba(34,197,94,0.15)' },
  warning:  { bg: 'rgba(245,158,11,0.08)', color: '#fbbf24', border: 'rgba(245,158,11,0.15)' },
  critical: { bg: 'rgba(239,68,68,0.08)',  color: '#f87171', border: 'rgba(239,68,68,0.15)' },
}
const DEFAULT_SEVERITY_STYLE = { bg: 'var(--bg-overlay)', color: 'var(--text-muted)', border: 'var(--border-subtle)' }

export default function ActivityFeedPanel({ items = [], maxVisible = 5 }) {
  const visible = (Array.isArray(items) ? items : []).slice(0, maxVisible)

  return (
    <div data-testid="activity-feed-panel" className="card card-p" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity style={{ width: 13, height: 13, color: 'var(--text-muted)' }} strokeWidth={1.75} />
          <span className="section-title" style={{ fontSize: '12px' }}>Today's Activities</span>
        </div>
        {visible.length > 0 && (
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{visible.length} events</span>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Submit a KPI entry to see it here." tone="neutral" compact />
      ) : (
        visible.map((item) => {
          const style = SEVERITY_STYLE[item.severity] ?? DEFAULT_SEVERITY_STYLE
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </div>
                {item.relativeTime && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>{item.relativeTime}</div>
                )}
              </div>
              <span style={{
                fontSize: '9px', fontWeight: 500, padding: '1px 6px', borderRadius: '99px', flexShrink: 0,
                background: style.bg, color: style.color, border: `1px solid ${style.border}`,
              }}>
                {item.severity}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
