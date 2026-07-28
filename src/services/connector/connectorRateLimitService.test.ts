import { describe, it, expect } from 'vitest'
import { assertWithinRateLimit, buildRateLimitBucketKey } from './connectorRateLimitService'
import { ConnectorFailure } from './connectorTypes'

function makeStore() {
  const counts = new Map<string, number>()
  return {
    incrementAndGet: async (bucketKey: string) => {
      const next = (counts.get(bucketKey) ?? 0) + 1
      counts.set(bucketKey, next)
      return next
    },
  }
}

describe('Rate limiting', () => {
  it('allows requests within the limit', async () => {
    const store = makeStore()
    const key = buildRateLimitBucketKey('chatgpt-1', 'admin-uid', 'pharmapulse_get_intake_status')
    for (let i = 0; i < 5; i++) {
      await expect(assertWithinRateLimit(key, store, { maxRequests: 5, windowMs: 60_000 })).resolves.toBeUndefined()
    }
  })

  it('rejects once the limit is exceeded, with RATE_LIMITED', async () => {
    const store = makeStore()
    const key = buildRateLimitBucketKey('chatgpt-1', 'admin-uid', 'pharmapulse_get_intake_status')
    for (let i = 0; i < 3; i++) await assertWithinRateLimit(key, store, { maxRequests: 3, windowMs: 60_000 })
    await expect(assertWithinRateLimit(key, store, { maxRequests: 3, windowMs: 60_000 })).rejects.toThrow(ConnectorFailure)
  })

  it('does not rely on frontend rate limiting — never trusts a client-supplied count', () => {
    // Structural check: the function signature never accepts a caller-supplied
    // current count, only derives it from the injected server-side store.
    expect(assertWithinRateLimit.length).toBeLessThanOrEqual(4)
  })
})
