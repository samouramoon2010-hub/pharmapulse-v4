// ============================================================
// Pharmacies Page — Enterprise DataTable
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Building2, Plus, Search, Pencil, ToggleLeft, ToggleRight,
  Trash2, Save, X, Loader2, AlertCircle, MapPin,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore } from '../../components/ui/Toast'
import ConfirmModal from '../../components/ui/ConfirmModal'
import DataTable, { StatusPill, RowActions } from '../../components/ui/DataTable'
import { pharmacyCodeExists } from '../../services/pharmacyService'

const SA_REGIONS = [
  'الرياض','مكة المكرمة','المدينة المنورة','القصيم','المنطقة الشرقية',
  'عسير','تبوك','حائل','الحدود الشمالية','جازان','نجران','الباحة','الجوف',
]

const EMPTY = { code:'', name:'', region:'الرياض', city:'', managerEmail:'', active:true }

function F({ label, required, error, children }) {
  return (
    <div style={{ marginBottom:'12px' }}>
      <label style={{
        display:'block', fontSize:'10px', fontWeight:500,
        letterSpacing:'0.07em', textTransform:'uppercase',
        color:'var(--text-muted)', marginBottom:'5px', fontFamily:"'Inter',sans-serif",
      }}>
        {label}{required && <span style={{ color:'#ef4444', marginRight:'3px' }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'4px' }}>{error}</p>}
    </div>
  )
}

