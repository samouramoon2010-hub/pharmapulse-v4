// ============================================================
// ProfileDetailPanel — Profile detail surface (Phase 2C; basket/
// element editing composed in Phase 2F+2G)
//
// All identity/hierarchy-summary/processor-readiness/validation/
// audit sections below remain pure read-only display — no edit
// inputs, no lifecycle transitions, no Firestore calls.
//
// The Basket & Element Editor section composes BasketEditorPanel,
// which nests ElementEditorPanel, which nests RuleEditorPanel and
// ProcessorPipelinePanel (Phase 2H+2I). These are the only parts of
// this surface that write (via the existing updateProfileDocument
// service call) and only when canEdit is true (admin + editable
// status).
//
// The Simulator section (Phase 2J) composes SimulatorPanel, which
// runs the existing sandbox simulator kernel and persists run
// records through the existing simulationRuns service — it never
// mutates the profile document itself. Version History (Phase 3A)
// and Snapshot Viewer (Phase 3B) are read-only, role-gated displays
// of the existing snapshots collection.
//
// Approval (Phase 3D) and Publish (Phase 3E) compose ApprovalPanel
// and PublishPanel, which use only the existing workflow kernel and
// persist exclusively through the existing Phase 1B service layer —
// never a custom transition. Audit Log (Phase 3C) is a read-only
// display of the existing audit log collection.
//
// Diff & Restore (Phase 1 Closure Bundle) composes
// SnapshotDiffRestorePanel, which adds Take Snapshot, the
// diffSnapshots() Diff Viewer, and restoreProfileFromSnapshot()
// rollback — restore always creates a NEW DRAFT profile via the
// existing profile-creation service call; it never overwrites the
// snapshot, the original profile, or activates the result.
//
// NO visual builder. NO canvas. NO drag & drop. NO AI. NO Governance
// Dashboard. NO Evaluation Engine changes.
// ============================================================
import React from 'react'
import { Info, Layers, Cog, CheckCircle2, FlaskConical, Package, History, Camera, Rocket, ScrollText } from 'lucide-react'

import ProfileStatusBadge from './ProfileStatusBadge'
import HierarchySummaryPanel from './HierarchySummaryPanel'
import ProcessorReadinessPanel from './ProcessorReadinessPanel'
import BasketEditorPanel from './BasketEditorPanel'
import SimulatorPanel from './SimulatorPanel'
import VersionHistoryPanel from './VersionHistoryPanel'
import SnapshotViewerPanel from './SnapshotViewerPanel'
import SnapshotDiffRestorePanel from './SnapshotDiffRestorePanel'
import ApprovalPanel from './ApprovalPanel'
import PublishPanel from './PublishPanel'
import AuditLogPanel from './AuditLogPanel'
import { SkeletonWidget } from '../ui/SkeletonCard'
import EmptyState, { ErrorState } from '../ui/EmptyState'

