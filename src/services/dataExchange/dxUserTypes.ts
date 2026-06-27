// ============================================================
// Closure Patch Part 7 (revised, follow-up closure patch Part 1) —
// typed wrapper for userService.js.
//
// services/userService.d.ts now declares this module's real exports
// accurately, so importing '../userService' carries zero TS7016. This
// DX-domain-scoped wrapper is kept anyway — it narrows the surface to
// exactly what Data Exchange uses.
// ============================================================

import { createUser as _createUser, transferUser as _transferUser } from '../userService'

export interface CreateUserParams {
  displayName:       string
  email:             string
  password:          string
  role:              string
  status?:           string
  pharmacyId?:       string | null
  regionId?:         string | null
  districtId?:       string | null
  regionIds?:        string[] | null
  phone?:            string
  employeeId?:       string
  sendWelcomeEmail?: boolean
  actorId:           string
  actorRole:         string
}

export interface CreateUserResult {
  uid: string
  [key: string]: unknown
}

export async function createUser(params: CreateUserParams): Promise<CreateUserResult> {
  return _createUser(params)
}

export async function transferUser(
  uid: string, destinationPharmacyId: string, actorId: string, actorRole: string,
): Promise<unknown> {
  return _transferUser(uid, destinationPharmacyId, actorId, actorRole)
}
