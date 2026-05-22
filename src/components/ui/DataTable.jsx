// ============================================================
// DataTable — Enterprise table component
// Linear / Stripe / Airtable dark aesthetic
// ============================================================
import React, { useState } from 'react'
import { ChevronUp, ChevronDown, MoreHorizontal } from 'lucide-react'

// ── Status Pill — muted, minimal ─────────────────────────────
export function StatusPill({ status, label }) {
  const STYLES = {
    active:    { bg:'rgba(0,210,173,0.08)',  border:'rgba(0,210,173,0.18)',  color:'#00d2ad' },
    inactive:  { bg:'rgba(113,113,122,0.1)', border:'rgba(113,113,122,0.2)', color:'#71717a' },
    pending:   { bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.18)', color:'#f59e0b' },
    approved:  { bg:'rgba(0,210,173,0.08)',  border:'rgba(0,210,173,0.18)',  color:'#00d2ad' },
    rejected:  { bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.18)',  color:'#ef4444' },
    admin:     { bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.18)',  color:'#f87171' },
    manager:   { bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.18)', color:'#fbbf24' },
    pharmacist:{ bg:'rgba(0,210,173,0.08)',  border:'rgba(0,210,173,0.18)',  color:'#00d2ad' },
    warning:   { bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.18)', color:'#f59e0b' },
    critical:  { bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.18)',  color:'#ef4444' },
    excellent: { bg:'rgba(34,197,94,0.08)',  border:'rgba(34,197,94,0.18)',  color:'#4ade80' },
    good:      { bg:'rgba(0,210,173,0.08)',  border:'rgba(0,210,173,0.18)',  color:'#00d2ad' },
  }
  const s = STYLES[status] || STYLES.inactive
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'5px',
      padding:'2px 8px', borderRadius:'99px',
      background: s.bg, border:`1px solid ${s.border}`, color: s.color,
      fontSize:'10px', fontWeight:500, fontFamily:"'Inter',sans-serif",
      letterSpacing:'0.01em', whiteSpace:'nowrap',
    }}>
      <span style={{
        width:'5px', height:'5px', borderRadius:'50%',
        background: s.color, flexShrink:0,
      }} />
      {label}
    </span>
  )
}

