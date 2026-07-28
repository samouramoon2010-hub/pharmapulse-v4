import { describe, it, expect } from 'vitest'
import { assertProductionWriteAllowed } from './connectorProductionGuard'
import { ConnectorFailure } from './connectorTypes'

describe('Production write guard (fail closed by default)', () => {
  it('blocks when no flags are supplied at all', () => {
    expect(() => assertProductionWriteAllowed({})).toThrow(ConnectorFailure)
  })

  it('blocks when connectorEnabled is missing/false', () => {
    expect(() => assertProductionWriteAllowed({ productionWritesEnabled: 'true', environmentName: 'production' }))
      .toThrow(/Connector is disabled/)
  })

  it('blocks when productionWritesEnabled is missing/false', () => {
    expect(() => assertProductionWriteAllowed({ connectorEnabled: 'true', environmentName: 'production' }))
      .toThrow(/Production writes are disabled/)
  })

  it('blocks when environmentName is missing or unrecognized', () => {
    expect(() => assertProductionWriteAllowed({ connectorEnabled: 'true', productionWritesEnabled: 'true' }))
      .toThrow(/[Ee]nvironment/)
    expect(() => assertProductionWriteAllowed({ connectorEnabled: 'true', productionWritesEnabled: 'true', environmentName: 'not-a-real-env' }))
      .toThrow(/[Ee]nvironment/)
  })

  it('allows execution only when every flag is explicitly and correctly set', () => {
    expect(() => assertProductionWriteAllowed({
      connectorEnabled: 'true', productionWritesEnabled: 'true', environmentName: 'development',
    })).not.toThrow()
  })

  it('is strict about the string "true" — truthy-but-not-"true" values still block', () => {
    expect(() => assertProductionWriteAllowed({
      connectorEnabled: 'yes' as any, productionWritesEnabled: 'true', environmentName: 'production',
    })).toThrow(ConnectorFailure)
  })
})
