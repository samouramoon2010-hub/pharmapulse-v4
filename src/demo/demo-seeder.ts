// ============================================================
// Demo Data Seeder — RF-0E v1
//
// Writes to EXISTING production collections using demo tags.
// Every document includes: isDemoData:true, demoBatchId, scenarioName.
//
// Safety guarantees:
//   - Never overwrites real data (uses batch-scoped doc IDs)
//   - Dry-run writes nothing
//   - No Firebase Auth users created
//   - Cleanup only deletes docs where isDemoData===true AND demoBatchId matches
//
// Architecture:
//   - seeder is the ONLY file that writes to Firestore (batch writes via writeBatch)
//   - pure generation functions are separate from Firestore writes
//   - UI calls runDryRun() → then generateDemoBatch()
// ============================================================

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  writeBatch, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import {
  DEMO_BATCHES_COLLECTION,
  DEMO_KPI_ENGINE_KEYS,
  DEMO_TARGET_FIELDS,
  BASE_BRANCH_TARGETS,
  PERFORMER_ACHIEVEMENT,
  PERFORMER_ACTIVE_DAYS,
  DEMO_CITIES,
  DEMO_PHARMACIST_NAMES,
} from './constants'
import { createStandardMixedScenario, PHARMACIST_PATTERN_BY_CLASS } from './scenario-standard-mixed'
import type {
  DemoBatchDoc, DemoTags, DemoEntityCounts, DryRunReport,
  ScenarioDefinition, PerformerType, GeneratedPharmacy, GeneratedUser,
} from './types'

// ── Batch size ────────────────────────────────────────────────

const BATCH_SIZE = 400   // conservative (<500 limit)

// ── PRNG (deterministic for dry-run reproducibility) ──────────

function seededRand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function randBetween(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function randFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

// ── ID generators ─────────────────────────────────────────────

export function generateBatchId(): string {
  const ts   = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `DEMO_${ts}_${rand}`
}

function demoPharmacyCode(batchId: string, codePrefix: string, index: number): string {
  return `${codePrefix}${String(index).padStart(2, '0')}_${batchId.slice(-4)}`
}

function demoUserId(batchId: string, index: number): string {
  return `demo_user_${batchId}_${String(index).padStart(3, '0')}`
}

// ── Working days in a month ───────────────────────────────────

function getWorkingDates(month: string, count: number, rng: () => number): string[] {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const allDates: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m - 1, d)
    const dow  = date.getDay()
    if (dow !== 5) {   // exclude Friday (Saudi weekend)
      allDates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  // Shuffle and take `count`
  for (let i = allDates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allDates[i], allDates[j]] = [allDates[j], allDates[i]]
  }
  return allDates.slice(0, count).sort()
}

// ── Pure data builders ────────────────────────────────────────

export interface GeneratedBranchTarget {
  docId:      string   // {pharmacyId}_{month}
  pharmacyId: string
  month:      string
  fields:     Record<string, number>
}

export interface GeneratedPersonalTarget {
  docId:      string   // {userId}_{pharmacyId}_{month}
  userId:     string
  pharmacyId: string
  month:      string
  targets:    Record<string, number>   // engine keys
}

export interface GeneratedKpiEntry {
  docId:      string   // {userId}_{pharmacyId}_{date}
  userId:     string
  pharmacyId: string
  date:       string
  values:     Record<string, number>
}

export interface GeneratedBatch {
  batchId:        string
  scenario:       ScenarioDefinition
  pharmacies:     { code: string; name: string; classificationId: string; city: string }[]
  users:          { id: string; displayName: string; email: string; pharmacyId: string; performerType: PerformerType }[]
  branchTargets:  GeneratedBranchTarget[]
  personalTargets: GeneratedPersonalTarget[]
  kpiEntries:     GeneratedKpiEntry[]
}

/**
 * Generate all demo data IN MEMORY — no Firestore writes.
 * Used by dry-run and by the actual write step.
 *
 * pharmacyIds are placeholders in dry-run mode (Firestore IDs not known yet).
 * In write mode, real Firestore IDs are passed in via pharmacyIdMap.
 */
