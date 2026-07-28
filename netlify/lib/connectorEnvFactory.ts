// ============================================================
// Universal AI Intake — Shared Netlify Function Environment Factory
//
// Extracted in Phase 2.2 so pharmapulse-connector.ts (HTTP transport)
// and pharmapulse-mcp.ts (MCP transport) build the IDENTICAL
// HandlerEnv from the same environment variables — one source of
// truth for admin-mapping resolution, production-guard flags, and the
// Admin SDK repository/executor wiring. No duplicated business logic
// between the two transports.
// ============================================================

import { createFirestoreConnectorRepository, fetchExistingDataAdmin, getAdminFirestore } from './firestoreConnectorRepository'
import { createAdminFirestoreCommitExecutor } from './adminFirestoreCommitExecutor'
import type { HandlerEnv } from '../../src/services/connector/connectorHttpHandler'
import type { ConnectorRepository } from '../../src/services/connector/repositories/connectorRepository'

// Admin uid -> connector clientId mapping is env-configured, never
// hardcoded and never derived from a client-supplied value. Format:
// CONNECTOR_CLIENT_ADMIN_MAP='{"chatgpt-primary":"<adminUid>"}'
function resolveAdminMapping(clientId: string): { mappedAdminUid: string; mappedAdminRole: 'admin' } | null {
  const raw = process.env.CONNECTOR_CLIENT_ADMIN_MAP
  if (!raw) return null
  try {
    const map = JSON.parse(raw) as Record<string, string>
    const uid = map[clientId]
    return uid ? { mappedAdminUid: uid, mappedAdminRole: 'admin' } : null
  } catch {
    return null
  }
}

export function isConnectorEnabled(): boolean {
  return process.env.CONNECTOR_ENABLED === 'true'
}

/** Builds the exact same HandlerEnv both transports (HTTP tool-call
 *  endpoint and MCP endpoint) pass to handleConnectorRequest() /
 *  handleMcpRequest() — same secrets, same production guard flags,
 *  same Admin SDK repository + commit executor instance shape. */
export function buildProductionHandlerEnv(): { env: HandlerEnv; repo: ConnectorRepository } {
  const repo = createFirestoreConnectorRepository()
  const commitExecutor = createAdminFirestoreCommitExecutor(getAdminFirestore())

  const env: HandlerEnv = {
    tokenSecret: process.env.CONNECTOR_TOKEN_SECRET ?? '',
    audience:    process.env.CONNECTOR_AUDIENCE ?? 'pharmapulse-connector',
    issuer:      process.env.CONNECTOR_ISSUER ?? 'pharmapulse',
    approvalSecret: process.env.CONNECTOR_APPROVAL_SECRET ?? '',
    getExistingData: fetchExistingDataAdmin,
    resolveAdminMapping,
    commitExecutor,
    productionGuardFlags: {
      connectorEnabled: process.env.CONNECTOR_ENABLED,
      productionWritesEnabled: process.env.CONNECTOR_PRODUCTION_WRITES_ENABLED,
      environmentName: process.env.CONNECTOR_ENVIRONMENT,
    },
  }

  return { env, repo }
}
