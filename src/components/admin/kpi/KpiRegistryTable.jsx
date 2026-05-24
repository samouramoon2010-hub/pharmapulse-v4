// ============================================================
// KpiRegistryTable
// Displays all KPI definitions with status, weights, and
// visibility toggles. Admin-only.
// No analytics logic — renders pre-built registry data.
// ============================================================
import React from 'react'
import { Pencil, Archive, EyeOff, Shield } from 'lucide-react'

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

// ── Protected badge ────────────────────────────────────────────
function ProtectedBadge() {
  return (
    <span title="Protected production KPI — key is immutable" style={{
      display:'inline-flex', alignItems:'center', gap:'3px',
      padding:'1px 6px', borderRadius:'4px', fontSize:'10px', fontWeight:600,
      color:'#60a5fa', background:'rgba(96,165,250,0.1)', border:'1px solid rgba(96,165,250,0.2)',
    }}>
      <Shield style={{ width:9, height:9 }} />
      Core
    </span>
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
    <div className="tbl-wrap" style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
        <colgroup>
          <col style={{ width:'130px' }} />   {/* Key */}
          <col style={{ width:'140px' }} />   {/* Label */}
          <col style={{ width:'110px' }} />   {/* Category */}
          <col style={{ width:'110px' }} />   {/* Status */}
          <col style={{ width:'50px'  }} />   {/* Core */}
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
            {['Key','Label','Category','Status','Core','Weight','Target','Dash','Team','Exec','Reg',''].map((h) => (
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

                {/* Category */}
                <td style={{ ...CELL, fontSize:'12px', color:'var(--text-secondary)' }}>
                  {kpi.category}
                </td>

                {/* Status */}
                <td style={CELL}>
                  <StatusBadge status={uiStatus} />
                </td>

                {/* Core */}
                <td style={{ ...CELL, textAlign:'center' }}>
                  {kpi.isCore ? <ProtectedBadge /> : <span style={{ color:'var(--text-muted)', fontSize:'12px' }}>—</span>}
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

                    {/* Archive / Hide — disabled for core protected KPIs */}
                    {!kpi.isCore && uiStatus === 'ACTIVE' && (
                      <>
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
                      </>
                    )}
                    {kpi.isCore && (
                      <span title="Core KPIs are protected" style={{ width:26, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                        <Shield style={{ width:11, height:11, color:'rgba(96,165,250,0.4)' }} />
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
