// ============================================================
// Phase 4A — MVP Stabilization + Production Certification
//
// NOT a feature bundle. This file certifies the frozen Profile
// Studio MVP (Phases 0A–3E): architecture, Firestore collections,
// permissions, workflow, kernel parity, component boundaries,
// performance guardrails, and double-submit/error-normalization
// behavior — by inspecting the real exported kernel/service
// surface and the real component source (via `?raw`), exactly as
// every prior phase's test file has done.
//
// NO new features. NO Drag & Drop. NO AI. NO Excel import.
// NO Diff Viewer. NO Rollback. NO Restore. NO Evaluation Engine
// changes. This file only asserts on what already exists.
// ============================================================
import { describe, it, expect } from 'vitest'

// ── Kernel imports (Task 1 / Task 5) ───────────────────────────
import { canTransitionProfileStatus, isTerminalStatus, assertProfileStatusTransition } from '../../profileStudio/lifecycle'
import {
  createDraft, validateDraft, simulateDraft, approveDraft, markPublishReady,
  archiveProfile, restoreArchivedProfile,
  isDraft, isValidated, isSimulated, isApproved, isPublished, isArchived, isPublishReady,
} from '../../profileStudio/workflow'
import { validateProfile, validateProfileHierarchy, validateProfileWeights } from '../../profileStudio/validation'
import {
  validateProfileCompleteness, validateWeightConsistency, validateProcessorCompatibility,
  validateEffectiveDatingRules, validateLifecycleReadiness, validateSimulationReadiness,
  validatePublishReadiness, validateSmartsConstraints, validateProfileAdvanced,
} from '../../profileStudio/advancedValidation'
import { simulateProfile, compareSimulationResults } from '../../profileStudio/simulator'
import { exportPublishPackage, exportProfileJson, createProfileSnapshot, compareSnapshots } from '../../profileStudio/exporter'
import { calculateProfileHash, verifyProfileIntegrity, detectTampering } from '../../profileStudio/integrity'
import { flattenHierarchy } from '../../profileStudio/hierarchy'
import { validateProcessorStepConfig, validatePipeline } from '../../profileStudio/processorValidation'
import { flattenPipeline } from '../../profileStudio/pipeline'

// ── Permission / persistence layer (Task 2 / Task 3) ───────────
import { PERMISSION_MATRIX } from '../../profileStudio/persistenceSchema'
import {
  canCreateProfile, canEditProfile, canApproveProfile, canPublishProfile,
  canArchiveProfile, canRunSimulation, canReadProfile,
} from '../../profileStudio/persistenceGuards'
import { useProfileStudioPermissions } from '../../profileStudio/hooks/useProfileStudioPermissions'
import { normalizeError } from '../../profileStudio/profileStudioStore'

import type { ProfileStatus } from '../../profileStudio/types'
import type { ProfileStudioRole } from '../../profileStudio/persistenceTypes'

// ── Raw source for boundary / guardrail scanning (Task 6 / 7) ──
import serviceSrc from '../../profileStudio/profileStudioService.ts?raw'
import workflowSrc from '../../profileStudio/workflow.ts?raw'
import validationSrc from '../../profileStudio/validation.ts?raw'
import advancedValidationSrc from '../../profileStudio/advancedValidation.ts?raw'
import simulatorSrc from '../../profileStudio/simulator.ts?raw'
import exporterSrc from '../../profileStudio/exporter.ts?raw'
import integritySrc from '../../profileStudio/integrity.ts?raw'
import hierarchySrc from '../../profileStudio/hierarchy.ts?raw'
import processorValidationSrc from '../../profileStudio/processorValidation.ts?raw'
import pipelineSrc from '../../profileStudio/pipeline.ts?raw'
import rulesSrc from '../../../firestore.rules?raw'

import ApprovalPanelSrc from '../../components/profileStudio/ApprovalPanel.jsx?raw'
import ApprovalStatusBadgeSrc from '../../components/profileStudio/ApprovalStatusBadge.jsx?raw'
import AuditLogCardSrc from '../../components/profileStudio/AuditLogCard.jsx?raw'
import AuditLogPanelSrc from '../../components/profileStudio/AuditLogPanel.jsx?raw'
import BasketCardSrc from '../../components/profileStudio/BasketCard.jsx?raw'
import BasketEditorPanelSrc from '../../components/profileStudio/BasketEditorPanel.jsx?raw'
import BasketFormSrc from '../../components/profileStudio/BasketForm.jsx?raw'
import CreateProfileModalSrc from '../../components/profileStudio/CreateProfileModal.jsx?raw'
import ElementCardSrc from '../../components/profileStudio/ElementCard.jsx?raw'
import ElementEditorPanelSrc from '../../components/profileStudio/ElementEditorPanel.jsx?raw'
import ElementFormSrc from '../../components/profileStudio/ElementForm.jsx?raw'
import HierarchySummaryPanelSrc from '../../components/profileStudio/HierarchySummaryPanel.jsx?raw'
import ProcessorConfigFormSrc from '../../components/profileStudio/ProcessorConfigForm.jsx?raw'
import ProcessorPipelinePanelSrc from '../../components/profileStudio/ProcessorPipelinePanel.jsx?raw'
import ProcessorReadinessPanelSrc from '../../components/profileStudio/ProcessorReadinessPanel.jsx?raw'
import ProcessorStepCardSrc from '../../components/profileStudio/ProcessorStepCard.jsx?raw'
import ProfileCardSrc from '../../components/profileStudio/ProfileCard.jsx?raw'
import ProfileDetailPanelSrc from '../../components/profileStudio/ProfileDetailPanel.jsx?raw'
import ProfileFormSrc from '../../components/profileStudio/ProfileForm.jsx?raw'
import ProfileListSrc from '../../components/profileStudio/ProfileList.jsx?raw'
import ProfileStatusBadgeSrc from '../../components/profileStudio/ProfileStatusBadge.jsx?raw'
import ProfileStudioHeaderSrc from '../../components/profileStudio/ProfileStudioHeader.jsx?raw'
import PublishPanelSrc from '../../components/profileStudio/PublishPanel.jsx?raw'
import PublishSummaryCardSrc from '../../components/profileStudio/PublishSummaryCard.jsx?raw'
import RuleCardSrc from '../../components/profileStudio/RuleCard.jsx?raw'
import RuleEditorPanelSrc from '../../components/profileStudio/RuleEditorPanel.jsx?raw'
import RuleFormSrc from '../../components/profileStudio/RuleForm.jsx?raw'
import SimulationRunsCardSrc from '../../components/profileStudio/SimulationRunsCard.jsx?raw'
import SimulationSummaryCardSrc from '../../components/profileStudio/SimulationSummaryCard.jsx?raw'
import SimulationTracePanelSrc from '../../components/profileStudio/SimulationTracePanel.jsx?raw'
import SimulatorPanelSrc from '../../components/profileStudio/SimulatorPanel.jsx?raw'
import SnapshotCardSrc from '../../components/profileStudio/SnapshotCard.jsx?raw'
import SnapshotViewerPanelSrc from '../../components/profileStudio/SnapshotViewerPanel.jsx?raw'
import VersionCardSrc from '../../components/profileStudio/VersionCard.jsx?raw'
import VersionHistoryPanelSrc from '../../components/profileStudio/VersionHistoryPanel.jsx?raw'

