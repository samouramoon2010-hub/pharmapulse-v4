// ============================================================
// Universal AI Intake — Phase 2.2 MCP Schema Validator (Layer 1)
//
// A light structural check (required fields present, basic type
// checks, request-limit ceilings) run against a tool's `arguments`
// BEFORE dispatching to the existing connector pipeline. This is
// deliberately shallow — it never re-implements entity validation,
// normalization, or duplicate-detection rules (those remain 100% in
// Phase 1's adapters, reached via dispatchConnectorTool() -> Layer 2).
// Its only job is to reject structurally malformed MCP tool calls
// early, with a clear, MCP-visible error, and to enforce the
// request-limit ceilings from mcpToolSchemas.ts (never silently
// truncates — always rejects with a structured error instead).
// ============================================================

import { getInputSchema, MCP_LIMITS } from './mcpToolSchemas'
import type { JsonSchemaObject } from './mcpTypes'

export interface McpValidationError {
  field:   string
  message: string
}

export interface McpValidationResult {
  valid:  boolean
  errors: McpValidationError[]
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function validateToolArguments(toolName: string, args: unknown): McpValidationResult {
  const schema = getInputSchema(toolName)
  if (!schema) {
    return { valid: false, errors: [{ field: '(tool)', message: `No input schema registered for tool "${toolName}"` }] }
  }

  const errors: McpValidationError[] = []
  const obj = (args && typeof args === 'object' && !Array.isArray(args)) ? (args as Record<string, unknown>) : null

  if (!obj) {
    return { valid: false, errors: [{ field: '(arguments)', message: 'Tool arguments must be a JSON object' }] }
  }

  for (const requiredField of schema.required ?? []) {
    if (!(requiredField in obj) || obj[requiredField] === undefined) {
      errors.push({ field: requiredField, message: `Missing required field "${requiredField}"` })
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(obj)) {
      if (!(key in schema.properties)) {
        errors.push({ field: key, message: `Unknown field "${key}" is not permitted by this tool's schema` })
      }
    }
  }

  for (const [field, value] of Object.entries(obj)) {
    const fieldSchema = (schema.properties as Record<string, any>)[field]
    if (!fieldSchema || value === undefined) continue
    const expected = fieldSchema.type
    if (expected && typeOf(value) !== expected) {
      errors.push({ field, message: `Field "${field}" must be of type "${expected}", got "${typeOf(value)}"` })
      continue
    }
    if (expected === 'number' && typeof fieldSchema.maximum === 'number' && (value as number) > fieldSchema.maximum) {
      errors.push({ field, message: `Field "${field}" exceeds the maximum allowed value (${fieldSchema.maximum})` })
    }
    if (expected === 'array' && typeof fieldSchema.maxItems === 'number' && (value as unknown[]).length > fieldSchema.maxItems) {
      errors.push({ field, message: `Field "${field}" exceeds the maximum allowed item count (${fieldSchema.maxItems}) — split the import into multiple sessions instead of a single oversized request` })
    }
  }

  // Row-level required-field check for create-session (clientRowId/rawValues) —
  // still shallow structural validation, not business validation.
  if (toolName === 'pharmapulse_create_intake_session' && Array.isArray((obj as any).rows)) {
    (obj as any).rows.forEach((row: unknown, i: number) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        errors.push({ field: `rows[${i}]`, message: 'Each row must be a JSON object' })
        return
      }
      const r = row as Record<string, unknown>
      if (typeof r.clientRowId !== 'string' || !r.clientRowId) errors.push({ field: `rows[${i}].clientRowId`, message: 'Missing required field "clientRowId"' })
      if (!r.rawValues || typeof r.rawValues !== 'object' || Array.isArray(r.rawValues)) errors.push({ field: `rows[${i}].rawValues`, message: 'Missing required field "rawValues"' })
    })
  }

  return { valid: errors.length === 0, errors }
}

export { MCP_LIMITS }
export type { JsonSchemaObject }
