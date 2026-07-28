// ============================================================
// Browser-side file checksum + metadata extraction.
//
// Used by DataExchangeStudioPage.jsx to attach REAL file metadata
// (name/size/mimeType/checksum) to an import job, instead of the
// previous behavior of never populating it (root cause of the
// production `fileMeta: undefined` Firestore write failure).
//
// Uses the standard Web Crypto API (`crypto.subtle.digest`), which is
// available in all evergreen browsers including iOS/desktop Safari,
// over a secure (https) origin — no third-party hashing library
// needed. If digest computation ever fails (e.g. a non-secure context,
// or an unsupported runtime), the checksum is simply omitted — it is
// never the cause of an import failing, since `ImportFileMetadata`
// already treats nothing here as required except fileName/sizeBytes.
// ============================================================

import type { ImportFileMetadata } from './importJobTypes'

/** SHA-256 of the given bytes, as a lowercase hex string. */
export async function computeChecksum(buffer: ArrayBuffer): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    // Checksum is used only for re-upload detection/idempotency —
    // never block or fail an import because it could not be computed.
    return undefined
  }
}

/**
 * Builds the real `ImportFileMetadata` shape from an actual uploaded
 * `File` and its already-read `ArrayBuffer`. Every browser-derived
 * field is read defensively:
 *  - `file.type` is frequently an empty string on mobile Safari for
 *    `.xlsx` uploads (no OS-level MIME mapping) — an empty string is
 *    a valid, intentional value here, not `undefined`, and is kept
 *    only when non-empty so it is never written as `''`-meaning-unset.
 *  - `file.lastModified` is not part of `ImportFileMetadata` at all
 *    (the schema does not ask for it) and is intentionally not
 *    invented here.
 *  - the checksum is best-effort (see computeChecksum) and is simply
 *    absent, never `undefined`, if it could not be computed.
 */
export async function extractFileMeta(
  file:      { name: string; size: number; type?: string },
  buffer:    ArrayBuffer,
  sheetName?: string,
): Promise<ImportFileMetadata> {
  const checksum = await computeChecksum(buffer)
  return {
    fileName:  file.name,
    sizeBytes: file.size,
    ...(checksum ? { checksum } : {}),
    ...(sheetName ? { sheetName } : {}),
    ...(file.type ? { mimeType: file.type } : {}),
  }
}
