// ============================================================
// Legacy Entry Adapter — Hybrid Dynamic KPI Strategy
// src/engine/kpiCompatibility/legacyEntryAdapter.ts
//
// PURPOSE
// -------
// Translates a dynamic KPI entry document (containing a kpiValues map)
// into the flat legacy shape expected by ALL production engines:
//
//   Evaluation Engine V1
//   Evaluation Engine V2 (shadow)
//   Ranking Engine
//   Executive Score Engine
//   Regional Rollup Engine
//   Team Intelligence Engine
//
// These engines were built around a closed-world assumption: five KPI
// keys are the only KPIs that exist. This adapter is the safety membrane
// that ensures they continue to receive exactly the shape they expect,
// regardless of what pilot or future KPIs exist in the entry document.
//
// STATUS (updated, Final Stabilization / Architecture Closure Bundle):
//         mapDynamicToLegacyBatch() IS wired into production — it is
//         called from fetchKpiEntriesRange() in kpiService.js (both the
//         multi-branch and single-branch/all-branches code paths). It is
//         NOT yet called from the real-time subscription paths
//         (subscribeKpiEntries / subscribeRecentKpiEntries) or from the
//         write path (saveKpiEntry) — those remain on the flat legacy
//         shape directly. This comment previously claimed "NOT yet wired
//         into any production read path," which was true at the time it
//         was written but is no longer accurate.
//
// INVARIANTS
// ----------
// 1. Output always contains all 5 production engine keys (wasfaty, omni,
//    wellness, basket, crossSelling) with numeric values.
// 2. Missing or invalid values produce 0 — never undefined or NaN.
// 3. Pilot, draft, shadow, and unknown KPI keys in kpiValues are ignored.
// 4. The adapter never throws — all errors produce safe fallback output.
// 5. Metadata fields (userId, pharmacyId, date, month) pass through
//    unchanged.
// 6. Extended legacy fields (ndf, sl, sales) pass through if present.
//
// RESOLUTION PRECEDENCE (per production engine key)
// --------------------------------------------------
// 1. kpiValues[registryKey]  — registry business key via alias reverse-lookup
//    e.g. kpiValues['omnihealth'] for engine key 'omni'
// 2. doc[engineKey]          — legacy flat field on the document
//    e.g. doc.omni
// 3. 0                       — safe fallback when both are absent
//
// PILOT KPI HANDLING
// ------------------
// Pilot KPI values in kpiValues (e.g. kpiValues['insurance']) are
// silently ignored by the adapter output. They remain in the raw
// document for the display layer but never reach evaluation engines.
// ============================================================

import type { KpiAliasMap } from '../kpiRegistry/kpiRegistryTypes'

// ── Input / Output types ──────────────────────────────────────

/**
 * Raw entry document that may contain either the legacy flat fields,
 * a dynamic kpiValues map, or both (dual-write period).
 *
 * All fields are optional — the adapter handles every absence safely.
 */
export interface DynamicEntryDoc {
  // Metadata
  userId?:      string
  pharmacyId?:  string
  date?:        string    // 'YYYY-MM-DD'
  month?:       string    // 'YYYY-MM'

  // Dynamic KPI values map (registry business keys → values)
  // e.g. { wasfaty: 100, omnihealth: 90, insurance: 15 }
  // Pilot/unknown keys are ignored by the adapter output.
  kpiValues?:   Record<string, number>

  // Legacy flat fields — preserved during dual-write period
  wasfaty?:     number
  omni?:        number
  wellness?:    number
  basket?:      number
  crossSelling?: number

  // Extended legacy fields — passed through unchanged
  ndf?:         number
  sl?:          number
  sales?:       number

  // Allow additional unknown fields (future-proof)
  [key: string]: unknown
}

/**
 * The flat legacy shape expected by all production engines.
 *
 * The five core fields are ALWAYS present and ALWAYS numeric.
 * Extended fields are optional — present only when the source doc had them.
 */
export interface LegacyFlatEntry {
  // Metadata (pass-through)
  id?:          string
  userId?:      string
  pharmacyId?:  string
  date?:        string
  month?:       string

  // Five production engine keys — always present, always numeric
  wasfaty:      number
  omni:         number
  wellness:     number
  basket:       number
  crossSelling: number

  // Extended legacy fields — optional pass-through
  ndf?:         number
  sl?:          number
  sales?:       number
}

// ── Engine key definitions ────────────────────────────────────

/**
 * The five production engine keys that all current engines expect.
 * These are the INTERNAL engine field names — not registry business keys.
 *
 * DO NOT change this list without a corresponding engine migration.
 * Adding a key here would change the adapter output and require all
 * consuming engines to be updated simultaneously.
 */
const PRODUCTION_ENGINE_KEYS: ReadonlyArray<
  'wasfaty' | 'omni' | 'wellness' | 'basket' | 'crossSelling'
> = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

type ProductionEngineKey = typeof PRODUCTION_ENGINE_KEYS[number]

// ── Value sanitization ────────────────────────────────────────

/**
 * Sanitize a raw value to a safe non-negative number.
 *
 * Maps: undefined, null, NaN, non-numeric → 0
 * Preserves: valid numbers (including negative — the existing system
 * does not clamp negatives, so we preserve them for compatibility)
 */
