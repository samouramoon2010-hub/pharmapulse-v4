// ============================================================
// Territory Types — RBAC Phase 1 Infrastructure
//
// These types define the data contracts for the territory layer.
// Phase 1: CRUD infrastructure only.
// Phase 2 (future): territory-based access enforcement.
//
// Documents are stored in:
//   districts/{districtId}
//   regions/{regionId}
//
// Backward-compatible: existing pharmacy/user documents are
// unchanged. districtId/regionId fields are optional additions.
// ============================================================

// ── Region ────────────────────────────────────────────────────
// A region groups multiple districts. Managed by a regional_manager.
// Corresponds to SA_REGIONS from constants but stored as a Firestore
// document so it can carry metadata and manager assignments.

export interface Region {
  id:           string       // Firestore document ID
  name:         string       // e.g. "الرياض"
  code:         string       // e.g. "RUH" — short identifier
  managerUid:   string | null
  districtIds:  string[]     // member district IDs
  active:       boolean
  createdAt:    unknown      // serverTimestamp
  updatedAt:    unknown
  createdBy:    string | null
}

// ── District ──────────────────────────────────────────────────
// A district groups multiple branches (pharmacies) within a region.
// Managed by a district_supervisor.
// Note: districtId / area / zone — the type is named District
// but the code is label-agnostic; the admin UI can display any term.

export interface District {
  id:              string       // Firestore document ID
  name:            string       // e.g. "شمال الرياض"
  code:            string       // e.g. "RUH-N"
  regionId:        string       // parent region
  supervisorUid:   string | null
  pharmacyIds:     string[]     // member branch IDs
  active:          boolean
  createdAt:       unknown
  updatedAt:       unknown
  createdBy:       string | null
}

// ── Territory Assignment ───────────────────────────────────────
// Describes how a user is connected to a territory.
// Used by future scope enforcement — Phase 1 stores it but does
// not yet enforce it.

export type TerritoryType = 'store' | 'district' | 'region' | 'tenant'

export interface TerritoryAssignment {
  type:       TerritoryType
  id:         string          // the pharmacyId, districtId, or regionId
  label?:     string          // human-readable name
  temporary?: boolean
  expiresAt?: string          // ISO date — for temporary assignments
}

// ── User territory fields (Phase 1 additions) ─────────────────
// These are added as OPTIONAL fields to the user document.
// Existing user documents without these fields remain valid.

export interface UserTerritoryFields {
  districtId?:  string | null    // district_supervisor: their assigned district
  regionIds?:   string[]         // regional_manager: their assigned regions (can be multiple)
}

// ── Pharmacy territory fields (Phase 1 additions) ─────────────
// Added as optional fields to the pharmacy document.
// Existing pharmacy documents without these fields remain valid.

export interface PharmacyTerritoryFields {
  districtId?:  string | null    // which district this pharmacy belongs to
  regionId?:    string | null    // which region (denormalised from district)
}
