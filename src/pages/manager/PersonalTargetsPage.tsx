// ============================================================
// Personal Targets Page — PT-1
//
// Manager + Admin only. Allows allocating branch KPI targets
// to individual pharmacists for a given month.
//
// Features:
//   - Month selector (current ± 2 months)
//   - Branch selector (admin only; manager sees own branch)
//   - Load branch targets from `targets` collection
//   - Equal split button (rounding-safe)
//   - Custom allocation table (editable per-user per-KPI)
//   - Validation: sum must equal branch target
//   - Save all allocations atomically
//
// Non-goals: No ranking. No evaluation. No coaching. No scoring.
// ============================================================
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { format, subMonths, addMonths } from 'date-fns'
import {
  Users, Save, Loader2, RefreshCw, ChevronDown,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }   from '../../components/ui/Toast'
import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { getTargetInputConfigs } from '../../engine/kpiRegistry/kpiUiAdapter'
import { subscribeTargets }      from '../../services/kpiService'
import { getUsersByPharmacy }    from '../../services/userService'
import {
  subscribePersonalTargetsByBranch,
  saveBranchPersonalTargets,
  publishPersonalTargets,
} from '../../services/personalTargetService'
import {
  allocateEqual,
  allocateCustom,
  validateCustomAllocation,
} from '../../engine/personalTargets/allocationEngine'
import type { PersonalAllocation } from '../../engine/personalTargets/allocationEngine'

// ── Helpers ───────────────────────────────────────────────────

function toMonthStr(d: Date): string {
  return format(d, 'yyyy-MM')
}

function monthLabel(m: string): string {
  try { return format(new Date(`${m}-01`), 'MMMM yyyy') } catch { return m }
}

const NOW = new Date()

// ── Sub-components ────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', fontSize: '10px', fontWeight: 600,
      letterSpacing: '0.07em', textTransform: 'uppercase',
      color: 'var(--text-muted)', marginBottom: '5px',
    }}>{children}</label>
  )
}

