// ============================================================
// KPI Registry Service
// Persists KPI definitions to Firestore collection:
//   kpi_registry/{kpiKey}
//
// Design:
//   - One document per KPI key (key = doc ID)
//   - All authenticated users can read
//   - Only admins can write / archive / hide
//   - No hard delete — status transitions only
//   - Default registry is the fallback when Firestore is empty
//   - Protected core KPI keys cannot be changed (enforced here +
//     in Firestore rules)
// ============================================================

import {
  collection, doc, setDoc, getDoc, getDocs,
  onSnapshot, serverTimestamp, query, orderBy, addDoc,
} from 'firebase/firestore'
import { db, auth, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'

import { DEFAULT_KPI_REGISTRY }   from '../engine/kpiRegistry'
import { validateWeights, validateThresholds } from '../engine/kpiRegistry'

import type { KpiDefinition, KpiRegistry, KpiLifecycleStage } from '../engine/kpiRegistry'
import type { KpiUiStatus }                 from '../engine/kpiRegistry'
import { canTransitionKpiLifecycle } from '../engine/kpiRegistry/kpiRegistryTypes'
import {
  PROTECTED_CORE_KEYS as _PROTECTED,
  mergeRemoteRegistryWithDefaults as _merge,
  docToKpiDefinition as _docConvert,
  buildDocPayloadSync as _buildDocPayloadSync,
} from './kpiRegistryLogic'

// ── Re-export from pure logic layer ────────────────────────────
export {
  PROTECTED_CORE_KEYS,
  mergeRemoteRegistryWithDefaults,
  ENTRY_METADATA_FIELDS,
  buildAllowedEntryKeys,
  sanitizeKpiEntryFields,
} from './kpiRegistryLogic'

// ── Collection reference ──────────────────────────────────────
const registryCol = () => collection(db, COL.KPI_REGISTRY)
const registryDoc = (key: string) => doc(db, COL.KPI_REGISTRY, key)

// ── Payload builder ───────────────────────────────────────────

function buildDocPayload(
  def:      KpiDefinition,
  uiStatus: KpiUiStatus,
  isNew:    boolean,
): Record<string, unknown> {
  const uid = auth?.currentUser?.uid ?? 'system'
  // Delegate to buildDocPayloadSync (single source of truth for field list).
  // This eliminates the two-builder divergence that caused lifecycleStage,
  // isPrimary, coachingAction, and coachingActionAr to be silently omitted.
  // buildDocPayloadSync is a pure function without serverTimestamp; we add
  // the server-side timestamp fields here as the only addition.
  const base = _buildDocPayloadSync(def, uiStatus, uid)
  return {
    ...base,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  }
}

// docToKpiDefinition is in kpiRegistryLogic.ts (imported as _docConvert)

// ════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════

/**
 * Subscribe to the KPI registry collection in real-time.
 *
 * Calls onUpdate with the merged registry (Firestore docs + defaults)
 * and a uiStatus map on every snapshot change.
 * Falls back gracefully when Firestore is empty.
 *
 * @returns Unsubscribe function
 */
export function subscribeKpiRegistry(
  onUpdate: (registry: KpiRegistry, uiStatuses: Record<string, KpiUiStatus>) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(registryCol(), orderBy('sortOrder', 'asc'))

  return onSnapshot(
    q,
    (snapshot) => {
      const remote: KpiRegistry                   = {}
      const uiStatuses: Record<string, KpiUiStatus> = {}

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        try {
          const result = _docConvert(data)
          if (!result) return
          const { def, uiStatus } = result
          remote[def.key]     = def
          uiStatuses[def.key] = uiStatus
        } catch {
          // Unknown/corrupt doc — skip silently
        }
      })

      const merged = _merge(remote)
      // Fill in uiStatuses for any default KPIs not in Firestore
      for (const key of Object.keys(merged)) {
        if (!(key in uiStatuses)) {
          uiStatuses[key] = merged[key].isActive ? 'ACTIVE' : 'ARCHIVED'
        }
      }

      onUpdate(merged, uiStatuses)
    },
    (err) => {
      console.error('[kpiRegistryService] subscribeKpiRegistry error:', err)
      // Fallback to defaults on error
      const uiStatuses: Record<string, KpiUiStatus> = {}
      for (const key of Object.keys(DEFAULT_KPI_REGISTRY)) {
        uiStatuses[key] = DEFAULT_KPI_REGISTRY[key].isActive ? 'ACTIVE' : 'ARCHIVED'
      }
      onUpdate({ ...DEFAULT_KPI_REGISTRY }, uiStatuses)
      onError?.(err)
    },
  )
}