export function generateBatchData(
  scenario: ScenarioDefinition,
  batchId:  string,
  pharmacyIdMap?: Map<string, string>,  // code → real Firestore ID
): GeneratedBatch {
  const rng = seededRand(batchId.split('').reduce((a, c) => a + c.charCodeAt(0), 0))

  const pharmacies: GeneratedBatch['pharmacies'] = []
  const users: GeneratedBatch['users'] = []
  const branchTargets: GeneratedBranchTarget[] = []
  const personalTargets: GeneratedPersonalTarget[] = []
  const kpiEntries: GeneratedKpiEntry[] = []

  // Track per-classification code index
  const classCount: Record<string, number> = {}
  let userIndex = 0
  let nameIndex = 0

  for (const branchSpec of scenario.branches) {
    classCount[branchSpec.classificationId] = (classCount[branchSpec.classificationId] ?? 0) + 1
    const idx  = classCount[branchSpec.classificationId]
    const code = demoPharmacyCode(batchId, branchSpec.codePrefix, idx)
    const city = DEMO_CITIES[Math.floor(rng() * DEMO_CITIES.length)]
    const name = `${branchSpec.namePrefix} ${idx}`

    pharmacies.push({ code, name, classificationId: branchSpec.classificationId, city })

    // Use real pharmacyId if available (write mode), otherwise use code as placeholder
    const pharmacyId = pharmacyIdMap?.get(code) ?? `placeholder_${code}`

    // Branch targets
    const targetFields: Record<string, number> = {}
    for (const kpiKey of DEMO_KPI_ENGINE_KEYS) {
      const base   = BASE_BRANCH_TARGETS[kpiKey]
      const scaled = Math.round(base * branchSpec.targetMultiplier * (0.9 + rng() * 0.2))
      targetFields[DEMO_TARGET_FIELDS[kpiKey]] = scaled
    }
    branchTargets.push({
      docId:      `${pharmacyId}_${scenario.month}`,
      pharmacyId,
      month:      scenario.month,
      fields:     targetFields,
    })

    // Pharmacists for this branch
    const pattern = PHARMACIST_PATTERN_BY_CLASS[branchSpec.classificationId] ?? ['average', 'average', 'average']

    for (let p = 0; p < scenario.pharmacistsPerBranch; p++) {
      const performerType = pattern[p % pattern.length] as PerformerType
      const userId       = demoUserId(batchId, userIndex)
      const displayName  = DEMO_PHARMACIST_NAMES[nameIndex % DEMO_PHARMACIST_NAMES.length]
      const email        = `demo.${userId}@pharmapulse.test`

      users.push({ id: userId, displayName, email, pharmacyId, performerType })

      // Personal targets — split branch targets with slight variation
      const personalTargetValues: Record<string, number> = {}
      for (const kpiKey of DEMO_KPI_ENGINE_KEYS) {
        const branchTarget = targetFields[DEMO_TARGET_FIELDS[kpiKey]] / scenario.pharmacistsPerBranch
        const variation    = 0.85 + rng() * 0.30   // ±15% variation
        personalTargetValues[kpiKey] = Math.round(branchTarget * variation)
      }
      personalTargets.push({
        docId:      `${userId}_${pharmacyId}_${scenario.month}`,
        userId,
        pharmacyId,
        month:      scenario.month,
        targets:    personalTargetValues,
      })

      // KPI entries
      const [achieveMin, achieveMax] = PERFORMER_ACHIEVEMENT[performerType] ?? [80, 100]
      const [daysMin, daysMax]       = PERFORMER_ACTIVE_DAYS[performerType] ?? [20, 25]
      const activeDays               = randBetween(rng, daysMin, daysMax)
      const dates                    = getWorkingDates(scenario.month, activeDays, rng)

      for (const date of dates) {
        const values: Record<string, number> = {}
        for (const kpiKey of DEMO_KPI_ENGINE_KEYS) {
          const dailyTarget  = personalTargetValues[kpiKey] / activeDays
          const achievePct   = randFloat(rng, achieveMin / 100, achieveMax / 100)
          const actual       = Math.max(0, Math.round(dailyTarget * achievePct * (0.85 + rng() * 0.3)))
          values[kpiKey]     = actual
        }
        kpiEntries.push({
          docId:      `${userId}_${pharmacyId}_${date}`,
          userId,
          pharmacyId,
          date,
          values,
        })
      }

      userIndex++
      nameIndex++
    }
  }

  return { batchId, scenario, pharmacies, users, branchTargets, personalTargets, kpiEntries }
}

