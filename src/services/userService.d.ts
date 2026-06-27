// ============================================================
// Type declaration for services/userService.js (DX-2/DX-3 Closure
// Patch Part 1 — TypeScript closure). Path-specific, accurate to the
// real destructured parameters and returned shapes (see each
// function's implementation for the exact fields read/written).
// ============================================================

export interface CreateUserParams {
  displayName:          string
  email:                string
  password:             string
  role:                 string
  status?:              string
  pharmacyId?:          string | null
  regionId?:            string | null
  districtId?:          string | null
  regionIds?:           string[] | null
  assignedPharmacyIds?: string[] | null
  assignedDistrictIds?: string[]
  phone?:               string
  employeeId?:          string
  sendWelcomeEmail?:    boolean
  actorId:              string
  actorRole:            string
}

export interface UserProfileRecord {
  uid:                  string
  displayName:          string
  email:                string
  role:                 string
  status:               string
  active:               boolean
  pharmacyId:           string | null
  regionId:             string | null
  districtId:           string | null
  regionIds:            string[]
  assignedPharmacyIds:  string[] | null
  assignedDistrictIds:  string[]
  phone:                string
  employeeId:           string
  [key: string]:        unknown
}

export declare function createUser(params: CreateUserParams): Promise<UserProfileRecord>

export declare function updateUserProfile(
  uid: string, data: Record<string, unknown>, actorId: string, actorRole: string,
): Promise<void>

export declare function toggleUserStatus(
  uid: string, actorId: string, actorRole: string,
): Promise<void>

export declare function transferUser(
  uid: string, destinationPharmacyId: string, actorId: string, actorRole: string,
): Promise<void>

export declare function promoteBranchManager(
  uid: string, newRole: string, actorId: string, actorRole: string,
): Promise<void>

export declare function emailExistsInFirestore(email: string): Promise<boolean>

export declare function employeeIdExists(
  employeeId: string, excludeUid?: string | null,
): Promise<boolean>

/** Returned shape matches what every consumer in this codebase
 *  actually reads off a roster row (id/displayName/role/active are
 *  always set by createUser()/bulk onboarding; everything else is
 *  whatever additional fields that pharmacist's document happens to
 *  carry). */
export interface PharmacyUserRecord {
  id:           string
  displayName:  string
  role:         string
  active:       boolean
  pharmacyId:   string | null
  email?:       string
  employeeId?:  string
  authStatus?:  string
  [key: string]: unknown
}

export declare function getUsersByPharmacy(pharmacyId: string): Promise<PharmacyUserRecord[]>
