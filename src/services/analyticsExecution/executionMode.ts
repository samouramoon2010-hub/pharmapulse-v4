// ============================================================
// Execution Mode
// Determines WHERE analytics engines run: client-side or serverless.
//
// Phase 1 (now): all engines run client-side (current behaviour)
// Phase 2 (future): heavy engines offload to Netlify Functions
// Phase 3 (future): full serverless with scheduled execution
//
// This module centralises the routing decision so engines
// can be moved server-side without changing call sites.
// ============================================================

export type ExecutionEnvironment =
  | 'CLIENT'         // runs in browser (current)
  | 'NETLIFY_FN'     // runs in Netlify Function (future)
  | 'CLOUD_RUN'      // runs in Cloud Run (future)

export type EngineCategory =
  | 'KPI_ANALYTICS'        // kpiAnalyticsEngine — fast, client-side ok
  | 'HISTORY_ENGINE'       // historyEngine — moderate, client ok
  | 'EXECUTIVE_REPORT'     // executiveReportGenerator — heavy for many branches
  | 'LIVE_ANALYTICS'       // liveAnalyticsGenerator — must be fast
  | 'INGESTION_VALIDATION' // stagingValidator — client-side batch validation

export interface ExecutionDecision {
  engine:      EngineCategory
  environment: ExecutionEnvironment
  reason:      string
  latencyMs?:  number   // expected max latency
}

// ── Phase 1: all client-side ──────────────────────────────────
const PHASE1_ROUTING: Record<EngineCategory, ExecutionDecision> = {
  KPI_ANALYTICS: {
    engine: 'KPI_ANALYTICS',
    environment: 'CLIENT',
    reason: 'Low computation, real-time required',
    latencyMs: 10,
  },
  HISTORY_ENGINE: {
    engine: 'HISTORY_ENGINE',
    environment: 'CLIENT',
    reason: 'Post-save trigger, data already in memory',
    latencyMs: 50,
  },
  EXECUTIVE_REPORT: {
    engine: 'EXECUTIVE_REPORT',
    environment: 'CLIENT',
    reason: 'Phase 1: client-side. Future: offload when branches > 50',
    latencyMs: 200,
  },
  LIVE_ANALYTICS: {
    engine: 'LIVE_ANALYTICS',
    environment: 'CLIENT',
    reason: 'Must be <100ms for real-time feel',
    latencyMs: 30,
  },
  INGESTION_VALIDATION: {
    engine: 'INGESTION_VALIDATION',
    environment: 'CLIENT',
    reason: 'Validation is synchronous, runs before Firestore write',
    latencyMs: 100,
  },
}

/** Get current routing decision for an engine */
export function getExecutionMode(engine: EngineCategory): ExecutionDecision {
  return PHASE1_ROUTING[engine]
}

/** Is this engine running client-side? */
export function isClientSide(engine: EngineCategory): boolean {
  return getExecutionMode(engine).environment === 'CLIENT'
}

/** Is this engine serverless-ready? (has a registered function endpoint) */
export function isServerlessReady(engine: EngineCategory): boolean {
  // Phase 1: nothing is serverless yet
  return false
}

// ── Threshold for offload suggestion ─────────────────────────
export const OFFLOAD_THRESHOLDS = {
  EXECUTIVE_REPORT_BRANCHES: 50,    // suggest serverless when > 50 branches
  HISTORY_ENGINE_ENTRIES:    5000,  // suggest serverless when > 5000 entries/month
} as const

export function shouldSuggestOffload(
  engine:    EngineCategory,
  dataSize:  number,
): boolean {
  switch (engine) {
    case 'EXECUTIVE_REPORT':
      return dataSize > OFFLOAD_THRESHOLDS.EXECUTIVE_REPORT_BRANCHES
    case 'HISTORY_ENGINE':
      return dataSize > OFFLOAD_THRESHOLDS.HISTORY_ENGINE_ENTRIES
    default:
      return false
  }
}
