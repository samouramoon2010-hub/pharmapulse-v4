// ============================================================
// Admin-triggered Firestore backup export — tests
//
// Mocks firebase-admin the same way adminFirestoreCommitExecutor.test.ts
// does: a hand-built fake Firestore + a fake Auth.verifyIdToken, since
// no Firebase Emulator toolchain is configured in this repo.
//
// vitest hoists vi.mock(...) calls above all imports, and factory
// functions may only reference outer variables whose name starts with
// "mock" — hence mockUsers/mockCollections/MockTimestamp below.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test' })

const { MockTimestamp, mockUsers, mockCollections } = vi.hoisted(() => {
  class MockTimestamp {
    iso: string
    constructor(iso: string) { this.iso = iso }
    toDate() { return new Date(this.iso) }
  }
  return {
    MockTimestamp,
    mockUsers: new Map<string, Record<string, unknown>>(),
    mockCollections: new Map<string, Array<{ id: string; data: Record<string, unknown> }>>(),
  }
})

vi.mock('firebase-admin/app', () => ({
  initializeApp: () => ({ __fakeApp: true }),
  cert: (x: unknown) => x,
  getApps: () => [],
}))

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: MockTimestamp,
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        async get() {
          const data = name === 'users' ? mockUsers.get(id) : undefined
          return { exists: data !== undefined, data: () => data }
        },
      }),
      async get() {
        const rows = mockCollections.get(name) ?? []
        return { docs: rows.map((r) => ({ id: r.id, data: () => r.data })) }
      },
    }),
  }),
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    async verifyIdToken(token: string) {
      if (token === 'valid-admin-token') return { uid: 'admin-uid' }
      if (token === 'valid-nonadmin-token') return { uid: 'pharmacist-uid' }
      throw new Error('invalid token')
    },
  }),
}))

import { handler } from './pharmapulse-backup'
import { BACKUP_COLLECTIONS } from '../../lib/backupCollections'

function makeEvent(overrides: Partial<{ httpMethod: string; headers: Record<string, string> }> = {}) {
  return { httpMethod: 'GET', headers: {}, ...overrides }
}

describe('pharmapulse-backup handler', () => {
  beforeEach(() => {
    mockUsers.clear()
    mockCollections.clear()
    mockUsers.set('admin-uid', { role: 'admin' })
    mockUsers.set('pharmacist-uid', { role: 'pharmacist' })
  })

  it('rejects non-GET requests', async () => {
    const res = await handler(makeEvent({ httpMethod: 'POST' }) as any)
    expect(res.statusCode).toBe(405)
  })

  it('rejects requests with no Authorization header', async () => {
    const res = await handler(makeEvent() as any)
    expect(res.statusCode).toBe(401)
  })

  it('rejects an invalid/expired token', async () => {
    const res = await handler(makeEvent({ headers: { authorization: 'Bearer garbage' } }) as any)
    expect(res.statusCode).toBe(403)
  })

  it('rejects a valid token for a non-admin user', async () => {
    const res = await handler(makeEvent({ headers: { authorization: 'Bearer valid-nonadmin-token' } }) as any)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toMatch(/not an admin/i)
  })

  it('returns a JSON export for a valid admin token, converting Timestamps to ISO strings', async () => {
    mockCollections.set('pharmacies', [
      { id: 'ph1', data: { name: 'Branch 1', createdAt: new MockTimestamp('2026-01-01T00:00:00.000Z') } },
    ])
    const res = await handler(makeEvent({ headers: { authorization: 'Bearer valid-admin-token' } }) as any)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Disposition']).toMatch(/attachment; filename="pharmapulse-backup-/)
    const body = JSON.parse(res.body)
    expect(body.exportedBy).toBe('admin-uid')
    expect(body.collectionCount).toBe(BACKUP_COLLECTIONS.length)
    expect(body.collections.pharmacies).toEqual([
      { id: 'ph1', name: 'Branch 1', createdAt: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('includes every allowlisted collection key in the export, even when empty', async () => {
    const res = await handler(makeEvent({ headers: { authorization: 'Bearer valid-admin-token' } }) as any)
    const body = JSON.parse(res.body)
    for (const name of BACKUP_COLLECTIONS) {
      expect(body.collections).toHaveProperty(name)
      expect(Array.isArray(body.collections[name])).toBe(true)
    }
  })
})
