// ============================================================
// Users Page — reads pharmacies from Firestore (no dummy data)
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Users, Plus, Search, Pencil, UserCheck, UserX,
  Save, X, Loader2, Eye, EyeOff, AlertCircle,
  ToggleLeft, ToggleRight, Mail, Phone, Hash, Shield, Crown, Building2,
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
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/SkeletonCard'

const ROLES = [
  { value:'admin',      label:'مدير النظام',  icon:'👑', needsPharmacy:false },
  { value:'manager',    label:'مدير فرع',     icon:'🏪', needsPharmacy:true  },
  { value:'pharmacist', label:'صيدلاني',       icon:'💊', needsPharmacy:true  },
]
const ROLE_STYLE = {
  admin:      'bg-red-500/10 text-red-400 border-red-500/20',
  manager:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pharmacist: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
}

function pwStrength(pw) {
  if (!pw) return { score:0, label:'', color:'' }
  let s=0
  if (pw.length>=6)  s++
  if (pw.length>=10) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (s<=1) return { score:s, label:'ضعيفة جداً', color:'bg-red-500' }
  if (s<=2) return { score:s, label:'ضعيفة',     color:'bg-orange-500' }
  if (s<=3) return { score:s, label:'متوسطة',    color:'bg-yellow-500' }
  if (s<=4) return { score:s, label:'قوية',      color:'bg-brand-500' }
  return          { score:s, label:'قوية جداً', color:'bg-green-500' }
}

const EMPTY = {
  displayName:'', email:'', password:'', role:'pharmacist',
  pharmacyId:'', phone:'', employeeId:'', status:'active', sendEmail:true,
}

