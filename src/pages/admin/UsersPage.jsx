// ============================================================
// Users Page — Enterprise DataTable, Firestore, Auth REST API
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Users, Plus, Search, Pencil, UserCheck, UserX,
  Save, X, Loader2, Eye, EyeOff, AlertCircle,
  Mail, Phone, Hash, Shield, Crown, Building2, Download,
} from 'lucide-react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db, COL } from '../../services/firebase'
import { useAuthStore } from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import {
  createUser, updateUserProfile, toggleUserStatus,
  employeeIdExists,
} from '../../services/userService'
import { useToastStore } from '../../components/ui/Toast'
import ConfirmModal from '../../components/ui/ConfirmModal'
import DataTable, { StatusPill, RowActions } from '../../components/ui/DataTable'

const ROLES = [
  { value:'admin',      label:'Admin',    icon:'👑', needsPharmacy:false },
  { value:'manager',    label:'Manager',  icon:'🏪', needsPharmacy:true  },
  { value:'pharmacist', label:'Pharmacist',icon:'💊', needsPharmacy:true  },
]

function pwStrength(pw) {
  if (!pw) return { score:0, label:'', color:'' }
  let s=0
  if (pw.length>=6)s++; if (pw.length>=10)s++
  if (/[A-Z]/.test(pw))s++; if (/[0-9]/.test(pw))s++
  if (/[^A-Za-z0-9]/.test(pw))s++
  if (s<=1) return { score:s, label:'Weak',    color:'#ef4444' }
  if (s<=2) return { score:s, label:'Fair',    color:'#f59e0b' }
  if (s<=3) return { score:s, label:'Good',    color:'#00d2ad' }
  return          { score:s, label:'Strong',  color:'#22c55e' }
}

const EMPTY = {
  displayName:'', email:'', password:'', role:'pharmacist',
  pharmacyId:'', phone:'', employeeId:'', status:'active', sendEmail:true,
}

// Tiny field component
function F({ label, required, error, children }) {
  return (
    <div style={{ marginBottom:'12px' }}>
      <label style={{
        display:'block', fontSize:'10px', fontWeight:500,
        letterSpacing:'0.07em', textTransform:'uppercase',
        color:'var(--text-muted)', marginBottom:'5px',
        fontFamily:"'Inter',sans-serif",
      }}>
        {label}{required && <span style={{ color:'#ef4444', marginRight:'3px' }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize:'11px', color:'#f87171', marginTop:'4px' }}>{error}</p>}
    </div>
  )
}

