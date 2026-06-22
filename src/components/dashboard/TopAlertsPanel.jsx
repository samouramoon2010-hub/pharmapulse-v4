// ============================================================
// TopAlertsPanel — Smart Alerts (Phase UI3.2-D/F)
//
// Display-only. Extracted from DashboardPage.jsx's existing inline
// "Live Priority Alerts" block (same data shape, same styling) into
// a reusable, capped, compact panel. No new alert logic — alerts
// are produced by the existing generateLiveAnalytics() engine call;
// this component only renders what it is given.
// ============================================================
import React from 'react'
import { Bell } from 'lucide-react'
import EmptyState from '../ui/EmptyState'

const MAX_VISIBLE = 5

export default function TopAlertsPanel({ alerts = [], onNavigate, maxVisible = 3 }) {
  const visible = (Array.isArray(alerts) ? alerts : [])
    .filter((a) => !a.dismissed && a.priority !== 'info')
    .slice(0, Math.min(maxVisible, MAX_VISIBLE))

  return (
    <div data-testid="top-alerts-panel" className="card card-p" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Bell style={{ width: 13, height: 13, color: 'var(--text-muted)' }} strokeWidth={1.75} />
        <span className="section-title" style={{ fontSize: '12px' }}>Top Alerts</span>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Bell} title="No active alerts" description="Everything is within expected range." tone="positive" compact />
      ) : (
        visible.map((alert) => {
          const isCritical = alert.priority === 'critical'
          return (
            <div key={alert.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '8px',
              background: isCritical ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
              border: `1px solid ${isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
              fontSize: '12px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isCritical ? '#ef4444' : '#f59e0b' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{alert.title}</span>
                {' '}<span style={{ color: 'var(--text-muted)' }}>{alert.message}</span>
              </div>
              {alert.actionRoute && onNavigate && (
                <button onClick={() => onNavigate(alert.actionRoute)}
                  style={{
                    fontSize: '10px', fontWeight: 600, flexShrink: 0,
                    color: isCritical ? '#ef4444' : '#f59e0b',
                    background: isCritical ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${isCritical ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                    borderRadius: '5px', padding: '3px 8px', cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                  {alert.action}
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
