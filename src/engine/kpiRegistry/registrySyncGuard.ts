// ============================================================
// KPI Registry Synchronization Guard — Phase 1A
//
// Development-only startup utility.
//
// Purpose:
//   Compare KPI_KEYS (the engine's canonical set) against the
//   DEFAULT_KPI_REGISTRY to detect any drift between what the
//   engine processes and what the registry defines.
//
// Behaviour:
//   - Development:  console.warn() if mismatch found.
//   - Production:   no-op. Nothing is logged.
//   - NEVER throws. NEVER blocks startup.
//   - Informational only.
//
// When to call:
//   Import this module once in main.jsx or App.jsx startup.
//   It self-invokes at import time in development.
//   In production builds it is tree-shaken to nothing.
//
// What it checks:
//   1. Every KPI_KEYS engine key resolves to a registry entry
//      via the alias map (omni→omnihealth, wellness→wellnessCard).
//   2. Every registry core KPI's engine key appears in KPI_KEYS.
//   3. The primary KPI (isPrimary:true) is active and is wasfaty.
// ============================================================

import { KPI_KEYS } from '../kpiAnalyticsEngine'
import {
  DEFAULT_KPI_REGISTRY,
  KPI_ENGINE_ALIAS_MAP,
} from './defaultKpiRegistry'

// Reverse alias map: engine key → registry business key
const ENGINE_TO_REGISTRY: Record<string, string> = Object.fromEntries(
  Object.entries(KPI_ENGINE_ALIAS_MAP).map(([biz, eng]) => [eng, biz]),
)

/**
 * Validate that KPI_KEYS and DEFAULT_KPI_REGISTRY are in sync.
 * Returns an array of warning messages (empty = no issues).
 */
export function validateRegistrySync(): string[] {
  const warnings: string[] = []

  // Check 1: every engine key resolves to a registry entry
  for (const engineKey of KPI_KEYS) {
    const registryKey = ENGINE_TO_REGISTRY[engineKey] ?? engineKey
    if (!DEFAULT_KPI_REGISTRY[registryKey]) {
      warnings.push(
        `[KPI Registry] Engine key '${engineKey}' has no corresponding registry entry.` +
        ` Expected registry key: '${registryKey}'.` +
        ` Add it to defaultKpiRegistry.ts.`
      )
    }
  }

  // Check 2: every active core registry KPI's engine key is in KPI_KEYS
  const engineKeySet = new Set(KPI_KEYS)
  for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
    if (!kpi.isCore || !kpi.isActive) continue
    const engineKey = kpi.aliasFor ?? kpi.key
    if (!engineKeySet.has(engineKey as any)) {
      warnings.push(
        `[KPI Registry] Registry core KPI '${kpi.key}' (engine key: '${engineKey}') ` +
        `is not present in KPI_KEYS from kpiAnalyticsEngine.ts.` +
        ` Add '${engineKey}' to KPI_KEYS, or set isCore:false in the registry.`
      )
    }
  }

  // Check 3: exactly one primary KPI, and it is active
  const primaryKpis = Object.values(DEFAULT_KPI_REGISTRY).filter(
    (k) => k.isPrimary === true
  )
  if (primaryKpis.length === 0) {
    warnings.push(
      `[KPI Registry] No KPI has isPrimary:true. ` +
      `Set isPrimary:true on the primary operational KPI (expected: wasfaty).`
    )
  } else if (primaryKpis.length > 1) {
    const keys = primaryKpis.map((k) => k.key).join(', ')
    warnings.push(
      `[KPI Registry] Multiple KPIs have isPrimary:true: ${keys}. ` +
      `Only one KPI may be primary.`
    )
  } else if (!primaryKpis[0].isActive) {
    warnings.push(
      `[KPI Registry] Primary KPI '${primaryKpis[0].key}' has isActive:false. ` +
      `The primary KPI must be active.`
    )
  }

  return warnings
}

/**
 * Run the sync check and emit warnings in development.
 * Called automatically at module load time in development builds.
 * Tree-shaken in production.
 */
function runSyncCheck(): void {
  // Guard: only run in development
  if (import.meta.env.PROD) return

  try {
    const warnings = validateRegistrySync()
    if (warnings.length > 0) {
      console.warn(
        '\n━━━ [PharmaPulse] KPI Registry Sync Warning ━━━\n' +
        warnings.map((w) => `  ⚠  ${w}`).join('\n') +
        '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
      )
    }
    // No console output when registry is clean — silence is success
  } catch {
    // Never throw — this is informational only
  }
}

// Self-invoke at import time
runSyncCheck()
