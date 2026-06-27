// ============================================================
// Actuals & Large Files Bundle (DX-6) — DX-domain-scoped wrapper
// for kpiService.js's saveKpiEntry().
//
// Narrows the surface to exactly what the Branch/Pharmacist Actuals
// adapters need. No parallel schema: every commit goes through the
// real saveKpiEntry(), which already handles registry-driven
// sanitization, the kpiValues dual-write map, audit logging, and
// history snapshots.
//
// isDataExchangeImport/importBatchRef are additive params added to
// saveKpiEntry() in this same bundle — without them, an admin-driven
// import cannot write an entry attributed to another user (the
// existing manual-entry path always substitutes auth.currentUser.uid).
// See kpiService.js and firestore.rules (kpi_entries create) for the
// matching attribution + rule bypass.
// ============================================================

import { saveKpiEntry as _saveKpiEntry } from '../kpiService'

export interface SaveKpiActualEntryParams {
  userId:         string
  pharmacyId:     string
  date:           string
  actorId:        string
  actorRole:      string
  importBatchRef: string
  registry?:      unknown
  /** Exactly one KPI field per row — see adapters' commitBatch(). */
  [kpiField: string]: unknown
}

export interface SaveKpiActualEntryResult {
  id: string
  [key: string]: unknown
}

export async function saveKpiActualEntry(params: SaveKpiActualEntryParams): Promise<SaveKpiActualEntryResult> {
  return _saveKpiEntry({ ...params, isDataExchangeImport: true })
}
