import { describe, it, expect, vi } from 'vitest'
import { withIdempotency } from './connectorIdempotencyService'
import { ConnectorFailure } from './connectorTypes'

function makeStore() {
  const records = new Map()
  return {
    getIdempotencyRecord: async (key: string) => records.get(key) ?? null,
    putIdempotencyRecord: async (record: any) => { records.set(record.key, record) },
  }
}

describe('Idempotency', () => {
  it('same key + same payload returns the original result without re-executing', async () => {
    const store = makeStore()
    const execute = vi.fn(async () => ({ ok: true, n: 1 }))
    const first = await withIdempotency('key-1', { a: 1 }, store, execute)
    const second = await withIdempotency('key-1', { a: 1 }, store, execute)
    expect(second).toEqual(first)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('same key + different payload throws IDEMPOTENCY_CONFLICT', async () => {
    const store = makeStore()
    await withIdempotency('key-2', { a: 1 }, store, async () => ({ ok: true }))
    await expect(withIdempotency('key-2', { a: 2 }, store, async () => ({ ok: true })))
      .rejects.toThrow(ConnectorFailure)
  })

  it('different keys execute independently', async () => {
    const store = makeStore()
    const execute = vi.fn(async () => ({ n: Math.random() }))
    await withIdempotency('key-a', {}, store, execute)
    await withIdempotency('key-b', {}, store, execute)
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
