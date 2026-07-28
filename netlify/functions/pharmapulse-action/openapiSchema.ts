// ============================================================
// Universal AI Intake — Phase 2.4 OpenAPI schema for GPT Actions
//
// Describes exactly the 5 routes pharmapulse-action.ts implements —
// nothing more. `approve`/`execute` are intentionally absent (see
// AI_INTAKE_PHASE_2_4_ACTIVATION_POLICY.md). `buildOpenApiSchema()`
// takes the server URL as a parameter — the caller (pharmapulse-action.ts)
// derives it from the incoming request's own host header, so the
// schema is always self-correct across redeploys (draft deploy URLs
// change every time) with no env var to keep in sync manually.
//
// Every response/request object schema declares explicit `properties`
// (the GPT Actions editor rejects a bare `type: object` with no
// properties) — reusable shapes live under components.schemas and are
// referenced via $ref, mirroring the exact output shapes already
// documented in src/services/connector/connectorTypes.ts (no new
// business shapes invented here, just their OpenAPI description).
// The only two genuinely dynamic objects (a reference record's fields
// vary by referenceType; a preview row's normalizedValues/rawValues
// vary by entityType) use `properties: {} , additionalProperties: true`
// — the narrowest form the GPT Actions editor accepts for "shape not
// known in advance," per Requirement 5.
// ============================================================

const FALLBACK_SERVER_URL = 'https://REPLACE-WITH-YOUR-DEPLOY-URL.netlify.app/.netlify/functions/pharmapulse-action'

// A dynamic, caller-shaped object whose keys aren't knowable ahead of
// time (raw row values, normalized row values, per-referenceType
// record fields). Kept to exactly the narrow form Requirement 5 asks
// for — never used for a shape we actually know.
const DYNAMIC_OBJECT = { type: 'object', properties: {}, additionalProperties: true } as const

const COMPONENT_SCHEMAS = {
  ErrorResponse: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      retryable: { type: 'boolean' },
      requestId: { type: 'string' },
      timestamp: { type: 'string' },
    },
  },
  ValidationSummary: {
    type: 'object',
    properties: {
      totalRows: { type: 'integer' },
      valid: { type: 'integer' },
      warning: { type: 'integer' },
      error: { type: 'integer' },
      conflict: { type: 'integer' },
      duplicate: { type: 'integer' },
      update: { type: 'integer' },
      skip: { type: 'integer' },
    },
  },
  ReferenceRecord: DYNAMIC_OBJECT,
  GetReferenceDataResponse: {
    type: 'object',
    properties: {
      referenceType: { type: 'string' },
      records: { type: 'array', items: { $ref: '#/components/schemas/ReferenceRecord' } },
    },
  },
  CreateIntakeSessionResponse: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      status: { type: 'string' },
      detectedEntityType: { type: 'string' },
      acceptedRowCount: { type: 'integer' },
      rejectedRowCount: { type: 'integer' },
      validationSummary: { $ref: '#/components/schemas/ValidationSummary' },
      nextAction: { type: 'string' },
    },
  },
  RowClassification: {
    type: 'object',
    properties: {
      clientRowId: { type: 'string' },
      classification: { type: 'string' },
    },
  },
  DuplicateSummary: {
    type: 'object',
    properties: {
      inFile: { type: 'integer' },
      againstRepository: { type: 'integer' },
    },
  },
  ValidateIntakeSessionResponse: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      validationSummary: { $ref: '#/components/schemas/ValidationSummary' },
      rowClassifications: { type: 'array', items: { $ref: '#/components/schemas/RowClassification' } },
      duplicateSummary: { $ref: '#/components/schemas/DuplicateSummary' },
      unresolvedReferences: { type: 'array', items: { type: 'string' } },
      previewSignature: { type: 'string' },
    },
  },
  PreviewRow: {
    type: 'object',
    properties: {
      clientRowId: { type: 'string' },
      proposedAction: { type: 'string' },
      normalizedValues: DYNAMIC_OBJECT,
      warnings: { type: 'array', items: { type: 'string' } },
      errors: { type: 'array', items: { type: 'string' } },
    },
  },
  GetIntakePreviewResponse: {
    type: 'object',
    properties: {
      createCount: { type: 'integer' },
      updateCount: { type: 'integer' },
      skipCount: { type: 'integer' },
      conflictCount: { type: 'integer' },
      invalidCount: { type: 'integer' },
      warningCount: { type: 'integer' },
      rows: { type: 'array', items: { $ref: '#/components/schemas/PreviewRow' } },
      executionEligible: { type: 'boolean' },
      previewSignature: { type: 'string' },
    },
  },
  GetIntakeStatusResponse: {
    type: 'object',
    properties: {
      lifecycleStatus: { type: 'string' },
      validationState: { type: 'string', nullable: true },
      approvalState: { type: 'string', nullable: true },
      executionState: { type: 'string', nullable: true },
      counts: DYNAMIC_OBJECT,
      timestamps: DYNAMIC_OBJECT,
      failureReason: { type: 'string' },
    },
  },
  IntakeRow: {
    type: 'object',
    required: ['clientRowId', 'rawValues'],
    properties: {
      clientRowId: { type: 'string' },
      rawValues: DYNAMIC_OBJECT,
    },
  },
} as const

