// ============================================================
// Closure Patch Part 7 (revised, follow-up closure patch Part 1) —
// typed wrapper for pharmacyService.js.
//
// services/pharmacyService.d.ts now declares this module's real
// exports accurately, so importing '../pharmacyService' carries zero
// TS7016. This DX-domain-scoped wrapper is kept anyway — it narrows
// the surface to exactly what Data Exchange uses.
// ============================================================

import { createPharmacy as _createPharmacy, updatePharmacy as _updatePharmacy } from '../pharmacyService'

export interface PharmacyData {
  code:          string
  name:          string
  region?:       string | null
  city?:         string | null
  managerEmail?: string | null
  active?:       boolean
}

export interface PharmacyResult {
  id: string
  [key: string]: unknown
}

export async function createPharmacy(
  data: PharmacyData, actorId: string, actorRole: string,
): Promise<PharmacyResult> {
  return _createPharmacy(data, actorId, actorRole)
}

export async function updatePharmacy(
  id: string, data: Partial<PharmacyData>, actorId: string, actorRole: string,
): Promise<unknown> {
  return _updatePharmacy(id, data, actorId, actorRole)
}
