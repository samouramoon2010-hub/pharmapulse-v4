// ============================================================
// Universal AI Intake — image extraction architecture (Phase 1)
//
// Per instruction: "Create the architecture for image extraction...
// if no image extraction provider is configured, return a controlled
// unsupported state. Do not add unreliable local OCR loops."
//
// This module defines the provider interface only. No provider is
// wired up in this phase — every image upload resolves to
// NO_PROVIDER_CONFIGURED. The existing BYOK text-only AI client
// (src/assistant/realAiProviderClient.ts) is a plausible future
// multimodal extension point (documented in
// docs/ai-intake/AI_INTAKE_PHASE_1_LIMITATIONS.md) but is not called
// from here — it has no image/vision support today.
// ============================================================

export interface ImageExtractionRequest {
  fileName: string
  mimeType: string
  /** Raw image bytes — never persisted, held only in the intake session
   *  for the duration of this request. */
  data:     ArrayBuffer
}

export interface ImageExtractionRow {
  rawValues: Record<string, unknown>
}

export type ImageExtractionOutcome =
  | { status: 'EXTRACTED'; rows: ImageExtractionRow[]; confidence: number }
  | { status: 'NO_PROVIDER_CONFIGURED'; message: string }
  | { status: 'PROVIDER_ERROR'; message: string }

/** Implemented by a future concrete provider (e.g. a vision-capable model
 *  client). No implementation is registered in Phase 1. */
export interface ImageExtractionProvider {
  readonly name: string
  extract(request: ImageExtractionRequest): Promise<ImageExtractionOutcome>
}

const NO_PROVIDER_MESSAGE =
  'Image data intake requires a configured image-extraction provider. ' +
  'None is configured in this phase — the image has been stored in this ' +
  'intake session only; no data was extracted or fabricated.'

let registeredProvider: ImageExtractionProvider | null = null

/** For future phases: register a real provider. Not called anywhere in
 *  Phase 1 — kept here so the architecture is provable/testable without
 *  a UI wiring change once a provider exists. */
export function registerImageExtractionProvider(provider: ImageExtractionProvider): void {
  registeredProvider = provider
}

/** Test-only reset hook. */
export function _resetImageExtractionProvider(): void {
  registeredProvider = null
}

export async function extractFromImage(request: ImageExtractionRequest): Promise<ImageExtractionOutcome> {
  if (!registeredProvider) {
    return { status: 'NO_PROVIDER_CONFIGURED', message: NO_PROVIDER_MESSAGE }
  }
  try {
    return await registeredProvider.extract(request)
  } catch (e: any) {
    return { status: 'PROVIDER_ERROR', message: e?.message ?? 'Image extraction provider failed' }
  }
}
