// ============================================================
// MyActionsPage — Phase 3C-3B
//
// Current user sees actions assigned to them (ownerId === uid).
// Scope enforcement lives inside useActions / Firestore rules.
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

// ── MyActionsPage ─────────────────────────────────────────────

export default function MyActionsPage() {
  const { userProfile } = useAuthStore()
  const uid  = userProfile?.uid
  const role = userProfile?.role

  const [filters,           setFilters]           = useState({})
  const [updatingActionId,  setUpdatingActionId]  = useState(null)
  const [toast,             setToast]             = useState(null)
  const [historyExpanded,   setHistoryExpanded]   = useState(false)

  const { actions, loading, error, refresh } = useActions({ ownerId: uid })

  // Client-side filter on top of scope-filtered results
  const filtered = useMemo(() => {
    let result = actions
    if (filters.status)   result = result.filter((a) => a.status   === filters.status)
    if (filters.priority) result = result.filter((a) => a.priority === filters.priority)
    if (filters.month)    result = result.filter((a) => a.month    === filters.month)
    return result
  }, [actions, filters])

  const suggested = filtered.filter((a) => a.status === 'SUGGESTED')
  const accepted  = filtered.filter((a) => a.status === 'ACCEPTED')
  const history   = filtered.filter((a) => a.status === 'DISMISSED' || a.status === 'CLOSED')

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
        <div style={{ height: '28px', width: '160px' }} className="skeleton rounded" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded" style={{ height: '64px' }} />
          ))}
        </div>
        {[0, 1, 2].map((i) => <SkeletonActionRow key={i} />)}
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

  // ── No uid / no access ──────────────────────────────────────
  if (!uid) {
    return (
      <div style={{ padding: '24px' }}>
        <ActionEmptyState message="Unable to load your profile. Please sign out and sign in again." />
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
          My Actions
        </h1>
        <p style={{
          fontSize: '12px', color: 'var(--text-muted)',
          fontFamily: "'Inter', sans-serif", marginTop: '4px',
        }}>
          Actions assigned to you.
        </p>
      </div>

      {/* When there are truly no actions at all, show a single compact
          empty state instead of empty summary cards plus a redundant
          empty box per section (the old layout stacked 3 oversized
          empty boxes for the same "nothing here" fact). */}
      {actions.length === 0 ? (
        <ActionEmptyState
          title="No open actions"
          message="Everything is under control. Assigned actions will appear here when follow-up is required."
        />
      ) : (
        <>
          {/* Summary cards */}
          <ActionSummaryCards actions={actions} />

          {/* Filters — status, priority, month; no branch filter */}
          <ActionFilters
            filters={filters}
            onChange={setFilters}
            showBranchFilter={false}
          />

          {/* Open / Suggested section */}
          <div>
            <SectionHeading title="Open" count={suggested.length} />
            {suggested.length === 0 ? (
              <ActionEmptyState compact message="No open actions." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {suggested.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onAccept={handleAccept}
                    onDismiss={handleDismiss}
                    isUpdating={updatingActionId === action.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Accepted section */}
          <div>
            <SectionHeading title="In Progress" count={accepted.length} />
            {accepted.length === 0 ? (
              <ActionEmptyState compact message="No actions in progress." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {accepted.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onClose={handleClose}
                    isUpdating={updatingActionId === action.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* History section — collapsible */}
          {history.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryExpanded((e) => !e)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px 0', marginBottom: '8px',
                }}
              >
                <SectionHeading title={`History (${history.length})`} />
              </button>

              {historyExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {history.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