export default function UsersPage() {
  const { userProfile } = useAuthStore()
  const { pharmacies, subscribe: subscribePh } = usePharmacyStore()
  const toast = useToastStore()

  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterRole,   setFilterRole]   = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
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
    const u1 = subscribePh()
    const q  = query(collection(db, COL.USERS), orderBy('createdAt', 'desc'))
    const u2 = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ id:d.id, uid:d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return () => { u1(); u2() }
  }, [])

  const isNew = !editUser

  const stats = useMemo(() => ({
    total:  users.length,
    active: users.filter((u) => u.active !== false).length,
    counts: users.reduce((a, u) => { a[u.role]=(a[u.role]||0)+1; return a }, {}),
  }), [users])

  const filtered = useMemo(() =>
    users.filter((u) => {
      const q  = search.toLowerCase()
      const ms = !q || u.displayName?.toLowerCase().includes(q) ||
                       u.email?.toLowerCase().includes(q)       ||
                       u.employeeId?.toLowerCase().includes(q)
      const mr = filterRole   === 'all' || u.role === filterRole
      const ma = filterStatus === 'all' ||
        (filterStatus==='active'   ? u.active!==false : u.active===false)
      return ms && mr && ma
    }),
    [users, search, filterRole, filterStatus]
  )

  const getPharmacyName = (id) => pharmacies.find((p) => p.id === id)?.name || '—'
  const sf = (f, v) => { setForm((p)=>({...p,[f]:v})); setErrors((e)=>({...e,[f]:undefined})) }
  const selectedRole = ROLES.find((r) => r.value === form.role)

  const openCreate = () => { setForm(EMPTY); setEditUser(null); setErrors({}); setStep('form'); setCreated(null); setShowModal(true) }
  const openEdit   = (u) => {
    setForm({
      displayName:u.displayName||'', email:u.email||'', password:'',
      role:u.role||'pharmacist', pharmacyId:u.pharmacyId||'',
      phone:u.phone||'', employeeId:u.employeeId||'',
      status:u.status||(u.active!==false?'active':'inactive'), sendEmail:false,
    })
    setEditUser(u); setErrors({}); setStep('form'); setCreated(null); setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditUser(null) }

  const validate = async () => {
    const e = {}
    if (!form.displayName?.trim()) e.displayName = 'الاسم مطلوب'
    if (!form.email?.trim())       e.email = 'البريد مطلوب'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'البريد غير صالح'
    else if (isNew && users.some((u) => u.email?.toLowerCase() === form.email.toLowerCase()))
      e.email = 'البريد مسجّل مسبقاً'
    if (isNew) {
      if (!form.password)         e.password = 'كلمة المرور مطلوبة'
      else if (form.password.length < 6) e.password = 'أقل 6 أحرف'
    }
    if (!form.role) e.role = 'الدور مطلوب'
    if (selectedRole?.needsPharmacy && !form.pharmacyId) e.pharmacyId = 'الفرع مطلوب لهذا الدور'
    if (form.employeeId?.trim()) {
      const dup = await employeeIdExists(form.employeeId.trim(), isNew ? null : editUser?.uid||editUser?.id)
      if (dup) e.employeeId = 'الرقم الوظيفي مستخدم مسبقاً'
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
          displayName: form.displayName.trim(), email: form.email.trim(),
          password: form.password, role: form.role, status: form.status,
          pharmacyId: form.pharmacyId||null, phone: form.phone,
          employeeId: form.employeeId, sendWelcomeEmail: form.sendEmail,
          actorId: userProfile?.uid, actorRole: userProfile?.role,
        })
        setCreated(result); setStep('success')
      } else {
        await updateUserProfile(
          editUser.uid||editUser.id,
          {
            displayName: form.displayName.trim(), role: form.role,
            status: form.status, active: form.status==='active',
            pharmacyId: form.pharmacyId||null, phone: form.phone, employeeId: form.employeeId,
          },
          userProfile?.uid, userProfile?.role,
        )
        toast.success('تم تحديث بيانات المستخدم')
        closeModal()
      }
    } catch (e) {
      const msg = e.message || 'حدث خطأ'
      if (msg.toLowerCase().includes('email') || msg.includes('البريد')) setErrors({ email: msg })
      else setErrors({ _global: msg })
      toast.error(msg)
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!confirmToggle) return
    try {
      await toggleUserStatus(confirmToggle.uid||confirmToggle.id, userProfile?.uid, userProfile?.role)
      toast.success(`تم ${confirmToggle.active!==false?'إيقاف':'تفعيل'} الحساب`)
    } catch (e) { toast.error(e.message) }
    setConfirmToggle(null)
  }

  const pw = pwStrength(form.password)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-400" />إدارة المستخدمين
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{stats.total} مستخدم · {stats.active} نشط</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary gap-2"><Plus className="w-4 h-4"/>إضافة مستخدم</button>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { role:'admin',      label:'مدير النظام', color:'#ef4444', icon:Crown },
          { role:'manager',    label:'مدير فرع',    color:'#f59e0b', icon:Shield },
          { role:'pharmacist', label:'صيدلاني',      color:'#1a9a7e', icon:Building2 },
        ].map((r) => (
          <button key={r.role} onClick={() => setFilterRole(filterRole===r.role?'all':r.role)}
            className="card card-p flex items-center gap-3 cursor-pointer text-right transition-all"
            style={filterRole===r.role ? { borderColor:`${r.color}40` } : {}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:`${r.color}18` }}>
              <r.icon className="w-4 h-4" style={{ color:r.color }} />
            </div>
            <div><div className="text-xl font-bold text-white">{stats.counts[r.role]||0}</div>
            <div className="text-xs text-slate-500">{r.label}</div></div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e)=>setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد..." className="pr-9 text-sm" />
        </div>
        <select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)} className="text-sm">
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">موقوف</option>
        </select>
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={6} /> : filtered.length===0 ? (
        <EmptyState icon={Users} title="لا يوجد مستخدمون"
          action={<button onClick={openCreate} className="btn btn-primary btn-sm gap-2"><Plus className="w-4 h-4"/>إضافة</button>} />
      ) : (
        <div className="tbl-wrap overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th>المستخدم</th>
              <th className="hidden sm:table-cell">البريد</th>
              <th>الدور</th>
              <th className="hidden md:table-cell">الفرع</th>
              <th>الحالة</th>
              <th className="text-center">إجراء</th>
            </tr></thead>
            <tbody>
              {filtered.map((u) => {
                const uid = u.uid||u.id
                const active = u.active!==false && u.status!=='inactive'
                return (
                  <tr key={uid} className={active?'':'opacity-50'}>
                    <td><div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {u.displayName?.[0]||'?'}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">{u.displayName}</div>
                        {u.employeeId && <div className="text-xs text-slate-600">#{u.employeeId}</div>}
                      </div>
                    </div></td>
                    <td className="hidden sm:table-cell text-sm text-slate-400">{u.email}</td>
                    <td><span className={`badge text-xs ${ROLE_STYLE[u.role]||ROLE_STYLE.pharmacist}`}>
                      {ROLES.find((r)=>r.value===u.role)?.label||u.role}
                    </span></td>
                    <td className="hidden md:table-cell text-sm text-slate-400">
                      {u.pharmacyId ? getPharmacyName(u.pharmacyId) : '—'}
                    </td>
                    <td><span className={`badge text-xs ${active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {active?'نشط':'موقوف'}
                    </span></td>
                    <td><div className="flex items-center justify-center gap-1">
                      <button onClick={()=>openEdit(u)} className="btn btn-ghost btn-icon btn-sm"><Pencil className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>setConfirmToggle({...u,uid,active})}
                        className={`btn btn-ghost btn-icon btn-sm ${active?'hover:text-red-400':'hover:text-green-400'}`}>
                        {active ? <UserX className="w-3.5 h-3.5"/> : <UserCheck className="w-3.5 h-3.5"/>}
                      </button>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal}/>
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-base font-bold text-white">{isNew?'إضافة مستخدم':'تعديل المستخدم'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isNew ? 'يُنشئ Firebase Auth + Firestore document' : 'تعديل Firestore فقط'}
                </p>
              </div>
              <button onClick={closeModal} className="btn btn-ghost btn-icon"><X className="w-5 h-5"/></button>
            </div>

            {step==='success' && created ? (
              <div className="px-6 py-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
                  <UserCheck className="w-8 h-8 text-green-400"/>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">تم إنشاء الحساب!</h3>
                  <p className="text-sm text-slate-400 mt-1">{created.displayName}</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-4 space-y-2 text-right text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">UID</span>
                    <code className="text-brand-400 text-xs">{created.uid}</code></div>
                  <div className="flex justify-between"><span className="text-slate-500">الفرع</span>
                    <span className="text-slate-200">{created.pharmacyId ? getPharmacyName(created.pharmacyId) : '—'}</span></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>{setStep('form');setForm(EMPTY);setErrors({})}} className="btn btn-secondary flex-1">إضافة آخر</button>
                  <button onClick={closeModal} className="btn btn-primary flex-1">إغلاق</button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                {errors._global && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0"/>{errors._global}
                  </div>
                )}

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">الاسم *</label>
                  <input value={form.displayName} onChange={(e)=>sf('displayName',e.target.value)} placeholder="محمد أحمد العتيبي"/>
                  {errors.displayName && <p className="text-xs text-red-400">{errors.displayName}</p>}
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">البريد الإلكتروني *</label>
                  <div className="relative">
                    <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/>
                    <input type="email" dir="ltr" value={form.email} onChange={(e)=>sf('email',e.target.value)}
                      placeholder="user@company.com" className="pr-10"
                      disabled={!isNew} style={!isNew?{opacity:0.6,cursor:'not-allowed'}:{}}/>
                  </div>
                  {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
                </div>

                {/* Password */}
                {isNew && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">كلمة المرور *</label>
                    <div className="relative">
                      <input type={showPass?'text':'password'} dir="ltr" value={form.password}
                        onChange={(e)=>sf('password',e.target.value)} placeholder="••••••••" className="pl-10"/>
                      <button type="button" onClick={()=>setShowPass(!showPass)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {showPass?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                      </button>
                    </div>
                    {form.password && (
                      <div className="space-y-1">
                        <div className="flex gap-1">{[1,2,3,4,5].map((i)=>(
                          <div key={i} className={`h-1 flex-1 rounded-full ${i<=pw.score?pw.color:'bg-slate-800'}`}/>
                        ))}</div>
                        <p className={`text-xs ${pw.score<=2?'text-red-400':pw.score<=3?'text-yellow-400':'text-green-400'}`}>{pw.label}</p>
                      </div>
                    )}
                    {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
                    <label className="flex items-center gap-2.5 mt-1 cursor-pointer">
                      <button type="button" onClick={()=>sf('sendEmail',!form.sendEmail)}
                        className={`w-9 h-5 rounded-full transition-all relative ${form.sendEmail?'bg-brand-500':'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.sendEmail?'right-0.5':'left-0.5'}`}/>
                      </button>
                      <span className="text-xs text-slate-400">إرسال بريد لتعيين كلمة المرور</span>
                    </label>
                  </div>
                )}

                {/* Role */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">الدور *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ROLES.map((r) => (
                      <button key={r.value} type="button" onClick={()=>sf('role',r.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                          form.role===r.value
                            ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
                            : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}>
                        <span>{r.icon}</span><span className="text-xs">{r.label}</span>
                      </button>
                    ))}
                  </div>
                  {errors.role && <p className="text-xs text-red-400">{errors.role}</p>}
                </div>

                {/* Pharmacy */}
                {selectedRole?.needsPharmacy && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      الفرع {selectedRole.needsPharmacy && '*'}
                    </label>
                    <select value={form.pharmacyId} onChange={(e)=>sf('pharmacyId',e.target.value)}>
                      <option value="">-- اختر الفرع --</option>
                      {pharmacies.filter((p)=>p.active!==false).map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                    {errors.pharmacyId && <p className="text-xs text-red-400">{errors.pharmacyId}</p>}
                    {pharmacies.length===0 && (
                      <p className="text-xs text-amber-400">⚠️ لا توجد فروع — أضف فروعاً أولاً من صفحة إدارة الفروع</p>
                    )}
                  </div>
                )}

                {/* Phone + EmployeeId */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">الجوال</label>
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/>
                      <input type="tel" value={form.phone} onChange={(e)=>sf('phone',e.target.value)} placeholder="05xxxxxxxx" className="pr-9"/>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">رقم الموظف</label>
                    <div className="relative">
                      <Hash className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/>
                      <input value={form.employeeId} dir="ltr" onChange={(e)=>sf('employeeId',e.target.value)} placeholder="EMP-001" className="pr-9"/>
                    </div>
                    {errors.employeeId && <p className="text-xs text-red-400">{errors.employeeId}</p>}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-slate-300">الحالة</span>
                  <div className="flex gap-2">
                    {['active','inactive'].map((s)=>(
                      <button key={s} type="button" onClick={()=>sf('status',s)}
                        className={`px-3 py-1.5 rounded-xl text-sm border transition-all ${
                          form.status===s
                            ? s==='active'
                              ? 'bg-brand-500/15 border-brand-500/30 text-brand-300'
                              : 'bg-red-500/15 border-red-500/30 text-red-400'
                            : 'bg-slate-800 border-slate-700 text-slate-500'
                        }`}>
                        {s==='active'?'نشط':'موقوف'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={closeModal} className="btn btn-secondary flex-1">إلغاء</button>
                  <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 gap-2">
                    {saving?<><Loader2 className="w-4 h-4 animate-spin"/>{isNew?'جاري الإنشاء...':'جاري الحفظ...'}</>
                           :<><Save className="w-4 h-4"/>{isNew?'إنشاء المستخدم':'حفظ'}</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirmToggle} onClose={()=>setConfirmToggle(null)} onConfirm={handleToggle}
        title={confirmToggle?.active!==false?'إيقاف المستخدم':'تفعيل المستخدم'}
        message={`هل تريد ${confirmToggle?.active!==false?'إيقاف':'تفعيل'} حساب "${confirmToggle?.displayName}"؟`}
        confirmLabel={confirmToggle?.active!==false?'إيقاف':'تفعيل'}
        danger={confirmToggle?.active!==false} />
    </div>
  )
}
