import { describe, it, expect } from 'vitest'
import { BACKUP_COLLECTIONS } from './backupCollections'

describe('BACKUP_COLLECTIONS', () => {
  it('is a non-empty flat list of unique collection name strings', () => {
    expect(BACKUP_COLLECTIONS.length).toBeGreaterThan(20)
    expect(new Set(BACKUP_COLLECTIONS).size).toBe(BACKUP_COLLECTIONS.length)
    for (const name of BACKUP_COLLECTIONS) expect(typeof name).toBe('string')
  })

  it('includes core business-data collections', () => {
    for (const name of ['users', 'pharmacies', 'kpi_entries', 'targets', 'kpi_registry']) {
      expect(BACKUP_COLLECTIONS).toContain(name)
    }
  })

  it('excludes internal connector/operation-state machinery collections', () => {
    for (const name of BACKUP_COLLECTIONS) {
      expect(name).not.toMatch(/^connector_/)
      expect(name).not.toMatch(/operation_state$/)
    }
  })
})