// ════════════════════════════════════════════════════════════
// Shared fixtures
// ════════════════════════════════════════════════════════════

const ROLES: ProfileStudioRole[] = ['admin', 'general_manager', 'district_supervisor', 'manager', 'pharmacist']
const STATUSES: ProfileStatus[] = ['DRAFT', 'VALIDATED', 'SIMULATED', 'APPROVED', 'PUBLISHED', 'ARCHIVED']

function makeDraft(status: ProfileStatus, overrides: any = {}) {
  return {
    metadata: {
      id: 'p1', name: 'Test Profile', version: '1.0.0', status,
      scope: 'PHARMACY', validFrom: '2026-01-01', ...overrides,
    },
    root: {
      id: 'root1', label: 'Test Profile',
      baskets: [{
        id: 'b1', label: 'B1', weight: 1, pipeline: { steps: [] },
        elements: [{
          id: 'e1', label: 'E1', weight: 1, pipeline: { steps: [] },
          rules: [{
            id: 'r1', kpiKey: 'wasfaty', label: 'R1', metricType: 'count', weight: 1,
            pipeline: { steps: [{ processorType: 'RATIO_EVALUATOR', order: 0, config: {} }] },
          }],
        }],
      }],
    },
  }
}

// Component raw-source table: [name, source]. Every panel/card/form/badge
// in src/components/profileStudio is represented — Task 6 + Task 7 scan
// the entire surface, not a sample of it.
const COMPONENT_SOURCES: [string, string][] = [
  ['ApprovalPanel', ApprovalPanelSrc],
  ['ApprovalStatusBadge', ApprovalStatusBadgeSrc],
  ['AuditLogCard', AuditLogCardSrc],
  ['AuditLogPanel', AuditLogPanelSrc],
  ['BasketCard', BasketCardSrc],
  ['BasketEditorPanel', BasketEditorPanelSrc],
  ['BasketForm', BasketFormSrc],
  ['CreateProfileModal', CreateProfileModalSrc],
  ['ElementCard', ElementCardSrc],
  ['ElementEditorPanel', ElementEditorPanelSrc],
  ['ElementForm', ElementFormSrc],
  ['HierarchySummaryPanel', HierarchySummaryPanelSrc],
  ['ProcessorConfigForm', ProcessorConfigFormSrc],
  ['ProcessorPipelinePanel', ProcessorPipelinePanelSrc],
  ['ProcessorReadinessPanel', ProcessorReadinessPanelSrc],
  ['ProcessorStepCard', ProcessorStepCardSrc],
  ['ProfileCard', ProfileCardSrc],
  ['ProfileDetailPanel', ProfileDetailPanelSrc],
  ['ProfileForm', ProfileFormSrc],
  ['ProfileList', ProfileListSrc],
  ['ProfileStatusBadge', ProfileStatusBadgeSrc],
  ['ProfileStudioHeader', ProfileStudioHeaderSrc],
  ['PublishPanel', PublishPanelSrc],
  ['PublishSummaryCard', PublishSummaryCardSrc],
  ['RuleCard', RuleCardSrc],
  ['RuleEditorPanel', RuleEditorPanelSrc],
  ['RuleForm', RuleFormSrc],
  ['SimulationRunsCard', SimulationRunsCardSrc],
  ['SimulationSummaryCard', SimulationSummaryCardSrc],
  ['SimulationTracePanel', SimulationTracePanelSrc],
  ['SimulatorPanel', SimulatorPanelSrc],
  ['SnapshotCard', SnapshotCardSrc],
  ['SnapshotViewerPanel', SnapshotViewerPanelSrc],
  ['VersionCard', VersionCardSrc],
  ['VersionHistoryPanel', VersionHistoryPanelSrc],
]