// ── Row Actions ───────────────────────────────────────────────
export function RowActions({ actions = [] }) {
  const [open, setOpen] = useState(false)
  const primary = actions.filter((a) => !a.secondary)
  const secondary = actions.filter((a) => a.secondary)

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {primary.map((a, i) => (
        <button key={i} onClick={(e) => { e.stopPropagation(); a.onClick() }}
          title={a.label}
          style={{
            padding:'3px 8px', borderRadius:'5px',
            fontSize:'11px', fontWeight:500,
            color:'var(--text-muted)',
            background:'transparent',
            border:'1px solid transparent',
            cursor:'pointer', transition:'all 0.12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)'
            e.currentTarget.style.background = 'var(--bg-overlay)'
            e.currentTarget.style.borderColor = 'var(--border-default)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}>
          {a.icon && <a.icon style={{ width:12, height:12, display:'inline', marginLeft:3 }} />}
          {a.label}
        </button>
      ))}
      {secondary.length > 0 && (
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
            style={{
              width:'24px', height:'24px', borderRadius:'5px',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--text-muted)', background:'transparent', border:'none', cursor:'pointer',
              transition:'all 0.12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color='var(--text-primary)'; e.currentTarget.style.background='var(--bg-overlay)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='transparent' }}>
            <MoreHorizontal style={{ width:14, height:14 }} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 py-1 rounded-lg"
                   style={{
                     background:'var(--bg-elevated)', border:'1px solid var(--border-default)',
                     boxShadow:'0 8px 24px rgba(0,0,0,0.4)', minWidth:'140px',
                   }}>
                {secondary.map((a, i) => (
                  <button key={i} onClick={(e) => { e.stopPropagation(); a.onClick(); setOpen(false) }}
                    style={{
                      display:'flex', alignItems:'center', gap:'8px',
                      width:'100%', padding:'6px 12px',
                      fontSize:'12px', fontWeight:400,
                      color: a.danger ? '#f87171' : 'var(--text-secondary)',
                      background:'transparent', border:'none', cursor:'pointer',
                      transition:'background 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background='var(--bg-overlay)'}
                    onMouseLeave={(e) => e.currentTarget.style.background='transparent'}>
                    {a.icon && <a.icon style={{ width:13, height:13, flexShrink:0 }} />}
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── The Table ─────────────────────────────────────────────────
export default function DataTable({
  columns = [], rows = [], loading = false,
  emptyText = 'No data', emptySubtext = '',
  onRowClick, selectable = false, stickyHeader = true,
}) {
  const [selected,   setSelected]   = useState(new Set())
  const [sortCol,    setSortCol]    = useState(null)
  const [sortDir,    setSortDir]    = useState('asc')

  const toggleSort = (colKey) => {
    if (sortCol === colKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(colKey); setSortDir('asc') }
  }

  const toggleRow = (id) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleAll = () => {
    setSelected((s) => s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id || r.uid)))
  }

  const sorted = sortCol
    ? [...rows].sort((a, b) => {
        const va = a[sortCol] ?? ''
        const vb = b[sortCol] ?? ''
        const cmp = String(va).localeCompare(String(vb), 'ar', { numeric:true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    : rows

  const TH_STYLE = {
    padding:'0 12px 8px',
    fontSize:'10px', fontWeight:500, letterSpacing:'0.07em',
    textTransform:'uppercase', color:'var(--text-muted)',
    textAlign:'right', whiteSpace:'nowrap',
    fontFamily:"'Inter',sans-serif",
    borderBottom:'1px solid var(--border-subtle)',
    background:'var(--bg-canvas)',
    position: stickyHeader ? 'sticky' : 'static',
    top: 0, zIndex: 1,
    userSelect:'none',
  }

  const TD_STYLE = {
    padding:'0 12px',
    height:'40px',
    fontSize:'12.5px',
    color:'var(--text-secondary)',
    borderBottom:'1px solid var(--border-subtle)',
    textAlign:'right',
    verticalAlign:'middle',
  }

  if (loading) {
    return (
      <div className="tbl-wrap">
        {/* Header skeleton */}
        <div style={{
          display:'flex', gap:'24px', padding:'8px 12px',
          background:'var(--bg-canvas)', borderBottom:'1px solid var(--border-subtle)',
          height:'36px', alignItems:'center',
        }}>
          {columns.slice(0, 4).map((_, i) => (
            <div key={i} className="skeleton rounded" style={{ height:'8px', width:`${[80,120,80,60][i]||80}px` }} />
          ))}
        </div>
        {/* Row skeletons */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            display:'flex', alignItems:'center', gap:'14px', padding:'0 12px',
            height:'40px', borderBottom:'1px solid var(--border-subtle)',
            opacity: 1 - i * 0.1,
          }}>
            <div className="skeleton rounded-full flex-shrink-0" style={{ width:'22px', height:'22px' }} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
              <div className="skeleton rounded" style={{ height:'9px', width:'35%' }} />
              <div className="skeleton rounded" style={{ height:'7px', width:'18%' }} />
            </div>
            <div className="skeleton rounded-full" style={{ height:'17px', width:'50px' }} />
            <div className="skeleton rounded" style={{ height:'22px', width:'52px' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="tbl-wrap">
        <div style={{ padding:'40px 24px', textAlign:'center' }} className="animate-fade-in">
          <div style={{
            width:'32px', height:'32px', borderRadius:'8px',
            background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 10px',
          }}>
            <svg style={{ width:'14px', height:'14px', color:'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <div style={{ fontSize:'12px', fontWeight:500, color:'var(--text-secondary)', marginBottom:'3px', fontFamily:"'Inter',sans-serif" }}>
            {emptyText}
          </div>
          {emptySubtext && (
            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>{emptySubtext}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="tbl-wrap" style={{ overflow:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {selectable && (
              <th style={{ ...TH_STYLE, width:'36px', textAlign:'center' }}>
                <input type="checkbox" checked={selected.size === rows.length}
                  onChange={toggleAll} style={{ accentColor:'var(--brand-500)', cursor:'pointer' }} />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} style={{ ...TH_STYLE, width: col.width }}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  className={col.sortable ? 'cursor-pointer hover:text-white transition-colors' : ''}>
                <div style={{ display:'flex', alignItems:'center', gap:'4px',
                              justifyContent: col.align === 'center' ? 'center' : 'flex-end' }}>
                  {col.label}
                  {col.sortable && sortCol === col.key && (
                    sortDir === 'asc'
                      ? <ChevronUp style={{ width:10, height:10 }} />
                      : <ChevronDown style={{ width:10, height:10 }} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => {
            const id = row.id || row.uid || ri
            const isSelected = selected.has(id)
            return (
              <tr key={id}
                className="group"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  background: isSelected ? 'var(--bg-active)' : 'transparent',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background='var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background='transparent'
                }}>
                {selectable && (
                  <td style={{ ...TD_STYLE, textAlign:'center', width:'36px' }}>
                    <input type="checkbox" checked={isSelected}
                      onChange={() => toggleRow(id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor:'var(--brand-500)', cursor:'pointer' }} />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} style={{
                    ...TD_STYLE,
                    textAlign: col.align || 'right',
                    color: col.primary ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: col.primary ? 500 : 400,
                  }}>
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