/**
 * Save (create or update) a KPI definition to Firestore.
 *
 * Validates:
 *   - Key format (camelCase)
 *   - Threshold ordering
 *   - Weight range
 *   - Core key immutability
 *
 * @throws Error on validation failure
 */
export async function saveKpiDefinition(
  def:      KpiDefinition,
  uiStatus: KpiUiStatus,
  existingRegistry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): Promise<void> {
  const uid = auth?.currentUser?.uid ?? 'system'

  // ── Validate: key format ───────────────────────────────────
  if (!def.key || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(def.key)) {
    throw new Error(`Invalid key format "${def.key}" — must be camelCase letters/numbers.`)
  }

  // ── Validate: thresholds ───────────────────────────────────
  if (!validateThresholds(def)) {
    throw new Error('Thresholds must be ordered: healthy ≥ watch ≥ risk ≥ critical (0–200).')
  }

  // ── Validate: weight ───────────────────────────────────────
  if (def.weight < 0 || def.weight > 1 || isNaN(def.weight)) {
    throw new Error('Weight must be a number between 0 and 1.')
  }

  // ── Validate: lifecycleStage ───────────────────────────────
  const validStages = ['draft','pilot_tracking','shadow_evaluation','production_evaluation','archived']
  if (def.lifecycleStage && !validStages.includes(def.lifecycleStage)) {
    throw new Error(`Invalid lifecycleStage "${def.lifecycleStage}".`)
  }

  // ── Validate: isPrimary invariant ──────────────────────────
  // If this KPI claims isPrimary, verify no other production KPI already is
  if (def.isPrimary) {
    const currentPrimary = Object.values(existingRegistry).find(
      (k) => k.isPrimary && k.key !== def.key && k.lifecycleStage === 'production_evaluation'
    )
    if (currentPrimary) {
      throw new Error(
        `KPI "${currentPrimary.key}" is already the primary KPI. ` +
        `Only one KPI may have isPrimary:true. Clear the existing primary first.`
      )
    }
  }

  // ── Check if existing doc exists (determines isNew) ────────
  const existingSnap = await getDoc(registryDoc(def.key))
  const isNew = !existingSnap.exists()
  const beforeData = isNew ? undefined : (existingSnap.data() as Record<string, unknown>)

  // For existing docs: verify key hasn't changed (immutable)
  if (!isNew && beforeData?.key !== def.key) {
    throw new Error('KPI key is immutable after creation.')
  }

  // ── Validate: lifecycle transition for existing KPIs ───────
  if (!isNew && def.lifecycleStage && beforeData?.lifecycleStage) {
    const fromStage = beforeData.lifecycleStage as KpiLifecycleStage
    const toStage   = def.lifecycleStage as KpiLifecycleStage
    if (fromStage !== toStage && !canTransitionKpiLifecycle(fromStage, toStage)) {
      throw new Error(
        `Lifecycle transition "${fromStage}" → "${toStage}" is blocked for KPI "${def.key}". ` +
        `Use the approved path: draft → pilot_tracking → shadow_evaluation → production_evaluation.`
      )
    }
  }

  const payload = buildDocPayload(def, uiStatus, isNew)

  await setDoc(registryDoc(def.key), payload, { merge: true })

  // ── Audit log ──────────────────────────────────────────────
  const action = isNew ? 'CREATE' : 'UPDATE'
  await logKpiAudit({
    kpiKey:    def.key,
    action,
    before:    isNew ? undefined : beforeData,
    after:     payload as Record<string, unknown>,
    changedBy: uid,
    note:      isNew ? `Created KPI "${def.label}"` : `Updated KPI "${def.label}"`,
  })

  await logAction({
    action:     isNew ? AUDIT_ACTION.CREATE : AUDIT_ACTION.UPDATE,
    collection: COL.KPI_REGISTRY,
    docId:      def.key,
    userId:     uid,
    userRole:   'admin',
    meta:       { key: def.key, label: def.label, uiStatus, lifecycleStage: def.lifecycleStage },
  })
}