export default function PharmaciesPage() {
  const { userProfile } = useAuthStore()
  const { pharmacies, loading, subscribe, create, update, toggle, remove } = usePharmacyStore()
  const toast = useToastStore()

  const [search,       setSearch]       = useState('')
  const [filterRegion, setFilterRegion] = useState('all')
  const [filterActive, setFilterActive] = useState('all')
  const [showForm,     setShowForm]     = useState(false)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState(EMPTY)
  const [errors,       setErrors]       = useState({})
  const [saving,       setSaving]       = useState(false)
  const [confirm,      setConfirm]      = useState(null)

  useEffect(() => { const u = subscribe(); return u }, [])

  const filtered = useMemo(() => pharmacies.filter((p) => {
    const q  = search.toLowerCase()
    const ms = !q || p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q)
    const mr = filterRegion==='all' || p.region===filterRegion
    const ma = filterActive==='all' || (filterActive==='active'?p.active!==false:p.active===false)
    return ms && mr && ma
  }), [pharmacies, search, filterRegion, filterActive])

  const sf = (f,v) => { setForm((p)=>({...p,[f]:v})); setErrors((e)=>({...e,[f]:undefined})) }

  const openCreate = () => { setForm(EMPTY); setEditId(null); setErrors({}); setShowForm(true) }
  const openEdit   = (p)  => {
    setForm({ code:p.code, name:p.name, region:p.region||'الرياض',
              city:p.city||'', managerEmail:p.managerEmail||'', active:p.active!==false })
    setEditId(p.id); setErrors({}); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null) }

  const validate = async () => {
    const e = {}
    if (!form.code?.trim()) e.code='Code required'
    else {
      const dup = await pharmacyCodeExists(form.code.trim(), editId)
      if (dup) e.code='Code already in use'
    }
    if (!form.name?.trim()) e.name='Name required'
    if (!form.region)       e.region='Region required'
    return e
  }

  const handleSave = async () => {
    const errs = await validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (editId) { await update(editId, form, userProfile?.uid, userProfile?.role); toast.success('Branch updated') }
      else        { await create(form, userProfile?.uid, userProfile?.role); toast.success('Branch created') }
      closeForm()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const stats = useMemo(() => ({
    total:   pharmacies.length,
    active:  pharmacies.filter((p) => p.active !== false).length,
    regions: [...new Set(pharmacies.map((p) => p.region).filter(Boolean))].length,
  }), [pharmacies])

  // Columns
  const columns = [
    {
      key:'code', label:'Code', sortable:true, width:'80px',
      render:(v)=>(
        <code style={{
          fontSize:'11px', fontFamily:'monospace',
          background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
          padding:'1px 6px', borderRadius:'4px', color:'var(--brand-400)',
        }}>{v}</code>
      ),
    },
    {
      key:'name', label:'Branch Name', primary:true, sortable:true,
      render:(v, row)=>(
        <div>
          <div style={{ fontSize:'12.5px', fontWeight:500, color:'var(--text-primary)' }}>{v}</div>
          {row.city && (
            <div style={{ fontSize:'10px', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'3px', marginTop:'1px' }}>
              <MapPin style={{ width:9, height:9 }} />{row.city}
            </div>
          )}
        </div>
      ),
    },
    { key:'region', label:'Region', sortable:true, render:(v)=><span style={{ fontSize:'12px' }}>{v||'—'}</span> },
    {
      key:'active', label:'Status', align:'center', sortable:true,
      render:(v)=><StatusPill status={v!==false?'active':'inactive'} label={v!==false?'Active':'Inactive'} />,
    },
    {
      key:'_actions', label:'', align:'center', width:'100px',
      render:(_,row)=>(
        <RowActions actions={[
          { label:'Edit', onClick:()=>openEdit(row) },
          { label:row.active!==false?'Deactivate':'Activate',
            onClick:async ()=>{
              try { await toggle(row.id, userProfile?.uid, userProfile?.role); toast.info('Status updated') }
              catch(e){ toast.error(e.message) }
            }, secondary:true },
          { label:'Delete', onClick:()=>setConfirm({id:row.id, name:row.name}), secondary:true, danger:true },
        ]} />
      ),
    },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:'15px', fontWeight:600, letterSpacing:'-0.02em', color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>
            Pharmacies
          </h1>
          <p style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
            {stats.total} branches · {stats.active} active · {stats.regions} regions
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap:'6px' }}>
          <Plus style={{ width:13, height:13 }} /> Add Branch
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'1', minWidth:'200px', maxWidth:'280px' }}>
          <Search style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', width:13, height:13, color:'var(--text-muted)', pointerEvents:'none' }} />
          <input value={search} onChange={(e)=>setSearch(e.target.value)}
            placeholder="Search by name, code or city..."
            style={{ paddingRight:'32px', height:'34px', fontSize:'13px' }} />
        </div>
        <select value={filterRegion} onChange={(e)=>setFilterRegion(e.target.value)} style={{ height:'34px', fontSize:'12px', width:'auto', flex:'none' }}>
          <option value="all">All Regions</option>
          {SA_REGIONS.map((r)=><option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterActive} onChange={(e)=>setFilterActive(e.target.value)} style={{ height:'34px', fontSize:'12px', width:'auto', flex:'none' }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <DataTable columns={columns} rows={filtered} loading={loading}
        emptyText="No branches found"
        emptySubtext={search ? `No results for "${search}"` : 'Add your first branch to get started'}
      />

      {/* Form modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }} onClick={closeForm} />
          <div style={{
            position:'relative', width:'100%', maxWidth:'400px',
            background:'var(--bg-elevated)', border:'1px solid var(--border-strong)',
            borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
            overflow:'hidden', animation:'scaleIn 0.2s ease-out both',
          }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                {editId ? 'Edit Branch' : 'New Branch'}
              </div>
              <button onClick={closeForm} className="btn btn-ghost btn-icon" style={{ width:28, height:28 }}>
                <X style={{ width:14, height:14 }} />
              </button>
            </div>
            <div style={{ padding:'16px', overflowY:'auto', maxHeight:'70vh' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <F label="Branch Code" required error={errors.code}>
                  <input value={form.code} onChange={(e)=>sf('code',e.target.value.toUpperCase())}
                    placeholder="5074" dir="ltr"
                    disabled={!!editId} style={{ height:'34px', fontSize:'13px', opacity:editId?0.5:1 }} />
                </F>
                <F label="Region" required error={errors.region}>
                  <select value={form.region} onChange={(e)=>sf('region',e.target.value)} style={{ height:'34px', fontSize:'12px' }}>
                    {SA_REGIONS.map((r)=><option key={r} value={r}>{r}</option>)}
                  </select>
                </F>
              </div>
              <F label="Branch Name" required error={errors.name}>
                <input value={form.name} onChange={(e)=>sf('name',e.target.value)} placeholder="صيدلية الأثير" style={{ height:'34px', fontSize:'13px' }} />
              </F>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <F label="City">
                  <input value={form.city} onChange={(e)=>sf('city',e.target.value)} placeholder="الدمام" style={{ height:'34px', fontSize:'13px' }} />
                </F>
                <F label="Manager Email">
                  <input type="email" dir="ltr" value={form.managerEmail} onChange={(e)=>sf('managerEmail',e.target.value)} placeholder="mgr@co.com" style={{ height:'34px', fontSize:'13px' }} />
                </F>
              </div>
              <F label="Status">
                <div style={{ display:'flex', gap:'6px' }}>
                  {[{v:true,l:'Active'},{v:false,l:'Inactive'}].map((s)=>(
                    <button key={String(s.v)} type="button" onClick={()=>sf('active',s.v)}
                      style={{
                        flex:1, height:'32px', borderRadius:'7px', fontSize:'12px',
                        border:`1px solid ${form.active===s.v?(s.v?'var(--border-brand)':'rgba(239,68,68,0.2)'):'var(--border-subtle)'}`,
                        background:form.active===s.v?(s.v?'var(--bg-active)':'rgba(239,68,68,0.08)'):'var(--bg-overlay)',
                        color:form.active===s.v?(s.v?'var(--brand-300)':'#f87171'):'var(--text-muted)',
                        cursor:'pointer', transition:'all 0.12s',
                      }}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </F>
              <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
                <button onClick={closeForm} className="btn btn-secondary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                  {saving ? <><Loader2 style={{ width:13, height:13, animation:'spin 1s linear infinite' }} />Saving...</> : editId ? 'Save Changes' : 'Create Branch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirm} onClose={()=>setConfirm(null)}
        onConfirm={async()=>{ try{ await remove(confirm.id,userProfile?.uid,userProfile?.role); toast.success('Branch deleted') }catch(e){toast.error(e.message)} setConfirm(null) }}
        title="Delete Branch" message={`Delete "${confirm?.name}"? This cannot be undone.`}
        confirmLabel="Delete" danger />
    </div>
  )
}
