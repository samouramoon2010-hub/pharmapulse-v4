// ============================================================
// Profile Studio — Cohort Simulation Readiness Audit (Phase 1 Closure)
//
// AUDIT ONLY. This module does NOT implement cohort simulation.
//
// Existing simulator architecture (simulator.ts):
//   - simulateProfile(input) takes ONE StudioSimulationInput
//     ({ profile, actuals, targets, context }) — actuals/targets are
//     flat Record<kpiKey, number> maps for a SINGLE subject (one
//     pharmacy/pharmacist/month).
//   - There is no batching primitive, no iteration over multiple
//     subjects, and no aggregation-across-subjects logic anywhere in
//     the kernel.
//
// What "cohort simulation" would require beyond the current safe
// pattern:
//   1. A new data contract for SUPPLYING many subjects' actuals/targets
//      at once (e.g. an array of StudioSimulationInput, or a query
//      shape keyed by branch/region/month range).
//   2. Reading that bulk data from Firestore production collections
//      (kpiActuals / targets / historyEngine snapshots) at a scale and
//      query shape that does not exist today for Profile Studio's
//      sandboxed read path — Profile Studio currently only ever
//      receives synthetic actuals/targets typed in by hand via
//      SimulatorPanel, never a live production read.
//   3. New aggregation/statistics logic (distribution of scores across
//      a cohort, percentile banding, etc.) that does not exist in
//      simulator.ts and would need new, unreviewed kernel code.
//
// Per the bundle's own safety rule ("if cohort simulation requires new
// data contracts or production reads beyond safe existing patterns,
// defer and report"), this audit concludes:
//
//   READY:    Single-subject simulation, simulation comparison
//             (compareSimulationResults), and structural profile diff
//             (profileDiff.ts) — all already safe, isolated, and exist
//             today.
//   NOT READY: True cohort (multi-subject, multi-branch) simulation —
//             would require new production-read data contracts that
//             have not been scoped, reviewed, or approved. Deferred.
//
// No code in this file executes a simulation, reads Firestore, or
// touches the production Evaluation Engine — it only documents the
// audit conclusion in a structured, testable form.
// ============================================================

export interface CohortSimulationReadinessAudit {
  /** Always false until a separate, explicitly-approved bundle scopes this. */
  cohortSimulationImplemented: false
  /** Capabilities that already exist and are safe to use today. */
  readyCapabilities: string[]
  /** What would be required to safely implement cohort simulation. */
  blockingRequirements: string[]
  /** The audit's recommendation. */
  recommendation: 'DEFER'
}

export const COHORT_SIMULATION_READINESS: CohortSimulationReadinessAudit = {
  cohortSimulationImplemented: false,
  readyCapabilities: [
    'Single-subject simulation via simulateProfile() — isolated, deterministic, no production reads.',
    'Simulation-to-simulation comparison via compareSimulationResults() — already exists in simulator.ts.',
    'Structural profile-to-profile diff via diffProfiles()/diffSnapshots() — added in this bundle, no production reads.',
  ],
  blockingRequirements: [
    'A new bulk input data contract for many subjects at once (not present in StudioSimulationInput today).',
    'A new, reviewed production-read query shape to source many subjects\' actuals/targets at scale.',
    'New cross-subject aggregation/statistics logic that does not exist in the simulator kernel today.',
  ],
  recommendation: 'DEFER',
}
