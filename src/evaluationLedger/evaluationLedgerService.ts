// ============================================================
// Evaluation Ledger — Firestore Service (Phase 5A)
//
// Implements persistence for the single new collection this bundle
// introduces: evaluationLedgerEntries.
//
// Append-only, immutable:
//   1. Validates caller role via the existing Profile Studio
//      permission guards (canRunSimulation / canReadProfile) —
//      reused, not duplicated.
//   2. Validates entry schema via evaluationLedgerValidation.ts
//   3. Writes only through the Firestore "add a new document" call —
//      this collection has no document-replace or document-removal
//      counterpart anywhere in this file.
//
// NO UI. NO React. NO routes. NO AI. NO new collections beyond
// this one. NO Profile Studio file changes — only imports.
// ============================================================

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

import { db } from '../services/firebase'

import { canRunSimulation, canReadProfile } from '../profileStudio/persistenceGuards'
import type { ProfileStudioRole } from '../profileStudio/persistenceTypes'

import { validateLedgerEntry } from './evaluationLedgerValidation'
import type {
  EvaluationLedgerEntry,
  LedgerQueryFilters,
} from './evaluationLedgerTypes'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Collection name constant
// ════════════════════════════════════════════════════════════

export const EL_COL = {
  LEDGER_ENTRIES: 'evaluationLedgerEntries',
} as const

// ════════════════════════════════════════════════════════════
// SECTION 2 — Internal helpers
// ════════════════════════════════════════════════════════════

function colRef() {
  return collection(db, EL_COL.LEDGER_ENTRIES)
}

function requirePermission(condition: boolean, message: string): void {
  if (!condition) throw new Error(`PERMISSION_DENIED: ${message}`)
}

function toPlain(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    out[k] = v instanceof Timestamp ? v.toDate().toISOString() : v
  }
  return out
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — evaluationLedgerEntries API
// ════════════════════════════════════════════════════════════

/**
 * Appends a new evaluation ledger entry.
 *
 * Requires: a role that can run simulations (admin, district_supervisor,
 * manager) — the same gate already used for Profile Studio's sandbox
 * simulator, reused here rather than re-defined.
 *
 * Append-only — there is no update/delete counterpart.
 */
export async function createLedgerEntryDocument(
  entry: EvaluationLedgerEntry,
  actor: { uid: string; role: ProfileStudioRole },
): Promise<EvaluationLedgerEntry> {
  requirePermission(canRunSimulation(actor.role), `Role "${actor.role}" cannot record evaluation runs`)

  const validation = validateLedgerEntry(entry)
  if (!validation.valid) {
    const msgs = validation.issues.filter((i) => i.severity === 'error').map((i) => `${i.code}: ${i.message}`).join('; ')
    throw new Error(`SCHEMA_INVALID: ${msgs}`)
  }

  const payload: Record<string, unknown> = {
    ...entry,
    recordedBy: actor.uid,
    recordedAt: serverTimestamp(),
  }

  const ref = await addDoc(colRef(), payload)
  return { ...entry, evaluationId: entry.evaluationId || ref.id }
}

/**
 * Lists ledger entries, optionally filtered by entity/profile/period.
 *
 * Requires: any authenticated Profile Studio role (all roles can read).
 */
export async function listLedgerEntries(
  actor:    { uid: string; role: ProfileStudioRole },
  filters?: LedgerQueryFilters,
): Promise<EvaluationLedgerEntry[]> {
  requirePermission(canReadProfile(actor.role), `Role "${actor.role}" cannot read the evaluation ledger`)

  const clauses = []
  if (filters?.entityId)   clauses.push(where('entityId', '==', filters.entityId))
  if (filters?.entityType) clauses.push(where('entityType', '==', filters.entityType))
  if (filters?.profileId)  clauses.push(where('profileId', '==', filters.profileId))
  if (filters?.periodId)   clauses.push(where('periodId', '==', filters.periodId))

  const q = query(colRef(), ...clauses, orderBy('timestamp', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => toPlain(d.data() as Record<string, unknown>) as unknown as EvaluationLedgerEntry)
}
