// ============================================================
// Audit Logs — Enterprise DataTable with before/after diff
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import { ShieldCheck, Search, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db, COL } from '../../services/firebase'
import DataTable, { StatusPill } from '../../components/ui/DataTable'

const ACTION_STYLE = {
  create:       { label:'Created',  status:'active'  },
  update:       { label:'Updated',  status:'warning' },
  delete:       { label:'Deleted',  status:'critical'},
  login:        { label:'Login',    status:'good'    },
  logout:       { label:'Logout',   status:'inactive'},
  import:       { label:'Import',   status:'info'    },
  bulk_approve: { label:'Approved', status:'active'  },
}

function DiffRow({ label, before, after }) {
  const changed = JSON.stringify(before) !== JSON.stringify(after)
  if (!changed && before === undefined) return null
  return (
    <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr', gap:'8px', fontSize:'11px', padding:'3px 0', borderBottom:'1px solid var(--border-subtle)' }}>
      <span style={{ color:'var(--text-muted)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>{label}</span>
      <span style={{ color: changed ? '#f87171' : 'var(--text-muted)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {before !== undefined ? JSON.stringify(before) : '—'}
      </span>
      <span style={{ color: changed ? '#4ade80' : 'var(--text-muted)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {after !== undefined ? JSON.stringify(after) : '—'}
      </span>
    </div>
  )
}

function ExpandedLog({ log }) {
  const before = log.before || {}
  const after  = log.after  || {}
  const keys   = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => !['createdAt','updatedAt','timestamp'].includes(k))

  return (
    <div style={{
      padding:'12px 16px', background:'var(--bg-overlay)',
      borderBottom:'1px solid var(--border-subtle)',
    }}>
      {keys.length > 0 ? (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr', gap:'8px', marginBottom:'6px' }}>
            <span style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)' }}>Field</span>
            <span style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'#f87171' }}>Before</span>
            <span style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'#4ade80' }}>After</span>
          </div>
          {keys.map((k) => (
            <DiffRow key={k} label={k} before={before[k]} after={after[k]} />
          ))}
        </div>
      ) : (
        <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>No field changes recorded</span>
      )}
    </div>
  )
}

export default function AuditLogsPage() {
  const [logs,       setLogs]     = useState([])
  const [loading,    setLoading]  = useState(true)
  const [search,     setSearch]   = useState('')
  const [expanded,   setExpanded] = useState(null)

  useEffect(() => {
    const q = query(collection(db, COL.AUDIT_LOGS), orderBy('timestamp', 'desc'), limit(200))
    const u = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id:d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return u
  }, [])

  const filtered = useMemo(() => {
    if (!search) return logs
    const q = search.toLowerCase()
    return logs.filter((l) =>
      l.action?.includes(q) ||
      l.userId?.includes(q) ||
      l.collection?.includes(q)
    )
  }, [logs, search])

  const fmt = (ts) => {
    if (!ts) return '—'
    const d = ts.toDate?.() || new Date(ts)
    return d.toLocaleString('en-GB', { dateStyle:'short', timeStyle:'short' })
  }

  const columns = [
    {
      key:'timestamp', label:'Time', sortable:true, width:'130px',
      render:(v)=>(
        <span style={{ fontSize:'11px', fontFamily:'monospace', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
          {fmt(v)}
        </span>
      ),
    },
    {
      key:'action', label:'Action', sortable:true, width:'90px',
      render:(v)=>{
        const cfg = ACTION_STYLE[v] || { label:v, status:'neutral' }
        return <StatusPill status={cfg.status} label={cfg.label} />
      },
    },
    { key:'collection', label:'Collection', sortable:true,
      render:(v)=><span style={{ fontSize:'11px', fontFamily:'monospace', color:'var(--text-secondary)' }}>{v||'—'}</span> },
    { key:'userId', label:'User', sortable:true,
      render:(v)=><span style={{ fontSize:'11px', fontFamily:'monospace', color:'var(--text-muted)' }}>{v?.slice(0,12)||'—'}…</span> },
    { key:'userRole', label:'Role', sortable:true,
      render:(v)=><span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{v||'—'}</span> },
    {
      key:'_expand', label:'', align:'center', width:'60px',
      render:(_, row)=>(
        <button onClick={(e)=>{ e.stopPropagation(); setExpanded(expanded===row.id?null:row.id) }}
          style={{
            display:'flex', alignItems:'center', gap:'4px',
            fontSize:'11px', color:'var(--text-muted)',
            background:'transparent', border:'none', cursor:'pointer',
            padding:'2px 6px', borderRadius:'4px', transition:'color 0.12s',
          }}
          onMouseEnter={(e)=>e.currentTarget.style.color='var(--text-primary)'}
          onMouseLeave={(e)=>e.currentTarget.style.color='var(--text-muted)'}>
          {expanded===row.id
            ? <ChevronUp style={{ width:12, height:12 }} />
            : <ChevronDown style={{ width:12, height:12 }} />}
        </button>
      ),
    },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:'15px', fontWeight:600, letterSpacing:'-0.02em', color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>
            Audit Log
          </h1>
          <p style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
            {logs.length} events recorded
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:'var(--text-muted)' }}>
          <Clock style={{ width:12, height:12 }} />
          Real-time
        </div>
      </div>

      <div style={{ position:'relative', maxWidth:'280px' }}>
        <Search style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', width:13, height:13, color:'var(--text-muted)', pointerEvents:'none' }} />
        <input value={search} onChange={(e)=>setSearch(e.target.value)}
          placeholder="Filter by action, user or collection..."
          style={{ paddingRight:'32px', height:'34px', fontSize:'13px' }} />
      </div>

      {/* Custom table with expandable rows */}
      <div className="tbl-wrap">
        {loading ? (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>
            Loading logs...
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} style={{
                    padding:'8px 12px', fontSize:'10px', fontWeight:500,
                    letterSpacing:'0.07em', textTransform:'uppercase',
                    color:'var(--text-muted)', textAlign: col.align||'right',
                    borderBottom:'1px solid var(--border-subtle)',
                    background:'var(--bg-canvas)',
                    fontFamily:"'Inter',sans-serif",
                    width: col.width,
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0,100).map((log) => (
                <React.Fragment key={log.id}>
                  <tr style={{ transition:'background 0.1s' }}
                    onMouseEnter={(e)=>e.currentTarget.style.background='var(--bg-hover)'}
                    onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
                    {columns.map((col) => (
                      <td key={col.key} style={{
                        padding:'0 12px', height:'38px',
                        borderBottom: expanded===log.id ? 'none' : '1px solid var(--border-subtle)',
                        textAlign: col.align||'right', verticalAlign:'middle',
                      }}>
                        {col.render ? col.render(log[col.key], log) : log[col.key]??'—'}
                      </td>
                    ))}
                  </tr>
                  {expanded === log.id && (
                    <tr>
                      <td colSpan={columns.length} style={{ padding:0 }}>
                        <ExpandedLog log={log} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>
            No audit logs found
          </div>
        )}
      </div>
    </div>
  )
}
