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
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { db, auth, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'

import { DEFAULT_KPI_REGISTRY }   from '../engine/kpiRegistry'
import { validateWeights, validateThresholds } from '../engine/kpiRegistry'

import type { KpiDefinition, KpiRegistry } from '../engine/kpiRegistry'
import type { KpiUiStatus }                 from '../engine/kpiRegistry'
import {
  PROTECTED_CORE_KEYS as _PROTECTED,
  mergeRemoteRegistryWithDefaults as _merge,
  docToKpiDefinition as _docConvert,
} from './kpiRegistryLogic'

// ── Re-export from pure logic layer ────────────────────────────
export { PROTECTED_CORE_KEYS, mergeRemoteRegistryWithDefaults } from './kpiRegistryLogic'

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
  return {
    // Identity
    key:          def.key,
    label:        def.label,
    shortLabel:   def.shortLabel,
    labelAr:      def.labelAr,
    // Classification
    category:     def.category,
    valueType:    def.valueType,
    unit:         def.unit,
    unitAr:       def.unitAr,
    direction:    def.direction,
    targetType:   def.targetType,
    // Score
    weight:       def.weight,
    isActive:     uiStatus !== 'ARCHIVED',
    isCore:       def.isCore,
    // Status
    uiStatus,
    // Thresholds
    thresholdHealthy:  def.thresholds.healthy,
    thresholdWatch:    def.thresholds.watch,
    thresholdRisk:     def.thresholds.risk,
    thresholdCritical: def.thresholds.critical,
    // Visibility
    dashboardEnabled:   def.visibility.dashboardEnabled,
    teamEnabled:        def.visibility.teamEnabled,
    executiveEnabled:   def.visibility.executiveEnabled,
    regionalEnabled:    def.visibility.regionalEnabled,
    targetInputEnabled: def.visibility.targetInputEnabled ?? false,
    // Ordering & Metadata
    sortOrder: def.sortOrder ?? 999,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
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
  // ── Validate ──────────────────────────────────────────────
  if (!def.key || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(def.key)) {
    throw new Error(`Invalid key format "${def.key}" — must be camelCase letters/numbers.`)
  }

  if (!validateThresholds(def)) {
    throw new Error('Thresholds must be ordered: healthy ≥ watch ≥ risk ≥ critical (0–200).')
  }

  if (def.weight < 0 || def.weight > 1 || isNaN(def.weight)) {
    throw new Error('Weight must be a number between 0 and 1.')
  }

  // Check if existing doc exists (determines isNew)
  const existingSnap = await getDoc(registryDoc(def.key))
  const isNew = !existingSnap.exists()

  // For existing docs: verify key hasn't changed (immutable)
  if (!isNew) {
    const existingData = existingSnap.data() as Record<string, unknown>
    if (existingData.key !== def.key) {
      throw new Error('KPI key is immutable after creation.')
    }
  }

  const payload = buildDocPayload(def, uiStatus, isNew)

  await setDoc(registryDoc(def.key), payload, { merge: true })

  await logAction({
    action:     isNew ? AUDIT_ACTION.CREATE : AUDIT_ACTION.UPDATE,
    collection: COL.KPI_REGISTRY,
    docId:      def.key,
    userId:     auth?.currentUser?.uid,
    userRole:   'admin',
    meta:       { key: def.key, label: def.label, uiStatus },
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
    isActive:  false,
    uiStatus:  'ARCHIVED',
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true })

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
