// ============================================================
// TasksPage — Phase 3C-3C
//
// Managers and above see all actions within their scope.
// Scope is resolved inside useActions via useScopeProfile.
//
// NO signal generation. NO action creation UI. NO AI.
// NO engine imports. NO dashboard changes.
// ============================================================
import React, { useState, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { useActions }      from '../../hooks/useActions'
import {
  acceptAction,
  dismissAction,
  closeAction,
  markRecovered,
  markNotRecovered,
}                          from '../../services/actionService'
import ActionSummaryCards  from '../../components/actions/ActionSummaryCards'
import ActionFilters       from '../../components/actions/ActionFilters'
import ActionCard          from '../../components/actions/ActionCard'
import ActionEmptyState    from '../../components/actions/ActionEmptyState'
import { SkeletonActionRow, SectionHeading, Toast } from '../../components/actions/ActionPageChrome'
import { COLORS } from '../../design/tokens'

// ── TasksPage ─────────────────────────────────────────────────

export default function TasksPage() {
  const { userProfile } = useAuthStore()
  const uid  = userProfile?.uid
  const role = userProfile?.role

  const [filters,          setFilters]          = useState({})
  const [updatingActionId, setUpdatingActionId] = useState(null)
  const [toast,            setToast]            = useState(null)

  // No ownerId filter — scope resolved internally via useScopeProfile
  const { actions, loading, error, refresh } = useActions()

  const today = new Date().toISOString().split('T')[0]

  // Unique branch IDs from current result set
  const uniqueBranches = useMemo(
    () => [...new Set(actions.map((a) => a.relatedPharmacyId).filter(Boolean))],
    [actions],
  )

  const showBranchFilter = uniqueBranches.length > 1

  // Client-side filters applied on top of scope-filtered actions
  const filtered = useMemo(() => {
    let result = actions
    if (filters.status)   result = result.filter((a) => a.status   === filters.status)
    if (filters.priority) result = result.filter((a) => a.priority === filters.priority)
    if (filters.month)    result = result.filter((a) => a.month    === filters.month)
    if (filters.branch)   result = result.filter((a) => a.relatedPharmacyId === filters.branch)
    return result
  }, [actions, filters])

  // Sections
  const allOpen = filtered.filter((a) => a.status === 'SUGGESTED' || a.status === 'ACCEPTED')

  const criticalHigh = allOpen.filter(
    (a) => a.priority === 'CRITICAL' || a.priority === 'HIGH',
  )

  // Overdue: has dueDate in the past and still open
  const overdueActions = allOpen.filter(
    (a) => a.dueDate && a.dueDate < today,
  )

  // By Branch — group open actions by relatedPharmacyId
  const byBranch = useMemo(() => {
    if (uniqueBranches.length <= 1) return null
    return uniqueBranches.map((branchId) => ({
      branchId,
      items: allOpen.filter((a) => a.relatedPharmacyId === branchId),
    })).filter((b) => b.items.length > 0)
  }, [allOpen, uniqueBranches])

  function showToast(type, message) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleAccept(id) {
    setUpdatingActionId(id)
    try {
      await acceptAction(id, uid, role)
      refresh()
      showToast('success', 'Action accepted.')
    } catch (e) {
      showToast('error', e?.message || 'Something went wrong. Please try again.')
    } finally {
      setUpdatingActionId(null)
    }
  }

  async function handleDismiss(id, reason) {
    setUpdatingActionId(id)
    try {
      await dismissAction(id, uid, role, reason)
      refresh()
      showToast('success', 'Action dismissed.')
    } catch (e) {
      showToast('error', e?.message || 'Something went wrong. Please try again.')
    } finally {
      setUpdatingActionId(null)
    }
  }

  async function handleClose(id, recoveryPayload) {
    setUpdatingActionId(id)
    try {
      const action = actions.find((a) => a.id === id)
      await closeAction(id, uid, role)
      if (recoveryPayload) {
        const obsPayload = {
          relatedPharmacyId:    action?.relatedPharmacyId,
          relatedKpi:           action?.relatedKpi           || null,
          month:                action?.month                || null,
          signalType:           action?.signalType           || null,
          signalValueAtTrigger: action?.signalValue          || null,
          signalValueAtClose:   null,
          notes:                recoveryPayload.notes        || null,
        }
        if (recoveryPayload.recovered) {
          await markRecovered(id, obsPayload, uid, role)
        } else {
          await markNotRecovered(id, obsPayload, uid, role)
        }
      }
      refresh()
      showToast('success', 'Action closed.')
    } catch (e) {
      showToast('error', e?.message || 'Something went wrong. Please try again.')
    } finally {
      setUpdatingActionId(null)
    }
  }

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ height: '28px', width: '180px' }} className="skeleton rounded" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded" style={{ height: '64px' }} />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => <SkeletonActionRow key={i} />)}
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{
          background: 'rgba(185,43,43,0.08)', border: '1px solid rgba(185,43,43,0.25)',
          borderRadius: '10px', padding: '16px 20px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span style={{ fontSize: '13px', color: '#B92B2B', fontFamily: "'Inter', sans-serif" }}>
            {error.message || 'Failed to load actions.'}
          </span>
          <button onClick={refresh} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(185,43,43,0.15)', border: '1px solid rgba(185,43,43,0.3)',
            borderRadius: '7px', padding: '5px 12px', color: '#B92B2B',
            fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}>
            <RefreshCw style={{ width: 12, height: 12 }} /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div>
        <h1 style={{
          fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)',
          fontFamily: "'Inter', sans-serif", margin: 0,
        }}>
          Action Tasks
        </h1>
        <p style={{
          fontSize: '12px', color: 'var(--text-muted)',
          fontFamily: "'Inter', sans-serif", marginTop: '4px',
        }}>
          Scoped action board for your branches.
        </p>
      </div>

      {/* When there are truly no tasks at all, show a single compact
          empty state instead of zeroed summary cards plus a redundant
          empty box in "All Open Actions" (the old layout stacked 2
          oversized empty boxes for the same "nothing here" fact). */}
      {actions.length === 0 ? (
        <ActionEmptyState
          title="No active tasks"
          message="There are currently no branch tasks requiring action."
        />
      ) : (
        <>
          {/* Summary cards — overdue count shown here */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <ActionSummaryCards actions={actions} />
            {overdueActions.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', borderRadius: '8px',
                background: COLORS.warningBg, border: `1px solid ${COLORS.warningBorder}`,
              }}>
                <span style={{ fontSize: '11px', color: COLORS.warning, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                  {overdueActions.length} overdue action{overdueActions.length !== 1 ? 's' : ''} — past due date
                </span>
              </div>
            )}
          </div>

          {/* Filters */}
          <ActionFilters
            filters={filters}
            onChange={setFilters}
            showBranchFilter={showBranchFilter}
            branches={uniqueBranches}
          />

          {/* Critical / High Priority section */}
          {criticalHigh.length > 0 && (
            <div>
              <SectionHeading title="Critical & High Priority" count={criticalHigh.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {criticalHigh.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onAccept={action.status === 'SUGGESTED' ? handleAccept : undefined}
                    onDismiss={action.status === 'SUGGESTED' ? handleDismiss : undefined}
                    onClose={action.status === 'ACCEPTED' ? handleClose : undefined}
                    isUpdating={updatingActionId === action.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Open Actions */}
          <div>
            <SectionHeading title="All Open Actions" count={allOpen.length} />
            {allOpen.length === 0 ? (
              <ActionEmptyState compact message="No open actions in your scope." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {allOpen.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onAccept={action.status === 'SUGGESTED' ? handleAccept : undefined}
                    onDismiss={action.status === 'SUGGESTED' ? handleDismiss : undefined}
                    onClose={action.status === 'ACCEPTED' ? handleClose : undefined}
                    isUpdating={updatingActionId === action.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* By Branch — only when multiple branches exist */}
          {byBranch && byBranch.length > 0 && (
            <div>
              <SectionHeading title="By Branch" count={uniqueBranches.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {byBranch.map(({ branchId, items }) => (
                  <div key={branchId} style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    borderRadius: '10px', overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '8px 14px', background: 'var(--bg-canvas)',
                      borderBottom: '1px solid var(--border-subtle)',
                      fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                      fontFamily: "'Inter', sans-serif", display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span>{branchId}</span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{items.length} open</span>
                    </div>
                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {items.map((action) => (
                        <ActionCard
                          key={action.id}
                          action={action}
                          onAccept={action.status === 'SUGGESTED' ? handleAccept : undefined}
                          onDismiss={action.status === 'SUGGESTED' ? handleDismiss : undefined}
                          onClose={action.status === 'ACCEPTED' ? handleClose : undefined}
                          isUpdating={updatingActionId === action.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
