// ============================================================
// Districts Page — RBAC Phase 1 Territory Admin
// Admin-only CRUD. No analytics. No dashboards. No ranking.
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import { Layers, Plus, Pencil, Trash2, Save, X, Loader2 } from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { useDistrictStore } from '../../store/districtStore'
import { useRegionStore }   from '../../store/regionStore'
import { useToastStore }   from '../../components/ui/Toast'
import ConfirmModal        from '../../components/ui/ConfirmModal'
import DataTable, { RowActions } from '../../components/ui/DataTable'
import type { District } from '../../services/territoryTypes'

const EMPTY: Partial<District> = { code: '', name: '', regionId: '', active: true }

function F({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{
        display: 'block', fontSize: '10px', fontWeight: 500,
        letterSpacing: '0.07em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: '5px',
      }}>
        {label}{required && <span style={{ color: '#ef4444', marginRight: '3px' }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>{error}</p>}
    </div>
  )
}

export default function DistrictsPage() {
  const { userProfile }   = useAuthStore()
  const { districts, loading, subscribe, create, update, remove } = useDistrictStore()
  const { regions, subscribe: subRegions } = useRegionStore()
  const toast = useToastStore()

  const [search,   setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState<Partial<District>>(EMPTY)
  const [errors,   setErrors]   = useState<Record<string, string>>({})
  const [saving,   setSaving]   = useState(false)
  const [confirm,  setConfirm]  = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    const u1 = subscribe()
    const u2 = subRegions()
    return () => { u1(); u2() }
  }, [])

  const regionMap = useMemo(() =>
    Object.fromEntries(regions.map((r) => [r.id, r.name])),
    [regions]
  )

  const filtered = useMemo(() => districts.filter((d) => {
    const q = search.toLowerCase()
    return !q || d.name?.toLowerCase().includes(q) || d.code?.toLowerCase().includes(q)
  }), [districts, search])

  const sf = (f: keyof District, v: unknown) => {
    setForm((p) => ({ ...p, [f]: v }))
    setErrors((e) => ({ ...e, [f]: undefined }))
  }

  const openCreate = () => { setForm(EMPTY); setEditId(null); setErrors({}); setShowForm(true) }
  const openEdit   = (d: District) => {
    setForm({ code: d.code, name: d.name, regionId: d.regionId, active: d.active !== false })
    setEditId(d.id); setErrors({}); setShowForm(true)
  }
  const closeForm  = () => { setShowForm(false); setEditId(null) }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.code?.trim())     e.code     = 'Code required'
    if (!form.name?.trim())     e.name     = 'Name required'
    if (!form.regionId?.trim()) e.regionId = 'Region required'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      if (editId) {
        await update(editId, form, userProfile?.uid, userProfile?.role)
        toast.success('District updated')
      } else {
        await create(form, userProfile?.uid, userProfile?.role)
        toast.success('District created')
      }
      closeForm()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm) return
    try {
      await remove(confirm.id, userProfile?.uid, userProfile?.role)
      toast.success('District deleted')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setConfirm(null)
    }
  }

  const COLS = [
    { key: 'code', label: 'Code', sortable: true, render: (v) => (
      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--brand-400)' }}>{v}</span>
    )},
    { key: 'name',     label: 'Name',   sortable: true },
    { key: 'regionId', label: 'Region', render: (v) => regionMap[v] || v || '—' },
    { key: 'pharmacyIds', label: 'Branches', render: (v) => (
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {Array.isArray(v) ? v.length : 0}
      </span>
    )},
    { key: 'active', label: 'Status', render: (v) => (
      <span style={{
        fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '99px',
        background: v !== false ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        color:      v !== false ? '#22c55e'              : '#ef4444',
      }}>{v !== false ? 'Active' : 'Inactive'}</span>
    )},
    { key: '__actions', label: '', render: (_v, row: District) => (
      <RowActions actions={[
        { label: 'Edit',   icon: Pencil, onClick: () => openEdit(row) },
        { label: 'Delete', icon: Trash2, onClick: () => setConfirm({ id: row.id, name: row.name }), danger: true },
      ]} />
    )},
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Districts</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Territory infrastructure — {districts.length} district{districts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          height: '32px', padding: '0 12px', borderRadius: '8px',
          background: 'var(--brand-500)', color: '#fff',
          border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
        }}>
          <Plus style={{ width: 13, height: 13 }} /> Add District
        </button>
      </div>

      <div style={{ maxWidth: '300px' }}>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search districts..."
          style={{ width: '100%', height: '34px', fontSize: '12px' }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>Loading...</div>
      ) : (
        <DataTable columns={COLS} rows={filtered} rowKey="id" emptyText="No districts yet" />
      )}

      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: '12px', padding: '20px', width: '380px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {editId ? 'Edit District' : 'Add District'}
              </h2>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <F label="Code" required error={errors.code}>
              <input value={form.code || ''} onChange={(e) => sf('code', e.target.value.toUpperCase())}
                placeholder="e.g. RUH-N" style={{ width: '100%', height: '34px', fontSize: '12px' }} />
            </F>
            <F label="Name" required error={errors.name}>
              <input value={form.name || ''} onChange={(e) => sf('name', e.target.value)}
                placeholder="e.g. شمال الرياض" style={{ width: '100%', height: '34px', fontSize: '12px' }} />
            </F>
            <F label="Region" required error={errors.regionId}>
              <select value={form.regionId || ''}
                onChange={(e) => sf('regionId', e.target.value)}
                style={{ width: '100%', height: '34px', fontSize: '12px' }}>
                <option value="">Select region...</option>
                {regions.filter((r) => r.active !== false).map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                ))}
              </select>
            </F>
            <F label="Status" error={undefined}>
              <select value={form.active !== false ? 'active' : 'inactive'}
                onChange={(e) => sf('active', e.target.value === 'active')}
                style={{ width: '100%', height: '34px', fontSize: '12px' }}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </F>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={closeForm} style={{
                height: '32px', padding: '0 14px', borderRadius: '7px', fontSize: '12px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                height: '32px', padding: '0 14px', borderRadius: '7px', fontSize: '12px',
                background: 'var(--brand-500)', color: '#fff', border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                {saving ? <Loader2 style={{ width: 13, height: 13 }} /> : <Save style={{ width: 13, height: 13 }} />}
                {editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Delete District"
        message={`Delete district "${confirm?.name}"? Pharmacies must be unassigned first.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}
