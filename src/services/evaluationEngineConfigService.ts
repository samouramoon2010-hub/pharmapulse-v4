// ============================================================
// Evaluation Engine Config Service
//
// Provides a runtime feature flag for switching between V1 and V2
// evaluation engines without a code deployment.
//
// Firestore document: system_config/evaluation
// {
//   activeEngine: "v1",          ← global default (future full-fleet promotion)
//   rollout: {                   ← Limited Rollout scope (Phase 3)
//     engine:   "v2",
//     branches: ["ph-atheer-id"],
//     months:   ["2026-06"]
//   }
// }
//
// Resolution rules (in priority order):
//   1. If rollout.engine = 'v2' AND scope.pharmacyId ∈ rollout.branches
//      AND scope.month ∈ rollout.months → return 'v2'
//   2. If activeEngine = 'v2' (global, no rollout scope) → return 'v2'
//   3. Otherwise → return 'v1'
//   4. On ANY Firestore error → return 'v1' (safe fallback)
//
// The global activeEngine field is reserved for future full-fleet promotion.
// During Limited Rollout only the rollout sub-object is used.
//
// Contract:
//   ✓ Default = 'v1' when document is missing, fields are absent, or read fails
//   ✓ Safe: any Firestore error falls back to 'v1' silently
//   ✓ No production switch occurs by the mere existence of this service
//   ✓ Scoped rollout requires explicit branches + months to be set
//   ✗ Never caches the value (reads Firestore on every call for real-time control)
//   ✗ Does NOT change any scoring logic — it is purely a routing flag
//
// To roll back instantly:
//   Firebase Console → Firestore → system_config → evaluation
//   Remove pharmacyId from rollout.branches, or set rollout.engine = 'v1'
//   Effect is immediate — no deployment needed.
// ============================================================

export type ActiveEngine = 'v1' | 'v2'

/**
 * Optional scope for getActiveEngine().
 * When provided, the rollout sub-object is checked first.
 * When absent, only the global activeEngine field is checked.
 */
export interface EngineScope {
  pharmacyId: string
  month:      string
}

const SYSTEM_CONFIG_DOC = 'system_config/evaluation'

/**
 * Shape of the rollout sub-object in system_config/evaluation.
 * All fields are optional — missing fields are treated as "no rollout".
 */
interface RolloutConfig {
  engine?:   string
  branches?: string[]
  months?:   string[]
}

/**
 * Read the active evaluation engine setting from Firestore.
 *
 * When a scope is provided, checks the rollout sub-object first.
 * If the scope matches the rollout configuration, returns 'v2'.
 * Otherwise falls back to the global activeEngine field.
 * Falls back to 'v1' in every failure scenario.
 *
 * @param scope  Optional pharmacyId + month for Limited Rollout scoping.
 *               Omit for a global (unscoped) check.
 * @returns 'v1' | 'v2'
 */
export async function getActiveEngine(scope?: EngineScope): Promise<ActiveEngine> {
  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const { db }          = await import('./firebase')

    const snap = await getDoc(doc(db, SYSTEM_CONFIG_DOC))
    if (!snap.exists()) return 'v1'   // document not created yet → default V1

    const data = snap.data() as {
      activeEngine?: string
      rollout?:      RolloutConfig
    }

    // ── 1. Scoped rollout check (Limited Rollout phase) ───────
    // Only fires when scope is provided AND rollout is configured.
    if (scope && data.rollout) {
      const rollout = data.rollout
      if (
        rollout.engine === 'v2' &&
        Array.isArray(rollout.branches) &&
        Array.isArray(rollout.months) &&
        rollout.branches.includes(scope.pharmacyId) &&
        rollout.months.includes(scope.month)
      ) {
        return 'v2'
      }
      // Scope provided but doesn't match rollout → V1 (don't fall through to global)
      return 'v1'
    }

    // ── 2. Global flag (future full-fleet promotion) ───────────
    // Only used when no scope is provided (or no rollout object exists).
    const value = data.activeEngine
    if (value === 'v2') return 'v2'   // only accept explicit 'v2'
    return 'v1'                        // anything else → V1

  } catch {
    // Firestore unavailable, permission denied, or network error:
    // always fall back to V1 — never risk the scoring path on a config read failure.
    return 'v1'
  }
}

/**
 * Validate that an activeEngine value is a known supported value.
 * Used in tests and administrative tooling.
 */
export function isValidActiveEngine(value: unknown): value is ActiveEngine {
  return value === 'v1' || value === 'v2'
}

// ============================================================
// Evaluation Engine V2 Production Promotion Bundle — Phase B
//
// Explicit, named engine mode — wraps getActiveEngine() without changing
// any of its resolution rules or defaults.
//
//   'v1_official' — V1 is official AND shadow execution is disabled.
//                    Reserved for a possible future config flag that turns
//                    shadow off entirely. No code path returns this today:
//                    the orchestrator (evaluationOrchestrationService.ts)
//                    always runs the opposite engine in shadow regardless
//                    of which one is official, so the accurate name for
//                    "V1 official, default state" is 'v2_shadow', not this.
//                    It exists in the type purely for forward documentation.
//   'v2_shadow'    — V1 is official (the getActiveEngine() default), V2
//                     runs unconditionally in shadow. This is the actual
//                     default state of the system today.
//   'v2_official'  — V2 is official (getActiveEngine() returned 'v2' via
//                     the global flag or a matching scoped rollout). V1
//                     runs as reverse shadow and remains the fallback if
//                     V2 fails (see evaluationOrchestrationService.ts).
// ============================================================

export type EvaluationEngineMode = 'v1_official' | 'v2_shadow' | 'v2_official'

/**
 * Resolve the explicit, named engine mode for a given scope.
 *
 * Pure wrapper around getActiveEngine() — does not add any new resolution
 * rule, Firestore read, or default. Mirrors its safe-fallback contract
 * exactly: any error in getActiveEngine() is already caught internally and
 * resolves to 'v1', which this function reports as 'v2_shadow' (V1
 * official, V2 shadow running) — the same default behavior as today.
 */
export async function resolveEvaluationEngineMode(
  scope?: EngineScope,
): Promise<EvaluationEngineMode> {
  const active = await getActiveEngine(scope)
  return active === 'v2' ? 'v2_official' : 'v2_shadow'
}

/**
 * Validate that an EvaluationEngineMode value is a known supported value.
 * Used in tests and administrative tooling.
 */
export function isValidEvaluationEngineMode(value: unknown): value is EvaluationEngineMode {
  return value === 'v1_official' || value === 'v2_shadow' || value === 'v2_official'
}
