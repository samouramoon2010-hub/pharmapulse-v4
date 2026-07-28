// ============================================================
// Universal AI Intake — Phase 2 Scope + Admin Mapping
//
// The connector identity carries a fixed set of scopes issued at
// token time (see connectorTokenService.ts). This module maps a tool
// name to its required scope and enforces the "connector identity ->
// exactly one protected admin uid, never arbitrary impersonation"
// rule.
// ============================================================

import { ConnectorFailure } from './connectorTypes'
import type { ConnectorIdentity, ConnectorScope, ConnectorToolName } from './connectorTypes'

export const TOOL_REQUIRED_SCOPE: Record<ConnectorToolName, ConnectorScope> = {
  pharmapulse_create_intake_session:   'intake:create',
  pharmapulse_validate_intake_session: 'intake:validate',
  pharmapulse_get_intake_preview:      'intake:read',
  pharmapulse_approve_intake_session:  'intake:approve',
  pharmapulse_execute_intake_session:  'intake:execute',
  pharmapulse_get_intake_status:       'intake:read',
  pharmapulse_cancel_intake_session:   'intake:cancel',
  pharmapulse_get_reference_data:      'reference:read',
}

export function assertToolScope(identity: ConnectorIdentity, tool: ConnectorToolName): void {
  const required = TOOL_REQUIRED_SCOPE[tool]
  if (!identity.scopes.includes(required)) {
    throw new ConnectorFailure({
      code: 'INVALID_SCOPE',
      message: `Connector identity "${identity.clientId}" lacks required scope "${required}" for tool "${tool}"`,
      retryable: false,
    })
  }
}

/** The connector identity must resolve to exactly one protected admin
 *  uid — this function is intentionally the ONLY place that mapping
 *  is read from, so it can never be bypassed by passing an arbitrary
 *  uid elsewhere in the call chain. */
export function assertAdminMapping(identity: ConnectorIdentity): void {
  if (identity.mappedAdminRole !== 'admin' || !identity.mappedAdminUid) {
    throw new ConnectorFailure({
      code: 'UNAUTHORIZED',
      message: 'Connector identity is not mapped to a protected admin context',
      retryable: false,
    })
  }
}
