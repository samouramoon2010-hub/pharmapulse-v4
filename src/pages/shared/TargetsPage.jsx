// ============================================================
// Targets Management Page — Full Production Build
// Collection: targets/{pharmacyId}_{month}
// Schema: pharmacyId, month, wasfatyTarget, omniTarget,
//         wellnessTarget, basketTarget, crossSellTarget
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Target, Plus, Pencil, Trash2, Save, X, Loader2,
  Building2, ChevronRight, Copy, CheckCircle2,
  AlertTriangle, BarChart2, Layers, TrendingUp,
} from 'lucide-react'
import { format, subMonths } from 'date-fns'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }    from '../../components/ui/Toast'
import ConfirmModal         from '../../components/ui/ConfirmModal'
import EmptyState           from '../../components/ui/EmptyState'
import { SkeletonTable }    from '../../components/ui/SkeletonCard'
import {
  getTrafficLight, TRAFFIC_COLORS,
  computeAchievementPct, sumKpi, getDayProgress,
} from '../../engine'
import {
  getTargetInputConfigs,
  buildFormInitialState,
} from '../../engine/kpiRegistry'
import {
  subscribeKpiRegistry,
} from '../../services/kpiRegistryService'
import { mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import {
  saveTarget, deleteTarget,
  subscribeAllTargets, subscribeTargets,
} from '../../services/kpiService'

// ── KPI color map — safe fallback for dynamic KPIs ────────────
const KPI_COLORS = {
  wasfaty:      '#6366f1',
  omnihealth:   '#ef4444',
  wellnessCard: '#f59e0b',
  basket:       '#22c55e',
  crossSelling: '#8b5cf6',
}
const DEFAULT_KPI_COLOR = '#a1a1aa'
// targetInputConfigs and kpiFields are live useMemo hooks inside TargetsPage()
// and passed as props to TargetCard, TargetFormModal, BulkModal
// using the live Firestore-backed registry (see useRegistryData hook below).

function toMonthStr(d) {
  return format(d, 'yyyy-MM')
}
function monthLabel(s) {
  if (!s) return '—'
  const [y, m] = s.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}
function monthDays(s) {
  const [y, m] = s.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// ── Mini field label ──────────────────────────────────────────
function FL({ label, error, children }) {
  return (
    <div>
      <label style={{
        display:'block', fontSize:'10px', fontWeight:500,
        letterSpacing:'0.07em', textTransform:'uppercase',
        color:'var(--text-muted)', marginBottom:'4px',
        fontFamily:"'Inter',sans-serif",
      }}>{label}</label>
      {children}
      {error && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'3px' }}>{error}</p>}
    </div>
  )
}

// ── Achievement pill ──────────────────────────────────────────
function AchPill({ actual, target, dp }) {
  if (!target || target <= 0)
    return <span style={{ color:'var(--text-muted)', fontSize:'10px' }}>—</span>
  const pct = computeAchievementPct(actual, target)
  const cfg = TRAFFIC_COLORS[getTrafficLight(pct, dp.ratio)]
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'3px',
      padding:'1px 7px', borderRadius:'99px', fontSize:'10px', fontWeight:600,
      fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums',
      background: cfg.bg, border:`1px solid ${cfg.border}`, color: cfg.color,
    }}>
      {pct}%
    </span>
  )
}