/**
 * Archive a KPI (set isActive=false, uiStatus=ARCHIVED).
 * Protected core KPIs cannot be archived.
 *
 * @throws Error if key is a protected core KPI
 */
export async function archiveKpiDefinition(key: string): Promise<void> {
  if (PROTECTED_CORE_KEYS.has(key)) {
    throw new Error(`KPI "${key}" is a protected core KPI and cannot be archived.`)
  }

  const existingSnap = await getDoc(registryDoc(key))
  if (!existingSnap.exists()) {
    // Key not in Firestore yet — check defaults
    if (!(key in DEFAULT_KPI_REGISTRY)) {
      throw new Error(`KPI "${key}" not found in registry.`)
    }
    // Save the default definition with ARCHIVED status
    const def = { ...DEFAULT_KPI_REGISTRY[key] }
    return saveKpiDefinition(def, 'ARCHIVED')
  }

  const uid = auth?.currentUser?.uid ?? 'system'
  await setDoc(registryDoc(key), {
    isActive:       false,
    uiStatus:       'ARCHIVED',
    lifecycleStage: 'archived',
    updatedAt:      serverTimestamp(),
    updatedBy:      uid,
  }, { merge: true })

  await logKpiAudit({
    kpiKey:    key,
    action:    'ARCHIVE',
    before:    { lifecycleStage: existingSnap.data()?.lifecycleStage ?? 'production_evaluation' },
    after:     { lifecycleStage: 'archived', isActive: false },
    changedBy: uid,
    note:      `Archived KPI "${key}"`,
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.KPI_REGISTRY,
    docId:      key,
    userId:     uid,
    userRole:   'admin',
    meta:       { key, uiStatus: 'ARCHIVED' },
  })
}

/**
 * Hide a KPI from input forms (uiStatus=HIDDEN_FROM_INPUT).
 * Protected core KPIs cannot be hidden from input.
 */
export async function hideKpiDefinition(key: string): Promise<void> {
  if (PROTECTED_CORE_KEYS.has(key)) {
    throw new Error(`KPI "${key}" is a protected core KPI and cannot be hidden from input.`)
  }

  const uid = auth?.currentUser?.uid ?? 'system'

  const existingSnap = await getDoc(registryDoc(key))
  if (!existingSnap.exists()) {
    const def = DEFAULT_KPI_REGISTRY[key]
    if (!def) throw new Error(`KPI "${key}" not found.`)
    return saveKpiDefinition(def, 'HIDDEN_FROM_INPUT')
  }

  await setDoc(registryDoc(key), {
    uiStatus:  'HIDDEN_FROM_INPUT',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.KPI_REGISTRY,
    docId:      key,
    userId:     uid,
    userRole:   'admin',
    meta:       { key, uiStatus: 'HIDDEN_FROM_INPUT' },
  })
}

/**
 * Reset the entire registry to defaults.
 * Writes all default KPI definitions to Firestore, overwriting any
 * custom changes. Does not delete documents — overwrites.
 */
export async function resetKpiRegistryToDefaults(): Promise<void> {
  const uid = auth?.currentUser?.uid ?? 'system'
  const writes = Object.values(DEFAULT_KPI_REGISTRY).map((def) => {
    const payload = buildDocPayload(def, 'ACTIVE', false)
    return setDoc(registryDoc(def.key), payload, { merge: true })
  })
  await Promise.all(writes)

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.KPI_REGISTRY,
    docId:      'ALL',
    userId:     uid,
    userRole:   'admin',
    meta:       { action: 'reset_to_defaults' },
  })
}

// mergeRemoteRegistryWithDefaults is in kpiRegistryLogic.ts

/**
 * One-shot fetch of the live KPI registry from Firestore.
 * Equivalent to the first emission of subscribeKpiRegistry(), but as a
 * Promise — suitable for server-side service calls (e.g. bulk evaluation)
 * that cannot use an onSnapshot subscription.
 *
 * Falls back to DEFAULT_KPI_REGISTRY on error.
 */