function sanitize(raw: unknown): number {
  if (raw === undefined || raw === null) return 0
  try {
    const n = Number(raw)
    if (!isFinite(n) || isNaN(n)) return 0
    return n
  } catch {
    return 0
  }
}

// ── Core adapter function ─────────────────────────────────────

/**
 * mapDynamicToLegacy
 *
 * Translates one dynamic entry document to the legacy flat shape.
 *
 * @param doc      - Raw entry document (legacy, dynamic, or dual-write)
 * @param aliasMap - Registry alias map from buildAliasMap()
 *                   e.g. { omnihealth: 'omni', wellnessCard: 'wellness' }
 *                   Used to resolve kpiValues business keys to engine keys.
 * @returns LegacyFlatEntry with all 5 production fields populated
 *
 * @example
 *   const aliasMap = buildAliasMap(DEFAULT_KPI_REGISTRY)
 *   const legacy = mapDynamicToLegacy({
 *     userId: 'u1',
 *     kpiValues: { wasfaty: 100, omnihealth: 90, insurance: 15 },
 *     wellness: 50,   // legacy flat field (fallback)
 *   }, aliasMap)
 *   // → { userId: 'u1', wasfaty: 100, omni: 90, wellness: 50, basket: 0, crossSelling: 0 }
 */
export function mapDynamicToLegacy(
  doc: DynamicEntryDoc,
  aliasMap: KpiAliasMap,
  extraEngineKeys: string[] = [],
): LegacyFlatEntry {
  // Guard: malformed input produces a safe zero-value entry
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { wasfaty: 0, omni: 0, wellness: 0, basket: 0, crossSelling: 0 }
  }

  // Reverse alias map: engine key → registry business key
  // e.g. { omni: 'omnihealth', wellness: 'wellnessCard' }
  const reverseAlias: Record<string, string> = {}
  for (const [bizKey, engineKey] of Object.entries(aliasMap)) {
    reverseAlias[engineKey] = bizKey
  }

  // Build the output — one field at a time for each production engine key
  const output: LegacyFlatEntry = {
    // Metadata pass-through
    id:          doc['id'] as string | undefined,
    userId:      doc.userId,
    pharmacyId:  doc.pharmacyId,
    date:        doc.date,
    month:       doc.month,

    // Five production fields — resolved with precedence chain
    wasfaty:      0,
    omni:         0,
    wellness:     0,
    basket:       0,
    crossSelling: 0,
  }

  for (const engineKey of PRODUCTION_ENGINE_KEYS) {
    const registryKey = reverseAlias[engineKey] ?? engineKey

    // Precedence 1: kpiValues[registryKey]
    const fromKpiValues = doc.kpiValues?.[registryKey]
    if (fromKpiValues !== undefined) {
      output[engineKey] = sanitize(fromKpiValues)
      continue
    }

    // Precedence 2: legacy flat field
    const fromLegacy = doc[engineKey as keyof DynamicEntryDoc]
    if (fromLegacy !== undefined) {
      output[engineKey] = sanitize(fromLegacy)
      continue
    }

    // Precedence 3: safe default
    output[engineKey] = 0
  }

  // Extended legacy fields — pass through if present, sanitize
  if (doc.ndf   !== undefined) output.ndf   = sanitize(doc.ndf)
  if (doc.sl    !== undefined) output.sl    = sanitize(doc.sl)
  if (doc.sales !== undefined) output.sales = sanitize(doc.sales)

  // ── Dynamic production KPI pass-through ───────────────────
  // Extra engine keys for production_evaluation KPIs beyond the 5 legacy keys.
  // Each key is read directly from the flat doc field (written by saveKpiEntry
  // which spreads safeKpiValues — so doc['testdynamickpi'] is present).
  // Pilot/shadow keys must NOT be in extraEngineKeys — the caller is responsible.
  for (const engineKey of extraEngineKeys) {
    const raw = doc[engineKey as keyof DynamicEntryDoc]
    ;(output as Record<string, unknown>)[engineKey] = sanitize(raw)
  }

  return output
}

// ── Batch adapter ─────────────────────────────────────────────

/**
 * mapDynamicToLegacyBatch
 *
 * Applies mapDynamicToLegacy to an array of entry documents.
 * Errors in individual documents are caught and logged — a single
 * malformed document does not abort the entire batch.
 *
 * @param docs            - Array of raw entry documents
 * @param aliasMap        - Registry alias map from buildAliasMap()
 * @param extraEngineKeys - Optional dynamic production KPI engine keys (default [])
 * @returns Array of LegacyFlatEntry, same length as input
 */
export function mapDynamicToLegacyBatch(
  docs: DynamicEntryDoc[],
  aliasMap: KpiAliasMap,
  extraEngineKeys: string[] = [],
): LegacyFlatEntry[] {
  return docs.map((doc, i) => {
    try {
      return mapDynamicToLegacy(doc, aliasMap, extraEngineKeys)
    } catch (err) {
      // Never let a single malformed document crash the batch
      console.error(`[legacyEntryAdapter] Failed to map doc at index ${i}:`, err)
      // Return a safe zero-value entry with metadata preserved
      return {
        userId:       doc?.userId,
        pharmacyId:   doc?.pharmacyId,
        date:         doc?.date,
        month:        doc?.month,
        wasfaty:      0,
        omni:         0,
        wellness:     0,
        basket:       0,
        crossSelling: 0,
      }
    }
  })
}
