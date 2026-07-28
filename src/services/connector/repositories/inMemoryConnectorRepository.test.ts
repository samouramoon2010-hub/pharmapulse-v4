import { describe, it, expect } from 'vitest'
import { createInMemoryConnectorRepository } from './inMemoryConnectorRepository'

describe('In-memory connector repository', () => {
  it('stores and retrieves a session by id', async () => {
    const repo = createInMemoryConnectorRepository()
    const job: any = { jobId: 'job-1', domain: 'REGION', status: 'READY' }
    await repo.saveSession({ job, rows: [] })
    const found = await repo.getSession('job-1')
    expect(found?.job.jobId).toBe('job-1')
  })

  it('returns null for an unknown session', async () => {
    const repo = createInMemoryConnectorRepository()
    expect(await repo.getSession('nope')).toBeNull()
  })

  it('filters listSessions by intakeSourceType prefix', async () => {
    const repo = createInMemoryConnectorRepository()
    await repo.saveSession({ job: { jobId: 'a', intakeSourceType: 'chatgpt_structured' } as any, rows: [] })
    await repo.saveSession({ job: { jobId: 'b', intakeSourceType: 'excel_extracted' } as any, rows: [] })
    const chatgptOnly = await repo.listSessions({ sourceTypePrefix: 'chatgpt' })
    expect(chatgptOnly).toHaveLength(1)
    expect(chatgptOnly[0].job.jobId).toBe('a')
  })

  it('replay guard: unseen then seen', async () => {
    const repo = createInMemoryConnectorRepository()
    expect(await repo.hasSeenRequestId('c1', 'r1')).toBe(false)
    await repo.recordRequestId('c1', 'r1', new Date(Date.now() + 60_000).toISOString())
    expect(await repo.hasSeenRequestId('c1', 'r1')).toBe(true)
  })

  it('idempotency get/put round-trips', async () => {
    const repo = createInMemoryConnectorRepository()
    expect(await repo.getIdempotencyRecord('k1')).toBeNull()
    await repo.putIdempotencyRecord({ key: 'k1', payloadHash: 'h', result: { ok: true }, createdAt: new Date().toISOString() })
    expect((await repo.getIdempotencyRecord('k1'))?.result).toEqual({ ok: true })
  })

  it('rate limit counter increments within a window and resets after it', async () => {
    const repo = createInMemoryConnectorRepository()
    const now = 1_000_000
    expect(await repo.incrementAndGet('bucket', 1000, now)).toBe(1)
    expect(await repo.incrementAndGet('bucket', 1000, now + 100)).toBe(2)
    expect(await repo.incrementAndGet('bucket', 1000, now + 2000)).toBe(1) // new window
  })

  it('approval consumption is tracked', async () => {
    const repo = createInMemoryConnectorRepository()
    expect(await repo.isApprovalConsumed('appr-1')).toBe(false)
    await repo.markApprovalConsumed('appr-1')
    expect(await repo.isApprovalConsumed('appr-1')).toBe(true)
  })

  it('writes audit records', async () => {
    const repo = createInMemoryConnectorRepository()
    await repo.writeAuditRecord({
      connectorClientId: 'c1', mappedAdminUid: 'a1', tool: 'x', requestId: 'r1',
      timestamp: new Date().toISOString(), outcome: 'SUCCESS',
    })
    expect((repo as any)._auditLog).toHaveLength(1)
  })

  it('reference data reads respect exactCode/searchText/limit and never return unseeded fields', async () => {
    const repo = createInMemoryConnectorRepository({
      regions: [{ id: 'r1', code: 'RUH', name: 'Riyadh' }, { id: 'r2', code: 'JED', name: 'Jeddah' }],
    })
    const byCode = await repo.getReferenceRecords('regions', { exactCode: 'RUH' })
    expect(byCode).toEqual([{ id: 'r1', code: 'RUH', name: 'Riyadh' }])
    const bySearch = await repo.getReferenceRecords('regions', { searchText: 'jed' })
    expect(bySearch).toHaveLength(1)
    const limited = await repo.getReferenceRecords('regions', { limit: 1 })
    expect(limited).toHaveLength(1)
  })

  it('unknown reference type returns an empty array, never throws', async () => {
    const repo = createInMemoryConnectorRepository()
    expect(await repo.getReferenceRecords('unknown_type', {})).toEqual([])
  })
})
