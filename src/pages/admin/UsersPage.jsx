// ============================================================
// Users Page — Enterprise DataTable, Firestore, Auth REST API
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Users, Plus, Search, Pencil, UserCheck, UserX,
  Save, X, Loader2, AlertCircle,
  Mail, Phone, Hash, Shield, Crown, Building2, Download, ArrowRightLeft,
} from 'lucide-react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db, COL } from '../../services/firebase'
import { useAuthStore } from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useDistrictStore } from '../../store/districtStore'
import { useRegionStore } from '../../store/regionStore'
import {
  createUser, updateUserProfile, toggleUserStatus,
  employeeIdExists, transferUser, promoteBranchManager,
} from '../../services/userService'
import { useToastStore } from '../../components/ui/Toast'
import { useScopeProfile } from '../../hooks/useScopeProfile'
import { isPharmacyAllowed, filterAllowedPharmacies } from '../../services/scopeResolver'
import ConfirmModal from '../../components/ui/ConfirmModal'
import DataTable, { StatusPill, RowActions } from '../../components/ui/DataTable'
import {
  ROLE_METADATA, CREATABLE_ROLES, getRoleLabel, getRequiredScopeType,
  getScopeRequiredMessage, getCanonicalRoleValue,
} from '../../constants/roleScope'

// Presentation-only icon/color per role — canonical label/scope rules live in roleScope.js
const ROLE_ICONS = {
  admin:'👑', general_manager:'🏢', regional_manager:'📊',
  district_supervisor:'🗺️', branch_manager:'🏪', manager:'🏪', pharmacist:'💊',
}
const ROLE_STAT_COLORS = {
  admin:'#f87171', general_manager:'#f87171', regional_manager:'#a78bfa',
  district_supervisor:'#fb923c', branch_manager:'#fbbf24', pharmacist:'var(--brand-400)',
}
const ROLES = CREATABLE_ROLES.map((r) => ({ ...r, icon: ROLE_ICONS[r.value] || '•' }))

// Identity state — derived only from fields that already exist on the user
// document (active, lastLoginAt). No new persisted state is introduced.
function identityState(u) {
  const isActive = u.active !== false && u.status !== 'inactive'
  if (!isActive) return { label: 'Inactive', tone: 'inactive' }
  if (!u.lastLoginAt) return { label: 'Pending Invitation', tone: 'pending' }
  return { label: 'Active', tone: 'active' }
}

