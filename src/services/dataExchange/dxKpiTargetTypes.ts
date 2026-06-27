// ============================================================
// KPI & Targets Bundle (DX-5) — DX-domain-scoped wrapper for
// kpiService.js's saveTarget().
//
// services/kpiService.d.ts now declares this module's real exports
// accurately, so importing '../kpiService' carries zero TS7016. This
// wrapper narrows the surface to exactly what the Branch Targets
// adapter needs. No parallel schema: every commit goes through the
// real saveTarget(), which already handles numeric coercion, negative
// clamping, merge-per-field writes, and audit logging.
// ============================================================

import { saveTarget as _saveTarget } from '../kpiService'

export interface SaveTargetParams {
  pharmacyId: string
  month:      string
  actorId:    string
  actorRole:  string
  /** Any key ending in 'Target', e.g. wasfatyTarget, omniTarget. */
  [targetField: string]: unknown
}

export interface SaveTargetResult {
  id: string
  [key: string]: unknown
}

export async function saveTarget(params: SaveTargetParams): Promise<SaveTargetResult> {
  return _saveTarget(params)
}
