import { describe, it, expect } from 'vitest'
import { MCP_TOOL_MANIFEST } from './connectorToolRegistry'
import { CONNECTOR_TOOL_NAMES } from './connectorTypes'

describe('MCP tool manifest', () => {
  it('defines all 8 required tools', () => {
    const names = MCP_TOOL_MANIFEST.map((t) => t.name).sort()
    expect(names).toEqual([...CONNECTOR_TOOL_NAMES].sort())
  })

  it('every tool is destructive: false', () => {
    for (const tool of MCP_TOOL_MANIFEST) {
      expect(tool.destructive).toBe(false)
    }
  })

  it('approve and execute require explicit confirmation', () => {
    const approve = MCP_TOOL_MANIFEST.find((t) => t.name === 'pharmapulse_approve_intake_session')
    const execute = MCP_TOOL_MANIFEST.find((t) => t.name === 'pharmapulse_execute_intake_session')
    expect(approve?.requiresConfirmation).toBe(true)
    expect(execute?.requiresConfirmation).toBe(true)
  })

  it('create, approve, and execute require an idempotency key', () => {
    for (const name of ['pharmapulse_create_intake_session', 'pharmapulse_approve_intake_session', 'pharmapulse_execute_intake_session']) {
      const tool = MCP_TOOL_MANIFEST.find((t) => t.name === name)
      expect(tool?.requiresIdempotencyKey).toBe(true)
    }
  })

  it('read-only tools (status, preview, reference) do not require an idempotency key', () => {
    for (const name of ['pharmapulse_get_intake_status', 'pharmapulse_get_intake_preview', 'pharmapulse_get_reference_data']) {
      const tool = MCP_TOOL_MANIFEST.find((t) => t.name === name)
      expect(tool?.requiresIdempotencyKey).toBe(false)
    }
  })

  it('every tool declares a non-empty required scope from the approved scope list', () => {
    const APPROVED = ['intake:create', 'intake:read', 'intake:validate', 'intake:approve', 'intake:execute', 'intake:cancel', 'reference:read']
    for (const tool of MCP_TOOL_MANIFEST) {
      expect(APPROVED).toContain(tool.requiredScope)
    }
  })

  it('no delete/user-admin/role-management/permission-management/system-reset scope exists anywhere in the manifest', () => {
    const forbidden = /delete|user-admin|role-management|permission-management|system-reset|factory-reset/i
    for (const tool of MCP_TOOL_MANIFEST) {
      expect(tool.requiredScope).not.toMatch(forbidden)
    }
  })

  it('all tools support only the Phase 1 domains (no Smart List / Item-level / Evaluation Profiles)', () => {
    for (const tool of MCP_TOOL_MANIFEST) {
      expect(tool.supportedEntityTypes).not.toContain('SMART_LIST')
      expect(tool.supportedEntityTypes).not.toContain('ITEM_SALES')
      expect(tool.supportedEntityTypes).not.toContain('EVALUATION_PROFILE')
    }
  })
})
