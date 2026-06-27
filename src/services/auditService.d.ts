// ============================================================
// Type declaration for services/auditService.js (DX-2/DX-3 Closure
// Patch Part 1 — TypeScript closure). Path-specific, accurate to the
// real exports and call shape used by every consumer in this
// codebase (see logAction's destructured parameter list).
// ============================================================

export declare const AUDIT_ACTION: {
  LOGIN:        string
  LOGOUT:       string
  CREATE:       string
  UPDATE:       string
  DELETE:       string
  APPROVE:      string
  REJECT:       string
  IMPORT:       string
  EXPORT:       string
  BULK_APPROVE: string
}

export interface LogActionParams {
  action:      string
  collection?: string | null
  docId?:      string | null
  userId?:     string | null
  userRole?:   string | null
  before?:     unknown
  after?:      unknown
  meta?:       Record<string, unknown>
}

export declare function logAction(params: LogActionParams): Promise<void>

export interface SubscribeAuditLogsOptions {
  n?:      number
  userId?: string
  col?:    string
}

export interface AuditLogEntry {
  id: string
  [key: string]: unknown
}

export declare function subscribeAuditLogs(
  options?: SubscribeAuditLogsOptions,
): (callback: (logs: AuditLogEntry[]) => void) => () => void
