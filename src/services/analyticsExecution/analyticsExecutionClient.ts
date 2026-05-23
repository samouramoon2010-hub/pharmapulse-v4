// ============================================================
// Analytics Execution Client
// Transparent routing: client engines today, serverless tomorrow.
// Call sites never change when execution moves to serverless.
// ============================================================

import {
  getExecutionMode,
  isServerlessReady,
  shouldSuggestOffload,
  type EngineCategory,
} from './executionMode'

// ── Result wrapper ────────────────────────────────────────────
export interface ExecutionResult<T> {
  data:         T
  executedIn:   'CLIENT' | 'NETLIFY_FN' | 'CLOUD_RUN'
  latencyMs:    number
  cached:       boolean
  offloadHint?: string    // set when serverless would be better
}

// ── In-memory cache (client-side, session duration) ──────────
interface CacheEntry<T> {
  data:      T
  expiresAt: number
}

const _cache = new Map<string, CacheEntry<unknown>>()

function cacheKey(engine: EngineCategory, inputHash: string): string {
  return `${engine}:${inputHash}`
}

function fromCache<T>(key: string): T | null {
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null }
  return entry.data as T
}

function toCache<T>(key: string, data: T, ttlMs: number): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

const ENGINE_TTL: Record<EngineCategory, number> = {
  KPI_ANALYTICS:        30_000,    // 30s
  HISTORY_ENGINE:       60_000,    // 1min
  EXECUTIVE_REPORT:    120_000,    // 2min
  LIVE_ANALYTICS:        5_000,    // 5s — must stay fresh
  INGESTION_VALIDATION:     0,     // no cache
}

// ── Simple hash for cache keying ─────────────────────────────
function simpleHash(input: unknown): string {
  const str = JSON.stringify(input)
  let h = 0
  for (let i = 0; i < Math.min(str.length, 200); i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

// ── Core executor ─────────────────────────────────────────────
export async function executeEngine<TInput, TOutput>(
  engine:     EngineCategory,
  fn:         (input: TInput) => TOutput,
  input:      TInput,
  options?:   { bypassCache?: boolean },
): Promise<ExecutionResult<TOutput>> {
  const mode       = getExecutionMode(engine)
  const ttl        = ENGINE_TTL[engine]
  const key        = ttl > 0 ? cacheKey(engine, simpleHash(input)) : ''
  const start      = performance.now()

  // Try cache first
  if (!options?.bypassCache && ttl > 0 && key) {
    const cached = fromCache<TOutput>(key)
    if (cached != null) {
      return {
        data:       cached,
        executedIn: 'CLIENT',
        latencyMs:  Math.round(performance.now() - start),
        cached:     true,
      }
    }
  }

  // Phase 2 hook: if serverless is ready, call the function instead
  if (isServerlessReady(engine)) {
    // Future: const result = await callNetlifyFunction(engine, input)
    // For now: fall through to client-side
    console.debug(`[ExecutionClient] ${engine}: serverless registered but calling client-side (Phase 1)`)
  }

  // Client-side execution (Phase 1)
  let output: TOutput
  try {
    output = fn(input)
  } catch (e) {
    throw new Error(`[ExecutionClient] ${engine} failed: ${(e as Error).message}`)
  }

  const latencyMs = Math.round(performance.now() - start)

  // Cache result
  if (ttl > 0 && key) {
    toCache(key, output, ttl)
  }

  // Offload hint
  const dataSize   = Array.isArray(input) ? input.length
    : typeof input === 'object' && input ? Object.keys(input as object).length : 0
  const offloadHint = shouldSuggestOffload(engine, dataSize)
    ? `Consider serverless execution: data size ${dataSize} exceeds recommended threshold`
    : undefined

  return {
    data:       output,
    executedIn: mode.environment,
    latencyMs,
    cached:     false,
    offloadHint,
  }
}

// ── Cache management ──────────────────────────────────────────

/** Invalidate cache entries for a specific engine */
export function invalidateEngineCache(engine: EngineCategory): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${engine}:`)) _cache.delete(key)
  }
}

/** Clear all cached results */
export function clearAllCache(): void {
  _cache.clear()
}

/** Get cache stats (for debugging/monitoring) */
export function getCacheStats(): { size: number; engines: string[] } {
  return {
    size:    _cache.size,
    engines: [...new Set([..._cache.keys()].map((k) => k.split(':')[0]))],
  }
}

// ── Netlify Function stub (Phase 2 placeholder) ───────────────
// When Phase 2 is ready, implement this to call the serverless function.
// The signature matches so call sites don't change.
async function callNetlifyFunction<T>(
  engine: EngineCategory,
  input:  unknown,
): Promise<T> {
  const endpoint = `/api/analytics/${engine.toLowerCase().replace(/_/g, '-')}`
  const response = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`Serverless function error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}