export default function UsersPage() {
  const { userProfile } = useAuthStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()
  const toast = useToastStore()

  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterRole,   setFilterRole]   = useState('all')
  const [showModal,    setShowModal]    = useState(false)
  const [editUser,     setEditUser]     = useState(null)
  const [form,         setForm]         = useState(EMPTY)
  const [errors,       setErrors]       = useState({})
  const [saving,       setSaving]       = useState(false)
  const [showPass,     setShowPass]     = useState(false)
  const [step,         setStep]         = useState('form')
  const [created,      setCreated]      = useState(null)
  const [confirmToggle,setConfirmToggle]= useState(null)

  useEffect(() => {
    const u1 = subPh()
    const q  = query(collection(db, COL.USERS), orderBy('createdAt', 'desc'))
    const u2 = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ id:d.id, uid:d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return () => { u1?.(); u2?.() }
  }, [])

  const isNew = !editUser
  const stats = useMemo(() => ({
    total:  users.length,
    active: users.filter((u) => u.active !== false).length,
    counts: users.reduce((a,u)=>{ a[u.role]=(a[u.role]||0)+1; return a }, {}),
  }), [users])

  const filtered = useMemo(() =>
    users.filter((u) => {
      const q = search.toLowerCase()
      const ms = !q || u.displayName?.toLowerCase().includes(q) ||
                       u.email?.toLowerCase().includes(q) ||
                       u.employeeId?.toLowerCase().includes(q)
      const mr = filterRole==='all' || u.role===filterRole
      return ms && mr
    }), [users, search, filterRole])

  const getPharmacyName = (id) => pharmacies.find((p) => p.id===id)?.name || '—'
  const sf = (f,v) => { setForm((p)=>({...p,[f]:v})); setErrors((e)=>({...e,[f]:undefined})) }
  const selectedRole = ROLES.find((r) => r.value === form.role)

  const openCreate = () => { setForm(EMPTY); setEditUser(null); setErrors({}); setStep('form'); setCreated(null); setShowModal(true) }
  const openEdit   = (u)  => {
    setForm({ displayName:u.displayName||'', email:u.email||'', password:'',
              role:u.role||'pharmacist', pharmacyId:u.pharmacyId||'',
              phone:u.phone||'', employeeId:u.employeeId||'',
              status:u.status||(u.active!==false?'active':'inactive'), sendEmail:false })
    setEditUser(u); setErrors({}); setStep('form'); setCreated(null); setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditUser(null) }

  const validate = async () => {
    const e = {}
    if (!form.displayName?.trim()) e.displayName='Name is required'
    if (!form.email?.trim()) e.email='Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email='Invalid email'
    else if (isNew && users.some((u)=>u.email?.toLowerCase()===form.email.toLowerCase()))
      e.email='Email already registered'
    if (isNew) {
      if (!form.password) e.password='Password required'
      else if (form.password.length<6) e.password='Min 6 characters'
    }
    if (!form.role) e.role='Role required'
    if (selectedRole?.needsPharmacy && !form.pharmacyId) e.pharmacyId='Branch required for this role'
    if (form.employeeId?.trim()) {
      const dup = await employeeIdExists(form.employeeId.trim(), isNew?null:editUser?.uid||editUser?.id)
      if (dup) e.employeeId='Employee ID already in use'
    }
    return e
  }

  const handleSave = async () => {
    const errs = await validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (isNew) {
        const result = await createUser({
          displayName:form.displayName.trim(), email:form.email.trim(),
          password:form.password, role:form.role, status:form.status,
          pharmacyId:form.pharmacyId||null, phone:form.phone,
          employeeId:form.employeeId, sendWelcomeEmail:form.sendEmail,
          actorId:userProfile?.uid, actorRole:userProfile?.role,
        })
        setCreated(result); setStep('success')
      } else {
        await updateUserProfile(
          editUser.uid||editUser.id,
          { displayName:form.displayName.trim(), role:form.role,
            status:form.status, active:form.status==='active',
            pharmacyId:form.pharmacyId||null, phone:form.phone, employeeId:form.employeeId },
          userProfile?.uid, userProfile?.role,
        )
        toast.success('User updated')
        closeModal()
      }
    } catch (e) {
      const msg=e.message||'An error occurred'
      if (msg.toLowerCase().includes('email')||msg.includes('البريد')) setErrors({email:msg})
      else setErrors({_global:msg})
      toast.error(msg)
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!confirmToggle) return
    try {
      await toggleUserStatus(confirmToggle.uid||confirmToggle.id, userProfile?.uid, userProfile?.role)
      toast.success(`Account ${confirmToggle.active!==false?'suspended':'activated'}`)
    } catch (e) { toast.error(e.message) }
    setConfirmToggle(null)
  }

  const pw = pwStrength(form.password)

  // DataTable columns
  const columns = [
    {
      key:'displayName', label:'User', primary:true, sortable:true,
      render:(val, row) => (
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{
            width:'24px', height:'24px', borderRadius:'50%',
            background:'var(--brand-500)', color:'#09090b',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'10px', fontWeight:700, flexShrink:0,
          }}>{val?.[0]||'?'}</div>
          <div>
            <div style={{ fontSize:'12.5px', fontWeight:500, color:'var(--text-primary)' }}>{val}</div>
            {row.employeeId && (
              <div style={{ fontSize:'10px', color:'var(--text-muted)', fontFamily:'monospace' }}>#{row.employeeId}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key:'email', label:'Email', sortable:true,
      render:(val)=><span style={{ fontFamily:"'Inter',monospace", fontSize:'11px' }}>{val}</span>,
    },
    {
      key:'role', label:'Role', sortable:true,
      render:(val)=><StatusPill status={val} label={{admin:'Admin',manager:'Manager',pharmacist:'Pharmacist'}[val]||val} />,
    },
    {
      key:'pharmacyId', label:'Branch',
      render:(val)=><span style={{ fontSize:'11px' }}>{val ? getPharmacyName(val) : '—'}</span>,
    },
    {
      key:'active', label:'Status', sortable:true, align:'center',
      render:(val, row)=>{
        const active = val!==false && row.status!=='inactive'
        return <StatusPill status={active?'active':'inactive'} label={active?'Active':'Suspended'} />
      },
    },
    {
      key:'_actions', label:'', align:'center', width:'100px',
      render:(_, row)=>(
        <RowActions actions={[
          { label:'Edit', onClick:()=>openEdit(row) },
          { label: row.active!==false?'Suspend':'Activate',
            onClick:()=>setConfirmToggle({...row, uid:row.uid||row.id, active:row.active!==false}),
            secondary:true, danger:row.active!==false },
        ]} />
      ),
    },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px' }}>
        <div>
          <h1 style={{ fontSize:'15px', fontWeight:600, letterSpacing:'-0.02em', color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>
            Users
          </h1>
          <p style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
            {stats.total} members · {stats.active} active
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap:'6px' }}>
            <Plus style={{ width:13, height:13 }} /> Add User
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display:'flex', gap:'2px' }}>
        {[
          { role:'all',       label:'All',         count:stats.total,              color:'var(--text-muted)' },
          { role:'admin',     label:'Admin',        count:stats.counts.admin||0,    color:'#f87171' },
          { role:'manager',   label:'Manager',      count:stats.counts.manager||0,  color:'#fbbf24' },
          { role:'pharmacist',label:'Pharmacist',   count:stats.counts.pharmacist||0,color:'var(--brand-400)' },
        ].map((s) => (
          <button key={s.role}
            onClick={() => setFilterRole(s.role)}
            style={{
              padding:'4px 10px', borderRadius:'6px', fontSize:'12px',
              fontFamily:"'Inter',sans-serif",
              background: filterRole===s.role ? 'var(--bg-overlay)' : 'transparent',
              border: filterRole===s.role ? '1px solid var(--border-default)' : '1px solid transparent',
              color: filterRole===s.role ? s.color : 'var(--text-muted)',
              cursor:'pointer', transition:'all 0.12s',
              display:'flex', alignItems:'center', gap:'5px',
            }}>
            <span style={{ fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{s.count}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position:'relative', maxWidth:'320px' }}>
        <Search style={{
          position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)',
          width:13, height:13, color:'var(--text-muted)', pointerEvents:'none',
        }} />
        <input value={search} onChange={(e)=>setSearch(e.target.value)}
          placeholder="Search by name, email or ID..."
          style={{ paddingRight:'32px', fontSize:'13px', height:'34px' }} />
      </div>

      {/* Table */}
      <DataTable
        columns={columns} rows={filtered} loading={loading}
        emptyText="No users found"
        emptySubtext={search ? `No results for "${search}"` : 'Add your first user to get started'}
        selectable
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }} onClick={closeModal} />
          <div style={{
            position:'relative', width:'100%', maxWidth:'440px',
            background:'var(--bg-elevated)', border:'1px solid var(--border-strong)',
            borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
            maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column',
            animation:'scaleIn 0.2s ease-out both',
          }}>
            {/* Header */}
            <div style={{
              padding:'14px 16px', borderBottom:'1px solid var(--border-subtle)',
              display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
            }}>
              <div>
                <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                  {isNew ? 'New User' : 'Edit User'}
                </div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
                  {isNew ? 'Creates Firebase Auth + Firestore profile' : 'Updates Firestore profile only'}
                </div>
              </div>
              <button onClick={closeModal} className="btn btn-ghost btn-icon" style={{ width:28, height:28 }}>
                <X style={{ width:14, height:14 }} />
              </button>
            </div>

            {step==='success' && created ? (
              <div style={{ padding:'24px', textAlign:'center', flexShrink:0 }}>
                <div style={{
                  width:'40px', height:'40px', borderRadius:'10px', margin:'0 auto 12px',
                  background:'rgba(0,210,173,0.1)', border:'1px solid rgba(0,210,173,0.2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <UserCheck style={{ width:18, height:18, color:'var(--brand-400)' }} />
                </div>
                <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)', marginBottom:'4px' }}>User created</div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'16px' }}>{created.displayName}</div>
                <div style={{
                  background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
                  borderRadius:'8px', padding:'10px 12px', textAlign:'right',
                  fontSize:'11px', color:'var(--text-secondary)', marginBottom:'16px',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                    <span style={{ color:'var(--text-muted)' }}>UID</span>
                    <code style={{ color:'var(--brand-400)', fontFamily:'monospace', fontSize:'10px' }}>{created.uid?.slice(0,16)}...</code>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:'var(--text-muted)' }}>Branch</span>
                    <span>{created.pharmacyId ? getPharmacyName(created.pharmacyId) : '—'}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <button onClick={()=>{setStep('form');setForm(EMPTY);setErrors({})}} className="btn btn-secondary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                    Add another
                  </button>
                  <button onClick={closeModal} className="btn btn-primary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ overflowY:'auto', padding:'16px', flex:1 }}>
                {errors._global && (
                  <div style={{
                    display:'flex', alignItems:'center', gap:'8px',
                    background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)',
                    borderRadius:'8px', padding:'8px 12px', marginBottom:'12px',
                    fontSize:'12px', color:'#f87171',
                  }}>
                    <AlertCircle style={{ width:14, height:14, flexShrink:0 }} />{errors._global}
                  </div>
                )}

                <F label="Full name" required error={errors.displayName}>
                  <input value={form.displayName} onChange={(e)=>sf('displayName',e.target.value)} placeholder="Mohammed Al-Otaibi" style={{ height:'34px', fontSize:'13px' }} />
                </F>

                <F label="Email" required error={errors.email}>
                  <div style={{ position:'relative' }}>
                    <Mail style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', width:13, height:13, color:'var(--text-muted)', pointerEvents:'none' }} />
                    <input type="email" dir="ltr" value={form.email} onChange={(e)=>sf('email',e.target.value)}
                      placeholder="user@company.com" style={{ paddingRight:'32px', height:'34px', fontSize:'13px' }}
                      disabled={!isNew} />
                  </div>
                </F>

                {isNew && (
                  <F label="Temporary password" required error={errors.password}>
                    <div style={{ position:'relative' }}>
                      <input type={showPass?'text':'password'} dir="ltr" value={form.password}
                        onChange={(e)=>sf('password',e.target.value)} placeholder="••••••••"
                        style={{ paddingLeft:'32px', height:'34px', fontSize:'13px' }} />
                      <button type="button" onClick={()=>setShowPass(!showPass)}
                        style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                        {showPass?<EyeOff style={{width:13,height:13}}/>:<Eye style={{width:13,height:13}}/>}
                      </button>
                    </div>
                    {form.password && (
                      <div style={{ marginTop:'5px', display:'flex', alignItems:'center', gap:'6px' }}>
                        <div style={{ display:'flex', gap:'2px', flex:1 }}>
                          {[1,2,3,4,5].map((i)=>(
                            <div key={i} style={{
                              flex:1, height:'2px', borderRadius:'99px',
                              background: i<=pw.score ? pw.color : 'var(--border-subtle)',
                              transition:'background 0.2s',
                            }} />
                          ))}
                        </div>
                        <span style={{ fontSize:'10px', color:pw.color, fontWeight:500, minWidth:'32px', textAlign:'left' }}>{pw.label}</span>
                      </div>
                    )}
                    <label style={{ display:'flex', alignItems:'center', gap:'7px', marginTop:'7px', cursor:'pointer' }}>
                      <button type="button" onClick={()=>sf('sendEmail',!form.sendEmail)}
                        style={{
                          width:'28px', height:'16px', borderRadius:'99px',
                          background: form.sendEmail ? 'var(--brand-500)' : 'var(--bg-overlay)',
                          border:'1px solid var(--border-default)', position:'relative',
                          cursor:'pointer', transition:'background 0.2s', flexShrink:0,
                        }}>
                        <div style={{
                          position:'absolute', top:'1px', width:'12px', height:'12px',
                          borderRadius:'50%', background:'white', transition:'right 0.2s',
                          right: form.sendEmail ? '1px' : 'calc(100% - 13px)',
                          boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                      <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>
                        Send password reset email
                      </span>
                    </label>
                  </F>
                )}

                <F label="Role" required error={errors.role}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px' }}>
                    {ROLES.map((r)=>(
                      <button key={r.value} type="button" onClick={()=>sf('role',r.value)}
                        style={{
                          padding:'7px 8px', borderRadius:'8px', fontSize:'12px',
                          border:`1px solid ${form.role===r.value?'var(--border-brand)':'var(--border-subtle)'}`,
                          background: form.role===r.value ? 'var(--bg-active)' : 'var(--bg-overlay)',
                          color: form.role===r.value ? 'var(--brand-300)' : 'var(--text-muted)',
                          cursor:'pointer', transition:'all 0.12s',
                          display:'flex', alignItems:'center', gap:'5px', justifyContent:'center',
                        }}>
                        <span style={{ fontSize:'13px' }}>{r.icon}</span>
                        <span>{r.label}</span>
                      </button>
                    ))}
                  </div>
                </F>

                {selectedRole?.needsPharmacy && (
                  <F label="Branch" required={selectedRole.needsPharmacy} error={errors.pharmacyId}>
                    <select value={form.pharmacyId} onChange={(e)=>sf('pharmacyId',e.target.value)} style={{ height:'34px', fontSize:'13px' }}>
                      <option value="">Select branch...</option>
                      {pharmacies.filter((p)=>p.active!==false).map((p)=>(
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                    {pharmacies.length===0 && (
                      <p style={{ fontSize:'11px', color:'#fbbf24', marginTop:'4px' }}>
                        ⚠ No branches available — add branches first
                      </p>
                    )}
                  </F>
                )}

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <F label="Phone">
                    <div style={{ position:'relative' }}>
                      <Phone style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', width:13, height:13, color:'var(--text-muted)', pointerEvents:'none' }} />
                      <input type="tel" value={form.phone} onChange={(e)=>sf('phone',e.target.value)} placeholder="05xxxxxxxx" style={{ paddingRight:'32px', height:'34px', fontSize:'13px' }} />
                    </div>
                  </F>
                  <F label="Employee ID" error={errors.employeeId}>
                    <div style={{ position:'relative' }}>
                      <Hash style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', width:13, height:13, color:'var(--text-muted)', pointerEvents:'none' }} />
                      <input value={form.employeeId} dir="ltr" onChange={(e)=>sf('employeeId',e.target.value)} placeholder="EMP-001" style={{ paddingRight:'32px', height:'34px', fontSize:'13px' }} />
                    </div>
                  </F>
                </div>

                <F label="Status">
                  <div style={{ display:'flex', gap:'6px' }}>
                    {[{v:'active',l:'Active'},{v:'inactive',l:'Inactive'}].map((s)=>(
                      <button key={s.v} type="button" onClick={()=>sf('status',s.v)}
                        style={{
                          flex:1, height:'32px', borderRadius:'7px', fontSize:'12px',
                          border:`1px solid ${form.status===s.v ? (s.v==='active'?'var(--border-brand)':'rgba(239,68,68,0.2)') : 'var(--border-subtle)'}`,
                          background: form.status===s.v ? (s.v==='active'?'var(--bg-active)':'rgba(239,68,68,0.08)') : 'var(--bg-overlay)',
                          color: form.status===s.v ? (s.v==='active'?'var(--brand-300)':'#f87171') : 'var(--text-muted)',
                          cursor:'pointer', transition:'all 0.12s',
                        }}>
                        {s.l}
                      </button>
                    ))}
                  </div>
                </F>

                <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
                  <button onClick={closeModal} className="btn btn-secondary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                    {saving
                      ? <><Loader2 style={{ width:13, height:13, animation:'spin 1s linear infinite' }} />{isNew?'Creating...':'Saving...'}</>
                      : isNew ? 'Create User' : 'Save Changes'
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirmToggle} onClose={()=>setConfirmToggle(null)} onConfirm={handleToggle}
        title={confirmToggle?.active!==false?'Suspend User':'Activate User'}
        message={`${confirmToggle?.active!==false?'Suspend':'Activate'} account for "${confirmToggle?.displayName}"?`}
        confirmLabel={confirmToggle?.active!==false?'Suspend':'Activate'}
        danger={confirmToggle?.active!==false} />
    </div>
  )
}
