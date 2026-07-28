import { describe, it, expect } from 'vitest'
import { issueConnectorToken, verifyConnectorToken } from './connectorTokenService'
import { ConnectorFailure } from './connectorTypes'

const BASE = { audience: 'pharmapulse-connector', issuer: 'pharmapulse', secret: 'test-secret-do-not-use-in-prod' }

describe('Connector auth tokens', () => {
  it('issues and verifies a valid token, round-tripping claims', () => {
    const token = issueConnectorToken({ clientId: 'chatgpt-1', scopes: ['intake:create'], ttlSeconds: 300, ...BASE })
    const claims = verifyConnectorToken({ token, ...BASE })
    expect(claims.sub).toBe('chatgpt-1')
    expect(claims.scope).toEqual(['intake:create'])
  })

  it('rejects an expired token', () => {
    const now = Math.floor(Date.now() / 1000)
    const token = issueConnectorToken({ clientId: 'c1', scopes: ['intake:read'], ttlSeconds: 60, now: now - 120, ...BASE })
    expect(() => verifyConnectorToken({ token, now, ...BASE })).toThrow(ConnectorFailure)
  })

  it('rejects an audience mismatch', () => {
    const token = issueConnectorToken({ clientId: 'c1', scopes: ['intake:read'], ttlSeconds: 300, ...BASE })
    expect(() => verifyConnectorToken({ token, ...BASE, audience: 'wrong-audience' })).toThrow(/audience/)
  })

  it('rejects an issuer mismatch', () => {
    const token = issueConnectorToken({ clientId: 'c1', scopes: ['intake:read'], ttlSeconds: 300, ...BASE })
    expect(() => verifyConnectorToken({ token, ...BASE, issuer: 'someone-else' })).toThrow(/issuer/)
  })

  it('rejects a tampered signature', () => {
    const token = issueConnectorToken({ clientId: 'c1', scopes: ['intake:read'], ttlSeconds: 300, ...BASE })
    const tampered = token.slice(0, -2) + 'xx'
    expect(() => verifyConnectorToken({ token: tampered, ...BASE })).toThrow(ConnectorFailure)
  })

  it('rejects a malformed token', () => {
    expect(() => verifyConnectorToken({ token: 'not-a-real-token', ...BASE })).toThrow(ConnectorFailure)
  })

  it('rejects missing required scope', () => {
    const token = issueConnectorToken({ clientId: 'c1', scopes: ['intake:read'], ttlSeconds: 300, ...BASE })
    expect(() => verifyConnectorToken({ token, ...BASE, requiredScopes: ['intake:execute'] })).toThrow(/scope/)
  })

  it('allows a token that carries the required scope among several', () => {
    const token = issueConnectorToken({ clientId: 'c1', scopes: ['intake:read', 'intake:execute'], ttlSeconds: 300, ...BASE })
    expect(() => verifyConnectorToken({ token, ...BASE, requiredScopes: ['intake:execute'] })).not.toThrow()
  })
})