const SCOPE_LABEL = {
  PHARMACY: 'Branch',
  DISTRICT: 'District',
  REGION:   'Region',
  NATIONAL: 'National',
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '5px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: '11px', color: 'var(--text-primary)', fontWeight: 500,
        textAlign: 'right', wordBreak: 'break-word',
      }}>
        {value}
      </span>
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <Icon style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{
          fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          fontFamily: "'Inter', sans-serif",
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

export default function ProfileDetailPanel({ profile, loading, error, actor, canEdit, onSaved }) {
  if (loading) return <SkeletonWidget height={220} label="Profile Detail" />

  if (error) {
    return <ErrorState message={error.message || 'Failed to load profile detail'} />
  }

  if (!profile) {
    return (
      <EmptyState
        icon={Info}
        title="No profile selected"
        description="Select a profile from the list to view its details"
        tone="neutral"
        compact
      />
    )
  }

  const scopeLabel         = SCOPE_LABEL[profile.scope] || profile.scope || '—'
  const hierarchy          = profile.hierarchy  || {}
  const processors         = profile.processors || {}
  const validationSummary  = profile.validationSummary || null
  const simulationSummary  = profile.simulationSummary || null

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '10px', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
            {profile.name || 'Unnamed Profile'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {scopeLabel} · v{profile.version}
          </div>
        </div>
        <ProfileStatusBadge status={profile.status} />
      </div>

      <Section icon={Info} title="Identity & Metadata">
        <Row label="Profile ID"   value={profile.id || '—'} />
        <Row label="Description" value={profile.metadata?.description || '—'} />
        <Row label="Valid From"  value={fmtDate(profile.metadata?.validFrom)} />
        <Row label="Hash"        value={profile.hash || '—'} />
      </Section>

      <Section icon={Layers} title="Hierarchy Summary">
        <HierarchySummaryPanel hierarchy={hierarchy} />
      </Section>

      <Section icon={Package} title="Basket & Element Editor">
        <BasketEditorPanel
          profile={profile}
          actor={actor}
          canEdit={!!canEdit}
          onSaved={onSaved}
        />
      </Section>

      <div style={{ marginBottom: '16px' }}>
        <ProcessorReadinessPanel profile={profile} />
      </div>

      <Section icon={Cog} title="Processor Inventory">
        <Row label="Processor Types"      value={(processors.processorTypes || []).length ? processors.processorTypes.join(', ') : '—'} />
        <Row label="Total Steps"          value={processors.totalStepCount ?? 0} />
        <Row label="Zero Target Guard"    value={processors.hasZeroTargetGuard  ? 'Yes' : 'No'} />
        <Row label="Band Evaluator"       value={processors.hasBandEvaluator    ? 'Yes' : 'No'} />
        <Row label="Penalty Evaluator"    value={processors.hasPenaltyEvaluator ? 'Yes' : 'No'} />
        <Row label="Node Aggregator"      value={processors.hasNodeAggregator   ? 'Yes' : 'No'} />
      </Section>

      <Section icon={CheckCircle2} title="Validation Summary">
        {validationSummary ? (
          <>
            <Row label="Valid"          value={validationSummary.valid ? 'Yes' : 'No'} />
            <Row label="Issues"         value={validationSummary.issueCount   ?? 0} />
            <Row label="Errors"         value={validationSummary.errorCount   ?? 0} />
            <Row label="Warnings"       value={validationSummary.warningCount ?? 0} />
            <Row label="Last Validated" value={fmtDate(validationSummary.lastValidatedAt)} />
          </>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Not yet validated</div>
        )}
      </Section>

      <Section icon={FlaskConical} title="Simulation Summary">
        {simulationSummary ? (
          <>
            <Row label="Score"          value={`${simulationSummary.score}%`} />
            <Row label="Valid"          value={simulationSummary.valid ? 'Yes' : 'No'} />
            <Row label="Baskets"        value={simulationSummary.basketCount ?? 0} />
            <Row label="Last Simulated" value={fmtDate(simulationSummary.lastSimulatedAt)} />
          </>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No simulation run yet</div>
        )}
      </Section>

      <Section icon={FlaskConical} title="Simulator">
        <SimulatorPanel profile={profile} actor={actor} />
      </Section>

      <Section icon={History} title="Version History">
        <VersionHistoryPanel profile={profile} actor={actor} />
      </Section>

      <Section icon={Camera} title="Snapshot Viewer">
        <SnapshotViewerPanel profile={profile} actor={actor} />
      </Section>

      <Section icon={History} title="Diff & Restore">
        <SnapshotDiffRestorePanel profile={profile} actor={actor} onRestored={onSaved} />
      </Section>

      <Section icon={CheckCircle2} title="Approval">
        <ApprovalPanel profile={profile} actor={actor} onSaved={onSaved} />
      </Section>

      <Section icon={Rocket} title="Publish">
        <PublishPanel profile={profile} actor={actor} onSaved={onSaved} />
      </Section>

      <Section icon={ScrollText} title="Audit Log">
        <AuditLogPanel profile={profile} actor={actor} />
      </Section>

      <Section icon={Info} title="Audit">
        <Row label="Created By" value={profile.createdBy || '—'} />
        <Row label="Updated By" value={profile.updatedBy || '—'} />
        <Row label="Created At" value={fmtDate(profile.createdAt)} />
        <Row label="Updated At" value={fmtDate(profile.updatedAt)} />
      </Section>
    </div>
  )
}
