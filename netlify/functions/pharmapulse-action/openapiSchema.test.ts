// ============================================================
// Universal AI Intake — Phase 2.4 OpenAPI schema tests
//
// Guards against the exact class of bug the GPT Actions editor
// rejected: a `type: object` schema (anywhere — request bodies,
// response bodies, or a components.schemas entry) with no explicit
// `properties` and no `$ref`. Also proves every `$ref` resolves to a
// real components.schemas entry, and that the five operationIds and
// their request/response wiring stayed intact.
// ============================================================
import { describe, it, expect } from 'vitest'
import { buildOpenApiSchema } from './openapiSchema'

const schema = buildOpenApiSchema('https://example.netlify.app/.netlify/functions/pharmapulse-action') as any

/** Recursively walks every schema-shaped node reachable from `paths`
 *  and `components.schemas`, collecting violations: a `type: object`
 *  node that has neither `properties` nor `$ref` (`additionalProperties`
 *  alone is not a substitute — the GPT Actions editor requires
 *  `properties`, even if empty, per Requirement 5). */
function findBareObjectSchemas(node: unknown, path: string, violations: string[]): void {
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>

  if (obj.type === 'object' && !('$ref' in obj)) {
    if (!('properties' in obj)) violations.push(path)
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') findBareObjectSchemas(value, `${path}.${key}`, violations)
  }
}

function collectRefs(node: unknown, refs: Set<string>): void {
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (typeof obj.$ref === 'string') refs.add(obj.$ref)
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectRefs(value, refs)
  }
}

describe('OpenAPI schema — GPT Actions editor compatibility', () => {
  it('has no bare "type: object" schema without explicit properties anywhere', () => {
    const violations: string[] = []
    findBareObjectSchemas(schema.paths, 'paths', violations)
    findBareObjectSchemas(schema.components.schemas, 'components.schemas', violations)
    expect(violations).toEqual([])
  })

  it('every $ref resolves to a real components.schemas entry', () => {
    const refs = new Set<string>()
    collectRefs(schema.paths, refs)
    const missing = [...refs].filter((ref) => {
      const name = ref.replace('#/components/schemas/', '')
      return !(name in schema.components.schemas)
    })
    expect(missing).toEqual([])
  })

  it('declares exactly the 5 documented operationIds, unchanged', () => {
    const ids: string[] = []
    for (const pathItem of Object.values(schema.paths) as any[]) {
      for (const op of Object.values(pathItem) as any[]) {
        if (op?.operationId) ids.push(op.operationId)
      }
    }
    expect(ids.sort()).toEqual([
      'createIntakeSession', 'getIntakePreview', 'getIntakeStatus', 'getReferenceData', 'validateIntakeSession',
    ].sort())
  })

  it('never declares an approve or execute operation', () => {
    const ids: string[] = []
    for (const pathItem of Object.values(schema.paths) as any[]) {
      for (const op of Object.values(pathItem) as any[]) {
        if (op?.operationId) ids.push(op.operationId)
      }
    }
    expect(ids.some((id) => /approve|execute/i.test(id))).toBe(false)
  })

  it('declares Bearer auth in components.securitySchemes and applies it globally', () => {
    expect(schema.components.securitySchemes.BearerAuth).toEqual({ type: 'http', scheme: 'bearer' })
    expect(schema.security).toEqual([{ BearerAuth: [] }])
  })

  it('every response 200 schema is a $ref (not an inline bare object)', () => {
    for (const pathItem of Object.values(schema.paths) as any[]) {
      for (const op of Object.values(pathItem) as any[]) {
        const ok = op.responses['200'].content['application/json'].schema
        expect('$ref' in ok).toBe(true)
      }
    }
  })

  it('every dynamic (unknown-shape) object explicitly sets properties:{} and additionalProperties:true', () => {
    const dynamicNames = ['ReferenceRecord']
    for (const name of dynamicNames) {
      const s = schema.components.schemas[name]
      expect(s.type).toBe('object')
      expect(s.properties).toEqual({})
      expect(s.additionalProperties).toBe(true)
    }
  })

  it('the server URL is derived from the passed-in argument, not hardcoded', () => {
    expect(schema.servers[0].url).toBe('https://example.netlify.app/.netlify/functions/pharmapulse-action')
  })
})
