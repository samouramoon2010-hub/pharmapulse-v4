// ============================================================
// Demo Data Seeder — Types
// RF-0E v1
//
// All demo documents carry isDemoData + demoBatchId tags.
// Cleanup uses ONLY these tags — never touches real data.
// ============================================================

// ── Batch metadata ────────────────────────────────────────────

export type DemoStatus = 'pending' | 'generating' | 'ready' | 'deleting' | 'deleted' | 'error'

export interface DemoBatchDoc {
  demoBatchId:  string
  scenarioName: string
  status:       DemoStatus
  generatedAt:  unknown      // serverTimestamp
  generatedBy:  string
  entityCounts: DemoEntityCounts
  isDemoData:   true
  error?:       string
}

export interface DemoEntityCounts {
  pharmacies:      number
  users:           number
  targets:         number
  personalTargets: number
  kpiEntries:      number
}

// ── Demo tags (on every generated document) ───────────────────

export interface DemoTags {
  isDemoData:   true
  demoBatchId:  string
  scenarioName: string
  generatedAt:  string   // ISO — NOT serverTimestamp (batch-generated)
  generatedBy:  string
}

// ── Scenario definition ───────────────────────────────────────

export type PerformerType = 'high' | 'average' | 'underperformer' | 'missing_data'

export interface BranchSpec {
  classificationId: string
  namePrefix:       string
  codePrefix:       string
  targetMultiplier: number   // scales base targets (1.0 = standard)
}

export interface PharmacistSpec {
  performerType:    PerformerType
  achievementRange: [number, number]   // [min%, max%] of target
  activeDaysRange:  [number, number]   // [min, max] days per month
}

export interface ScenarioDefinition {
  name:          string
  month:         string            // 'YYYY-MM'
  branches:      BranchSpec[]
  pharmacistsPerBranch: number
  performerDistribution: PerformerType[]   // one per pharmacist slot (length = pharmacistsPerBranch)
}

// ── Generated entities (in-memory before Firestore write) ─────

export interface GeneratedPharmacy {
  firestoreId:     string   // assigned after write (or deterministic for dry-run)
  code:            string
  name:            string
  classificationId: string
}

export interface GeneratedUser {
  firestoreId:  string
  displayName:  string
  email:        string
  pharmacyId:   string
  performerType: PerformerType
}

// ── Dry-run report ────────────────────────────────────────────

export interface DryRunReport {
  scenarioName:   string
  month:          string
  branches:       { name: string; code: string; classification: string }[]
  pharmacists:    { name: string; pharmacyName: string; performerType: string }[]
  targetCount:    number
  personalTargetCount: number
  kpiEntryCount:  number
  estimatedWrites: number
}

// ── Global cleanup result types ───────────────────────────────
// Re-exported via demo/index.ts for convenience.
// Full definitions live in demo-cleanup.ts.

export type { GlobalCleanupScan, GlobalCleanupResult, DemoDocCount } from './demo-cleanup'
