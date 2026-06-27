// ============================================================
// Closure Patch Part 7 (revised, follow-up closure patch Part 1) —
// typed wrapper for auditService.js.
//
// services/auditService.d.ts now declares this module's real exports
// accurately, so importing '../auditService' carries zero TS7016.
// This DX-domain-scoped wrapper is kept anyway so a consumer that only
// needs logAction doesn't read as depending on userService/
// pharmacyService too.
// ============================================================

import { logAction as _logAction, AUDIT_ACTION as _AUDIT_ACTION } from '../auditService'

export const AUDIT_ACTION: Record<string, string> = _AUDIT_ACTION

export interface LogActionParams {
  action:      string
  collection?: string | null
  docId?:      string | null
  userId:      string
  userRole:    string
  before?:     unknown
  after?:      unknown
  meta?:       Record<string, unknown>
}

export async function logAction(params: LogActionParams): Promise<void> {
  return _logAction(params)
}
