// ============================================================
// AssistantPage — /assistant (Targeted Visibility & UX Hotfix)
//
// Thin shell hosting the already-certified, read-only AssistantPanel
// (Phase 7F/8G). This page does not introduce any new AI behavior —
// it only builds a minimal AssistantContext from the current actor's
// own identity via the existing buildAssistantContext() aggregator,
// then renders AssistantPanel with no aiSettings supplied.
//
// AssistantPanel is unconditional-deterministic-first by design: with
// no aiSettings passed, every answer comes from the existing
// buildAnswer() deterministic kernel and the connector is never
// invoked (provider-disabled mode). No real AI API call. No API key
// UI. No Firestore writes — this page reads nothing and writes
// nothing; AssistantPanel itself has no Firestore import.
//
// Visible to: admin, general_manager, district_supervisor, manager
// (route-gated in App.jsx). Hidden from pharmacist.
// ============================================================
import React, { useMemo } from 'react'
import { format } from 'date-fns'
import { Bot } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { buildAssistantContext } from '../../assistant/assistantContext'
import AssistantPanel from '../../components/assistant/AssistantPanel'
import EmptyState from '../../components/ui/EmptyState'

export default function AssistantPage() {
  const { userProfile } = useAuthStore()

  const context = useMemo(() => {
    if (!userProfile) return null
    return buildAssistantContext({
      entityId:       userProfile.pharmacyId || userProfile.uid || userProfile.id || 'unknown',
      entityType:     'branch',
      profileId:      '',
      profileVersion: '',
      periodId:       format(new Date(), 'yyyy-MM'),
    })
  }, [userProfile])

  return (
    <div style={{ padding: '20px 24px', maxWidth: '760px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Assistant
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Ask grounded questions about your performance — every answer is explained from already-computed data, never invented.
        </p>
      </div>

      {context ? (
        <div className="card card-p" style={{ borderRadius: '8px' }}>
          <AssistantPanel context={context} />
        </div>
      ) : (
        <EmptyState
          icon={Bot}
          title="Preparing your context"
          description="Loading your profile to ground assistant answers in your own data."
          tone="neutral"
          compact
        />
      )}
    </div>
  )
}