// ── Dry-run ───────────────────────────────────────────────────

/**
 * Run a dry-run: generate data in memory, return summary report.
 * WRITES NOTHING to Firestore.
 */
export function runDryRun(scenarioName: string, month?: string): DryRunReport {
  const scenario = createStandardMixedScenario(month)
  const batchId  = 'DRY_RUN_PREVIEW'
  const data     = generateBatchData(scenario, batchId)

  const estimatedWrites =
    data.pharmacies.length +
    data.users.length +
    data.branchTargets.length +
    data.personalTargets.length +
    data.kpiEntries.length +
    1   // batch metadata doc

  return {
    scenarioName:        scenario.name,
    month:               scenario.month,
    branches:            data.pharmacies.map((p) => ({
      name:           p.name,
      code:           p.code,
      classification: p.classificationId,
    })),
    pharmacists:         data.users.map((u) => ({
      name:         u.displayName,
      pharmacyName: data.pharmacies.find((p) => `placeholder_${p.code}` === u.pharmacyId || p.code === u.pharmacyId)?.name ?? u.pharmacyId,
      performerType: u.performerType,
    })),
    targetCount:         data.branchTargets.length,
    personalTargetCount: data.personalTargets.length,
    kpiEntryCount:       data.kpiEntries.length,
    estimatedWrites,
  }
}

// ── Write ─────────────────────────────────────────────────────

/**
 * Generate and persist a full demo batch to Firestore.
 *
 * Steps:
 *   1. Write pharmacies (addDoc → collect real IDs)
 *   2. Re-generate data with real pharmacy IDs
 *   3. Write users, targets, personal_targets, kpi_entries in batches
 *   4. Write batch metadata doc
 */
