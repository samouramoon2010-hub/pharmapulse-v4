import { describe, it, expect, afterEach } from 'vitest'
import {
  extractFromImage, registerImageExtractionProvider, _resetImageExtractionProvider,
} from './imageIntakeAdapter'
import type { ImageExtractionProvider } from './imageIntakeAdapter'

afterEach(() => _resetImageExtractionProvider())

describe('Universal AI Intake — image extraction architecture', () => {
  it('returns NO_PROVIDER_CONFIGURED when no provider is registered (Phase 1 default)', async () => {
    const result = await extractFromImage({ fileName: 'shelf.png', mimeType: 'image/png', data: new ArrayBuffer(0) })
    expect(result.status).toBe('NO_PROVIDER_CONFIGURED')
  })

  it('never fabricates rows in the unsupported state', async () => {
    const result = await extractFromImage({ fileName: 'shelf.png', mimeType: 'image/png', data: new ArrayBuffer(0) })
    expect(result.status).toBe('NO_PROVIDER_CONFIGURED')
    expect((result as any).rows).toBeUndefined()
  })

  it('delegates to a registered provider when one exists (future-phase readiness)', async () => {
    const provider: ImageExtractionProvider = {
      name: 'test-provider',
      extract: async () => ({ status: 'EXTRACTED', rows: [{ rawValues: { code: 'RUH' } }], confidence: 90 }),
    }
    registerImageExtractionProvider(provider)
    const result = await extractFromImage({ fileName: 'shelf.png', mimeType: 'image/png', data: new ArrayBuffer(0) })
    expect(result.status).toBe('EXTRACTED')
    if (result.status === 'EXTRACTED') {
      expect(result.rows).toHaveLength(1)
    }
  })

  it('reports PROVIDER_ERROR when a registered provider throws, without crashing', async () => {
    registerImageExtractionProvider({
      name: 'broken-provider',
      extract: async () => { throw new Error('vision API down') },
    })
    const result = await extractFromImage({ fileName: 'shelf.png', mimeType: 'image/png', data: new ArrayBuffer(0) })
    expect(result.status).toBe('PROVIDER_ERROR')
  })
})
