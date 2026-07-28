// ============================================================
// Universal AI Intake — Phase 2 Idempotency
//
// Required for session creation, approval, and execution. Behavior:
//   - same key + same payload hash  -> return the original result
//   - same key + different payload  -> IDEMPOTENCY_CONFLICT
//   - no prior record               -> caller proceeds, then persists
// The store is injected so the same logic runs in tests (in-memory)
// and production (Firestore).
// ============================================================

import { createHash } from 'crypto'
import { ConnectorFailure } from './connectorTypes'

export interface IdempotencyRecord {
  key:         string
  payloadHash: string
  result:      unknown
  createdAt:   string
}

export interface IdempotencyStore {
  getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null>
  putIdempotencyRecord(record: IdempotencyRecord): Promise<void>
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

/**
 * Wraps an operation with idempotency-key semantics. `execute` is only
 * invoked when no prior record exists for this key.
 */
export async function withIdempotency<T>(
  key:     string,
  payload: unknown,
  store:   IdempotencyStore,
  execute: () => Promise<T>,
): Promise<T> {
  const payloadHash = hashPayload(payload)
  const existing = await store.getIdempotencyRecord(key)

  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new ConnectorFailure({
        code: 'IDEMPOTENCY_CONFLICT',
        message: `Idempotency key "${key}" was already used with a different payload`,
        retryable: false,
      })
    }
    return existing.result as T
  }

  const result = await execute()
  await store.putIdempotencyRecord({ key, payloadHash, result, createdAt: new Date().toISOString() })
  return result
}
