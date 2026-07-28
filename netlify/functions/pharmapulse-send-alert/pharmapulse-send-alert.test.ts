// ============================================================
// Critical-risk alert email relay — tests
// Mocks firebase-admin (same pattern as pharmapulse-backup.test.ts)
// and global fetch (the Resend API call).
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test' })

const mockUsers = new Map<string, Record<string, unknown>>()

vi.mock('firebase-admin/app', () => ({
  initializeApp: () => ({ __fakeApp: true }),
  cert: (x: unknown) => x,
  getApps: () => [],
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        async get() {
          const data = name === 'users' ? mockUsers.get(id) : undefined
          return { exists: data !== undefined, data: () => data }
        },
      }),
    }),
  }),
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    async verifyIdToken(token: string) {
      if (token === 'valid-admin-token') return { uid: 'admin-uid' }
      throw new Error('invalid token')
    },
  }),
}))

import { handler } from './pharmapulse-send-alert'

function makeEvent(overrides: Partial<{ httpMethod: string; headers: Record<string, string>; body: string | null }> = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-admin-token' },
    body: JSON.stringify({ subject: 'Test', html: '<p>hi</p>', text: 'hi' }),
    ...overrides,
  }
}

describe('pharmapulse-send-alert handler', () => {
  const originalEnv = { ...process.env }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockUsers.clear()
    mockUsers.set('admin-uid', { role: 'admin' })
    process.env.RESEND_API_KEY = 'test-key'
    process.env.ALERT_RECIPIENT_EMAILS = 'ops@example.com, manager@example.com'
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    global.fetch = fetchMock as any
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects non-POST requests', async () => {
    const res = await handler(makeEvent({ httpMethod: 'GET' }) as any)
    expect(res.statusCode).toBe(405)
  })

  it('fails closed (501) when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY
    const res = await handler(makeEvent() as any)
    expect(res.statusCode).toBe(501)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed (501) when ALERT_RECIPIENT_EMAILS is unset', async () => {
    delete process.env.ALERT_RECIPIENT_EMAILS
    const res = await handler(makeEvent() as any)
    expect(res.statusCode).toBe(501)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects requests with no Authorization header', async () => {
    const res = await handler(makeEvent({ headers: {} }) as any)
    expect(res.statusCode).toBe(401)
  })

  it('rejects a non-admin caller', async () => {
    mockUsers.set('admin-uid', { role: 'pharmacist' })
    const res = await handler(makeEvent() as any)
    expect(res.statusCode).toBe(403)
  })

  it('rejects a request missing subject/html', async () => {
    const res = await handler(makeEvent({ body: JSON.stringify({}) }) as any)
    expect(res.statusCode).toBe(400)
  })

  it('sends via Resend to every configured recipient and returns 200', async () => {
    const res = await handler(makeEvent() as any)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.sent).toBe(true)
    expect(body.recipients).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const sentPayload = JSON.parse(opts.body)
    expect(sentPayload.to).toEqual(['ops@example.com', 'manager@example.com'])
    expect(sentPayload.subject).toBe('Test')
  })

  it('returns 502 when Resend rejects the request', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'bad request' })
    const res = await handler(makeEvent() as any)
    expect(res.statusCode).toBe(502)
  })
})
