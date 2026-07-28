import { describe, it, expect } from 'vitest'
import { issueApprovalToken, verifyApprovalToken, assertApprovalNotConsumed } from './connectorApprovalService'
import { ConnectorFailure } from './connectorTypes'

const SECRET = 'approval-test-secret'

function makeConsumedStore(consumed: Set<string> = new Set()) {
  return {
    isApprovalConsumed: async (id: string) => consumed.has(id),
    markApprovalConsumed: async (id: string) => { consumed.add(id) },
  }
}

describe('Approval tokens', () => {
  it('issues and verifies a valid approval token bound to sessionId + previewSignature', () => {
    const issued = issueApprovalToken({
      sessionId: 'job-1', previewSignature: 'sig-abc', approvedRowIds: ['r1', 'r2'], excludedRowIds: [],
      ttlSeconds: 300, secret: SECRET,
    })
    const claims = verifyApprovalToken({ token: issued.token, sessionId: 'job-1', currentPreviewSignature: 'sig-abc', secret: SECRET })
    expect(claims.approvedRowIds).toEqual(['r1', 'r2'])
  })

  it('rejects an expired approval token', () => {
    const now = Math.floor(Date.now() / 1000)
    const issued = issueApprovalToken({
      sessionId: 'job-1', previewSignature: 'sig-abc', approvedRowIds: [], excludedRowIds: [],
      ttlSeconds: 60, secret: SECRET, now: now - 120,
    })
    expect(() => verifyApprovalToken({ token: issued.token, sessionId: 'job-1', currentPreviewSignature: 'sig-abc', secret: SECRET, now }))
      .toThrow(/expired/i)
  })

  it('rejects an approval token used against the wrong session', () => {
    const issued = issueApprovalToken({
      sessionId: 'job-1', previewSignature: 'sig-abc', approvedRowIds: [], excludedRowIds: [],
      ttlSeconds: 300, secret: SECRET,
    })
    expect(() => verifyApprovalToken({ token: issued.token, sessionId: 'job-2', currentPreviewSignature: 'sig-abc', secret: SECRET }))
      .toThrow(ConnectorFailure)
  })

  it('invalidates the token when the preview signature changed since approval (session mutated after approve)', () => {
    const issued = issueApprovalToken({
      sessionId: 'job-1', previewSignature: 'sig-abc', approvedRowIds: [], excludedRowIds: [],
      ttlSeconds: 300, secret: SECRET,
    })
    expect(() => verifyApprovalToken({ token: issued.token, sessionId: 'job-1', currentPreviewSignature: 'sig-CHANGED', secret: SECRET }))
      .toThrow(/changed after approval/i)
  })

  it('rejects a tampered approval token', () => {
    const issued = issueApprovalToken({
      sessionId: 'job-1', previewSignature: 'sig-abc', approvedRowIds: [], excludedRowIds: [],
      ttlSeconds: 300, secret: SECRET,
    })
    const tampered = issued.token.slice(0, -2) + 'zz'
    expect(() => verifyApprovalToken({ token: tampered, sessionId: 'job-1', currentPreviewSignature: 'sig-abc', secret: SECRET }))
      .toThrow(ConnectorFailure)
  })

  it('single-use: a consumed approval id is rejected on a second execute attempt', async () => {
    const issued = issueApprovalToken({
      sessionId: 'job-1', previewSignature: 'sig-abc', approvedRowIds: [], excludedRowIds: [],
      ttlSeconds: 300, secret: SECRET,
    })
    const store = makeConsumedStore()
    await assertApprovalNotConsumed(issued.approvalId, store, 'job-1') // first use: fine
    await store.markApprovalConsumed(issued.approvalId)
    await expect(assertApprovalNotConsumed(issued.approvalId, store, 'job-1')).rejects.toThrow(/APPROVAL_ALREADY_USED|already been used/i)
  })
})
