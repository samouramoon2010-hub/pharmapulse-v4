// ============================================================
// DX-7 (Large File Processing, Progress, Retry, Resume) — centralized
// configuration constants.
//
// Single source of truth for every chunk/cap/limit DX-7 introduces.
// Reuses INGESTION_LIMITS (src/services/ingestion/ingestionTypes.ts)
// rather than duplicating its row-count ceiling — that module is the
// pre-existing authority on "how big can one import batch be" for the
// legacy KPI Actuals pipeline, and these new domains are bound by the
// same practical ceiling until real large-file evidence says otherwise
// (see docs/dx/DX6_DX7_ACTUALS_LARGE_FILES_BUNDLE.md, Performance).
// ============================================================

import { INGESTION_LIMITS } from '../ingestion/ingestionTypes'

export const DX7_CONFIG = {
  /** Rows validated per yield-to-event-loop chunk during runValidation.
   *  Keeps the browser tab responsive on large files without true
   *  streaming Excel parsing (see known limitations doc). */
  VALIDATION_CHUNK_SIZE: 200,

  /** Rows committed per Firestore write chunk. These domains write
   *  through saveKpiEntry() — a single-document, single-row production
   *  service — so this is always 1, matching the established
   *  chunkSize:1 convention used by every prior single-document-commit
   *  adapter (branches/pharmacists/targets/registry). Not configurable
   *  per-call; documented here so the rationale lives in one place. */
  COMMIT_CHUNK_SIZE: 1,

  /** Hard ceiling on rows accepted in one import file. Reuses the
   *  existing, already-proven ceiling rather than inventing a new one. */
  MAX_ROWS_PER_FILE: INGESTION_LIMITS.MAX_ROWS_PER_BATCH,

  /** Maximum number of preview rows rendered in the UI at once — avoids
   *  rendering thousands of DOM rows for a large file. The full
   *  validation result (counts, errors) is always complete; only the
   *  on-screen row list is capped. */
  PREVIEW_ROW_CAP: 200,

  /** Maximum number of times a PARTIALLY_COMPLETED job's failed/remaining
   *  rows may be retried before requiring a fresh upload. Prevents an
   *  unbounded retry loop against a structurally broken batch. */
  MAX_RETRY_ATTEMPTS: 5,
} as const
