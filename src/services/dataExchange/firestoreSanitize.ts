// ============================================================
// Firestore write-boundary sanitizer.
//
// Root cause of the production "Function setDoc() called with invalid
// data. Unsupported field value: undefined (found in field fileMeta...)"
// failure: several import-job construction sites assign an optional
// field's value directly from a caller param that is frequently
// `undefined` (e.g. `fileMeta: params.fileMeta`). Object spread/literal
// assignment keeps the KEY even when the value is `undefined`, and
// Firestore's setDoc()/addDoc()/updateDoc()/writeBatch().set() all
// reject any object that contains an `undefined` value anywhere,
// including nested.
//
// This module is the last line of defense at the actual write
// boundary — it does not replace fixing the construction sites (see
// importJobEngine.ts, actualsImportRunner.ts, kpiTargetsImportRunner.ts),
// it backstops them so a future caller mistake fails safely (an
// omitted field) rather than throwing a raw Firestore error to the UI.
// ============================================================

/** True only for plain `{}`/`Object.create(null)` objects — false for
 *  class instances (Date, Firestore Timestamp/DocumentReference/
 *  GeoPoint/Bytes, FieldValue sentinels from serverTimestamp()/
 *  increment()/arrayUnion(), etc.). Those must pass through this
 *  sanitizer untouched, never have their own properties enumerated. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Recursively removes every `undefined` value from a plain object or
 * array (including nested), without ever mutating the input.
 *
 * Preserved as-is, never recursed into or altered:
 *  - `false`, `0`, `''`, `null`
 *  - non-plain-object instances (Date, Firestore Timestamp,
 *    DocumentReference, GeoPoint, Bytes, FieldValue sentinels) — these
 *    are passed through by reference, never spread/cloned, so their
 *    internal Firestore-recognized shape is never corrupted.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, stripUndefinedDeep(child)]),
    ) as T
  }

  return value
}
