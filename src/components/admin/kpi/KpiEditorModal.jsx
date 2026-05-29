// ============================================================
// KpiEditorModal
// Allows editing or creating KPI definitions.
// Governance: key is immutable for existing KPIs.
//             Core/protected KPIs cannot be archived.
// No analytics logic — pure form UI.
// ============================================================
import React, { useState, useEffect, useMemo } from 'react'
import { X, Save, AlertTriangle, Shield, Plus } from 'lucide-react'

// ── Protected production KPI keys ─────────────────────────────
const PROTECTED_KEYS = new Set([
  'wasfaty','omnihealth','wellnessCard','basket','crossSelling',
  'sales','sl','ndf','inbody','liberation',
])

const CATEGORIES = ['prescription','digital','wellness','commercial','operational','health_program']
const VALUE_TYPES = ['number','currency','percentage','count']
const TARGET_TYPES = ['absolute','percentage','ratio']
const DIRECTIONS   = ['higher_is_better','lower_is_better']

function FL({ label, required, hint, children }) {
  return (
    <div>
      <label style={{
        display:'block', fontSize:'10px', fontWeight:600,
        textTransform:'uppercase', letterSpacing:'0.06em',
        color:'var(--text-muted)', marginBottom:'4px',
      }}>
        {label}{required && <span style={{ color:'#f87171', marginLeft:'2px' }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'3px' }}>{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width:36, height:20, borderRadius:'99px', border:'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--brand-500)' : 'var(--bg-hover)',
        position:'relative', transition:'background 0.2s', flexShrink:0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        display:'block', width:14, height:14, borderRadius:'50%', background:'white',
        position:'absolute', top:3, left: checked ? 19 : 3, transition:'left 0.2s',
        boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

function ToggleRow({ label, checked, onChange, disabled, hint }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0' }}>
      <div>
        <div style={{ fontSize:'12px', fontWeight:500, color:'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{hint}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

// ── Default form state for new KPI ────────────────────────────
function defaultForm() {
  return {
    key:'', label:'', shortLabel:'', labelAr:'',
    category:'commercial', valueType:'count', unit:'units', unitAr:'وحدة',
    direction:'higher_is_better', targetType:'absolute',
    weight:0, isActive:true, isCore:false,
    thresholds:{ healthy:90, watch:75, risk:55, critical:35 },
    visibility:{ dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:false },
    uiStatus:'ACTIVE',
  }
}

export default function KpiEditorModal({ open, onClose, onSave, editingKpi, existingKeys }) {
  const [form,   setForm]   = useState(defaultForm)
  const [errors, setErrors] = useState({})

  const isNew      = !editingKpi
  const isProtected = editingKpi && PROTECTED_KEYS.has(editingKpi.key)

  useEffect(() => {
    if (!open) return
    if (editingKpi) {
      setForm({
        key:       editingKpi.key,
        label:     editingKpi.label,
        shortLabel: editingKpi.shortLabel,
        labelAr:   editingKpi.labelAr,
        category:  editingKpi.category,
        valueType: editingKpi.valueType,
        unit:      editingKpi.unit,
        unitAr:    editingKpi.unitAr,
        direction: editingKpi.direction,
        targetType: editingKpi.targetType,
        weight:    editingKpi.weight,
        isActive:  editingKpi.isActive,
        isCore:    editingKpi.isCore,
        thresholds: { ...editingKpi.thresholds },
        visibility: { targetInputEnabled: false, ...editingKpi.visibility },
        uiStatus:  editingKpi.isActive ? 'ACTIVE' : 'ARCHIVED',
      })
    } else {
      setForm(defaultForm())
    }
    setErrors({})
  }, [open, editingKpi])

  const sf  = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const stf = (field, value) => setForm((f) => ({ ...f, thresholds: { ...f.thresholds, [field]: Number(value) } }))
  const svf = (field, value) => setForm((f) => ({ ...f, visibility: { ...f.visibility, [field]: value } }))

  const validate = () => {
    const e = {}
    if (!form.key.trim())           e.key    = 'Key is required'
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(form.key.trim())) e.key = 'Key must be camelCase letters/numbers only'
    if (isNew && existingKeys.has(form.key.trim())) e.key = 'Key already exists — choose a unique key'
    if (!form.label.trim())         e.label  = 'Label is required'
    if (!form.shortLabel.trim())    e.shortLabel = 'Short label is required'
    if (form.weight < 0 || form.weight > 1) e.weight = 'Weight must be between 0 and 1'
    // Threshold order
    const { healthy, watch, risk, critical } = form.thresholds
    if (!(healthy >= watch && watch >= risk && risk >= critical)) {
      e.thresholds = 'Thresholds must be ordered: healthy ≥ watch ≥ risk ≥ critical'
    }
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({
      key:        form.key.trim(),
      label:      form.label.trim(),
      shortLabel: form.shortLabel.trim(),
      labelAr:    form.labelAr.trim(),
      category:   form.category,
      valueType:  form.valueType,
      unit:       form.unit.trim(),
      unitAr:     form.unitAr.trim(),
      direction:  form.direction,
      targetType: form.targetType,
      weight:     Number(form.weight),
      isActive:   form.uiStatus !== 'ARCHIVED',
      isCore:     editingKpi ? editingKpi.isCore : false,  // isCore immutable after creation
      thresholds: { ...form.thresholds },
      visibility: { ...form.visibility },
      sortOrder:  editingKpi?.sortOrder ?? 999,
      description: editingKpi?.description ?? '',
    }, form.uiStatus)
  }

  if (!open) return null

  const INP = {
    height:'32px', fontSize:'13px', borderRadius:'6px',
    border:'1px solid var(--border-default)', background:'var(--bg-elevated)',
    color:'var(--text-primary)', padding:'0 10px', width:'100%', boxSizing:'border-box',
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)' }} onClick={onClose} />
      <div style={{
        position:'relative', width:'100%', maxWidth:'560px',
        background:'var(--bg-elevated)', border:'1px solid var(--border-strong)',
        borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
        maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column',
      }}>
        {/* Header */}
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)' }}>
              {isNew ? 'Add KPI Definition' : `Edit KPI: ${editingKpi?.key}`}
            </div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
              {isProtected ? '⚠ Protected KPI — key and isCore are immutable' : isNew ? 'New custom KPI stored locally' : 'Changes stored in session'}
            </div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:'6px', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X style={{ width:14, height:14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding:'16px', flex:1, display:'flex', flexDirection:'column', gap:'14px' }}>

          {/* Protected banner */}
          {isProtected && (
            <div style={{ display:'flex', gap:'8px', padding:'8px 12px', borderRadius:'8px', background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.2)', fontSize:'12px', color:'#60a5fa' }}>
              <Shield style={{ width:13, height:13, flexShrink:0, marginTop:1 }} />
              This is a protected production KPI. The key and core status cannot be changed.
            </div>
          )}

          {/* Identity */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <FL label="Key" required hint={!isNew ? 'Immutable after creation' : 'camelCase only, e.g. myKpi'}>
              <input
                value={form.key} disabled={!isNew}
                onChange={(e) => sf('key', e.target.value)}
                placeholder="myKpiKey"
                style={{ ...INP, opacity: !isNew ? 0.6 : 1 }}
              />
              {errors.key && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'2px' }}>{errors.key}</p>}
            </FL>
            <FL label="Category" required>
              <select value={form.category} onChange={(e) => sf('category', e.target.value)} style={{ ...INP }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FL>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
            <FL label="Label (EN)" required>
              <input value={form.label} onChange={(e) => sf('label', e.target.value)} placeholder="Full label" style={INP} />
              {errors.label && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'2px' }}>{errors.label}</p>}
            </FL>
            <FL label="Short Label" required>
              <input value={form.shortLabel} onChange={(e) => sf('shortLabel', e.target.value)} placeholder="Short" style={INP} />
              {errors.shortLabel && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'2px' }}>{errors.shortLabel}</p>}
            </FL>
            <FL label="Arabic Label">
              <input value={form.labelAr} onChange={(e) => sf('labelAr', e.target.value)} placeholder="الاسم" dir="rtl" style={INP} />
            </FL>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'10px' }}>
            <FL label="Value Type">
              <select value={form.valueType} onChange={(e) => sf('valueType', e.target.value)} style={INP}>
                {VALUE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </FL>
            <FL label="Unit (EN)">
              <input value={form.unit} onChange={(e) => sf('unit', e.target.value)} style={INP} />
            </FL>
            <FL label="Direction">
              <select value={form.direction} onChange={(e) => sf('direction', e.target.value)} style={INP}>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d === 'higher_is_better' ? '↑ Higher' : '↓ Lower'}</option>)}
              </select>
            </FL>
            <FL label="Weight" hint="Decimal 0–1, core KPIs only. e.g. 0.20 = 20%">
              <input type="number" min="0" max="1" step="0.01"
                value={form.weight} onChange={(e) => sf('weight', e.target.value)}
                disabled={isProtected && editingKpi?.isCore}
                style={{ ...INP, opacity: isProtected && editingKpi?.isCore ? 0.6 : 1 }}
              />
              <p style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'4px', lineHeight:1.5 }}>
                Use decimal: <strong style={{ color:'var(--text-secondary)' }}>0.20</strong> = 20% ·
                {' '}<strong style={{ color:'var(--text-secondary)' }}>0.15</strong> = 15%.
                {' '}Core KPI weights must total <strong style={{ color:'var(--text-secondary)' }}>1.00</strong>.
                {' '}Custom KPIs: use <strong style={{ color:'var(--text-secondary)' }}>0</strong>.
              </p>
              {errors.weight && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'2px' }}>{errors.weight}</p>}
            </FL>
          </div>

          {/* Thresholds */}
          <div>
            <div style={{ fontSize:'11px', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>
              Achievement Thresholds (%) — healthy ≥ watch ≥ risk ≥ critical
            </div>
            {errors.thresholds && (
              <div style={{ display:'flex', gap:'6px', padding:'6px 10px', borderRadius:'6px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', fontSize:'11px', color:'#f87171', marginBottom:'6px' }}>
                <AlertTriangle style={{ width:12, height:12, flexShrink:0, marginTop:1 }} />{errors.thresholds}
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'8px' }}>
              {[['healthy','Healthy','#22c55e'],['watch','Watch','#f59e0b'],['risk','Risk','#f97316'],['critical','Critical','#ef4444']].map(([field, label, color]) => (
                <FL key={field} label={label}>
                  <input type="number" min="0" max="200" step="1"
                    value={form.thresholds[field]}
                    onChange={(e) => stf(field, e.target.value)}
                    style={{ ...INP, borderColor: color + '55', color }}
                  />
                </FL>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <div style={{ fontSize:'11px', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>
              Status & Visibility
            </div>
            <div style={{ display:'flex', gap:'8px', marginBottom:'10px' }}>
              {['ACTIVE','HIDDEN_FROM_INPUT','ARCHIVED'].map((s) => (
                <button
                  key={s}
                  onClick={() => !isProtected && sf('uiStatus', s)}
                  disabled={isProtected}
                  style={{
                    padding:'4px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:600, cursor: isProtected ? 'not-allowed' : 'pointer',
                    border:'1px solid',
                    borderColor: form.uiStatus === s ? 'var(--brand-500)' : 'var(--border-default)',
                    background:  form.uiStatus === s ? 'rgba(0,210,173,0.1)' : 'transparent',
                    color:       form.uiStatus === s ? 'var(--brand-400)' : 'var(--text-muted)',
                    opacity: isProtected ? 0.6 : 1,
                  }}
                >
                  {s === 'ACTIVE' ? 'Active' : s === 'ARCHIVED' ? 'Archived' : 'Hidden from input'}
                </button>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'4px', padding:'10px 12px', borderRadius:'8px', background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)' }}>
              <ToggleRow label="Target Input" hint="Appear in Monthly Target form — non-core KPIs only"
                checked={form.visibility.targetInputEnabled ?? false}
                onChange={(v) => svf('targetInputEnabled', v)}
                disabled={!!editingKpi?.isCore} />
              <ToggleRow label="Dashboard" hint="Show in branch KPI dashboard"
                checked={form.visibility.dashboardEnabled}
                onChange={(v) => svf('dashboardEnabled', v)} />
              <ToggleRow label="Team Intelligence" hint="Include in team performance panels"
                checked={form.visibility.teamEnabled}
                onChange={(v) => svf('teamEnabled', v)} />
              <ToggleRow label="Executive BI" hint="Include in executive reports and rollups"
                checked={form.visibility.executiveEnabled}
                onChange={(v) => svf('executiveEnabled', v)} />
              <ToggleRow label="Regional Heatmaps" hint="Include in regional intelligence engine"
                checked={form.visibility.regionalEnabled}
                onChange={(v) => svf('regionalEnabled', v)} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border-subtle)', display:'flex', gap:'8px', flexShrink:0 }}>
          <button onClick={onClose} style={{ height:'34px', padding:'0 16px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{ flex:1, height:'34px', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer', background:'var(--brand-500)', border:'none', color:'#09090b', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            <Save style={{ width:13, height:13 }} />
            {isNew ? 'Add KPI' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