const EMPTY = {
  displayName:'', email:'', role:'pharmacist',
  pharmacyId:'', districtId:'', regionId:'',
  phone:'', employeeId:'', status:'active',
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
  const { districts, subscribe: subDistricts } = useDistrictStore()
  const { regions, subscribe: subRegions } = useRegionStore()
  const toast = useToastStore()
  const { scope, loading: scopeLoading, error: scopeError } = useScopeProfile()
  // Phase 3A-1B: territory roles identified via list scope.
  const isReadOnly = scope?.type === 'list'
  const isTerritoryRole = isReadOnly
  // Phase 3A-1C1: roles territory actors are allowed to create.
  const SUPERVISOR_CREATABLE_ROLES = ['pharmacist', 'manager', 'branch_manager']
  // Territory roles gain create access in 3A-1C1.
  // GM excluded: Firestore create rule not yet extended for general_manager.
  const canCreate = userProfile?.role === 'admin' || isTerritoryRole
  // 3A-1C2: territory roles can edit basic info (displayName/phone/employeeId).
  const canEdit = userProfile?.role === 'admin' || isTerritoryRole
  // 3A-1C3: roles territory actors are allowed to toggle active/inactive.
  const SUPERVISOR_TOGGLEABLE_ROLES = ['pharmacist', 'manager', 'branch_manager']
  // 3A-1C4: roles territory actors are allowed to transfer between branches.
  const SUPERVISOR_TRANSFERABLE_ROLES = ['pharmacist', 'manager', 'branch_manager']
  const canTransfer = userProfile?.role === 'admin' || isTerritoryRole
  // 3A-1C5: roles that can be promoted or demoted (pharmacist ↔ branch_manager only).
  const SUPERVISOR_PROMOTABLE_ROLES = ['pharmacist', 'branch_manager']

  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterRole,   setFilterRole]   = useState('all')
  const [showModal,    setShowModal]    = useState(false)
  const [editUser,     setEditUser]     = useState(null)
  const [form,         setForm]         = useState(EMPTY)
  const [errors,       setErrors]       = useState({})
  const [saving,       setSaving]       = useState(false)
  const [step,         setStep]         = useState('form')
  const [created,      setCreated]      = useState(null)
  const [confirmToggle,setConfirmToggle]= useState(null)
  const [transferTarget, setTransferTarget] = useState(null)
  const [transferDest,   setTransferDest]   = useState('')
  const [transferring,   setTransferring]   = useState(false)
  const [promotionTarget, setPromotionTarget] = useState(null)

  useEffect(() => {
    const u1 = subPh()
    const u3 = subDistricts()
    const u4 = subRegions()
    const q  = query(collection(db, COL.USERS), orderBy('createdAt', 'desc'))
    const u2 = onSnapshot(q, (snap) => {
      // Closure Patch Part 2: CLAIMED pending-onboarding docs are
      // historical identity-link artifacts (see
      // pharmacistActivationService.ts) — superseded by a real
      // Auth-linked user doc the moment they're claimed. They remain
      // fully readable via Audit Logs; they must never appear as an
      // operational row in this list.
      setUsers(snap.docs.filter((d) => d.data().authStatus !== 'CLAIMED').map((d) => ({ id:d.id, uid:d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return () => { u1?.(); u2?.(); u3?.(); u4?.() }
  }, [])

  const isNew = !editUser

  // Scope-filtered user list: territory roles see only users assigned to their pharmacies.
  const scopedUsers = useMemo(() => {
    if (!scope) return []
    if (scope.type === 'all') return users
    if (scope.type === 'list') return users.filter(u => u.pharmacyId && isPharmacyAllowed(scope, u.pharmacyId))
    if (scope.type === 'single') return users.filter(u => u.pharmacyId === scope.id)
    return []
  }, [users, scope])

  const stats = useMemo(() => ({
    total:  scopedUsers.length,
    active: scopedUsers.filter((u) => u.active !== false).length,
    counts: scopedUsers.reduce((a,u)=>{ const r=getCanonicalRoleValue(u.role); a[r]=(a[r]||0)+1; return a }, {}),
  }), [scopedUsers])

  const filtered = useMemo(() =>
    scopedUsers.filter((u) => {
      const q = search.toLowerCase()
      const ms = !q || u.displayName?.toLowerCase().includes(q) ||
                       u.email?.toLowerCase().includes(q) ||
                       u.employeeId?.toLowerCase().includes(q)
      const mr = filterRole==='all' || u.role===filterRole || getCanonicalRoleValue(u.role)===filterRole
      return ms && mr
    }), [scopedUsers, search, filterRole])

  const getPharmacyName = (id) => pharmacies.find((p) => p.id===id)?.name || '—'
  const getDistrictName = (id) => districts.find((d) => d.id===id)?.name || '—'
  const getRegionName   = (id) => regions.find((r) => r.id===id)?.name || '—'
  const sf = (f,v) => { setForm((p)=>({...p,[f]:v})); setErrors((e)=>({...e,[f]:undefined})) }
  const requiredScopeType = getRequiredScopeType(form.role)

  // Changing role must clear whichever scope field the *previous* role
  // required — a Branch Manager's pharmacyId must not silently survive
  // into a Regional Manager submission, and vice versa.
  const setRole = (roleValue) => {
    setForm((p) => ({
      ...p, role: roleValue,
      pharmacyId: '', districtId: '', regionId: '',
    }))
    setErrors((e) => ({ ...e, role: undefined, pharmacyId: undefined, districtId: undefined, regionId: undefined }))
  }

  const openCreate = () => {
    if (!canCreate) return
    setForm(EMPTY); setEditUser(null); setErrors({}); setStep('form'); setCreated(null); setShowModal(true)
  }
  const openEdit   = (u)  => {
    if (!canEdit) return
    setForm({ displayName:u.displayName||'', email:u.email||'',
              role:u.role||'pharmacist', pharmacyId:u.pharmacyId||'',
              districtId:u.districtId||'', regionId:(u.regionIds||[])[0]||'',
              phone:u.phone||'', employeeId:u.employeeId||'',
              status:u.status||(u.active!==false?'active':'inactive') })
    setEditUser(u); setErrors({}); setStep('form'); setCreated(null); setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditUser(null) }

  // 3A-1C3: whether a row should show the Suspend/Activate action.
  // Territory roles: target must be in scope AND have an allowed role.
  const canToggleRow = (row) => {
    if (!isReadOnly) return true
    return SUPERVISOR_TOGGLEABLE_ROLES.includes(row.role)
      && isPharmacyAllowed(scope, row.pharmacyId)
  }
  // 3A-1C3: pre-confirm guard — runs before the confirm modal opens (Task 2 / defense layer 1).
  const requestToggle = (row) => {
    if (isTerritoryRole) {
      if (!isPharmacyAllowed(scope, row.pharmacyId)) {
        toast.error('User not in your assigned territory'); return
      }
      if (!SUPERVISOR_TOGGLEABLE_ROLES.includes(row.role)) {
        toast.error('Cannot modify this role'); return
      }
    }
    setConfirmToggle({...row, uid:row.uid||row.id, active:row.active!==false})
  }

  const validate = async () => {
    const e = {}
    if (!form.displayName?.trim()) e.displayName='Name is required'
    if (!form.email?.trim()) e.email='Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email='Invalid email'
    else if (isNew && users.some((u)=>u.email?.toLowerCase()===form.email.toLowerCase()))
      e.email='Email already registered'
    if (!form.role) e.role='Role required'
    // Role-aware scope validation — never the generic "pharmacyId is
    // required" message, and never validates a field the role doesn't use.
    if (requiredScopeType === 'branch' && !form.pharmacyId) {
      e.pharmacyId = getScopeRequiredMessage(form.role)
    } else if (requiredScopeType === 'district' && !form.districtId) {
      e.districtId = getScopeRequiredMessage(form.role)
    } else if (requiredScopeType === 'region' && !form.regionId) {
      e.regionId = getScopeRequiredMessage(form.role)
    }
    if (form.employeeId?.trim()) {
      const dup = await employeeIdExists(form.employeeId.trim(), isNew?null:editUser?.uid||editUser?.id)
      if (dup) e.employeeId='Employee ID already in use'
    }
    return e
  }

  const handleSave = async () => {
    if (!isNew && !canEdit) return
    // 3A-1C1: territory create guards — defense-in-depth before createUser()
    if (isNew && isTerritoryRole) {
      if (!SUPERVISOR_CREATABLE_ROLES.includes(form.role)) {
        toast.error('Role not permitted for your account')
        return
      }
      if (!isPharmacyAllowed(scope, form.pharmacyId)) {
        toast.error('Branch not in your assigned territory')
        return
      }
    }
    // 3A-1C2: territory edit guard — verify target user is in assignedPharmacyIds
    if (!isNew && isTerritoryRole) {
      if (!isPharmacyAllowed(scope, editUser.pharmacyId)) {
        toast.error('User not in your assigned territory')
        return
      }
    }
    const errs = await validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (isNew) {
        // No admin-entered password — userService generates one internally
        // and always emails a reset/setup link; the admin never sees it.
        const result = await createUser({
          displayName:form.displayName.trim(), email:form.email.trim(),
          role:form.role, status:form.status,
          pharmacyId:form.pharmacyId||null,
          districtId:form.districtId||null,
          regionIds:form.regionId ? [form.regionId] : null,
          phone:form.phone,
          employeeId:form.employeeId,
          actorId:userProfile?.uid, actorRole:userProfile?.role,
        })
        setCreated(result); setStep('success')
      } else {
        // 3A-1C2: territory roles may only touch displayName/phone/employeeId.
        const updateData = isTerritoryRole
          ? { displayName:form.displayName.trim(), phone:form.phone, employeeId:form.employeeId }
          : { displayName:form.displayName.trim(), role:form.role,
              status:form.status, active:form.status==='active',
              pharmacyId:form.pharmacyId||null,
              districtId:form.districtId||null,
              regionIds:form.regionId ? [form.regionId] : null,
              phone:form.phone, employeeId:form.employeeId }
        await updateUserProfile(
          editUser.uid||editUser.id,
          updateData,
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
    // 3A-1C3: territory toggle guard — defense-in-depth before toggleUserStatus (Task 3 / defense layer 2).
    if (isTerritoryRole) {
      if (!isPharmacyAllowed(scope, confirmToggle.pharmacyId)) {
        toast.error('User not in your assigned territory')
        setConfirmToggle(null)
        return
      }
      if (!SUPERVISOR_TOGGLEABLE_ROLES.includes(confirmToggle.role)) {
        toast.error('Cannot modify this role')
        setConfirmToggle(null)
        return
      }
    }
    try {
      await toggleUserStatus(confirmToggle.uid||confirmToggle.id, userProfile?.uid, userProfile?.role)
      toast.success(`Account ${confirmToggle.active!==false?'suspended':'activated'}`)
    } catch (e) { toast.error(e.message) }
    setConfirmToggle(null)
  }

  const canTransferRow = (row) => {
    if (!isTerritoryRole) return userProfile?.role === 'admin'
    return SUPERVISOR_TRANSFERABLE_ROLES.includes(row.role)
      && isPharmacyAllowed(scope, row.pharmacyId)
  }
  const requestTransfer = (row) => {
    if (isTerritoryRole) {
      if (!isPharmacyAllowed(scope, row.pharmacyId)) {
        toast.error('User not in your assigned territory'); return
      }
      if (!SUPERVISOR_TRANSFERABLE_ROLES.includes(row.role)) {
        toast.error('Cannot transfer this role'); return
      }
    }
    setTransferTarget(row)
    setTransferDest('')
  }
  const handleTransfer = async () => {
    if (!transferTarget || !transferDest) return
    // 3A-1C4: territory transfer guard — defense-in-depth before transferUser (defense layer 2).
    if (isTerritoryRole) {
      if (!isPharmacyAllowed(scope, transferTarget.pharmacyId)) {
        toast.error('User not in your assigned territory')
        setTransferTarget(null)
        return
      }
      if (!SUPERVISOR_TRANSFERABLE_ROLES.includes(transferTarget.role)) {
        toast.error('Cannot transfer this role')
        setTransferTarget(null)
        return
      }
      if (!isPharmacyAllowed(scope, transferDest)) {
        toast.error('Destination branch not in your assigned territory')
        setTransferTarget(null)
        return
      }
    }
    if (transferDest === transferTarget.pharmacyId) {
      toast.error('User is already assigned to this branch')
      return
    }
    setTransferring(true)
    try {
      await transferUser(transferTarget.uid || transferTarget.id, transferDest, userProfile?.uid, userProfile?.role)
      toast.success('User transferred successfully')
      setTransferTarget(null)
    } catch (e) { toast.error(e.message) }
    finally { setTransferring(false) }
  }

  const canPromoteRow = (row) => {
    if (!SUPERVISOR_PROMOTABLE_ROLES.includes(row.role)) return false
    if (isTerritoryRole) return isPharmacyAllowed(scope, row.pharmacyId)
    return userProfile?.role === 'admin'
  }
  const requestPromotion = (row) => {
    if (isTerritoryRole) {
      if (!isPharmacyAllowed(scope, row.pharmacyId)) {
        toast.error('User not in your assigned territory'); return
      }
      if (!SUPERVISOR_PROMOTABLE_ROLES.includes(row.role)) {
        toast.error('Cannot promote/demote this role'); return
      }
    }
    setPromotionTarget({
      ...row,
      uid: row.uid || row.id,
      newRole: row.role === 'pharmacist' ? 'branch_manager' : 'pharmacist',
    })
  }
  const handlePromotion = async () => {
    if (!promotionTarget) return
    // 3A-1C5: territory promotion guard — defense-in-depth before promoteBranchManager (defense layer 2).
    if (isTerritoryRole) {
      if (!isPharmacyAllowed(scope, promotionTarget.pharmacyId)) {
        toast.error('User not in your assigned territory')
        setPromotionTarget(null)
        return
      }
      if (!SUPERVISOR_PROMOTABLE_ROLES.includes(promotionTarget.role)) {
        toast.error('Cannot promote/demote this role')
        setPromotionTarget(null)
        return
      }
    }
    try {
      await promoteBranchManager(promotionTarget.uid, promotionTarget.newRole, userProfile?.uid, userProfile?.role)
      const label = promotionTarget.newRole === 'branch_manager' ? 'promoted to Branch Manager' : 'demoted to Pharmacist'
      toast.success(`${promotionTarget.displayName} ${label}`)
    } catch (e) { toast.error(e.message) }
    setPromotionTarget(null)
  }

  // 3A-1C1: scope-aware pharmacy list and role list for create modal
  const allowedPharmacies = scope ? filterAllowedPharmacies(scope, pharmacies) : []
  const pickablePharmacies = isTerritoryRole ? allowedPharmacies : pharmacies
  const visibleRoles = isTerritoryRole
    ? ROLES.filter(r => SUPERVISOR_CREATABLE_ROLES.includes(r.value))
    : ROLES

  if (scopeLoading) return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div style={{ color:'var(--text-muted)', fontSize:'13px', textAlign:'center', paddingTop:'60px' }}>
        Loading users...
      </div>
    </div>
  )

  if (scopeError || scope?.type === 'none') return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div style={{ color:'#f87171', fontSize:'13px', textAlign:'center', paddingTop:'60px' }}>
        Access denied
      </div>
    </div>
  )

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
      render:(val)=><StatusPill status={val} label={getRoleLabel(val)} />,
    },
    {
      key:'pharmacyId', label:'Scope',
      render:(_, row)=>{
        const scopeType = getRequiredScopeType(row.role)
        if (scopeType === 'branch')   return <span style={{ fontSize:'11px' }}>{row.pharmacyId ? getPharmacyName(row.pharmacyId) : '—'}</span>
        if (scopeType === 'district') return <span style={{ fontSize:'11px' }}>{row.districtId ? getDistrictName(row.districtId) : '—'}</span>
        if (scopeType === 'region')   return <span style={{ fontSize:'11px' }}>{(row.regionIds||[])[0] ? getRegionName(row.regionIds[0]) : '—'}</span>
        return <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>Organization-wide</span>
      },
    },
    {
      key:'active', label:'Status', sortable:true, align:'center',
      render:(_, row)=>{
        const st = identityState(row)
        return <StatusPill status={st.tone} label={st.label} />
      },
    },
    {
      key:'_actions', label:'', align:'center', width:'100px',
      render:(_, row)=>(
        <RowActions actions={[
          ...(canEdit ? [{ label:'Edit', onClick:()=>openEdit(row) }] : []),
          ...(canToggleRow(row) ? [{ label: row.active!==false?'Suspend':'Activate',
            onClick:()=>requestToggle(row),
            secondary:true, danger:row.active!==false }] : []),
          ...(canTransferRow(row) ? [{ label:'Transfer', onClick:()=>requestTransfer(row) }] : []),
          ...(canPromoteRow(row) ? [{ label: row.role==='pharmacist'?'Promote':'Demote', onClick:()=>requestPromotion(row) }] : []),
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
          {canCreate && (
            <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap:'6px' }}>
              <Plus style={{ width:13, height:13 }} /> Add User
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display:'flex', gap:'2px' }}>
        {[
          { role:'all', label:'All', count:stats.total, color:'var(--text-muted)' },
          ...ROLE_METADATA.map((r) => ({
            role: r.value,
            label: getRoleLabel(r.value),
            count: stats.counts[r.value] || 0,
            color: ROLE_STAT_COLORS[r.value] || 'var(--text-muted)',
          })),
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

      {/* Mobile cards — PR-1E6: DataTable has no responsive variant and
          previously rendered as a 1213px-wide horizontally-scrolling
          table on a 375px viewport (measured), clipping the role/scope/
          status columns off-screen. Maps the same `filtered` array, same
          order, no recompute — only the shared DataTable stays desktop-only. */}
      {!loading && filtered.length > 0 && (
        <div className="sm:hidden" style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {filtered.map((row) => {
            const st = identityState(row)
            const scopeType = getRequiredScopeType(row.role)
            const scopeLabel = scopeType === 'branch'   ? (row.pharmacyId ? getPharmacyName(row.pharmacyId) : '—')
                              : scopeType === 'district' ? (row.districtId ? getDistrictName(row.districtId) : '—')
                              : scopeType === 'region'   ? ((row.regionIds||[])[0] ? getRegionName(row.regionIds[0]) : '—')
                              : 'Organization-wide'
            return (
              <div key={row.id || row.uid} className="card" style={{ padding:'12px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', minWidth:0 }}>
                    <div style={{
                      width:'28px', height:'28px', borderRadius:'50%', flexShrink:0,
                      background:'var(--brand-500)', color:'#09090b',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:'11px', fontWeight:700,
                    }}>{row.displayName?.[0]||'?'}</div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:'13px', fontWeight:500, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {row.displayName}
                      </div>
                      <div style={{ fontSize:'11px', color:'var(--text-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {row.email}
                      </div>
                    </div>
                  </div>
                  <div style={{ flexShrink:0 }}><StatusPill status={st.tone} label={st.label} /></div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'8px', flexWrap:'wrap' }}>
                  <StatusPill status={row.role} label={getRoleLabel(row.role)} />
                  <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{scopeLabel}</span>
                  {row.employeeId && (
                    <span style={{ fontSize:'10px', color:'var(--text-muted)', fontFamily:'monospace' }}>#{row.employeeId}</span>
                  )}
                </div>
                {(canEdit || canToggleRow(row) || canTransferRow(row) || canPromoteRow(row)) && (
                  <div style={{ display:'flex', gap:'6px', marginTop:'10px', flexWrap:'wrap' }}>
                    {canEdit && (
                      <button onClick={() => openEdit(row)} className="btn btn-secondary btn-sm" style={{ fontSize:'11px' }}>Edit</button>
                    )}
                    {canToggleRow(row) && (
                      <button onClick={() => requestToggle(row)} className="btn btn-secondary btn-sm" style={{ fontSize:'11px', color: row.active!==false ? '#f87171' : undefined }}>
                        {row.active!==false ? 'Suspend' : 'Activate'}
                      </button>
                    )}
                    {canTransferRow(row) && (
                      <button onClick={() => requestTransfer(row)} className="btn btn-secondary btn-sm" style={{ fontSize:'11px' }}>Transfer</button>
                    )}
                    {canPromoteRow(row) && (
                      <button onClick={() => requestPromotion(row)} className="btn btn-secondary btn-sm" style={{ fontSize:'11px' }}>
                        {row.role==='pharmacist' ? 'Promote' : 'Demote'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns} rows={filtered} loading={loading}
          emptyText="No users found"
          emptySubtext={search ? `No results for "${search}"` : 'Add your first user to get started'}
          selectable
        />
      </div>
      {loading && (
        <div className="sm:hidden">
          <DataTable columns={columns} rows={filtered} loading={loading} />
        </div>
      )}

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
                    <span style={{ color:'var(--text-muted)' }}>Scope</span>
                    <span>
                      {created.pharmacyId ? getPharmacyName(created.pharmacyId)
                        : created.districtId ? getDistrictName(created.districtId)
                        : (created.regionIds||[])[0] ? getRegionName(created.regionIds[0])
                        : 'Organization-wide'}
                    </span>
                  </div>
                </div>
                <div style={{
                  display:'flex', alignItems:'flex-start', gap:'8px',
                  background:'rgba(0,210,173,0.06)', border:'1px solid rgba(0,210,173,0.16)',
                  borderRadius:'8px', padding:'10px 12px', marginBottom:'16px',
                  fontSize:'11px', color:'var(--text-secondary)', textAlign:'left',
                }}>
                  <Mail style={{ width:13, height:13, color:'var(--brand-400)', flexShrink:0, marginTop:'1px' }} />
                  <span>An invitation email was sent to <strong>{created.email}</strong> to set up their password. The admin never sees or sets the account password.</span>
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
                  <div style={{
                    display:'flex', alignItems:'flex-start', gap:'8px',
                    background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
                    borderRadius:'8px', padding:'9px 11px', marginBottom:'12px',
                    fontSize:'11px', color:'var(--text-muted)',
                  }}>
                    <Mail style={{ width:13, height:13, flexShrink:0, marginTop:'1px' }} />
                    <span>The account is created without a password. An invitation email is sent to this address so the user sets their own password — no one else ever knows it.</span>
                  </div>
                )}

                {(!isTerritoryRole || isNew) && (
                <F label="Role" required error={errors.role}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px' }}>
                    {visibleRoles.map((r)=>(
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
                )}

                {requiredScopeType === 'branch' && (!isTerritoryRole || isNew) && (
                  <F label="Branch" required error={errors.pharmacyId}>
                    <select value={form.pharmacyId} onChange={(e)=>sf('pharmacyId',e.target.value)} style={{ height:'34px', fontSize:'13px' }}>
                      <option value="">Select branch...</option>
                      {pickablePharmacies.filter((p)=>p.active!==false).map((p)=>(
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                    {pickablePharmacies.length===0 && (
                      <p style={{ fontSize:'11px', color:'#fbbf24', marginTop:'4px' }}>
                        ⚠ No branches available — add branches first
                      </p>
                    )}
                  </F>
                )}

                {requiredScopeType === 'district' && (!isTerritoryRole || isNew) && (
                  <F label="District" required error={errors.districtId}>
                    <select value={form.districtId} onChange={(e)=>sf('districtId',e.target.value)} style={{ height:'34px', fontSize:'13px' }}>
                      <option value="">Select district...</option>
                      {districts.filter((d)=>d.active!==false).map((d)=>(
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                    {districts.length===0 && (
                      <p style={{ fontSize:'11px', color:'#fbbf24', marginTop:'4px' }}>
                        ⚠ No districts available — add districts first
                      </p>
                    )}
                  </F>
                )}

                {requiredScopeType === 'region' && (!isTerritoryRole || isNew) && (
                  <F label="Region" required error={errors.regionId}>
                    <select value={form.regionId} onChange={(e)=>sf('regionId',e.target.value)} style={{ height:'34px', fontSize:'13px' }}>
                      <option value="">Select region...</option>
                      {regions.filter((r)=>r.active!==false).map((r)=>(
                        <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                      ))}
                    </select>
                    {regions.length===0 && (
                      <p style={{ fontSize:'11px', color:'#fbbf24', marginTop:'4px' }}>
                        ⚠ No regions available — add regions first
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

                {(!isTerritoryRole || isNew) && (
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
                )}

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

      <ConfirmModal open={!!promotionTarget} onClose={()=>setPromotionTarget(null)} onConfirm={handlePromotion}
        title={promotionTarget?.newRole==='branch_manager'?'Branch Manager Promotion':'Demote to Pharmacist'}
        message={promotionTarget?.newRole==='branch_manager'
          ? `Promote "${promotionTarget?.displayName}" from Pharmacist to Branch Manager?`
          : `Demote "${promotionTarget?.displayName}" from Branch Manager to Pharmacist?`}
        confirmLabel={promotionTarget?.newRole==='branch_manager'?'Promote':'Demote'} />

      {/* Transfer Modal */}
      {transferTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }} onClick={()=>setTransferTarget(null)} />
          <div style={{
            position:'relative', width:'100%', maxWidth:'400px',
            background:'var(--bg-elevated)', border:'1px solid var(--border-strong)',
            borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
            padding:'20px', animation:'scaleIn 0.2s ease-out both',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <ArrowRightLeft style={{ width:16, height:16, color:'var(--brand-400)' }} />
                <span style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)' }}>Transfer User</span>
              </div>
              <button onClick={()=>setTransferTarget(null)} className="btn btn-ghost btn-icon" style={{ width:28, height:28 }}>
                <X style={{ width:14, height:14 }} />
              </button>
            </div>
            <F label="User">
              <input value={transferTarget.displayName} disabled style={{ height:'34px', fontSize:'13px' }} />
            </F>
            <F label="Current Branch">
              <input value={transferTarget.pharmacyId ? getPharmacyName(transferTarget.pharmacyId) : '—'} disabled style={{ height:'34px', fontSize:'13px' }} />
            </F>
            <F label="Destination Branch" required>
              <select value={transferDest} onChange={(e)=>setTransferDest(e.target.value)} style={{ height:'34px', fontSize:'13px' }}>
                <option value="">Select destination branch...</option>
                {allowedPharmacies
                  .filter((p) => p.active !== false && p.id !== transferTarget.pharmacyId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
              </select>
            </F>
            <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
              <button onClick={()=>setTransferTarget(null)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                Cancel
              </button>
              <button onClick={handleTransfer} disabled={transferring || !transferDest} className="btn btn-primary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                {transferring
                  ? <><Loader2 style={{ width:13, height:13, animation:'spin 1s linear infinite' }} />Transferring...</>
                  : 'Transfer'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
