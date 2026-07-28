import { describe, it, expect } from 'vitest'
import { buildMcpToolDescriptors, getInputSchema, MCP_LIMITS } from './mcpToolSchemas'
import { CONNECTOR_TOOL_NAMES } from '../connectorTypes'

describe('buildMcpToolDescriptors', () => {
  it('returns exactly the 8 existing connector tools, no more, no fewer', () => {
    const descriptors = buildMcpToolDescriptors()
    expect(descriptors).toHaveLength(8)
    expect(descriptors.map((d) => d.name).sort()).toEqual([...CONNECTOR_TOOL_NAMES].sort())
  })

  it('every tool is classified non-destructive', () => {
    const descriptors = buildMcpToolDescriptors()
    expect(descriptors.every((d) => d._meta.destructive === false)).toBe(true)
  })

  it('every tool has a real object-typed inputSchema', () => {
    const descriptors = buildMcpToolDescriptors()
    for (const d of descriptors) {
      expect(d.inputSchema.type).toBe('object')
      expect(typeof d.inputSchema.properties).toBe('object')
    }
  })

  it('does not add any tool beyond the existing 8 (no new business tools)', () => {
    const descriptors = buildMcpToolDescriptors()
    for (const d of descriptors) expect((CONNECTOR_TOOL_NAMES as readonly string[])).toContain(d.name)
  })
})

describe('getInputSchema', () => {
  it('returns undefined for an unknown tool name', () => {
    expect(getInputSchema('pharmapulse_delete_everything')).toBeUndefined()
  })

  it('enforces request-limit ceilings on rows/limit fields', () => {
    const createSchema = getInputSchema('pharmapulse_create_intake_session') as any
    expect(createSchema.properties.rows.maxItems).toBe(MCP_LIMITS.MAX_ROWS_PER_CREATE)
    const previewSchema = getInputSchema('pharmapulse_get_intake_preview') as any
    expect(previewSchema.properties.limit.maximum).toBe(MCP_LIMITS.MAX_PREVIEW_PAGE_SIZE)
    const refSchema = getInputSchema('pharmapulse_get_reference_data') as any
    expect(refSchema.properties.limit.maximum).toBe(MCP_LIMITS.MAX_REFERENCE_RESULT_SIZE)
  })
})
