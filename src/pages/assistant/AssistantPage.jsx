// ============================================================
// AssistantPage — /assistant (Targeted Visibility & UX Hotfix)
//
// Thin shell hosting the already-certified, read-only AssistantPanel
// (Phase 7F/8G, extended for BYOK). Grounds the AssistantContext in
// the SAME live branch data already powering the Branch Intelligence
// page (useBranchIntelligenceData), reformatted into the existing
// AssistantContext shape via liveDataAdapter.ts — without that wiring,
// the context was always empty (no ledger/opportunities/
// recommendations) and every answer said "no grounded evidence".
// ranking/benchmark/trend remain unavailable (they require the
// legacy, non-live Evaluation Ledger pipeline) — the existing
// templates already say so explicitly rather than guessing.
//
// Branch scope resolution:
//   - manager / branch_manager: fixed to their single pharmacyId
//   - admin / general_manager: scope=all — shows branch picker,
//     auto-seeds to first active branch; user can switch
//   - district_supervisor / regional_manager: scope=list — same
//     picker, filtered to their assigned branches only
// All three paths converge on `effectiveBranchId` which feeds
// useBranchIntelligenceData — no special casing below the picker.
//
// Also loads the user's personal AI settings (if any) from this
// browser's localStorage (personalAiKeyStore.ts) to pass through to
// AssistantPanel. AssistantPanel remains deterministic-first by
// design. No Firestore writes — this page only reads (the same reads
// Branch Intelligence already performs); AssistantPanel itself has no
// Firestore import.
//
// Visible to: admin, general_manager, district_supervisor, manager
// (route-gated in App.jsx). Hidden from pharmacist.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Bot, MapPin, Settings as SettingsIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { buildAssistantContext } from '../../assistant/assistantContext'
import { buildLiveBranchGrounding } from '../../assistant/liveDataAdapter'
import { loadPersonalAiSettings } from '../../assistant/personalAiKeyStore'
import { useBranchIntelligenceData } from '../branch/useBranchIntelligenceData'
import { useScopeProfile } from '../../hooks/useScopeProfile'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { filterAllowedPharmacies } from '../../services/scopeResolver'
import AssistantPanel from '../../components/assistant/AssistantPanel'
import EmptyState from '../../components/ui/EmptyState'

export default function AssistantPage() {
  const { userProfile } = useAuthStore()
  const [personalAi] = useState(() => loadPersonalAiSettings())
  const { scope, loading: scopeLoading } = useScopeProfile()
  const { pharmacies } = usePharmacyStore()

  const periodId = useMemo(() => format(new Date(), 'yyyy-MM'), [])

  // Single-branch roles (manager/branch_manager) have a fixed pharmacyId.
  // Multi-branch roles (admin/GM/district_supervisor) need a picker.
  const isSingleBranch = !scope || scope.type === 'single' || scope.type === 'none'
  const activeBranches = useMemo(() => pharmacies.filter((p) => p.active !== false), [pharmacies])
  const allowedBranches = useMemo(
    () => (scope ? filterAllowedPharmacies(scope, activeBranches) : []),
    [scope, activeBranches],
  )

  // Multi-branch: user-selectable, auto-seeded to first available branch on load
  const [selectedBranchId, setSelectedBranchId] = useState('')
  useEffect(() => {
    if (!isSingleBranch && !selectedBranchId && allowedBranches.length > 0) {
      setSelectedBranchId(allowedBranches[0].id)
    }
  }, [isSingleBranch, selectedBranchId, allowedBranches])

  // Single-branch: fixed from profile. Multi-branch: from picker state.
  const effectiveBranchId = isSingleBranch ? (userProfile?.pharmacyId || '') : selectedBranchId
  const { viewModel, kpiStats, loading: branchLoading } = useBranchIntelligenceData(effectiveBranchId, periodId)

  const context = useMemo(() => {
    if (!userProfile) return null
    const entityId = effectiveBranchId || userProfile.uid || userProfile.id || 'unknown'
    const grounding = buildLiveBranchGrounding(entityId, periodId, viewModel, kpiStats)
    return buildAssistantContext({
      entityId,
      entityType:      'branch',
      profileId:       grounding ? 'live-branch-kpis' : '',
      profileVersion:  grounding ? 'v1' : '',
      periodId,
      ledgerEntry:     grounding?.ledgerEntry,
      opportunities:   grounding?.opportunities,
      recommendations: grounding?.recommendations,
    })
  }, [userProfile, effectiveBranchId, periodId, viewModel, kpiStats])

  const isPersonalAiActive = Boolean(personalAi?.enabled && personalAi?.apiKey)
  const isPreparingContext = !userProfile || !scope || scopeLoading
    || (!isSingleBranch && !selectedBranchId)
    || (Boolean(effectiveBranchId) && branchLoading)

  return (
    <div style={{ padding: '20px 24px', maxWidth: '760px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Assistant
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Ask grounded questions about your performance — every answer is explained from already-computed data, never invented.
          </p>
        </div>
        {!isPersonalAiActive && (
          <Link to="/settings" style={{
            display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            padding: '7px 12px', borderRadius: 'var(--radius-button, 8px)',
            border: '1px solid var(--border)', background: 'var(--bg-hover)',
            color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, textDecoration: 'none',
          }}>
            <SettingsIcon style={{ width: 12, height: 12 }} strokeWidth={1.75} />
            Connect your AI
          </Link>
        )}
      </div>

      {!isSingleBranch && allowedBranches.length > 1 && (
        <div style={{
          marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '8px',
          border: '1px solid var(--border)', background: 'var(--bg-card)',
        }}>
          <MapPin style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} strokeWidth={1.75} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>Branch</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            style={{
              flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600,
              color: 'var(--text-primary)', background: 'transparent',
              border: 'none', outline: 'none', cursor: 'pointer',
            }}
          >
            {allowedBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameAr || b.name || b.code || b.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {context && !isPreparingContext ? (
        <div className="card card-p" style={{ borderRadius: '8px' }}>
          <AssistantPanel context={context} personalAi={personalAi} />
        </div>
      ) : (
        <EmptyState
          icon={Bot}
          title="Preparing your context"
          description="Loading your branch's KPI data to ground assistant answers in your own numbers."
          tone="neutral"
          compact
        />
      )}
    </div>
  )
}
