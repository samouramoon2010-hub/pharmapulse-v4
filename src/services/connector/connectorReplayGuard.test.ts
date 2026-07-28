import { describe, it, expect } from 'vitest'
import { assertNotReplayed } from './connectorReplayGuard'
import { ConnectorFailure } from './connectorTypes'

function makeStore() {
  const seen = new Set<string>()
  return {
    hasSeenRequestId: async (clientId: string, requestId: string) => seen.has(`${clientId}:${requestId}`),
    recordRequestId: async (clientId: string, requestId: string) => { seen.add(`${clientId}:${requestId}`) },
  }
}

describe('Replay protection', () => {
  const now = Date.now()

  it('allows a fresh, unseen request', async () => {
    const store = makeStore()
    await expect(assertNotReplayed({ clientId: 'c1', requestId: 'r1', timestamp: new Date(now).toISOString() }, store, { now }))
      .resolves.toBeUndefined()
  })

  it('rejects a reused requestId (replay)', async () => {
    const store = makeStore()
    const input = { clientId: 'c1', requestId: 'r1', timestamp: new Date(now).toISOString() }
    await assertNotReplayed(input, store, { now })
    await expect(assertNotReplayed(input, store, { now })).rejects.toThrow(/replay/i)
  })

  it('rejects an expired request beyond max age', async () => {
    const store = makeStore()
    const old = new Date(now - 10 * 60_000).toISOString() // 10 min old, default max 5 min
    await expect(assertNotReplayed({ clientId: 'c1', requestId: 'r2', timestamp: old }, store, { now }))
      .rejects.toThrow(ConnectorFailure)
  })

  it('rejects a future-dated request beyond clock skew tolerance', async () => {
    const store = makeStore()
    const future = new Date(now + 5 * 60_000).toISOString() // 5 min future, default max skew 60s
    await expect(assertNotReplayed({ clientId: 'c1', requestId: 'r3', timestamp: future }, store, { now }))
      .rejects.toThrow(ConnectorFailure)
  })

  it('rejects a malformed timestamp', async () => {
    const store = makeStore()
    await expect(assertNotReplayed({ clientId: 'c1', requestId: 'r4', timestamp: 'not-a-date' }, store, { now }))
      .rejects.toThrow(/timestamp/i)
  })

  it('different clients can reuse the same requestId independently', async () => {
    const store = makeStore()
    const ts = new Date(now).toISOString()
    await assertNotReplayed({ clientId: 'client-A', requestId: 'shared-id', timestamp: ts }, store, { now })
    await expect(assertNotReplayed({ clientId: 'client-B', requestId: 'shared-id', timestamp: ts }, store, { now }))
      .resolves.toBeUndefined()
  })
})
