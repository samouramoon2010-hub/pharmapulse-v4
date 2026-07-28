// ============================================================
// Universal AI Intake — Phase 2 Replay Protection
//
// Every signed request must carry a requestId + timestamp. This
// module rejects reused requestIds, expired requests, and
// future-dated requests beyond the allowed clock skew. The actual
// "seen requestId" store is injected (ConnectorRepository) so the
// same logic runs against an in-memory store in tests and a
// persistent store in production.
// ============================================================

import { ConnectorFailure } from './connectorTypes'

export interface ReplayCheckInput {
  clientId:   string
  requestId:  string
  timestamp:  string   // ISO
}

export interface SeenRequestStore {
  hasSeenRequestId(clientId: string, requestId: string): Promise<boolean>
  recordRequestId(clientId: string, requestId: string, expiresAt: string): Promise<void>
}

export interface ReplayGuardOptions {
  maxAgeSeconds?:      number   // default 300 (5 min)
  maxClockSkewSeconds?: number  // default 60
  now?:                number   // for tests
}

export async function assertNotReplayed(
  input: ReplayCheckInput,
  store: SeenRequestStore,
  options: ReplayGuardOptions = {},
): Promise<void> {
  const maxAge = options.maxAgeSeconds ?? 300
  const maxSkew = options.maxClockSkewSeconds ?? 60
  const nowMs = options.now ?? Date.now()

  const requestMs = Date.parse(input.timestamp)
  if (Number.isNaN(requestMs)) {
    throw new ConnectorFailure({ code: 'INVALID_PAYLOAD', message: 'Malformed request timestamp', retryable: false })
  }

  if (requestMs < nowMs - maxAge * 1000) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Request expired', retryable: false })
  }
  if (requestMs > nowMs + maxSkew * 1000) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Request timestamp is too far in the future', retryable: false })
  }

  const alreadySeen = await store.hasSeenRequestId(input.clientId, input.requestId)
  if (alreadySeen) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Request has already been processed (replay detected)', retryable: false })
  }

  const expiresAt = new Date(nowMs + maxAge * 1000).toISOString()
  await store.recordRequestId(input.clientId, input.requestId, expiresAt)
}
