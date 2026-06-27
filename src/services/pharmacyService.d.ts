// ============================================================
// Type declaration for services/pharmacyService.js (DX-2/DX-3
// Closure Patch Part 1 — TypeScript closure). Path-specific, accurate
// to the real parameters/payloads used (see createPharmacy/
// updatePharmacy for the exact fields read).
// ============================================================

export declare function pharmacyCodeExists(
  code: string, excludeId?: string | null,
): Promise<boolean>

export interface PharmacyRecord {
  id:                    string
  code:                  string
  name:                  string
  region:                string | null
  city:                  string | null
  managerUid:            string | null
  managerEmail:          string | null
  active:                boolean
  branchClassification:  string
  [key: string]:         unknown
}

export declare function subscribeToPharmacies(
  callback: (pharmacies: PharmacyRecord[]) => void,
): () => void

export interface PharmacyInput {
  code:                 string
  name:                 string
  region?:              string | null
  city?:                string | null
  managerUid?:          string | null
  managerEmail?:        string | null
  active?:              boolean
  branchClassification?: string | null
}

export declare function createPharmacy(
  data: PharmacyInput, actorId: string, actorRole: string,
): Promise<PharmacyRecord>

export declare function updatePharmacy(
  id: string, data: Partial<PharmacyInput>, actorId: string, actorRole: string,
): Promise<void>

export declare function updatePharmacyClassification(
  id: string, classificationId: string, actorId: string, actorRole: string,
): Promise<void>

export declare function togglePharmacyStatus(
  id: string, actorId: string, actorRole: string,
): Promise<void>

export declare function deletePharmacy(
  id: string, actorId: string, actorRole: string,
): Promise<void>

export interface BulkImportPharmaciesResult {
  created: number
  skipped: number
  errors:  Array<{ row: unknown; error: string }>
}

export declare function bulkImportPharmacies(
  rows: PharmacyInput[], actorId: string, actorRole: string,
): Promise<BulkImportPharmaciesResult>