function Sel({
  value, onChange, children, disabled = false,
}: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        height: '34px', padding: '0 10px', fontSize: '12px',
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: '8px', color: 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none', width: '100%',
      }}
    >{children}</select>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function PersonalTargetsPage() {
  const { userProfile } = useAuthStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()
  const toast = useToastStore()

  const role         = userProfile?.role
  const isAdmin      = role === 'admin'
  const isManagerLvl = ['admin', 'manager', 'branch_manager'].includes(role ?? '')
  const myPharmacyId = userProfile?.pharmacyId

  // Month options: 2 months back → 3 months ahead
  const monthOpts = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(NOW, 2 - i)
      return { value: toMonthStr(d), label: monthLabel(toMonthStr(d)) }
    }), [])

  const [month,        setMonth]        = useState(toMonthStr(NOW))
  const [pharmacyId,   setPharmacyId]   = useState(isAdmin ? '' : (myPharmacyId ?? ''))
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  const [branchTarget, setBranchTarget] = useState<Record<string, number>>({})
  const [users,        setUsers]        = useState<{ id: string; displayName: string }[]>([])
  const [existing,     setExisting]     = useState<Record<string, Record<string, number>>>({})
  const [allocRows,    setAllocRows]    = useState<Record<string, Record<string, number>>>({})
  const [errors,       setErrors]       = useState<Record<string, string>>({})
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [savedOk,      setSavedOk]      = useState(false)
  const [publishing,   setPublishing]   = useState(false)
  const [publishedOk,  setPublishedOk]  = useState(false)

  // Live KPI registry
  useEffect(() => {
    return subscribeKpiRegistry(
      (r) => setLiveRegistry(r),
      () => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // Subscribe pharmacies
  useEffect(() => { const u = subPh(); return u }, [])

  // Target input configs from live registry
  const targetConfigs = useMemo(
    () => getTargetInputConfigs(liveRegistry),
    [liveRegistry],
  )

  // Subscribe to branch target for selected pharmacy + month
  useEffect(() => {
    if (!pharmacyId) { setBranchTarget({}); return }
    const unsub = subscribeTargets(pharmacyId, (list) => {
      const t = list.find((t) => t.month === month)
      if (t) {
        const fields: Record<string, number> = {}
        targetConfigs.forEach((c) => {
          if (t[c.targetFieldName] != null) fields[c.targetFieldName] = Number(t[c.targetFieldName])
        })
        setBranchTarget(fields)
      } else {
        setBranchTarget({})
      }
    })
    return unsub
  }, [pharmacyId, month, targetConfigs])

  // Subscribe to existing personal targets for this branch+month
  useEffect(() => {
    if (!pharmacyId) { setExisting({}); setAllocRows({}); return }
    const unsub = subscribePersonalTargetsByBranch(pharmacyId, month, (docs) => {
      const map: Record<string, Record<string, number>> = {}
      docs.forEach((d) => { map[d.userId] = d.targets })
      setExisting(map)
      // Pre-fill allocRows with existing if present
      setAllocRows((prev) => {
        const merged: Record<string, Record<string, number>> = {}
        // Keep any unsaved edits, overlay with loaded existing
        Object.keys(map).forEach((uid) => {
          merged[uid] = { ...(prev[uid] ?? {}), ...map[uid] }
        })
        return merged
      })
    })
    return unsub
  }, [pharmacyId, month])

  // Load users for selected branch
  useEffect(() => {
    if (!pharmacyId) { setUsers([]); return }
    setLoadingUsers(true)
    getUsersByPharmacy(pharmacyId)
      .then((list) => {
        // Show all active users; sort by displayName
        const sorted = list
          .filter((u) => u.active !== false)
          .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
        setUsers(sorted)
        // Initialise allocRows for any users not yet in the map
        setAllocRows((prev) => {
          const next = { ...prev }
          sorted.forEach((u) => {
            if (!next[u.id]) next[u.id] = {}
          })
          return next
        })
      })
      .catch(() => toast.error('Failed to load branch users'))
      .finally(() => setLoadingUsers(false))
  }, [pharmacyId])

  // ── Equal split ────────────────────────────────────────────

  const handleEqualSplit = useCallback(() => {
    if (!pharmacyId || users.length === 0) return
    const allocs = allocateEqual(
      branchTarget,
      users.map((u) => u.id),
      pharmacyId,
      month,
      liveRegistry,
    )
    const rows: Record<string, Record<string, number>> = {}
    allocs.forEach((a) => { rows[a.userId] = a.targets })
    setAllocRows(rows)
    setErrors({})
    setSavedOk(false)
  }, [branchTarget, users, pharmacyId, month, liveRegistry])

  // ── Cell edit ──────────────────────────────────────────────

  const handleCellChange = (userId: string, field: string, raw: string) => {
    const val = raw === '' ? 0 : Math.max(0, Number(raw) || 0)
    setAllocRows((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [field]: val },
    }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setSavedOk(false)
  }

  // ── Save ───────────────────────────────────────────────────

  const handleSave = async () => {
    if (!pharmacyId || users.length === 0) return

    // Build allocations from rows
    const allocs: PersonalAllocation[] = users.map((u) => ({
      userId:           u.id,
      pharmacyId,
      month,
      targets:          allocRows[u.id] ?? {},
      allocationMethod: 'custom' as const,
    }))

    // Validate sums
    const vr = validateCustomAllocation(allocs, branchTarget, liveRegistry)
    if (!vr.valid) {
      setErrors(vr.errors)
      toast.error(vr.message ?? 'Validation failed')
      return
    }

    setSaving(true)
    setErrors({})
    try {
      await saveBranchPersonalTargets(allocs, userProfile?.uid, userProfile?.role)
      setSavedOk(true)
      toast.success('Personal targets saved')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Publish ────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!pharmacyId || users.length === 0) return
    setPublishing(true)
    try {
      await publishPersonalTargets(pharmacyId, month, userProfile?.uid, userProfile?.role)
      setPublishedOk(true)
      toast.success('Personal targets published — pharmacists can now see their targets')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  // ── Derived state ──────────────────────────────────────────

  const availablePharmacies = useMemo(() =>
    isAdmin ? pharmacies : pharmacies.filter((p) => p.id === myPharmacyId),
    [isAdmin, pharmacies, myPharmacyId])

  const hasBranchTarget = Object.keys(branchTarget).length > 0
  const hasUsers        = users.length > 0

  // ── Render ─────────────────────────────────────────────────

  if (!isManagerLvl) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Access restricted to managers and admins.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Personal Targets
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
          Allocate branch KPI targets to individual pharmacists
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '20px' }}>
        {isAdmin && (
          <div>
            <FieldLabel>Branch</FieldLabel>
            <Sel value={pharmacyId} onChange={(v) => { setPharmacyId(v); setAllocRows({}); setErrors({}) }}>
              <option value="">Select branch…</option>
              {availablePharmacies.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Sel>
          </div>
        )}
        <div>
          <FieldLabel>Month</FieldLabel>
          <Sel value={month} onChange={(v) => { setMonth(v); setAllocRows({}); setErrors({}) }}>
            {monthOpts.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Sel>
        </div>
      </div>

      {/* Branch target summary */}
      {pharmacyId && !hasBranchTarget && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
          fontSize: '12px', color: '#fbbf24',
        }}>
          No branch target set for {monthLabel(month)}. Set one in Targets first.
        </div>
      )}

      {pharmacyId && hasBranchTarget && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          display: 'flex', flexWrap: 'wrap', gap: '16px',
        }}>
          {targetConfigs.map((cfg) => (
            <div key={cfg.targetFieldName}>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {cfg.shortLabel}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: cfg.defaultColor ?? 'var(--brand-400)' }}>
                {(branchTarget[cfg.targetFieldName] ?? 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Allocation table */}
      {pharmacyId && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Users style={{ width: 13, height: 13 }} />
              {loadingUsers ? 'Loading users…' : `${users.length} pharmacist${users.length !== 1 ? 's' : ''}`}
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleEqualSplit}
              disabled={!hasBranchTarget || users.length === 0}
              style={{
                height: '30px', padding: '0 12px', borderRadius: '7px', fontSize: '11px',
                border: '1px solid var(--border-default)', background: 'var(--bg-hover)',
                color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <RefreshCw style={{ width: 12, height: 12 }} /> Equal Split
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasUsers || !hasBranchTarget}
              style={{
                height: '30px', padding: '0 14px', borderRadius: '7px', fontSize: '11px',
                background: 'var(--brand-500)', color: '#fff', border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {saving
                ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                : savedOk
                  ? <CheckCircle2 style={{ width: 12, height: 12 }} />
                  : <Save style={{ width: 12, height: 12 }} />
              }
              {saving ? 'Saving…' : savedOk ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || !hasUsers || !hasBranchTarget || !savedOk}
              title="Make targets visible to pharmacists"
              style={{
                height: '30px', padding: '0 14px', borderRadius: '7px', fontSize: '11px',
                background: publishedOk ? 'rgba(34,197,94,0.15)' : 'rgba(var(--brand-rgb),0.1)',
                color: publishedOk ? '#22c55e' : 'var(--brand-400)',
                border: `1px solid ${publishedOk ? 'rgba(34,197,94,0.3)' : 'var(--border-default)'}`,
                cursor: (publishing || !savedOk) ? 'not-allowed' : 'pointer',
                opacity: (publishing || !savedOk) ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {publishing
                ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                : <CheckCircle2 style={{ width: 12, height: 12 }} />
              }
              {publishing ? 'Publishing…' : publishedOk ? 'Published' : 'Publish'}
            </button>
          </div>

          {/* Per-field sum errors */}
          {Object.keys(errors).filter(Boolean).length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: '11px', color: '#f87171',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                <AlertCircle style={{ width: 12, height: 12 }} /> Totals must match branch target:
              </div>
              {Object.entries(errors).filter(([, v]) => v).map(([field, msg]) => (
                <div key={field} style={{ marginLeft: '17px' }}>
                  {targetConfigs.find((c) => c.targetFieldName === field)?.shortLabel ?? field}: {msg}
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          {loadingUsers ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '12px' }}>
              Loading pharmacists…
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '12px' }}>
              No active pharmacists found for this branch.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{
                      textAlign: 'left', padding: '6px 10px', fontSize: '10px', fontWeight: 600,
                      letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-default)', background: 'var(--bg-card)',
                    }}>Pharmacist</th>
                    {targetConfigs.map((cfg) => (
                      <th key={cfg.targetFieldName} style={{
                        textAlign: 'right', padding: '6px 10px', fontSize: '10px', fontWeight: 600,
                        letterSpacing: '0.07em', textTransform: 'uppercase', color: cfg.defaultColor ?? 'var(--text-muted)',
                        borderBottom: '1px solid var(--border-default)', background: 'var(--bg-card)',
                        whiteSpace: 'nowrap',
                      }}>{cfg.shortLabel}</th>
                    ))}
                  </tr>
                  {/* Branch total row */}
                  <tr style={{ background: 'rgba(var(--brand-rgb),0.05)' }}>
                    <td style={{ padding: '5px 10px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Branch Total
                    </td>
                    {targetConfigs.map((cfg) => (
                      <td key={cfg.targetFieldName} style={{
                        textAlign: 'right', padding: '5px 10px', fontWeight: 600, color: 'var(--text-primary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {(branchTarget[cfg.targetFieldName] ?? 0).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>
                        <div style={{ fontWeight: 500 }}>{u.displayName || u.id}</div>
                        {existing[u.id] && (
                          <div style={{ fontSize: '10px', color: 'var(--brand-400)' }}>saved</div>
                        )}
                      </td>
                      {targetConfigs.map((cfg) => {
                        const fieldErr = errors[cfg.targetFieldName]
                        return (
                          <td key={cfg.targetFieldName} style={{ padding: '4px 6px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              step={cfg.valueType === 'percentage' ? '0.1' : '1'}
                              value={allocRows[u.id]?.[cfg.targetFieldName] ?? ''}
                              onChange={(e) => handleCellChange(u.id, cfg.targetFieldName, e.target.value)}
                              style={{
                                width: '90px', height: '28px', textAlign: 'right',
                                fontSize: '12px', padding: '0 6px',
                                border: `1px solid ${fieldErr ? '#ef4444' : 'var(--border-default)'}`,
                                borderRadius: '6px', background: 'var(--bg-input)',
                                color: 'var(--text-primary)', outline: 'none',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {/* Allocated sum row */}
                  <tr style={{ background: 'var(--bg-card)', borderTop: '2px solid var(--border-default)' }}>
                    <td style={{ padding: '5px 10px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Allocated Total
                    </td>
                    {targetConfigs.map((cfg) => {
                      const allocTotal = users.reduce(
                        (s, u) => s + (allocRows[u.id]?.[cfg.targetFieldName] ?? 0), 0
                      )
                      const branchVal  = branchTarget[cfg.targetFieldName] ?? 0
                      const balanced   = Math.abs(allocTotal - branchVal) <= 0.01
                      return (
                        <td key={cfg.targetFieldName} style={{
                          textAlign: 'right', padding: '5px 10px',
                          fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                          color: branchVal > 0 ? (balanced ? '#22c55e' : '#ef4444') : 'var(--text-muted)',
                        }}>
                          {allocTotal.toLocaleString()}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!pharmacyId && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '50px', fontSize: '13px' }}>
          {isAdmin ? 'Select a branch to begin allocating targets.' : 'No branch assigned to your account.'}
        </div>
      )}
    </div>
  )
}
