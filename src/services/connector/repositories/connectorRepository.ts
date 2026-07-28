// ============================================================
// Universal AI Intake — Phase 2 Repository Interface
//
// Everything the connector's tool handlers need from persistence,
// behind one interface. Two implementations exist:
//   - inMemoryConnectorRepository.ts (tests, local simulator)
//   - netlify/lib/firestoreConnectorRepository.ts (production,
//     firebase-admin-backed, lives OUTSIDE src/ so Vite's client
//     build never touches firebase-admin)
// No business logic here — pure storage contract.
// ============================================================

import type { SeenRequestStore } from '../connectorReplayGuard'
import type { IdempotencyStore } from '../connectorIdempotencyService'
import type { RateLimitStore } from '../connectorRateLimitService'
import type { ConsumedApprovalStore } from '../connectorApprovalService'
import type { ConnectorAuditSink } from '../connectorAuditService'
import type { ImportJob, StagedImportRow } from '../../dataExchange/importJobTypes'

export interface StoredIntakeSession {
  job:  ImportJob
  rows: StagedImportRow<unknown>[]
}

export interface ConnectorRepository
  extends SeenRequestStore, IdempotencyStore, RateLimitStore, ConsumedApprovalStore, ConnectorAuditSink {

  saveSession(session: StoredIntakeSession): Promise<void>
  getSession(sessionId: string): Promise<StoredIntakeSession | null>
  listSessions(filter?: { sourceTypePrefix?: string }): Promise<StoredIntakeSession[]>

  /** Minimal, field-limited reference reads — never the full document. */
  getReferenceRecords(referenceType: string, opts: { exactCode?: string; searchText?: string; limit?: number }): Promise<Array<Record<string, unknown>>>
}
