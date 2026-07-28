// ============================================================
// Universal AI Intake — Phase 2 In-Memory Repository (tests + local simulator)
//
// A complete, isolated implementation of ConnectorRepository backed
// by plain JS Maps. Used by every connector unit test and by
// scripts/connectorSimulate.mjs — never touches Firestore, never
// requires credentials. This is exactly the "isolated test
// repository" the spec's local-simulation requirement asks for.
// ============================================================

import type { ConnectorRepository, StoredIntakeSession } from './connectorRepository'
import type { IdempotencyRecord } from '../connectorIdempotencyService'
import type { ConnectorAuditRecord } from '../connectorAuditService'

export function createInMemoryConnectorRepository(
  seedReferenceData: Record<string, Array<Record<string, unknown>>> = {},
): ConnectorRepository {
  const sessions = new Map<string, StoredIntakeSession>()
  const seenRequests = new Map<string, string>() // `${clientId}:${requestId}` -> expiresAt
  const idempotency = new Map<string, IdempotencyRecord>()
  const rateBuckets = new Map<string, { count: number; windowStart: number }>()
  const consumedApprovals = new Set<string>()
  const auditLog: ConnectorAuditRecord[] = []

  return {
    // Sessions
    async saveSession(session) { sessions.set(session.job.jobId, session) },
    async getSession(sessionId) { return sessions.get(sessionId) ?? null },
    async listSessions(filter) {
      const all = [...sessions.values()]
      if (!filter?.sourceTypePrefix) return all
      return all.filter((s) => (s.job as any).intakeSourceType?.startsWith(filter.sourceTypePrefix))
    },

    // Replay guard
    async hasSeenRequestId(clientId, requestId) {
      const key = `${clientId}:${requestId}`
      const expiresAt = seenRequests.get(key)
      if (!expiresAt) return false
      return new Date(expiresAt).getTime() > Date.now()
    },
    async recordRequestId(clientId, requestId, expiresAt) {
      seenRequests.set(`${clientId}:${requestId}`, expiresAt)
    },

    // Idempotency
    async getIdempotencyRecord(key) { return idempotency.get(key) ?? null },
    async putIdempotencyRecord(record) { idempotency.set(record.key, record) },

    // Rate limiting (fixed-window, sufficient for this scope)
    async incrementAndGet(bucketKey, windowMs, now) {
      const bucket = rateBuckets.get(bucketKey)
      if (!bucket || now - bucket.windowStart >= windowMs) {
        rateBuckets.set(bucketKey, { count: 1, windowStart: now })
        return 1
      }
      bucket.count += 1
      return bucket.count
    },

    // Approval single-use
    async isApprovalConsumed(approvalId) { return consumedApprovals.has(approvalId) },
    async markApprovalConsumed(approvalId) { consumedApprovals.add(approvalId) },

    // Audit
    async writeAuditRecord(record) { auditLog.push(record) },

    // Reference data
    async getReferenceRecords(referenceType, opts) {
      let records = seedReferenceData[referenceType] ?? []
      if (opts.exactCode) records = records.filter((r) => r.code === opts.exactCode)
      if (opts.searchText) {
        const needle = opts.searchText.toLowerCase()
        records = records.filter((r) => JSON.stringify(r).toLowerCase().includes(needle))
      }
      return records.slice(0, opts.limit ?? 50)
    },

    // Test/debug helpers (not part of the interface, attached for
    // the local simulator's "inspect audit events" requirement)
    ...{ _auditLog: auditLog } as any,
  }
}