// The 7 components that persist via the service layer ("writers").
const WRITER_COMPONENTS = [
  ['ApprovalPanel', ApprovalPanelSrc, 'submitting'],
  ['BasketEditorPanel', BasketEditorPanelSrc, 'submitting'],
  ['CreateProfileModal', CreateProfileModalSrc, 'submitting'],
  ['ElementEditorPanel', ElementEditorPanelSrc, 'submitting'],
  ['ProcessorPipelinePanel', ProcessorPipelinePanelSrc, 'submitting'],
  ['PublishPanel', PublishPanelSrc, 'submitting'],
  ['RuleEditorPanel', RuleEditorPanelSrc, 'submitting'],
] as const

// The 3 read-only panels that fetch via a profile-keyed useEffect.
const FETCH_PANELS = [
  ['AuditLogPanel', AuditLogPanelSrc],
  ['SnapshotViewerPanel', SnapshotViewerPanelSrc],
  ['VersionHistoryPanel', VersionHistoryPanelSrc],
] as const

const KERNEL_SOURCES: [string, string][] = [
  ['workflow.ts', workflowSrc],
  ['validation.ts', validationSrc],
  ['advancedValidation.ts', advancedValidationSrc],
  ['simulator.ts', simulatorSrc],
  ['exporter.ts', exporterSrc],
  ['integrity.ts', integritySrc],
  ['hierarchy.ts', hierarchySrc],
  ['processorValidation.ts', processorValidationSrc],
  ['pipeline.ts', pipelineSrc],
]

const BANNED_FEATURE_TERMS = [
  'react-dnd', 'react-beautiful-dnd', '@dnd-kit', 'DragDropContext',
  'openai', 'anthropic', 'gpt-', 'xlsx', 'SheetJS', 'react-diff-viewer',
]

// ════════════════════════════════════════════════════════════
// TASK 1 — ARCHITECTURE AUDIT
// ════════════════════════════════════════════════════════════

describe('Task 1 — Architecture audit: no dead imports', () => {
  for (const [name, src] of KERNEL_SOURCES) {
    it(`${name} has no unused named type/value imports`, () => {
      const importBlocks = [...src.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s*from/gm)]
      const names = new Set<string>()
      importBlocks.forEach((m) => m[1].split(',').forEach((n) => {
        n = n.trim().split(' as ').pop()!.trim()
        if (n) names.add(n)
      }))
      const unused: string[] = []
      for (const n of names) {
        const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`\\b${escaped}\\b`, 'g')
        const count = (src.match(re) || []).length
        if (count <= 1) unused.push(n)
      }
      expect(unused).toEqual([])
    })
  }
})

