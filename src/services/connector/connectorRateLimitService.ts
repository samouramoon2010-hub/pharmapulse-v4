// ============================================================
// Universal AI Intake — Phase 2 Rate Limiting
//
// Sliding-window counter keyed by connector client ID + mapped admin
// identity + tool name. Store is injected (in-memory for tests,
// persistent for production) — never relies on the frontend.
// ============================================================

import { ConnectorFailure } from './connectorTypes'

export interface RateLimitStore {
  incrementAndGet(bucketKey: string, windowMs: number, now: number): Promise<number>
}

export interface RateLimitOptions {
  maxRequests: number
  windowMs:    number
}

// Conservative default: 30 requests per client+tool per minute.
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { maxRequests: 30, windowMs: 60_000 }

export function buildRateLimitBucketKey(clientId: string, adminUid: string, tool: string): string {
  return `${clientId}:${adminUid}:${tool}`
}

export async function assertWithinRateLimit(
  bucketKey: string,
  store:     RateLimitStore,
  options:   RateLimitOptions = DEFAULT_RATE_LIMIT,
  now = Date.now(),
): Promise<void> {
  const count = await store.incrementAndGet(bucketKey, options.windowMs, now)
  if (count > options.maxRequests) {
    throw new ConnectorFailure({
      code: 'RATE_LIMITED',
      message: `Rate limit exceeded for "${bucketKey}" (${options.maxRequests} requests / ${options.windowMs}ms)`,
      retryable: true,
    })
  }
}