export async function fetchKpiRegistryOnce(): Promise<KpiRegistry> {
  try {
    const q    = query(registryCol(), orderBy('sortOrder', 'asc'))
    const snap = await getDocs(q)
    const remote: KpiRegistry = {}
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>
      try {
        const result = _docConvert(data)
        if (result) remote[result.def.key] = result.def
      } catch { /* corrupt doc — skip */ }
    })
    return _merge(remote)
  } catch {
    return { ...DEFAULT_KPI_REGISTRY }
  }
}

// ══════════════════════════════════════════════════════════════
// PART F — KPI AUDIT TRAIL
// Writes to kpi_audit_logs collection. Append-only, never update.
// ══════════════════════════════════════════════════════════════

export interface KpiAuditEntry {
  kpiKey:    string
  action:    'CREATE' | 'UPDATE' | 'ARCHIVE' | 'LIFECYCLE_CHANGE'
  before?:   Record<string, unknown>
  after?:    Record<string, unknown>
  changedBy: string
  changedAt: unknown  // serverTimestamp()
  note?:     string
}

/**
 * Write a KPI audit log entry to kpi_audit_logs.
 * Append-only — addDoc generates a new doc each call.
 * Never throws — audit failure must not block the primary operation.
 */
export async function logKpiAudit(entry: Omit<KpiAuditEntry, 'changedAt'>): Promise<void> {
  try {
    await addDoc(collection(db, COL.KPI_AUDIT_LOGS), {
      ...entry,
      changedBy: entry.changedBy || auth?.currentUser?.uid || 'system',
      changedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[kpiRegistryService] Failed to write audit log:', err)
  }
}

// ══════════════════════════════════════════════════════════════
// PART E — LIFECYCLE GOVERNANCE
// Enforces canTransitionKpiLifecycle rules at the service layer.
// ══════════════════════════════════════════════════════════════

/**
 * Transition a KPI from one lifecycle stage to another.
 *
 * Enforces canTransitionKpiLifecycle — no duplicate transition logic.
 * Writes the new lifecycleStage to Firestore and creates an audit entry.
 *
 * @throws Error if the transition is blocked
 * @throws Error if the KPI is a protected core KPI and the target stage
 *         would prevent it from being evaluated (archived → protected core)
 */
export async function transitionKpiLifecycle(
  key:       string,
  toStage:   KpiLifecycleStage,
  note?:     string,
): Promise<void> {
  const uid = auth?.currentUser?.uid ?? 'system'

  // Fetch the current document
  const snap = await getDoc(registryDoc(key))
  if (!snap.exists() && !(key in DEFAULT_KPI_REGISTRY)) {
    throw new Error(`KPI "${key}" not found in registry.`)
  }

  const data = snap.exists()
    ? snap.data() as Record<string, unknown>
    : (DEFAULT_KPI_REGISTRY[key] as unknown as Record<string, unknown>)

  const fromStage = (data.lifecycleStage ?? 'production_evaluation') as KpiLifecycleStage

  // Guard: protected core KPIs cannot be archived
  if (PROTECTED_CORE_KEYS.has(key) && toStage === 'archived') {
    throw new Error(`KPI "${key}" is a protected core KPI and cannot be archived.`)
  }

  // Enforce transition rules — no duplicate logic here
  if (!canTransitionKpiLifecycle(fromStage, toStage)) {
    throw new Error(
      `Lifecycle transition "${fromStage}" → "${toStage}" is not permitted for KPI "${key}". ` +
      `Use the approved promotion path: draft → pilot_tracking → shadow_evaluation → production_evaluation.`
    )
  }

  // Derive isActive from target stage
  const isActive = toStage !== 'archived'

  await setDoc(registryDoc(key), {
    lifecycleStage: toStage,
    isActive,
    // Archived KPIs are not part of the weighted composite
    ...(toStage === 'archived' ? { uiStatus: 'ARCHIVED' } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true })

  // Audit log
  await logKpiAudit({
    kpiKey:    key,
    action:    'LIFECYCLE_CHANGE',
    before:    { lifecycleStage: fromStage },
    after:     { lifecycleStage: toStage },
    changedBy: uid,
    note:      note ?? `Transitioned from ${fromStage} to ${toStage}`,
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.KPI_REGISTRY,
    docId:      key,
    userId:     uid,
    userRole:   'admin',
    meta:       { key, fromStage, toStage },
  })
}