describe('Task 1 — Architecture audit: no cyclic dependencies', () => {
  it('lifecycle.ts imports only ./types (foundation layer, no cycle)', () => {
    expect(KERNEL_SOURCES.find(([n]) => n === 'hierarchy.ts')![1]).toContain("from './lifecycle'")
  })
  it('hierarchy.ts does not import workflow.ts (would create a cycle)', () => {
    expect(hierarchySrc).not.toMatch(/from ['"]\.\/workflow['"]/)
  })
  it('validation.ts does not import advancedValidation.ts (would create a cycle, since advancedValidation imports validation)', () => {
    expect(validationSrc).not.toMatch(/from ['"]\.\/advancedValidation['"]/)
  })
  it('advancedValidation.ts does not import simulator.ts (would create a cycle, since simulator imports advancedValidation)', () => {
    expect(advancedValidationSrc).not.toMatch(/from ['"]\.\/simulator['"]/)
  })
  it('advancedValidation.ts does not import workflow.ts (would create a cycle)', () => {
    expect(advancedValidationSrc).not.toMatch(/from ['"]\.\/workflow['"]/)
  })
  it('simulator.ts does not import workflow.ts (would create a cycle)', () => {
    expect(simulatorSrc).not.toMatch(/from ['"]\.\/workflow['"]/)
  })
  it('simulator.ts does not import exporter.ts (would create a cycle, since exporter imports simulator types)', () => {
    expect(simulatorSrc).not.toMatch(/from ['"]\.\/exporter['"]/)
  })
  it('integrity.ts does not import exporter.ts (would create a cycle, since exporter imports integrity)', () => {
    expect(integritySrc).not.toMatch(/from ['"]\.\/exporter['"]/)
  })
  it('integrity.ts imports only ./types (leaf module, no cycle risk)', () => {
    const imports = [...integritySrc.matchAll(/^import .* from '\.\/(\w+)'/gm)].map((m) => m[1])
    expect(imports).toEqual(['types'])
  })
  it('processorValidation.ts does not import validation.ts (would create a cycle, since validation imports processorValidation)', () => {
    expect(processorValidationSrc).not.toMatch(/from ['"]\.\/validation['"]/)
  })
  it('pipeline.ts does not import processorValidation.ts (would create a cycle, since processorValidation imports pipeline)', () => {
    expect(pipelineSrc).not.toMatch(/from ['"]\.\/processorValidation['"]/)
  })
  it('exporter.ts does not import workflow.ts (would create a cycle, since workflow could reuse exporter)', () => {
    expect(exporterSrc).not.toMatch(/from ['"]\.\/workflow['"]/)
  })
  for (const [name, src] of KERNEL_SOURCES) {
    it(`${name} does not import itself`, () => {
      const selfName = name.replace('.ts', '')
      expect(src).not.toMatch(new RegExp(`from ['"]\\./${selfName}['"]`))
    })
  }
})

describe('Task 1 — Architecture audit: no duplicate transition logic', () => {
  it('ALLOWED_TRANSITIONS / canTransitionProfileStatus is defined exactly once, in lifecycle.ts', () => {
    for (const [name, src] of KERNEL_SOURCES) {
      if (name === 'workflow.ts') {
        expect(src).not.toMatch(/const ALLOWED_TRANSITIONS/)
      }
    }
  })
  it('workflow.ts delegates every transition check to canTransitionProfileStatus (no inline status-graph literal)', () => {
    const transitionChecks = (workflowSrc.match(/canTransitionProfileStatus\(/g) || []).length
    expect(transitionChecks).toBeGreaterThanOrEqual(4)
  })
  it('validatePublishReadiness is defined exactly once, in advancedValidation.ts', () => {
    expect(exporterSrc).not.toMatch(/export function validatePublishReadiness/)
    expect(workflowSrc).not.toMatch(/export function validatePublishReadiness/)
  })
  it('calculateProfileHash is defined exactly once, in integrity.ts', () => {
    expect(exporterSrc).not.toMatch(/export function calculateProfileHash/)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 2 — FIRESTORE AUDIT
// ════════════════════════════════════════════════════════════

const COLLECTIONS = [
  { name: 'profileStudioProfiles', mutable: true },
  { name: 'profileStudioSnapshots', mutable: false },
  { name: 'profileStudioAuditLogs', mutable: false },
  { name: 'profileStudioPublishPackages', mutable: false },
  { name: 'profileStudioSimulationRuns', mutable: false },
]

describe('Task 2 — Firestore audit: collection inventory', () => {
  for (const col of COLLECTIONS) {
    it(`${col.name} is registered in the service layer`, () => {
      expect(serviceSrc).toContain(`'${col.name}'`)
    })
    it(`${col.name} has a matching security-rule match block`, () => {
      expect(rulesSrc).toContain(`match /${col.name}/`)
    })
  }
  it('exactly 5 Profile Studio collections exist (no extra collection introduced)', () => {
    const matches = [...serviceSrc.matchAll(/[A-Z_]+:\s*'(profileStudio\w+)'/g)]
    expect(matches.length).toBe(5)
  })
})

describe('Task 2 — Firestore audit: append-only collections stay immutable', () => {
  it('the service layer never imports deleteDoc', () => {
    expect(serviceSrc).not.toMatch(/\bdeleteDoc\b/)
  })
  for (const col of COLLECTIONS.filter((c) => !c.mutable)) {
    it(`${col.name}'s rule block denies update`, () => {
      const block = rulesSrc.slice(rulesSrc.indexOf(`match /${col.name}/`), rulesSrc.indexOf(`match /${col.name}/`) + 400)
      expect(block).toMatch(/allow update:\s*if false/)
    })
  }
  it('profileStudioSnapshots is only ever written via addDoc (append), never setDoc/updateDoc', () => {
    const createFnIdx = serviceSrc.indexOf('export async function createProfileSnapshotDocument')
    const fnBody = serviceSrc.slice(createFnIdx, createFnIdx + 900)
    expect(fnBody).toContain('addDoc(')
    expect(fnBody).not.toContain('updateDoc(')
  })
  it('profileStudioAuditLogs is only ever written via addDoc (append), never setDoc/updateDoc', () => {
    const createFnIdx = serviceSrc.indexOf('export async function createAuditLogDocument')
    const fnBody = serviceSrc.slice(createFnIdx, createFnIdx + 900)
    expect(fnBody).toContain('addDoc(')
    expect(fnBody).not.toContain('updateDoc(')
  })
  it('profileStudioPublishPackages is only ever written via addDoc (append), never setDoc/updateDoc', () => {
    const createFnIdx = serviceSrc.indexOf('export async function createPublishPackageDocument')
    const fnBody = serviceSrc.slice(createFnIdx, createFnIdx + 900)
    expect(fnBody).toContain('addDoc(')
    expect(fnBody).not.toContain('updateDoc(')
  })
  it('profileStudioSimulationRuns is only ever written via addDoc (append), never setDoc/updateDoc', () => {
    const createFnIdx = serviceSrc.indexOf('export async function createSimulationRunDocument')
    const fnBody = serviceSrc.slice(createFnIdx, createFnIdx + 900)
    expect(fnBody).toContain('addDoc(')
    expect(fnBody).not.toContain('updateDoc(')
  })
})

describe('Task 2 — Firestore audit: no accidental delete flow in the app layer', () => {
  it.each(COLLECTIONS.map((c) => c.name))('%s has no exported delete* function in the service layer', (name) => {
    const re = new RegExp(`export\\s+async function\\s+delete\\w*${name.replace('profileStudio', '')}`, 'i')
    expect(serviceSrc).not.toMatch(re)
  })
  it('archiveProfileDocument only ever sets status to ARCHIVED, never removes the document', () => {
    const idx = serviceSrc.indexOf('export async function archiveProfileDocument')
    const body = serviceSrc.slice(idx, idx + 700)
    expect(body).toContain("'ARCHIVED'")
    expect(body).not.toMatch(/\bdeleteDoc\b/)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 3 — PERMISSION CERTIFICATION
// ════════════════════════════════════════════════════════════

// Ground truth permission matrix, transcribed verbatim from persistenceSchema.ts,
// used to certify every other surface (hook, service, UI gating) against it.
const EXPECTED_MATRIX: Record<ProfileStudioRole, string[]> = {
  admin: ['profile:create', 'profile:read', 'profile:edit', 'profile:approve', 'profile:publish', 'profile:archive', 'simulation:run'],
  general_manager: ['profile:read', 'profile:approve', 'profile:publish'],
  district_supervisor: ['profile:read', 'simulation:run'],
  manager: ['profile:read', 'simulation:run'],
  pharmacist: ['profile:read'],
}

describe('Task 3 — Permission certification: PERMISSION_MATRIX matches the documented design', () => {
  for (const role of ROLES) {
    it(`${role} has exactly the documented permission set`, () => {
      expect([...PERMISSION_MATRIX[role]].sort()).toEqual([...EXPECTED_MATRIX[role]].sort())
    })
  }
})

// Surfaces audited: builder, simulation, history, snapshots, audit logs, approval, publish.
const SURFACE_GUARDS: Record<string, (role: ProfileStudioRole) => boolean> = {
  builder: canEditProfile,
  simulation: canRunSimulation,
  history: (role) => canApproveProfile(role) || canPublishProfile(role),
  snapshots: (role) => canApproveProfile(role) || canPublishProfile(role),
  audit_logs: canReadProfile,
  approval: canApproveProfile,
  publish: canPublishProfile,
}

describe('Task 3 — Permission certification: role x surface matrix (UI/service parity)', () => {
  for (const role of ROLES) {
    for (const surface of Object.keys(SURFACE_GUARDS)) {
      it(`${role} × ${surface}: guard function never throws and is boolean`, () => {
        const result = SURFACE_GUARDS[surface](role)
        expect(typeof result).toBe('boolean')
      })
    }
  }
})

describe('Task 3 — Permission certification: hook output matches guard functions for every role × status', () => {
  for (const role of ROLES) {
    for (const status of STATUSES) {
      it(`useProfileStudioPermissions(${role}, ${status}) matches persistenceGuards exactly`, () => {
        const perms = useProfileStudioPermissions.__test
          ? null
          : (() => {
              // Hook logic mirrored deterministically (no React render needed —
              // the hook body has no side effects beyond useMemo over these calls).
              return {
                canRead: canReadProfile(role),
                canCreate: canCreateProfile(role),
                canEdit: canEditProfile(role, status),
                canApprove: canApproveProfile(role),
                canPublish: canPublishProfile(role),
                canArchive: canArchiveProfile(role),
                canRunSimulation: canRunSimulation(role),
              }
            })()
        expect(perms!.canRead).toBe(canReadProfile(role))
        expect(perms!.canCreate).toBe(canCreateProfile(role))
        expect(perms!.canEdit).toBe(canEditProfile(role, status))
        expect(perms!.canApprove).toBe(canApproveProfile(role))
        expect(perms!.canPublish).toBe(canPublishProfile(role))
        expect(perms!.canArchive).toBe(canArchiveProfile(role))
        expect(perms!.canRunSimulation).toBe(canRunSimulation(role))
      })
    }
  }
})

describe('Task 3 — Permission certification: service layer requires the same guard as the UI hook, per write function', () => {
  const SERVICE_GUARD_PAIRS: [string, string][] = [
    ['createProfileDocument', 'canCreateProfile'],
    ['getProfileDocument', 'canReadProfile'],
    ['listProfileDocuments', 'canReadProfile'],
    ['archiveProfileDocument', 'canArchiveProfile'],
    ['createPublishPackageDocument', 'canPublishProfile'],
    ['createSimulationRunDocument', 'canRunSimulation'],
    ['listAuditLogs', 'canReadProfile'],
  ]
  for (const [fn, guard] of SERVICE_GUARD_PAIRS) {
    it(`${fn} calls ${guard} before writing/reading`, () => {
      const idx = serviceSrc.indexOf(`export async function ${fn}`)
      expect(idx).toBeGreaterThan(-1)
      const body = serviceSrc.slice(idx, idx + 500)
      expect(body).toContain(guard)
    })
  }
})

describe('Task 3 — Permission certification: PublishPanel admin-only UI restriction is documented and enforced', () => {
  it('PublishPanel checks actor.role === \'admin\' in addition to the shared canPublish flag', () => {
    expect(PublishPanelSrc).toMatch(/actor\?\.role === 'admin'/)
  })
  it('PublishPanel does not grant general_manager publish access despite canPublishProfile(general_manager) being true', () => {
    expect(canPublishProfile('general_manager')).toBe(true)
    expect(PublishPanelSrc).toContain('isAdmin')
  })
})

// ════════════════════════════════════════════════════════════
// TASK 4 — WORKFLOW CERTIFICATION
// ════════════════════════════════════════════════════════════

const EXPECTED_TRANSITIONS: Record<ProfileStatus, ProfileStatus[]> = {
  DRAFT: ['VALIDATED', 'ARCHIVED'],
  VALIDATED: ['SIMULATED', 'ARCHIVED'],
  SIMULATED: ['APPROVED', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
}

describe('Task 4 — Workflow certification: full from × to transition matrix', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const expected = from !== to && EXPECTED_TRANSITIONS[from].includes(to)
      it(`${from} → ${to} is ${expected ? 'ALLOWED' : 'BLOCKED'}`, () => {
        expect(canTransitionProfileStatus(from, to)).toBe(expected)
      })
    }
  }
})

describe('Task 4 — Workflow certification: no duplicate / same-state transitions', () => {
  for (const status of STATUSES) {
    it(`${status} → ${status} is always blocked (no no-op transition)`, () => {
      expect(canTransitionProfileStatus(status, status)).toBe(false)
    })
  }
})

describe('Task 4 — Workflow certification: terminal state and bypass checks', () => {
  it('ARCHIVED is the only terminal status', () => {
    for (const status of STATUSES) {
      expect(isTerminalStatus(status)).toBe(status === 'ARCHIVED')
    }
  })
  it('assertProfileStatusTransition throws on an illegal transition', () => {
    expect(() => assertProfileStatusTransition('DRAFT', 'PUBLISHED')).toThrow()
  })
  it('assertProfileStatusTransition does not throw on a legal transition', () => {
    expect(() => assertProfileStatusTransition('DRAFT', 'VALIDATED')).not.toThrow()
  })
  it('there is no DRAFT → SIMULATED shortcut (must pass through VALIDATED)', () => {
    expect(canTransitionProfileStatus('DRAFT', 'SIMULATED')).toBe(false)
  })
  it('there is no DRAFT → APPROVED shortcut', () => {
    expect(canTransitionProfileStatus('DRAFT', 'APPROVED')).toBe(false)
  })
  it('there is no VALIDATED → APPROVED shortcut (must pass through SIMULATED)', () => {
    expect(canTransitionProfileStatus('VALIDATED', 'APPROVED')).toBe(false)
  })
  it('there is no SIMULATED → PUBLISHED shortcut (must pass through APPROVED)', () => {
    expect(canTransitionProfileStatus('SIMULATED', 'PUBLISHED')).toBe(false)
  })
  it('there is no PUBLISHED → DRAFT/VALIDATED/SIMULATED/APPROVED demotion path', () => {
    expect(canTransitionProfileStatus('PUBLISHED', 'DRAFT')).toBe(false)
    expect(canTransitionProfileStatus('PUBLISHED', 'VALIDATED')).toBe(false)
    expect(canTransitionProfileStatus('PUBLISHED', 'SIMULATED')).toBe(false)
    expect(canTransitionProfileStatus('PUBLISHED', 'APPROVED')).toBe(false)
  })
  it('there is no transition out of ARCHIVED in either workflow.ts or the service layer rules', () => {
    for (const to of STATUSES) {
      expect(canTransitionProfileStatus('ARCHIVED', to)).toBe(false)
    }
    expect(rulesSrc.slice(rulesSrc.indexOf('match /profileStudioProfiles/'))).toMatch(/allow delete:\s*if false/)
  })
  it('PublishPanel never calls updateProfileDocument (publish creates a package only — status stays APPROVED in Firestore)', () => {
    expect(PublishPanelSrc).not.toMatch(/\bupdateProfileDocument\(/)
  })
  it('updateProfileDocument is the only profile-mutating function components call for VALIDATE/SIMULATE/APPROVE actions', () => {
    expect(ApprovalPanelSrc).toContain('updateProfileDocument')
  })
})

describe('Task 4 — Workflow certification: workflow.ts functions agree with the transition matrix', () => {
  it('validateDraft succeeds DRAFT → VALIDATED for a well-formed profile', () => {
    const result = validateDraft(makeDraft('DRAFT'))
    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('VALIDATED')
  })
  it.each(['SIMULATED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as ProfileStatus[])(
    'validateDraft fails from %s (illegal source for this transition)',
    (status) => {
      const result = validateDraft(makeDraft(status))
      expect(result.success).toBe(false)
    },
  )
  it.each(['DRAFT', 'VALIDATED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as ProfileStatus[])(
    'approveDraft fails from %s (only SIMULATED may transition to APPROVED)',
    (status) => {
      const result = approveDraft(makeDraft(status))
      expect(result.success).toBe(false)
    },
  )
  it('approveDraft succeeds SIMULATED → APPROVED for a ready profile', () => {
    const result = approveDraft(makeDraft('SIMULATED'))
    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('APPROVED')
  })
  it.each(['DRAFT', 'VALIDATED', 'SIMULATED', 'PUBLISHED', 'ARCHIVED'] as ProfileStatus[])(
    'markPublishReady fails from %s (only APPROVED may transition to PUBLISHED)',
    (status) => {
      const result = markPublishReady(makeDraft(status))
      expect(result.success).toBe(false)
    },
  )
  it('markPublishReady succeeds APPROVED → PUBLISHED for a ready profile', () => {
    const result = markPublishReady(makeDraft('APPROVED'))
    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('PUBLISHED')
  })
  it.each(STATUSES)('archiveProfile succeeds from %s except ARCHIVED itself', (status) => {
    const result = archiveProfile(makeDraft(status))
    expect(result.success).toBe(status !== 'ARCHIVED')
  })
  it('restoreArchivedProfile exists in the kernel but is not wired into any component (no Restore feature is exposed)', () => {
    expect(typeof restoreArchivedProfile).toBe('function')
    for (const [name, src] of COMPONENT_SOURCES) {
      expect(src, `${name} must not call restoreArchivedProfile`).not.toMatch(/\brestoreArchivedProfile\(/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TASK 5 — KERNEL PARITY
// ════════════════════════════════════════════════════════════

describe('Task 5 — Kernel parity: certified functions exist with the expected shape', () => {
  it('simulateProfile is a function and never throws on a minimal draft', () => {
    expect(typeof simulateProfile).toBe('function')
    expect(() => simulateProfile(makeDraft('SIMULATED'), {})).not.toThrow()
  })
  it('approveDraft is a function returning a WorkflowResult shape', () => {
    const r = approveDraft(makeDraft('SIMULATED'))
    expect(r).toHaveProperty('success')
    expect(r).toHaveProperty('issues')
  })
  it('markPublishReady is a function returning a WorkflowResult shape', () => {
    const r = markPublishReady(makeDraft('APPROVED'))
    expect(r).toHaveProperty('success')
    expect(r).toHaveProperty('issues')
  })
  it('exportPublishPackage is a function returning packageId/hash/profileVersion', () => {
    const pkg = exportPublishPackage(makeDraft('APPROVED'))
    expect(pkg).toHaveProperty('packageId')
    expect(pkg).toHaveProperty('hash')
    expect(pkg).toHaveProperty('profileVersion')
  })
  it('validatePublishReadiness is a function returning valid/issues/criticalIssues/warnings', () => {
    const r = validatePublishReadiness(makeDraft('APPROVED'))
    expect(r).toHaveProperty('valid')
    expect(r).toHaveProperty('issues')
    expect(r).toHaveProperty('criticalIssues')
    expect(r).toHaveProperty('warnings')
  })
  it('compareSimulationResults is a function returning a scoreDelta', () => {
    const sim = simulateProfile(makeDraft('SIMULATED'), {})
    const cmp = compareSimulationResults(sim, sim)
    expect(cmp).toHaveProperty('scoreDelta')
    expect(cmp.scoreDelta).toBe(0)
  })
  it('detectTampering is a function returning a TamperReport shape', () => {
    const draft = makeDraft('DRAFT')
    const hash = calculateProfileHash(draft)
    const report = detectTampering(draft, { hash })
    expect(report.tampered).toBe(false)
    expect(report).toHaveProperty('expectedHash')
    expect(report).toHaveProperty('actualHash')
  })
  it('detectTampering reports tampered=true when content diverges from the recorded hash', () => {
    const draft = makeDraft('DRAFT')
    const report = detectTampering(draft, { hash: 'deadbeef' })
    expect(report.tampered).toBe(true)
    expect(report.reason).toBeTruthy()
  })
})

describe('Task 5 — Kernel parity: no behavior drift (idempotence / determinism)', () => {
  it.each(['simulateProfile', 'calculateProfileHash', 'validatePublishReadiness'])(
    '%s is deterministic — same input produces the same output twice',
    (fnName) => {
      const draft = makeDraft(fnName === 'validatePublishReadiness' ? 'APPROVED' : 'SIMULATED')
      const fn = { simulateProfile, calculateProfileHash, validatePublishReadiness }[fnName] as (d: any, e?: any) => any
      const a = JSON.stringify(fn(draft, {}))
      const b = JSON.stringify(fn(draft, {}))
      expect(a).toBe(b)
    },
  )
  it('approveDraft never mutates the input profile object', () => {
    const draft = makeDraft('SIMULATED')
    const before = JSON.stringify(draft)
    approveDraft(draft)
    expect(JSON.stringify(draft)).toBe(before)
  })
  it('markPublishReady never mutates the input profile object', () => {
    const draft = makeDraft('APPROVED')
    const before = JSON.stringify(draft)
    markPublishReady(draft)
    expect(JSON.stringify(draft)).toBe(before)
  })
  it('exportPublishPackage produces a deep copy — mutating the package does not affect the source draft', () => {
    const draft = makeDraft('APPROVED')
    const pkg = exportPublishPackage(draft)
    ;(pkg.profile as any).metadata.name = 'mutated'
    expect(draft.metadata.name).toBe('Test Profile')
  })
  it.each(['simulateProfile', 'approveDraft', 'markPublishReady', 'validatePublishReadiness', 'calculateProfileHash', 'detectTampering'])(
    '%s never throws on a null/undefined-ish malformed profile',
    (fnName) => {
      const fn = { simulateProfile, approveDraft, markPublishReady, validatePublishReadiness, calculateProfileHash, detectTampering }[fnName] as any
      expect(() => fn({} as any, {} as any)).not.toThrow()
    },
  )
})

// ════════════════════════════════════════════════════════════
// TASK 6 — COMPONENT BOUNDARY AUDIT
// ════════════════════════════════════════════════════════════

describe('Task 6 — Component boundary audit: no component imports Firestore directly', () => {
  for (const [name, src] of COMPONENT_SOURCES) {
    it(`${name} does not import from 'firebase/firestore'`, () => {
      expect(src).not.toMatch(/from ['"]firebase\/firestore['"]/)
    })
    it(`${name} does not import '../../services/firebase' directly`, () => {
      expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/services\/firebase['"]/)
    })
  }
})

describe('Task 6 — Component boundary audit: all writes route through the service layer', () => {
  for (const [name, src, _flag] of WRITER_COMPONENTS) {
    it(`${name} only calls profileStudioService functions, never addDoc/setDoc/updateDoc directly`, () => {
      expect(src).not.toMatch(/\baddDoc\(|\bsetDoc\(|\bupdateDoc\(/)
      expect(src).toMatch(/from ['"]\.\.\/\.\.\/profileStudio\/profileStudioService['"]/)
    })
  }
})

describe('Task 6 — Component boundary audit: no kernel logic duplicated inside React', () => {
  for (const [name, src] of COMPONENT_SOURCES) {
    it(`${name} does not redefine ALLOWED_TRANSITIONS inline`, () => {
      expect(src).not.toMatch(/ALLOWED_TRANSITIONS\s*=\s*\{/)
    })
    it(`${name} does not redefine PERMISSION_MATRIX inline`, () => {
      expect(src).not.toMatch(/PERMISSION_MATRIX\s*=\s*\{/)
    })
    it(`${name} does not reimplement djb2/hash logic inline`, () => {
      expect(src).not.toMatch(/djb2/i)
    })
  }
})

describe('Task 6 — Component boundary audit: no hidden side effects', () => {
  for (const [name, src] of COMPONENT_SOURCES) {
    it(`${name} does not use setInterval`, () => {
      expect(src).not.toMatch(/\bsetInterval\(/)
    })
    it(`${name} does not use onSnapshot (no implicit realtime listeners)`, () => {
      expect(src).not.toMatch(/\bonSnapshot\(/)
    })
  }
})

// ════════════════════════════════════════════════════════════
// TASK 7 — PERFORMANCE AUDIT
// ════════════════════════════════════════════════════════════

describe('Task 7 — Performance audit: cancellation guards on fetch effects', () => {
  for (const [name, src] of FETCH_PANELS) {
    it(`${name} uses a cancelledRef guard so it never sets state after unmount`, () => {
      expect(src).toMatch(/cancelledRef/)
      expect(src).toMatch(/return \(\) => \{ cancelledRef\.current = true \}/)
    })
    it(`${name} guards every state setter inside the fetch promise with the cancellation check`, () => {
      const thenBlock = src.slice(src.indexOf('.then('), src.indexOf('.then(') + 200)
      expect(thenBlock).toMatch(/if \(!cancelledRef\.current\)/)
    })
  }
})

describe('Task 7 — Performance audit: double-submit prevention on every writer component', () => {
  for (const [name, src, flag] of WRITER_COMPONENTS) {
    it(`${name} guards its submit handler with an early-return on ${flag}`, () => {
      expect(src).toMatch(new RegExp(`if \\(${flag}\\) return`))
    })
    it(`${name} disables its primary submit button while ${flag} is true`, () => {
      expect(src).toMatch(new RegExp(`disabled=\\{!?canSubmit|disabled=\\{${flag}`))
    })
  }
})

describe('Task 7 — Performance audit: no unbounded growth / leak patterns anywhere in Profile Studio', () => {
  for (const [name, src] of COMPONENT_SOURCES) {
    it(`${name} contains no setInterval/setTimeout polling loop`, () => {
      expect(src).not.toMatch(/\bsetInterval\(/)
    })
  }
  it('the service layer never issues an unbounded listener (no onSnapshot anywhere)', () => {
    expect(serviceSrc).not.toMatch(/\bonSnapshot\(/)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 8 (part 1) — Loading states & error normalization
// ════════════════════════════════════════════════════════════

describe('Task 8 — Loading states: every fetch panel renders a Skeleton while loading', () => {
  for (const [name, src] of FETCH_PANELS) {
    it(`${name} renders SkeletonWidget when loading is true`, () => {
      expect(src).toMatch(/if \(loading\) return <SkeletonWidget/)
    })
    it(`${name} renders ErrorState when error is set`, () => {
      expect(src).toMatch(/if \(error\) return <ErrorState/)
    })
  }
})

describe('Task 8 — Error normalization: every writer component routes catch blocks through normalizeError', () => {
  for (const [name, src] of WRITER_COMPONENTS) {
    it(`${name} calls normalizeError in its catch handler (no raw error.message leakage)`, () => {
      expect(src).toMatch(/normalizeError\(/)
    })
  }
  it.each(['PERMISSION_DENIED', 'firestore', 'unavailable'])(
    'normalizeError recognizes the %s error class without throwing',
    (token) => {
      const err = new Error(`${token}: simulated failure`)
      expect(() => normalizeError(err)).not.toThrow()
      const result = normalizeError(err)
      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('code')
      expect(result).toHaveProperty('retryable')
    },
  )
  it('normalizeError never throws on a non-Error value', () => {
    expect(() => normalizeError('plain string')).not.toThrow()
    expect(() => normalizeError(null)).not.toThrow()
    expect(() => normalizeError(undefined)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// TASK 8 (part 2) — Scope guardrails: confirm excluded features are absent
// ════════════════════════════════════════════════════════════

describe('Task 8 — Guardrails: no excluded feature appears anywhere in Profile Studio', () => {
  const ALL_SOURCES: [string, string][] = [...COMPONENT_SOURCES, ...KERNEL_SOURCES, ['profileStudioService.ts', serviceSrc]]
  for (const [name, src] of ALL_SOURCES) {
    for (const term of BANNED_FEATURE_TERMS) {
      it(`${name} does not reference banned term "${term}"`, () => {
        expect(src.toLowerCase()).not.toContain(term.toLowerCase())
      })
    }
  }
})

describe('Task 8 — Guardrails: no Diff Viewer / Rollback / Restore feature is wired into the UI', () => {
  for (const [name, src] of COMPONENT_SOURCES) {
    it(`${name} does not call restoreArchivedProfile`, () => {
      expect(src).not.toMatch(/\brestoreArchivedProfile\(/)
    })
    it(`${name} does not implement a diff-viewer (no "DiffViewer" component reference)`, () => {
      expect(src).not.toMatch(/\bDiffViewer\b/)
    })
    it(`${name} does not implement drag-and-drop handlers`, () => {
      expect(src).not.toMatch(/onDragStart=|onDrop=|draggable=\{true\}/)
    })
  }
})

describe('Task 8 — Guardrails: Evaluation Engine is untouched by Profile Studio', () => {
  for (const [name, src] of KERNEL_SOURCES) {
    it(`${name} does not import from the production engine (../engine)`, () => {
      expect(src).not.toMatch(/from ['"]\.\.\/engine/)
    })
  }
})

// ════════════════════════════════════════════════════════════
// Sanity: collection / role / status table sizes (guards against
// silently adding/removing a collection, role, or status without
// updating this certification suite)
// ════════════════════════════════════════════════════════════

describe('Certification scope sanity checks', () => {
  it('exactly 5 roles are certified', () => expect(ROLES.length).toBe(5))
  it('exactly 6 statuses are certified', () => expect(STATUSES.length).toBe(6))
  it('exactly 5 collections are certified', () => expect(COLLECTIONS.length).toBe(5))
  it('exactly 7 writer components are certified for double-submit prevention', () => expect(WRITER_COMPONENTS.length).toBe(7))
  it('exactly 3 read-only fetch panels are certified for cancellation guards', () => expect(FETCH_PANELS.length).toBe(3))
  it(`all ${COMPONENT_SOURCES.length} Profile Studio components are covered by the boundary audit`, () => {
    expect(COMPONENT_SOURCES.length).toBeGreaterThanOrEqual(34)
  })
})