const RESPONSES = {
  error: { description: 'Structured, redacted error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
} as const

export function buildOpenApiSchema(serverUrl?: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'PharmaPulse Intake Actions',
      description: 'Read-only reference lookups and intake-session preparation (create/validate/preview/status) for PharmaPulse. Execution and approval are not exposed by this API.',
      version: '2.4.0',
    },
    servers: [{ url: serverUrl || FALLBACK_SERVER_URL }],
    security: [{ BearerAuth: [] }],
    paths: {
      '/reference-data': {
        post: {
          operationId: 'getReferenceData',
          summary: 'Look up existing regions, groups, pharmacies, users, or KPI definitions before submitting rows.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['referenceType'],
                  properties: {
                    referenceType: { type: 'string', enum: ['regions', 'groups', 'pharmacies', 'users', 'kpi_definitions', 'roles', 'scopes', 'periods'] },
                    exactCode: { type: 'string' },
                    searchText: { type: 'string' },
                    limit: { type: 'integer', maximum: 200 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Minimized reference records', content: { 'application/json': { schema: { $ref: '#/components/schemas/GetReferenceDataResponse' } } } },
            default: RESPONSES.error,
          },
        },
      },
      '/intake-sessions': {
        post: {
          operationId: 'createIntakeSession',
          summary: 'Create a new intake session from structured rows already extracted by the caller (never raw binary files).',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['entityType', 'sourceType', 'rows', 'idempotencyKey'],
                  properties: {
                    entityType: { type: 'string', enum: ['REGION', 'GROUP', 'BRANCH', 'PHARMACIST', 'ASSIGNMENT', 'KPI_REGISTRY', 'BRANCH_TARGET', 'PHARMACIST_TARGET', 'BRANCH_ACTUALS', 'PHARMACIST_ACTUALS'] },
                    sourceType: { type: 'string', enum: ['chatgpt_structured', 'excel_extracted', 'csv_extracted', 'pdf_extracted', 'image_extracted', 'plain_text_extracted'] },
                    sourceName: { type: 'string' },
                    rows: { type: 'array', items: { $ref: '#/components/schemas/IntakeRow' } },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Created session summary', content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateIntakeSessionResponse' } } } },
            default: RESPONSES.error,
          },
        },
      },
      '/intake-sessions/validate': {
        post: {
          operationId: 'validateIntakeSession',
          summary: 'Re-check the current server-side validation state of an intake session.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } } },
          },
          responses: {
            '200': { description: 'Validation summary', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidateIntakeSessionResponse' } } } },
            default: RESPONSES.error,
          },
        },
      },
      '/intake-sessions/preview': {
        post: {
          operationId: 'getIntakePreview',
          summary: 'Retrieve the row-level preview (create/update/skip/conflict) for an intake session.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sessionId'],
                  properties: {
                    sessionId: { type: 'string' },
                    filter: { type: 'string' },
                    limit: { type: 'integer', maximum: 500 },
                    offset: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Row-level preview', content: { 'application/json': { schema: { $ref: '#/components/schemas/GetIntakePreviewResponse' } } } },
            default: RESPONSES.error,
          },
        },
      },
      '/intake-sessions/status': {
        get: {
          operationId: 'getIntakeStatus',
          summary: 'Read the current lifecycle/validation/approval/execution state of a session.',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Session status', content: { 'application/json': { schema: { $ref: '#/components/schemas/GetIntakeStatusResponse' } } } },
            default: RESPONSES.error,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer' },
      },
      schemas: COMPONENT_SCHEMAS,
    },
  } as const
}
