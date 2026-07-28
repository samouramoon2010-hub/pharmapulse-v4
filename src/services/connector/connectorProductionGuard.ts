// ============================================================
// Universal AI Intake — Phase 2 Production Write Guard
//
// executeIntakeSession is the ONLY tool that can write data. Before
// it runs, the caller (netlify/functions/pharmapulse-connector/pharmapulse-connector.ts)
// must call assertProductionWriteAllowed() with the resolved
// environment flags. Missing/undefined flags = fail closed = blocked.
//
// Deliberately takes plain values, not process.env directly, so this
// stays pure/testable and framework-agnostic — the Netlify Function
// is the only place that reads process.env.
// ============================================================

import { ConnectorFailure } from './connectorTypes'

export interface ProductionGuardFlags {
  connectorEnabled?:        string   // "true" | undefined
  productionWritesEnabled?: string   // "true" | undefined
  environmentName?:         string   // e.g. "production" | "staging" | "development"
}

const RECOGNIZED_ENVIRONMENTS = ['production', 'staging', 'development']

export function assertProductionWriteAllowed(flags: ProductionGuardFlags): void {
  if (flags.connectorEnabled !== 'true') {
    throw new ConnectorFailure({
      code: 'UNAUTHORIZED',
      message: 'Connector is disabled (CONNECTOR_ENABLED is not "true") — fail closed by default',
      retryable: false,
    })
  }
  if (flags.productionWritesEnabled !== 'true') {
    throw new ConnectorFailure({
      code: 'UNAUTHORIZED',
      message: 'Production writes are disabled (CONNECTOR_PRODUCTION_WRITES_ENABLED is not "true") — fail closed by default',
      retryable: false,
    })
  }
  if (!flags.environmentName || !RECOGNIZED_ENVIRONMENTS.includes(flags.environmentName)) {
    throw new ConnectorFailure({
      code: 'UNAUTHORIZED',
      message: `Unrecognized or missing environment name ("${flags.environmentName}")`,
      retryable: false,
    })
  }
}
