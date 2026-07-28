// ============================================================
// KpiRegistryTable
// Displays all KPI definitions with status, weights, and
// visibility toggles. Admin-only.
// No analytics logic — renders pre-built registry data.
// ============================================================
import React from 'react'
import { Pencil, Archive, EyeOff, Shield } from 'lucide-react'
import MobileRankCard from '../../ui/MobileRankCard'

// PR-1E4 — same lifecycle-stage label map the desktop table renders,
// extracted so the mobile card can reuse it instead of recomputing.
const LIFECYCLE_CFG = {
  production_evaluation: { label: 'Production', color: '#22c55e' },
  pilot_tracking:        { label: 'Pilot',       color: '#f59e0b' },
  shadow_evaluation:     { label: 'Shadow',      color: '#60a5fa' },
  draft:                  { label: 'Draft',       color: '#a1a1aa' },
  archived:               { label: 'Archived',    color: '#6b7280' },
}

// ── Status badge ───────────────────────────────────────────────
const STATUS_CFG = {
  ACTIVE:            { label: 'Active',           color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.25)'  },
  ARCHIVED:          { label: 'Archived',         color: '#a1a1aa', bg: 'rgba(161,161,170,0.10)', border: 'rgba(161,161,170,0.25)'},
  HIDDEN_FROM_INPUT: { label: 'Hidden',           color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.ACTIVE
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'2px 8px',
      borderRadius:'99px', fontSize:'11px', fontWeight:600,
      color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.border}`,
      whiteSpace:'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

// ── Visibility dot ─────────────────────────────────────────────
function VisDot({ enabled }) {
  return (
    <span style={{
      display:'inline-block', width:8, height:8, borderRadius:'50%',
      background: enabled ? '#22c55e' : 'var(--border-default)',
    }} />
  )
}

// ── Main table ─────────────────────────────────────────────────
export default function KpiRegistryTable({ kpis, uiStatuses, onEdit, onArchive, onHide }) {
  const COL = { fontSize:'11px', fontWeight:600, color:'var(--text-muted)',
                textTransform:'uppercase', letterSpacing:'0.05em', padding:'8px 12px',
                whiteSpace:'nowrap' }
  const CELL = { padding:'10px 12px', fontSize:'13px', color:'var(--text-primary)',
                 verticalAlign:'middle' }

  return (
    <>
      {/* PR-1E4 — phone-width card list, same `kpis` data/order as the
          table below (mobile-blueprint.md rule: card conversion is the
          required mobile fallback, not horizontal scroll). Action
          buttons are reused as-is via MobileRankCard's `actions` slot —
          no archive/hide/edit logic is duplicated. */}
      <div className="sm:hidden space-y-2">
        {kpis.map((kpi) => {
          const uiStatus = uiStatuses[kpi.key] ?? (kpi.isActive ? 'ACTIVE' : 'ARCHIVED')
          const isArchived = uiStatus === 'ARCHIVED'
          const lifecycle = LIFECYCLE_CFG[kpi.lifecycleStage ?? 'production_evaluation']
            ?? { label: kpi.lifecycleStage, color: '#a1a1aa' }
          const statusCfg = STATUS_CFG[uiStatus] ?? STATUS_CFG.ACTIVE
          return (
            <MobileRankCard
              key={kpi.key}
              title={kpi.label}
              subtitle={`${kpi.key}${kpi.labelAr ? ' · ' + kpi.labelAr : ''}`}
              primaryMetric={{ label: 'Weight', value: kpi.weight > 0 ? `${Math.round(kpi.weight * 100)}%` : '—' }}
              secondaryMetrics={[
                { label: 'Lifecycle', value: lifecycle.label },
                { label: 'Dash', value: kpi.visibility.dashboardEnabled && !isArchived ? 'On' : 'Off' },
                { label: 'Team', value: kpi.visibility.teamEnabled && !isArchived ? 'On' : 'Off' },
              ]}
              status={{ label: statusCfg.label, color: statusCfg.color }}
              actions={(
                <>
                  <button onClick={() => onEdit(kpi)} className="btn btn-ghost btn-sm gap-1 text-xs">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  {uiStatus === 'ACTIVE' && (
                    <>
                      {!kpi.isCore && (
                        <button onClick={() => onHide(kpi.key)} className="btn btn-ghost btn-sm gap-1 text-xs">
                          <EyeOff className="w-3.5 h-3.5" /> Hide
                        </button>
                      )}
                      <button onClick={() => onArchive(kpi.key)} className="btn btn-ghost btn-sm gap-1 text-xs">
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                      {kpi.isCore && (
                        <span title="Protected system KPI — cannot be hidden from input forms" className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(96,165,250,0.7)' }}>
                          <Shield className="w-3 h-3" /> Protected
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            />
          )
        })}
      </div>
    <div className="hidden sm:block tbl-wrap" style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
        <colgroup>
          <col style={{ width:'110px' }} />   {/* Key */}
          <col style={{ width:'120px' }} />   {/* Label */}
          <col style={{ width:'120px' }} />   {/* Lifecycle Stage */}
          <col style={{ width:'90px'  }} />   {/* Status */}
          <col style={{ width:'60px'  }} />   {/* Weight */}
          <col style={{ width:'44px'  }} />   {/* Target */}
          <col style={{ width:'36px'  }} />   {/* Dash */}
          <col style={{ width:'36px'  }} />   {/* Team */}
          <col style={{ width:'36px'  }} />   {/* Exec */}
          <col style={{ width:'36px'  }} />   {/* Reg */}
          <col style={{ width:'80px'  }} />   {/* Actions */}
        </colgroup>
        <thead>
          <tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>
            {['Key','Label','Lifecycle Stage','Status','Weight','Target','Dash','Team','Exec','Reg',''].map((h) => (
              <th key={h} style={COL}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kpis.map((kpi) => {
            const uiStatus = uiStatuses[kpi.key] ?? (kpi.isActive ? 'ACTIVE' : 'ARCHIVED')
            const isArchived = uiStatus === 'ARCHIVED'
            const rowOpacity = isArchived ? 0.55 : 1

            return (
              <tr
                key={kpi.key}
                style={{
                  borderBottom:'1px solid var(--border-subtle)',
                  opacity: rowOpacity,
                  transition:'background 0.12s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background='var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background='transparent'}
              >
                {/* Key */}
                <td style={CELL}>
                  <code style={{
                    fontSize:'11px', fontFamily:'monospace',
                    background:'var(--bg-overlay)', padding:'2px 5px',
                    borderRadius:'4px', color:'var(--text-secondary)',
                  }}>
                    {kpi.key}
                  </code>
                </td>

                {/* Label */}
                <td style={CELL}>
                  <div style={{ fontWeight:500 }}>{kpi.label}</div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{kpi.labelAr}</div>
                </td>

                {/* Lifecycle Stage */}
                <td style={CELL}>
                  {(() => {
                    const stage = kpi.lifecycleStage ?? 'production_evaluation'
                    const cfg = {
                      production_evaluation: { label:'Production', color:'#22c55e', bg:'rgba(34,197,94,0.10)' },
                      pilot_tracking:        { label:'Pilot',      color:'#f59e0b', bg:'rgba(245,158,11,0.10)' },
                      shadow_evaluation:     { label:'Shadow',     color:'#60a5fa', bg:'rgba(96,165,250,0.10)' },
                      draft:                 { label:'Draft',      color:'#a1a1aa', bg:'rgba(161,161,170,0.10)' },
                      archived:              { label:'Archived',   color:'#6b7280', bg:'rgba(107,114,128,0.10)' },
                    }[stage] ?? { label: stage, color:'#a1a1aa', bg:'rgba(161,161,170,0.10)' }
                    return (
                      <span style={{
                        display:'inline-flex', alignItems:'center', padding:'2px 7px',
                        borderRadius:'99px', fontSize:'10px', fontWeight:600,
                        color:cfg.color, background:cfg.bg, whiteSpace:'nowrap',
                      }}>{cfg.label}</span>
                    )
                  })()}
                </td>

                {/* Status */}
                <td style={CELL}>
                  <StatusBadge status={uiStatus} />
                </td>

                {/* Weight */}
                <td style={{ ...CELL, fontVariantNumeric:'tabular-nums', textAlign:'center', fontSize:'12px' }}>
                  {kpi.weight > 0 ? `${Math.round(kpi.weight * 100)}%` : '—'}
                </td>

                {/* Target input */}
                <td style={{ ...CELL, textAlign:'center' }}>
                  <VisDot enabled={uiStatus === 'ACTIVE' && kpi.isCore} />
                </td>

                {/* Dashboard */}
                <td style={{ ...CELL, textAlign:'center' }}>
                  <VisDot enabled={kpi.visibility.dashboardEnabled && !isArchived} />
                </td>

                {/* Team */}
                <td style={{ ...CELL, textAlign:'center' }}>
                  <VisDot enabled={kpi.visibility.teamEnabled && !isArchived} />
                </td>

                {/* Executive */}
                <td style={{ ...CELL, textAlign:'center' }}>
                  <VisDot enabled={kpi.visibility.executiveEnabled && !isArchived} />
                </td>

                {/* Regional */}
                <td style={{ ...CELL, textAlign:'center' }}>
                  <VisDot enabled={kpi.visibility.regionalEnabled && !isArchived} />
                </td>

                {/* Actions */}
                <td style={{ ...CELL, whiteSpace:'nowrap' }}>
                  <div style={{ display:'flex', gap:'4px', justifyContent:'flex-end' }}>
                    {/* Edit */}
                    <button
                      onClick={() => onEdit(kpi)}
                      title="Edit KPI"
                      style={{
                        width:26, height:26, borderRadius:'6px', border:'none',
                        background:'transparent', cursor:'pointer', color:'var(--text-muted)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='var(--text-primary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text-muted)' }}
                    >
                      <Pencil style={{ width:13, height:13 }} />
                    </button>

                    {/* Archive: allowed for all active KPIs, including former core-protected keys.
                        Hide: still restricted to non-core keys (that restriction was not lifted). */}
                    {uiStatus === 'ACTIVE' && (
                      <>
                        {!kpi.isCore && (
                          <button
                            onClick={() => onHide(kpi.key)}
                            title="Hide from input forms"
                            style={{
                              width:26, height:26, borderRadius:'6px', border:'none',
                              background:'transparent', cursor:'pointer', color:'var(--text-muted)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='#f59e0b' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text-muted)' }}
                          >
                            <EyeOff style={{ width:13, height:13 }} />
                          </button>
                        )}
                        <button
                          onClick={() => onArchive(kpi.key)}
                          title="Archive KPI"
                          style={{
                            width:26, height:26, borderRadius:'6px', border:'none',
                            background:'transparent', cursor:'pointer', color:'var(--text-muted)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='#a1a1aa' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text-muted)' }}
                        >
                          <Archive style={{ width:13, height:13 }} />
                        </button>
                        {kpi.isCore && (
                          <span title="Protected system KPI — cannot be hidden from input forms" style={{ width:26, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                            <Shield style={{ width:11, height:11, color:'rgba(96,165,250,0.4)' }} />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}
