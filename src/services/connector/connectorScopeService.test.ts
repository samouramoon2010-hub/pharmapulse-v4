import { describe, it, expect } from 'vitest'
import { assertToolScope, assertAdminMapping } from './connectorScopeService'
import { ConnectorFailure } from './connectorTypes'
import type { ConnectorIdentity } from './connectorTypes'

const ADMIN_IDENTITY: ConnectorIdentity = {
  clientId: 'chatgpt-1', scopes: ['intake:create', 'intake:read'],
  mappedAdminUid: 'admin-uid-1', mappedAdminRole: 'admin',
}

describe('Scope + admin mapping', () => {
  it('allows a tool call when the identity carries the required scope', () => {
    expect(() => assertToolScope(ADMIN_IDENTITY, 'pharmapulse_create_intake_session')).not.toThrow()
  })

  it('rejects a tool call when the required scope is missing', () => {
    expect(() => assertToolScope(ADMIN_IDENTITY, 'pharmapulse_execute_intake_session')).toThrow(ConnectorFailure)
  })

  it('every one of the 8 tools maps to exactly one required scope from the approved list', () => {
    const APPROVED = ['intake:create', 'intake:read', 'intake:validate', 'intake:approve', 'intake:execute', 'intake:cancel', 'reference:read']
    const toolNames: any[] = [
      'pharmapulse_create_intake_session', 'pharmapulse_validate_intake_session', 'pharmapulse_get_intake_preview',
      'pharmapulse_approve_intake_session', 'pharmapulse_execute_intake_session', 'pharmapulse_get_intake_status',
      'pharmapulse_cancel_intake_session', 'pharmapulse_get_reference_data',
    ]
    for (const tool of toolNames) {
      const identity: ConnectorIdentity = { ...ADMIN_IDENTITY, scopes: [] }
      expect(() => assertToolScope(identity, tool)).toThrow(ConnectorFailure)
      // Confirm the required scope (extracted from the thrown message) is one of the approved scopes.
      try { assertToolScope(identity, tool) } catch (e: any) {
        const matched = APPROVED.some((s) => e.error.message.includes(s))
        expect(matched).toBe(true)
      }
    }
  })

  it('rejects an identity not mapped to the protected admin role', () => {
    const notAdmin: ConnectorIdentity = { ...ADMIN_IDENTITY, mappedAdminRole: 'manager' as any }
    expect(() => assertAdminMapping(notAdmin)).toThrow(ConnectorFailure)
  })

  it('rejects an identity with no mapped admin uid (would otherwise allow impersonation)', () => {
    const noUid: ConnectorIdentity = { ...ADMIN_IDENTITY, mappedAdminUid: '' }
    expect(() => assertAdminMapping(noUid)).toThrow(ConnectorFailure)
  })

  it('accepts a properly mapped admin identity', () => {
    expect(() => assertAdminMapping(ADMIN_IDENTITY)).not.toThrow()
  })
})
