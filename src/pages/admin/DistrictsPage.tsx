// ============================================================
// Districts Page — RBAC Phase 1 Territory Admin
// Admin-only CRUD. No analytics. No dashboards. No ranking.
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import { Layers, Plus, Pencil, Trash2, Save, X, Loader2, Building2 } from 'lucide-react'
import { getDocs, query, collection, where } from 'firebase/firestore'
import { db, COL } from '../../services/firebase'
import { useAuthStore }    from '../../store/authStore'
import { useDistrictStore } from '../../store/districtStore'
import { useRegionStore }   from '../../store/regionStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }   from '../../components/ui/Toast'
import ConfirmModal        from '../../components/ui/ConfirmModal'
import DataTable, { RowActions } from '../../components/ui/DataTable'
import type { District } from '../../services/territoryTypes'

const EMPTY: Partial<District> = { code: '', name: '', regionId: '', supervisorUid: '', active: true }

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
  const { districts, loading, subscribe, create, update, remove, assignPharmacy, removePharmacy } = useDistrictStore()
  const { regions, subscribe: subRegions } = useRegionStore()
  const { pharmacies, subscribe: subPharmacies } = usePharmacyStore()
  const toast = useToastStore()

  const [search,      setSearch]      = useState('')
  const [showForm,    setShowForm]    = useState(false)
  const [editId,      setEditId]      = useState<string | null>(null)
  const [form,        setForm]        = useState<Partial<District>>(EMPTY)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState(false)
  const [confirm,     setConfirm]     = useState<{ id: string; name: string } | null>(null)
  // Phase 1B-2A: active district_supervisor users — loaded once on mount
  const [supervisors, setSupervisors] = useState<Array<{ uid: string; displayName: string }>>([])

  // Phase 1B-2C: pharmacy assignment modal
  const [assignDistrictId,   setAssignDistrictId]   = useState<string | null>(null)
  const [pharmSearch,         setPharmSearch]         = useState('')
  const [pharmSearchAssigned, setPharmSearchAssigned] = useState('')
  const [pharmInProgress,     setPharmInProgress]     = useState<Set<string>>(new Set())
  const [pharmRemoveConfirm,  setPharmRemoveConfirm]  = useState<{ id: string; name: string } | null>(null)
  const [pharmMoveConfirm,    setPharmMoveConfirm]    = useState<{ pharmacy: any; oldDistrictId: string } | null>(null)

  useEffect(() => {
    const u1 = subscribe()
    const u2 = subRegions()
    const u3 = subPharmacies()
    // One-time fetch — supervisor list changes rarely during an admin session
    getDocs(query(
      collection(db, COL.USERS),
      where('role',   '==', 'district_supervisor'),
      where('active', '==', true),
    )).then((snap) => {
      setSupervisors(snap.docs.map((d) => ({
        uid:         d.id,
        displayName: (d.data().displayName as string) || (d.data().email as string) || d.id,
      })))
    }).catch(() => {}) // non-fatal — form still works without the list
    return () => { u1(); u2(); u3() }
  }, [])

  const regionMap = useMemo(() =>
    Object.fromEntries(regions.map((r) => [r.id, r.name])),
    [regions]
  )

  // uid → displayName lookup used by the table and the supervisor dropdown
  const supervisorMap = useMemo(
    () => Object.fromEntries(supervisors.map((s) => [s.uid, s.displayName])),
    [supervisors],
  )

  // Phase 1B-2C: district id → name lookup for Move confirmation labels
  const districtMap = useMemo(
    () => Object.fromEntries(districts.map((d) => [d.id, d.name])),
    [districts],
  )

  // Phase 1B-2C: live district being managed — always current via realtime store
  const assignDistrict = useMemo(
    () => districts.find((d) => d.id === assignDistrictId) || null,
    [districts, assignDistrictId],
  )

  const filtered = useMemo(() => districts.filter((d) => {
    const q = search.toLowerCase()
    return !q || d.name?.toLowerCase().includes(q) || d.code?.toLowerCase().includes(q)
  }), [districts, search])

  // Phase 1B-2C: assigned pharmacies — derived from district.pharmacyIds
  const assignedPharmaciesAll = useMemo(() => {
    if (!assignDistrict) return []
    const ids = Array.isArray(assignDistrict.pharmacyIds) ? assignDistrict.pharmacyIds : []
    return pharmacies
      .filter((p: any) => ids.includes(p.id))
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
  }, [assignDistrict, pharmacies])

  const assignedPharmacies = useMemo(() => {
    if (!pharmSearchAssigned.trim()) return assignedPharmaciesAll
    const q = pharmSearchAssigned.toLowerCase()
    return assignedPharmaciesAll.filter((p: any) =>
      p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
    )
  }, [assignedPharmaciesAll, pharmSearchAssigned])

  // Phase 1B-2C: available pharmacies — active + not already assigned to this district
  const availablePharmaciesAll = useMemo(() => {
    if (!assignDistrict) return []
    const ids = Array.isArray(assignDistrict.pharmacyIds) ? assignDistrict.pharmacyIds : []
    return pharmacies
      .filter((p: any) => p.active !== false && !ids.includes(p.id))
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
  }, [assignDistrict, pharmacies])

  const availablePharmacies = useMemo(() => {
    if (!pharmSearch.trim()) return availablePharmaciesAll
    const q = pharmSearch.toLowerCase()
    return availablePharmaciesAll.filter((p: any) =>
      p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
    )
  }, [availablePharmaciesAll, pharmSearch])

  const sf = (f: keyof District, v: unknown) => {
    setForm((p) => ({ ...p, [f]: v }))
    setErrors((e) => ({ ...e, [f]: undefined }))
  }

  const openCreate = () => { setForm(EMPTY); setEditId(null); setErrors({}); setShowForm(true) }
  const openEdit   = (d: District) => {
    setForm({
      code:          d.code,
      name:          d.name,
      regionId:      d.regionId,
      supervisorUid: d.supervisorUid || '',  // '' = "no supervisor" sentinel in the form select
      active:        d.active !== false,
    })
    setEditId(d.id); setErrors({}); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null) }

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
    // Normalise supervisorUid: empty-string sentinel → null before persisting
    const payload = { ...form, supervisorUid: form.supervisorUid || null }
    try {
      if (editId) {
        await update(editId, payload, userProfile?.uid, userProfile?.role)
        toast.success('District updated')
      } else {
        await create(payload, userProfile?.uid, userProfile?.role)
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

  // Phase 1B-2C: close pharmacy modal and reset all related state
  const closePharmacyModal = () => {
    setAssignDistrictId(null)
    setPharmSearch('')
    setPharmSearchAssigned('')
    setPharmInProgress(new Set())
    setPharmRemoveConfirm(null)
    setPharmMoveConfirm(null)
  }

  const handleAssignPharmacy = async (pharmacyId: string, pharmacyName: string) => {
    if (!assignDistrictId) return
    setPharmInProgress((s) => new Set(s).add(pharmacyId))
    try {
      await assignPharmacy(assignDistrictId, pharmacyId, userProfile?.uid, userProfile?.role)
      toast.success(`${pharmacyName} added to district`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setPharmInProgress((s) => { const n = new Set(s); n.delete(pharmacyId); return n })
    }
  }

  const handleRemovePharmacy = async () => {
    if (!pharmRemoveConfirm || !assignDistrictId) return
    const { id: pharmacyId, name: pharmacyName } = pharmRemoveConfirm
    setPharmInProgress((s) => new Set(s).add(pharmacyId))
    try {
      await removePharmacy(assignDistrictId, pharmacyId, userProfile?.uid, userProfile?.role)
      toast.success(`${pharmacyName} removed from district`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setPharmInProgress((s) => { const n = new Set(s); n.delete(pharmacyId); return n })
      setPharmRemoveConfirm(null)
    }
  }

  const handleMovePharmacy = async () => {
    if (!pharmMoveConfirm || !assignDistrictId) return
    const { pharmacy, oldDistrictId } = pharmMoveConfirm
    const pharmacyId = pharmacy.id
    setPharmInProgress((s) => new Set(s).add(pharmacyId))
    try {
      await removePharmacy(oldDistrictId, pharmacyId, userProfile?.uid, userProfile?.role)
      try {
        await assignPharmacy(assignDistrictId, pharmacyId, userProfile?.uid, userProfile?.role)
        toast.success(`${pharmacy.name} moved to this district`)
      } catch {
        toast.error('Move partially failed. Pharmacy was removed from old district but not added to the new district.')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setPharmInProgress((s) => { const n = new Set(s); n.delete(pharmacyId); return n })
      setPharmMoveConfirm(null)
    }
  }

  const COLS = [
    { key: 'code', label: 'Code', sortable: true, render: (v) => (
      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--brand-400)' }}>{v}</span>
    )},
    { key: 'name', label: 'Name', sortable: true, render: (v, row: District) => (
      <div>
        <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{v}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
          {supervisorMap[row.supervisorUid] || 'No supervisor'}
        </div>
      </div>
    )},
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
        { label: 'Edit',              icon: Pencil,    onClick: () => openEdit(row) },
        { label: 'Manage Pharmacies', icon: Building2, onClick: () => setAssignDistrictId(row.id) },
        { label: 'Delete',            icon: Trash2,    onClick: () => setConfirm({ id: row.id, name: row.name }), danger: true },
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

      {/* Create / Edit Form */}
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
            <F label="Supervisor" error={undefined}>
              <select
                value={form.supervisorUid || ''}
                onChange={(e) => sf('supervisorUid', e.target.value)}
                style={{ width: '100%', height: '34px', fontSize: '12px' }}
              >
                <option value="">No supervisor assigned</option>
                {supervisors.map((s) => (
                  <option key={s.uid} value={s.uid}>{s.displayName}</option>
                ))}
              </select>
              {supervisors.length === 0 && (
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  No active district supervisors found — create users with the District Supervisor role first.
                </p>
              )}
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

      {/* Phase 1B-2C: Pharmacy Assignment Modal */}
      {assignDistrict && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: '12px', padding: '20px', width: '520px',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Manage Pharmacies — {assignDistrict.name}
              </h2>
              <button onClick={closePharmacyModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Section 1: Assigned Pharmacies */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    Assigned Pharmacies ({assignedPharmaciesAll.length})
                  </span>
                </div>
                <input
                  type="text"
                  value={pharmSearchAssigned}
                  onChange={(e) => setPharmSearchAssigned(e.target.value)}
                  placeholder="Search assigned..."
                  style={{ width: '100%', height: '30px', fontSize: '11px', marginBottom: '6px' }}
                />
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: '6px' }}>
                  {assignedPharmaciesAll.length === 0 ? (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center', margin: 0 }}>
                      No pharmacies assigned to this district yet.
                    </p>
                  ) : assignedPharmacies.length === 0 ? (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center', margin: 0 }}>
                      No pharmacies match your search.
                    </p>
                  ) : (
                    assignedPharmacies.map((p: any) => (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px', borderBottom: '1px solid var(--border-default)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--brand-400)' }}>
                            [{p.code || '—'}]
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{p.name || p.id}</span>
                          {p.active === false && (
                            <span style={{
                              fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '99px',
                              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            }}>Inactive</span>
                          )}
                        </div>
                        <button
                          disabled={pharmInProgress.has(p.id)}
                          onClick={() => setPharmRemoveConfirm({ id: p.id, name: p.name || p.id })}
                          style={{
                            height: '26px', padding: '0 10px', borderRadius: '5px', fontSize: '11px',
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.2)',
                            cursor: pharmInProgress.has(p.id) ? 'not-allowed' : 'pointer',
                            opacity: pharmInProgress.has(p.id) ? 0.5 : 1,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          {pharmInProgress.has(p.id) ? <Loader2 style={{ width: 11, height: 11 }} /> : 'Remove'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Section divider */}
              <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 0 16px' }} />

              {/* Section 2: Add Pharmacy */}
              <div>
                <span style={{
                  display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
                }}>
                  Add Pharmacy
                </span>
                <input
                  type="text"
                  value={pharmSearch}
                  onChange={(e) => setPharmSearch(e.target.value)}
                  placeholder="Search pharmacies..."
                  style={{ width: '100%', height: '30px', fontSize: '11px', marginBottom: '6px' }}
                />
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: '6px' }}>
                  {availablePharmaciesAll.length === 0 ? (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center', margin: 0 }}>
                      All active pharmacies are already assigned.
                    </p>
                  ) : availablePharmacies.length === 0 ? (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center', margin: 0 }}>
                      No pharmacies match your search.
                    </p>
                  ) : (
                    availablePharmacies.map((p: any) => {
                      const inOtherDistrict = !!p.districtId
                      return (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '7px 10px', borderBottom: '1px solid var(--border-default)',
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--brand-400)' }}>
                                [{p.code || '—'}]
                              </span>
                              <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{p.name || p.id}</span>
                            </div>
                            {inOtherDistrict && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Currently in: {districtMap[p.districtId] || p.districtId}
                              </div>
                            )}
                          </div>
                          {inOtherDistrict ? (
                            <button
                              disabled={pharmInProgress.has(p.id)}
                              onClick={() => setPharmMoveConfirm({ pharmacy: p, oldDistrictId: p.districtId })}
                              style={{
                                height: '26px', padding: '0 10px', borderRadius: '5px', fontSize: '11px',
                                background: 'rgba(234,179,8,0.1)', color: '#d97706',
                                border: '1px solid rgba(234,179,8,0.25)',
                                cursor: pharmInProgress.has(p.id) ? 'not-allowed' : 'pointer',
                                opacity: pharmInProgress.has(p.id) ? 0.5 : 1,
                                display: 'flex', alignItems: 'center',
                              }}
                            >
                              {pharmInProgress.has(p.id) ? <Loader2 style={{ width: 11, height: 11 }} /> : 'Move'}
                            </button>
                          ) : (
                            <button
                              disabled={pharmInProgress.has(p.id)}
                              onClick={() => handleAssignPharmacy(p.id, p.name || p.id)}
                              style={{
                                height: '26px', padding: '0 10px', borderRadius: '5px', fontSize: '11px',
                                background: 'var(--brand-500)', color: '#fff', border: 'none',
                                cursor: pharmInProgress.has(p.id) ? 'not-allowed' : 'pointer',
                                opacity: pharmInProgress.has(p.id) ? 0.5 : 1,
                                display: 'flex', alignItems: 'center',
                              }}
                            >
                              {pharmInProgress.has(p.id) ? <Loader2 style={{ width: 11, height: 11 }} /> : 'Add'}
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-default)' }}>
              <button onClick={closePharmacyModal} style={{
                height: '32px', padding: '0 18px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                background: 'var(--brand-500)', color: '#fff', border: 'none', cursor: 'pointer',
              }}>Done</button>
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

      {/* Phase 1B-2C: Remove pharmacy confirmation */}
      <ConfirmModal
        open={!!pharmRemoveConfirm}
        title="Remove Pharmacy"
        message={`Remove "${pharmRemoveConfirm?.name}" from this district?`}
        confirmLabel="Remove"
        onConfirm={handleRemovePharmacy}
        onClose={() => setPharmRemoveConfirm(null)}
      />

      {/* Phase 1B-2C: Move pharmacy confirmation */}
      <ConfirmModal
        open={!!pharmMoveConfirm}
        title="Move Pharmacy"
        message={pharmMoveConfirm
          ? `Move "${pharmMoveConfirm.pharmacy?.name}" from "${districtMap[pharmMoveConfirm.oldDistrictId] || pharmMoveConfirm.oldDistrictId}" to "${assignDistrict?.name}"?`
          : ''}
        confirmLabel="Move"
        onConfirm={handleMovePharmacy}
        onClose={() => setPharmMoveConfirm(null)}
      />
    </div>
  )
}