export async function generateDemoBatch(
  scenarioName: string,
  generatedBy:  string,
  month?:       string,
): Promise<{ batchId: string; counts: DemoEntityCounts }> {
  const batchId   = generateBatchId()
  const scenario  = createStandardMixedScenario(month)
  const now       = new Date().toISOString()

  const tags: DemoTags = {
    isDemoData:   true,
    demoBatchId:  batchId,
    scenarioName: scenario.name,
    generatedAt:  now,
    generatedBy,
  }

  // ── Step 1: write pharmacies, collect real IDs ────────────────
  const pharmacyIdMap = new Map<string, string>()   // code → Firestore ID
  const dryData = generateBatchData(scenario, batchId)

  for (const p of dryData.pharmacies) {
    const payload = {
      code:                         p.code,
      name:                         p.name,
      city:                         p.city,
      region:                       p.city,
      active:                       true,
      branchClassification:         p.classificationId,
      branchClassificationSetAt:    now,
      branchClassificationSource:   'admin',
      schemaVersion:                1,
      createdAt:                    serverTimestamp(),
      updatedAt:                    serverTimestamp(),
      createdBy:                    generatedBy,
      ...tags,
    }
    const ref = await addDoc(collection(db, 'pharmacies'), payload)
    pharmacyIdMap.set(p.code, ref.id)
  }

  // ── Step 2: re-generate with real pharmacy IDs ────────────────
  const data = generateBatchData(scenario, batchId, pharmacyIdMap)

  const ops: Array<() => void> = []
  const batches: ReturnType<typeof writeBatch>[] = []
  let currentBatch = writeBatch(db)
  let opCount = 0

  const flush = () => {
    if (opCount > 0) {
      batches.push(currentBatch)
      currentBatch = writeBatch(db)
      opCount = 0
    }
  }

  const enqueue = (ref: any, payload: Record<string, unknown>) => {
    if (opCount >= BATCH_SIZE) flush()
    currentBatch.set(ref, payload)
    opCount++
  }

  // ── Step 3a: users ────────────────────────────────────────────
  for (const u of data.users) {
    const ref = doc(db, 'users', u.id)
    enqueue(ref, {
      displayName:     u.displayName,
      email:           u.email,
      role:            'pharmacist',
      status:          'active',
      active:          true,
      pharmacyId:      u.pharmacyId,
      regionId:        null,
      districtId:      null,
      regionIds:       [],
      phone:           '',
      employeeId:      u.id,
      tenantId:        'default',
      accessScopes:    [`store:${u.pharmacyId}`],
      temporaryScopes: [],
      scopeVersion:    1,
      createdAt:       serverTimestamp(),
      updatedAt:       serverTimestamp(),
      createdBy:       generatedBy,
      ...tags,
    })
  }

  // ── Step 3b: branch targets ───────────────────────────────────
  for (const t of data.branchTargets) {
    const ref = doc(db, 'targets', t.docId)
    enqueue(ref, {
      pharmacyId: t.pharmacyId,
      month:      t.month,
      ...t.fields,
      updatedAt:  serverTimestamp(),
      createdAt:  serverTimestamp(),
      ...tags,
    })
  }

  // ── Step 3c: personal targets ─────────────────────────────────
  for (const pt of data.personalTargets) {
    const ref = doc(db, 'personal_targets', pt.docId)
    enqueue(ref, {
      userId:          pt.userId,
      pharmacyId:      pt.pharmacyId,
      month:           pt.month,
      targets:         pt.targets,
      allocationMethod: 'equal',
      status:          'published',
      publishedAt:     serverTimestamp(),
      createdBy:       generatedBy,
      createdAt:       serverTimestamp(),
      updatedAt:       serverTimestamp(),
      ...tags,
    })
  }

  // ── Step 3d: KPI entries ──────────────────────────────────────
  for (const entry of data.kpiEntries) {
    const ref = doc(db, 'kpi_entries', entry.docId)
    enqueue(ref, {
      userId:      entry.userId,
      pharmacyId:  entry.pharmacyId,
      date:        entry.date,
      ...entry.values,
      notes:       '',
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
      submittedBy: generatedBy,
      createdBy:   generatedBy,
      ...tags,
    })
  }

  flush()

  // Commit all batches — each batch is atomic.
  // If a batch fails (e.g. Firestore rule violation on any doc), it throws.
  // Without try/catch here the failure was previously silent — the function
  // continued to write the batch metadata doc claiming "ready" while 0 users
  // were actually written.
  let batchesCommitted = 0
  for (const batch of batches) {
    await batch.commit()
    batchesCommitted++
  }

  // ── Step 4: write batch metadata ─────────────────────────────
  const counts: DemoEntityCounts = {
    pharmacies:      data.pharmacies.length,
    users:           data.users.length,
    targets:         data.branchTargets.length,
    personalTargets: data.personalTargets.length,
    kpiEntries:      data.kpiEntries.length,
  }

  const batchDoc: Omit<DemoBatchDoc, 'generatedAt'> & { generatedAt: unknown } = {
    demoBatchId:  batchId,
    scenarioName: scenario.name,
    status:       'ready',
    generatedAt:  serverTimestamp(),
    generatedBy,
    entityCounts: counts,
    isDemoData:   true,
  }
  await setDoc(doc(db, DEMO_BATCHES_COLLECTION, batchId), batchDoc)

  return { batchId, counts }
}

// ── List active demo batches ──────────────────────────────────

export async function listDemoBatches(): Promise<DemoBatchDoc[]> {
  // Fetch all docs in the collection (admin-only per rules).
  // Client-side filter on isDemoData is a safety belt — the collection
  // itself only ever contains demo docs, but filtering here makes it
  // explicit and removes any compound-index requirement.
  const snap = await getDocs(collection(db, DEMO_BATCHES_COLLECTION))
  return snap.docs
    .map((d) => ({ ...d.data() } as DemoBatchDoc))
    .filter((d) => d.isDemoData === true)
}