// ── Target Card ───────────────────────────────────────────────
function TargetCard({ target, mtdEntries, dp, onEdit, onDelete, onCopy, kpiFields }) {
  const [open, setOpen] = useState(false)

  const kpiActuals = useMemo(() =>
    Object.fromEntries(kpiFields.map(({ key, kpi }) => [key, sumKpi(mtdEntries, kpi)])),
    [mtdEntries]
  )

  const overallPct = useMemo(() => {
    const vals = kpiFields
      .filter(({ key }) => target[key] > 0)
      .map(({ key }) => computeAchievementPct(kpiActuals[key], target[key]))
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0
  }, [kpiActuals, target])

  const hasEntries = mtdEntries.length > 0
  const overallCfg = TRAFFIC_COLORS[getTrafficLight(overallPct, dp.ratio)]

  const CARD = {
    background:'var(--bg-surface)',
    border:'1px solid var(--border-subtle)',
    borderRadius:'10px',
    boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)',
    overflow:'hidden',
    transition:'border-color 0.15s',
  }
  const ICON_BTN = (hoverBg, hoverColor) => ({
    base: {
      width:26, height:26, borderRadius:'6px', border:'none',
      background:'transparent', cursor:'pointer', transition:'all 0.12s',
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'var(--text-muted)',
    },
    hover: { background: hoverBg, color: hoverColor },
  })

  const iconStyle = (s) => ({
    ...s.base,
    onMouseEnter: (e) => Object.assign(e.currentTarget.style, s.hover),
    onMouseLeave: (e) => Object.assign(e.currentTarget.style, { background:'transparent', color:'var(--text-muted)' }),
  })

  return (
    <div style={CARD}
      onMouseEnter={(e) => e.currentTarget.style.borderColor='var(--border-default)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor='var(--border-subtle)'}>

      {/* Row 1 — header */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px' }}>
        <Building2 style={{ width:13, height:13, color:'var(--text-muted)', flexShrink:0 }} strokeWidth={1.75} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:500, color:'var(--text-primary)', lineHeight:1.2 }}>
            {target._pharmacyName}
          </div>
          <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'1px', fontFamily:"'Inter',sans-serif" }}>
            {monthLabel(target.month)}
          </div>
        </div>

        {hasEntries && (
          <span style={{
            fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'99px',
            fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif",
            background: overallCfg.bg, border:`1px solid ${overallCfg.border}`, color: overallCfg.color,
          }}>
            {overallPct}% {overallCfg.icon}
          </span>
        )}

        {/* actions */}
        <div style={{ display:'flex', gap:'2px' }}>
          {[
            { icon: ChevronRight, title:'Expand', style:{ transform: open ? 'rotate(90deg)' : 'none' }, fn: () => setOpen(p => !p), hBg:'var(--bg-overlay)', hCol:'var(--text-primary)' },
            { icon: Copy,         title:'Copy to next month', fn: () => onCopy(target), hBg:'var(--bg-overlay)', hCol:'var(--text-primary)' },
            { icon: Pencil,       title:'Edit',   fn: () => onEdit(target), hBg:'var(--bg-overlay)', hCol:'var(--text-primary)' },
            { icon: Trash2,       title:'Delete', fn: () => onDelete(target), hBg:'rgba(239,68,68,0.08)', hCol:'#f87171' },
          ].map(({ icon: Icon, title, fn, hBg, hCol, style: s = {} }) => (
            <button key={title} title={title} onClick={fn}
              style={{ width:26, height:26, borderRadius:'6px', border:'none', background:'transparent',
                       cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                       color:'var(--text-muted)', transition:'all 0.12s', ...s }}
              onMouseEnter={(e) => { e.currentTarget.style.background=hBg; e.currentTarget.style.color=hCol }}
              onMouseLeave={(e) => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text-muted)' }}>
              <Icon style={{ width:12, height:12 }} strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>

      {/* Row 2 — KPI targets grid */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(5,1fr)',
        borderTop:'1px solid var(--border-subtle)', padding:'8px 14px', gap:'4px',
      }}>
        {kpiFields.map(({ key, label, color, kpi }) => {
          const tgt    = target[key] || 0
          const actual = kpiActuals[key] || 0
          return (
            <div key={key} style={{ textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'3px', marginBottom:'3px' }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:color }} />
                <span style={{ fontSize:'9px', color:'var(--text-muted)', fontFamily:"'Inter',sans-serif", letterSpacing:'0.04em' }}>{label}</span>
              </div>
              <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums' }}>
                {tgt > 0 ? tgt.toLocaleString() : <span style={{ color:'var(--border-default)' }}>—</span>}
              </div>
              {hasEntries && tgt > 0 && (
                <div style={{ marginTop:'2px' }}>
                  <AchPill actual={actual} target={tgt} dp={dp} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Row 3 — expanded achievement bars */}
      {open && hasEntries && (
        <div style={{ borderTop:'1px solid var(--border-subtle)', padding:'10px 14px' }}>
          <div style={{ fontSize:'9px', letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'8px', fontFamily:"'Inter',sans-serif" }}>
            MTD Achievement vs Target
          </div>
          {kpiFields.map(({ key, kpi, label, color }) => {
            const tgt    = target[key] || 0
            const actual = kpiActuals[key] || 0
            const pct    = computeAchievementPct(actual, tgt)
            const cfg    = tgt > 0 ? TRAFFIC_COLORS[getTrafficLight(pct, dp.ratio)] : null
            return (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px' }}>
                <div style={{ width:'72px', textAlign:'right', fontSize:'10px', color:'var(--text-secondary)', flexShrink:0 }}>{label}</div>
                <div style={{ flex:1, height:'4px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                  {tgt > 0 && (
                    <div style={{ height:'100%', borderRadius:'99px', background: cfg?.color || color,
                                  width:`${Math.min(pct, 100)}%`, transition:'width 0.6s ease' }} />
                  )}
                </div>
                <div style={{ width:'36px', textAlign:'left', fontSize:'10px', fontWeight:600, fontVariantNumeric:'tabular-nums',
                              color: tgt > 0 ? cfg?.color : 'var(--text-muted)' }}>
                  {tgt > 0 ? `${pct}%` : '—'}
                </div>
                <div style={{ width:'48px', textAlign:'left', fontSize:'10px', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
                  {tgt > 0 ? `${actual.toLocaleString()}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Target Form Modal (add / edit) ────────────────────────────
function TargetFormModal({ open, onClose, editTarget, pharmacies, entries, onSave, saving, targetInputConfigs, kpiFields }) {
  const EMPTY = { pharmacyId:'', month: toMonthStr(new Date()),
    ...Object.fromEntries(targetInputConfigs.map(c => [c.targetFieldName, 0])) }
  const [form,   setForm]   = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const dp = getDayProgress()

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(editTarget
      ? { pharmacyId: editTarget.pharmacyId, month: editTarget.month,
          ...Object.fromEntries(targetInputConfigs.map(c => [c.targetFieldName, editTarget[c.targetFieldName] || 0])) }
      : EMPTY)
  }, [open, editTarget])

  const sf = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: undefined, _global: undefined })) }

  // Preview entries for selected pharmacy + month
  const previewEntries = useMemo(() => {
    if (!form.pharmacyId || !form.month) return []
    const from = `${form.month}-01`
    const to   = `${form.month}-${monthDays(form.month).toString().padStart(2,'0')}`
    return entries.filter(e => e.pharmacyId === form.pharmacyId && e.date >= from && e.date <= to)
  }, [form.pharmacyId, form.month, entries])

  // Month select options (2 months back → 2 months ahead)
  const monthOpts = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 2 - i)
      const v = toMonthStr(d)
      return { value: v, label: monthLabel(v) }
    }), [])

  const validate = () => {
    const e = {}
    if (!form.pharmacyId) e.pharmacyId = 'Required'
    if (!form.month)      e.month      = 'Required'
    const allZero = kpiFields.every(({ key }) => !form[key] || Number(form[key]) <= 0)
    if (allZero) e._global = 'At least one KPI target must be greater than 0'
    return e
  }

  const handleSave = () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave(form)
  }

  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }} onClick={onClose} />
      <div style={{
        position:'relative', width:'100%', maxWidth:'500px',
        background:'var(--bg-elevated)', border:'1px solid var(--border-strong)',
        borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
        maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column',
        animation:'scaleIn 0.2s ease-out both',
      }}>
        {/* Header */}
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border-subtle)',
                      display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
              {editTarget ? 'Edit Target' : 'New Monthly Target'}
            </div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
              One document per pharmacy × month in Firestore
            </div>
          </div>
          <button onClick={onClose}
            style={{ width:28, height:28, borderRadius:'6px', border:'none', background:'transparent',
                     cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--bg-overlay)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <X style={{ width:14, height:14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding:'16px', flex:1 }}>
          {errors._global && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', borderRadius:'8px', marginBottom:'12px', fontSize:'12px', color:'#fbbf24', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle style={{ width:13, height:13, flexShrink:0 }} />
              {errors._global}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'14px' }}>
            <FL label="Branch *" error={errors.pharmacyId}>
              <select value={form.pharmacyId} onChange={e => sf('pharmacyId', e.target.value)}
                disabled={!!editTarget}
                style={{ height:'34px', fontSize:'13px', opacity: editTarget ? 0.6 : 1 }}>
                <option value="">Select branch...</option>
                {pharmacies.filter(p => p.active !== false).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </FL>
            <FL label="Month *" error={errors.month}>
              <select value={form.month} onChange={e => sf('month', e.target.value)}
                disabled={!!editTarget}
                style={{ height:'34px', fontSize:'13px', opacity: editTarget ? 0.6 : 1 }}>
                {monthOpts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </FL>
          </div>

          {/* KPI targets */}
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'8px', fontFamily:"'Inter',sans-serif" }}>
              Monthly KPI Targets
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {kpiFields.map(({ key, label, color, kpi }) => {
                const actual = sumKpi(previewEntries, kpi)
                return (
                  <div key={key}>
                    <label style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'10px',
                                    fontWeight:500, color:'var(--text-muted)', marginBottom:'4px', fontFamily:"'Inter',sans-serif" }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }} />
                      {label}
                      {actual > 0 && <span style={{ marginRight:'auto', fontSize:'9px', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>MTD: {actual.toLocaleString()}</span>}
                    </label>
                    <input type="number" min="0" dir="ltr"
                      value={form[key] || ''}
                      onChange={e => sf(key, Number(e.target.value) || 0)}
                      placeholder="0"
                      style={{ height:'34px', fontSize:'13px', fontVariantNumeric:'tabular-nums' }} />
                    {actual > 0 && form[key] > 0 && (
                      <div style={{ marginTop:'3px' }}>
                        <AchPill actual={actual} target={form[key]} dp={dp} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {previewEntries.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 10px', borderRadius:'7px', fontSize:'11px', color:'var(--brand-400)', background:'rgba(0,210,173,0.05)', border:'1px solid rgba(0,210,173,0.15)' }}>
              <BarChart2 style={{ width:12, height:12, flexShrink:0 }} />
              {previewEntries.length} entries found — achievement shown inline
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border-subtle)', display:'flex', gap:'8px', flexShrink:0 }}>
          <button onClick={onClose}
            style={{ height:'34px', padding:'0 16px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex:1, height:'34px', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, background:'var(--brand-500)', border:'none', color:'#09090b', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {saving
              ? <><Loader2 style={{ width:13, height:13, animation:'spin 1s linear infinite' }} />Saving...</>
              : <><Save style={{ width:13, height:13 }} />{editTarget ? 'Save Changes' : 'Create Target'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk Modal ────────────────────────────────────────────────
function BulkModal({ open, onClose, pharmacies, onSave, saving, targetInputConfigs, kpiFields }) {
  const [month,    setMonth]    = useState(toMonthStr(new Date()))
  const [selected, setSelected] = useState([])
  const [rows,     setRows]     = useState({})

  useEffect(() => { if (open) { setSelected([]); setRows({}) } }, [open])

  const monthOpts = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 2 - i)
      const v = toMonthStr(d)
      return { value: v, label: monthLabel(v) }
    }), [])

  const toggle = (id) => {
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
    if (!rows[id]) {
      const ph = pharmacies.find(p => p.id === id)
      setRows(r => ({ ...r, [id]: { name: ph?.name || id, ...Object.fromEntries(targetInputConfigs.map(c => [c.targetFieldName, 0])) } }))
    }
  }

  const setVal = (id, key, val) =>
    setRows(r => ({ ...r, [id]: { ...r[id], [key]: Number(val) || 0 } }))

  const handleSave = () => {
    const data = selected.map(id => ({ pharmacyId: id, month, ...rows[id] }))
    onSave(data)
  }

  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }} onClick={onClose} />
      <div style={{
        position:'relative', width:'100%', maxWidth:'720px',
        background:'var(--bg-elevated)', border:'1px solid var(--border-strong)',
        borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
        maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column',
        animation:'scaleIn 0.2s ease-out both',
      }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)' }}>Bulk Target Entry</div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>Set targets for multiple branches at once</div>
          </div>
          <button onClick={onClose}
            style={{ width:28, height:28, borderRadius:'6px', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--bg-overlay)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <X style={{ width:14, height:14 }} />
          </button>
        </div>

        <div style={{ overflowY:'auto', padding:'16px', flex:1 }}>
          {/* Month */}
          <div style={{ marginBottom:'14px', maxWidth:'200px' }}>
            <FL label="Target Month">
              <select value={month} onChange={e => setMonth(e.target.value)} style={{ height:'34px', fontSize:'13px' }}>
                {monthOpts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </FL>
          </div>

          {/* Branch selector */}
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'6px', fontFamily:"'Inter',sans-serif" }}>
              Select Branches ({selected.length} selected)
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
              {pharmacies.filter(p => p.active !== false).map(p => {
                const on = selected.includes(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    style={{
                      padding:'4px 10px', borderRadius:'6px', fontSize:'12px', cursor:'pointer',
                      transition:'all 0.12s', display:'flex', alignItems:'center', gap:'4px',
                      background: on ? 'var(--bg-active)' : 'var(--bg-overlay)',
                      border:`1px solid ${on ? 'var(--border-brand)' : 'var(--border-subtle)'}`,
                      color: on ? 'var(--brand-300)' : 'var(--text-secondary)',
                    }}>
                    {on && <CheckCircle2 style={{ width:10, height:10 }} />}
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* KPI table */}
          {selected.length > 0 && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding:'6px 10px', fontSize:'10px', fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', textAlign:'right', borderBottom:'1px solid var(--border-subtle)', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>Branch</th>
                    {kpiFields.map(({ key, label, color }) => (
                      <th key={key} style={{ padding:'6px 8px', fontSize:'9px', fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', textAlign:'center', borderBottom:'1px solid var(--border-subtle)', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
                          <div style={{ width:5, height:5, borderRadius:'50%', background:color }} />{label}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.map(id => (
                    <tr key={id}>
                      <td style={{ padding:'6px 10px', fontSize:'12px', fontWeight:500, color:'var(--text-primary)', borderBottom:'1px solid var(--border-subtle)', whiteSpace:'nowrap' }}>
                        {rows[id]?.name || id}
                      </td>
                      {kpiFields.map(({ key }) => (
                        <td key={key} style={{ padding:'4px 5px', borderBottom:'1px solid var(--border-subtle)' }}>
                          <input type="number" min="0" dir="ltr"
                            value={rows[id]?.[key] || ''}
                            onChange={e => setVal(id, key, e.target.value)}
                            placeholder="0"
                            style={{ height:'30px', fontSize:'12px', textAlign:'center', padding:'0 6px', fontVariantNumeric:'tabular-nums' }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border-subtle)', display:'flex', gap:'8px', flexShrink:0 }}>
          <button onClick={onClose}
            style={{ height:'34px', padding:'0 16px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!selected.length || saving}
            style={{ flex:1, height:'34px', borderRadius:'8px', fontSize:'12px', fontWeight:600, background:'var(--brand-500)', border:'none', color:'#09090b', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', cursor: (!selected.length || saving) ? 'not-allowed' : 'pointer', opacity: (!selected.length || saving) ? 0.5 : 1 }}>
            {saving ? <Loader2 style={{ width:13, height:13, animation:'spin 1s linear infinite' }} /> : <Save style={{ width:13, height:13 }} />}
            Save {selected.length} Target{selected.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function TargetsPage() {
  const { userProfile }  = useAuthStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()
  const {
    entries,
    subscribeAllEntries,
    subscribePharmacyEntries,
  } = useKpiStore()
  const toast = useToastStore()

  const [targets,    setTargets]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [viewMonth,  setViewMonth]  = useState(toMonthStr(new Date()))
  const [showForm,   setShowForm]   = useState(false)
  const [showBulk,   setShowBulk]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [confirm,    setConfirm]    = useState(null)

  // ── Live Firestore-backed KPI registry ───────────────────────
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      () => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // KPI configs computed from live registry — reactive to Firestore changes
  const targetInputConfigs = useMemo(
    () => getTargetInputConfigs(liveRegistry),
    [liveRegistry],
  )
  const kpiFields = useMemo(
    () => targetInputConfigs.map(cfg => ({
      key:   cfg.targetFieldName,
      kpi:   cfg.engineKey,
      label: cfg.shortLabel,
      color: cfg.defaultColor ?? DEFAULT_KPI_COLOR,
    })),
    [targetInputConfigs],
  )

  const role       = userProfile?.role
  const isAdmin    = role === 'admin'
  const pharmacyId = userProfile?.pharmacyId
  const dp         = getDayProgress()

  useEffect(() => {
    const u1 = subPh()
    let u2 = () => {}
    let u3 = () => {}

    if (isAdmin) {
      u2 = subscribeAllTargets(list => { setTargets(list); setLoading(false) })
      u3 = subscribeAllEntries()
    } else if (pharmacyId) {
      u2 = subscribeTargets(pharmacyId, list => { setTargets(list); setLoading(false) })
      u3 = subscribePharmacyEntries(pharmacyId)
    } else {
      setLoading(false)
    }
    return () => { u1?.(); u2?.(); u3?.() }
  }, [userProfile?.uid])

  // Augment targets with pharmacy name
  const allTargets = useMemo(() =>
    targets.map(t => ({
      ...t,
      _pharmacyName: pharmacies.find(p => p.id === t.pharmacyId)?.name || t.pharmacyId,
    })), [targets, pharmacies])

  // Filter to view month
  const viewTargets = useMemo(() =>
    allTargets.filter(t => t.month === viewMonth), [allTargets, viewMonth])

  // Get MTD entries for a specific pharmacy in the view month
  const getEntries = (pid) => {
    const from = `${viewMonth}-01`
    const to   = `${viewMonth}-${monthDays(viewMonth).toString().padStart(2,'0')}`
    return entries.filter(e => e.pharmacyId === pid && e.date >= from && e.date <= to)
  }

  // Month tab options
  const monthTabs = useMemo(() =>
    Array.from({ length: 4 }, (_, i) => {
      const d = subMonths(new Date(), 2 - i)
      const v = toMonthStr(d)
      return { value: v, label: format(d, 'MMM yyyy'), count: allTargets.filter(t => t.month === v).length }
    }), [allTargets])

  const stats = useMemo(() => {
    const active  = pharmacies.filter(p => p.active !== false).length
    const covered = new Set(viewTargets.map(t => t.pharmacyId)).size
    return { active, covered, missing: active - covered }
  }, [viewTargets, pharmacies])

  // ── Actions ──────────────────────────────────────────────────
  const handleSave = async (form) => {
    setSaving(true)
    try {
      await saveTarget({
        pharmacyId:      form.pharmacyId,
        month:           form.month,
        ...Object.fromEntries(targetInputConfigs.map(c => [c.targetFieldName, Number(form[c.targetFieldName]) || 0])),
        actorId:   userProfile?.uid,
        actorRole: userProfile?.role,
      })
      toast.success(editTarget ? 'Target updated' : 'Target created')
      setShowForm(false); setEditTarget(null)
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleBulkSave = async (rows) => {
    setSaving(true)
    let ok = 0, fail = 0
    for (const row of rows) {
      try {
        await saveTarget({
          pharmacyId:      row.pharmacyId,
          month:           row.month,
          ...Object.fromEntries(targetInputConfigs.map(c => [c.targetFieldName, Number(row[c.targetFieldName]) || 0])),
          actorId: userProfile?.uid, actorRole: userProfile?.role,
        })
        ok++
      } catch { fail++ }
    }
    setSaving(false); setShowBulk(false)
    if (ok)   toast.success(`${ok} target${ok > 1 ? 's' : ''} saved`)
    if (fail) toast.error(`${fail} failed — check existing targets`)
  }

  const handleDelete = async (target) => {
    try {
      await deleteTarget(target.pharmacyId, target.month, userProfile?.uid, userProfile?.role)
      toast.success('Target deleted')
    } catch (e) { toast.error(e.message) }
    setConfirm(null)
  }

  const handleCopy = (target) => {
    const [y, m] = target.month.split('-').map(Number)
    const nextMonth = toMonthStr(new Date(y, m, 1))
    // Check if next month already has a target
    const exists = allTargets.some(t => t.pharmacyId === target.pharmacyId && t.month === nextMonth)
    if (exists) {
      toast.warning(`Target for ${monthLabel(nextMonth)} already exists — edit it instead`)
      return
    }
    setEditTarget(null)
    // Pre-fill form with same values but next month
    setTimeout(() => {
      setEditTarget({
        ...target,
        month:     nextMonth,
        id:        undefined,
        _isNew:    true,
      })
      setShowForm(true)
    }, 0)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px' }}>
        <div>
          <h1 style={{ fontSize:'15px', fontWeight:600, letterSpacing:'-0.02em', color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>
            Targets
          </h1>
          <p style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
            {stats.covered} / {stats.active} branches configured for {monthLabel(viewMonth)}
          </p>
        </div>
        <div style={{ display:'flex', gap:'6px' }}>
          {isAdmin && (
            <button onClick={() => setShowBulk(true)}
              style={{ height:'32px', padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'5px', transition:'all 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background='var(--bg-elevated)'; e.currentTarget.style.color='var(--text-secondary)' }}>
              <Layers style={{ width:13, height:13 }} strokeWidth={1.75} /> Bulk Entry
            </button>
          )}
          <button onClick={() => { setEditTarget(null); setShowForm(true) }}
            style={{ height:'32px', padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer', background:'var(--brand-500)', border:'none', color:'#09090b', display:'flex', alignItems:'center', gap:'5px' }}>
            <Plus style={{ width:13, height:13 }} /> Add Target
          </button>
        </div>
      </div>

      {/* Missing branches alert */}
      {isAdmin && stats.missing > 0 && viewMonth === toMonthStr(new Date()) && (
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 14px', borderRadius:'8px', fontSize:'12px', color:'#fbbf24', background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.18)' }}>
          <AlertTriangle style={{ width:13, height:13, flexShrink:0 }} />
          {stats.missing} branch{stats.missing > 1 ? 'es are' : ' is'} missing targets for this month
          <button onClick={() => setShowBulk(true)}
            style={{ marginRight:'auto', fontSize:'11px', fontWeight:600, color:'#fbbf24', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:'5px', padding:'2px 8px', cursor:'pointer' }}>
            Set up now
          </button>
        </div>
      )}

      {/* Month tabs */}
      <div style={{ display:'flex', gap:'2px', background:'var(--bg-hover)', border:'1px solid var(--border-subtle)', borderRadius:'9px', padding:'3px' }}>
        {monthTabs.map(tab => (
          <button key={tab.value} onClick={() => setViewMonth(tab.value)}
            style={{
              flex:1, height:'30px', borderRadius:'6px', fontSize:'12px', fontWeight:500, cursor:'pointer',
              background: viewMonth === tab.value ? 'var(--bg-card)' : 'transparent',
              border: `1px solid ${viewMonth === tab.value ? 'var(--border-default)' : 'transparent'}`,
              color: viewMonth === tab.value ? 'var(--text-primary)' : 'var(--text-muted)',
              transition:'all 0.15s', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
            }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{ fontSize:'9px', padding:'0 5px', borderRadius:'99px', background: viewMonth === tab.value ? 'var(--brand-500)' : 'var(--bg-overlay)', color: viewMonth === tab.value ? '#09090b' : 'var(--text-muted)' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonTable rows={4} />
      ) : viewTargets.length === 0 ? (
        <EmptyState icon={Target}
          title={`No targets for ${monthLabel(viewMonth)}`}
          description="Add monthly targets to enable achievement tracking and KPI analytics"
          action={
            <button onClick={() => { setEditTarget(null); setShowForm(true) }}
              style={{ height:'32px', padding:'0 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer', background:'var(--brand-500)', border:'none', color:'#09090b', display:'flex', alignItems:'center', gap:'5px' }}>
              <Plus style={{ width:13, height:13 }} /> Add Target
            </button>
          }
        />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {viewTargets.map(t => (
            <TargetCard
              kpiFields={kpiFields}
              key={t.id}
              target={t}
              mtdEntries={getEntries(t.pharmacyId)}
              dp={dp}
              onEdit={tgt => { setEditTarget(tgt); setShowForm(true) }}
              onDelete={tgt => setConfirm({ target: tgt })}
              onCopy={handleCopy}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <TargetFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditTarget(null) }}
        editTarget={editTarget?._isNew ? null : editTarget}
        pharmacies={pharmacies}
        entries={entries}
        onSave={handleSave}
        saving={saving}
        targetInputConfigs={targetInputConfigs}
        kpiFields={kpiFields}
      />
      <BulkModal
        open={showBulk}
        onClose={() => setShowBulk(false)}
        pharmacies={pharmacies}
        onSave={handleBulkSave}
        saving={saving}
        targetInputConfigs={targetInputConfigs}
        kpiFields={kpiFields}
      />
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => handleDelete(confirm?.target)}
        title="Delete Target"
        message={`Delete target for "${confirm?.target?._pharmacyName}" — ${monthLabel(confirm?.target?.month)}?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
