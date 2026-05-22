// ============================================================
// History Service — Firestore write layer for History Layer V1
//
// Responsibility:
//   Read data needed from Firestore → run engine generators →
//   write summaries/snapshots in a single batched write.
//
// Called by: kpiService.saveKpiEntry() (fire-and-forget)
// Never throws to the caller — all errors are caught internally.
// ============================================================
import {
  collection, doc, getDoc, getDocs, setDoc,
  query, where, orderBy, limit, writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'

// Engine V1 — pure functions, no Firebase deps
import {
  generateDailySummary,
  generateForecastSnapshot,
  generateRiskSnapshot,
  computeRankingHistory,
  dailySummaryId,
  forecastSnapshotId,
  riskSnapshotId,
  rankingHistoryId,
  monthString,
} from '../engine/historyEngine'

// ── Internal helpers ──────────────────────────────────────────

/**
 * Fetch the monthly target for a branch+month.
 * Returns null if not found — generators handle null gracefully.
 */
async function fetchTarget(pharmacyId, month) {
  try {
    const snap = await getDoc(doc(db, COL.TARGETS, `${pharmacyId}_${month}`))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch (e) {
    console.warn('[historyService] Could not fetch target:', e.message)
    return null
  }
}

/**
 * Fetch all MTD kpi_entries for a specific user + pharmacy + month.
 * Used for daily summary and forecast snapshot.
 */
async function fetchMTDEntries(userId, pharmacyId, month) {
  try {
    const fromDate = `${month}-01`
    const [yyyy, mm] = month.split('-').map(Number)
    const toDate   = `${month}-${new Date(yyyy, mm, 0).getDate().toString().padStart(2, '0')}`

    const q = query(
      collection(db, COL.KPI_ENTRIES),
      where('userId',     '==', userId),
      where('pharmacyId', '==', pharmacyId),
      where('date',       '>=', fromDate),
      where('date',       '<=', toDate),
      orderBy('date', 'asc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[historyService] Could not fetch MTD entries:', e.message)
    return []
  }
}

/**
 * Fetch today's kpi_entries for the entire branch.
 * Used for risk snapshot.
 */
async function fetchBranchTodayEntries(pharmacyId, date) {
  try {
    const q = query(
      collection(db, COL.KPI_ENTRIES),
      where('pharmacyId', '==', pharmacyId),
      where('date',       '==', date),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[historyService] Could not fetch branch entries:', e.message)
    return []
  }
}

/**
 * Fetch all MTD entries for the entire branch this month.
 * Used for ranking history.
 */
async function fetchBranchMTDEntries(pharmacyId, month) {
  try {
    const [yyyy, mm] = month.split('-').map(Number)
    const fromDate   = `${month}-01`
    const toDate     = `${month}-${new Date(yyyy, mm, 0).getDate().toString().padStart(2, '0')}`

    const q = query(
      collection(db, COL.KPI_ENTRIES),
      where('pharmacyId', '==', pharmacyId),
      where('date',       '>=', fromDate),
      where('date',       '<=', toDate),
      orderBy('date', 'asc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[historyService] Could not fetch branch MTD entries:', e.message)
    return []
  }
}

/**
 * Fetch all pharmacist UIDs in a branch.
 * Used for risk snapshot (missing submissions detection)
 * and ranking history.
 */
async function fetchBranchPharmacists(pharmacyId) {
  try {
    const q = query(
      collection(db, COL.USERS),
      where('pharmacyId', '==', pharmacyId),
      where('role',       '==', 'pharmacist'),
      where('active',     '==', true),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({
      uid:         d.id,
      displayName: d.data().displayName || 'Unknown',
      pharmacyId:  d.data().pharmacyId,
    }))
  } catch (e) {
    console.warn('[historyService] Could not fetch branch pharmacists:', e.message)
    return []
  }
}

/**
 * Fetch previous ranking for delta calculation.
 * Returns empty array if no previous ranking exists.
 */
async function fetchPreviousRanking(pharmacyId, currentMonth) {
  try {
    // Previous month
    const [yyyy, mm] = currentMonth.split('-').map(Number)
    const prevDate   = new Date(yyyy, mm - 2, 1)  // go back one month
    const prevMonth  = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    const snap = await getDoc(doc(db, COL.RANKING_HISTORY, rankingHistoryId(pharmacyId, prevMonth)))
    if (!snap.exists()) return []
    return snap.data().rankings || []
  } catch (e) {
    // Non-critical — ranking delta will be 0
    return []
  }
}

// ── Main trigger function ─────────────────────────────────────

/**
 * Trigger all history snapshots after a successful KPI entry save.
 *
 * Write order:
 *   Batch 1: daily_summary + forecast_snapshot (user-level)
 *   Batch 2: risk_snapshot + ranking_history   (branch-level)
 *
 * Uses writeBatch for atomic writes within each batch.
 * Failures in batch 2 do NOT affect batch 1 or the original KPI entry.
 *
 * @param userId      - Pharmacist UID
 * @param pharmacyId  - Branch ID
 * @param date        - KPI entry date "yyyy-MM-dd"
 * @param actorId     - Who triggered the save
 * @param actorRole   - Role of actor
 */
export async function triggerHistorySnapshots(userId, pharmacyId, date, actorId, actorRole) {
  const month = date.slice(0, 7)

  console.log('[historyService] Starting history snapshots:', { userId, pharmacyId, date, month })

  // ── Fetch shared data ─────────────────────────────────────────
  const [target, mtdEntries] = await Promise.all([
    fetchTarget(pharmacyId, month),
    fetchMTDEntries(userId, pharmacyId, month),
  ])

  // ── BATCH 1: User-level snapshots ─────────────────────────────
  // daily_summary + forecast_snapshot — write atomically
  let batch1Success = false
  try {
    const dailySummary    = generateDailySummary(userId, pharmacyId, date, mtdEntries, target)
    const forecastSnap    = generateForecastSnapshot(userId, pharmacyId, date, mtdEntries, target)

    const batch1 = writeBatch(db)

    // daily_summaries/{userId}_{pharmacyId}_{date}
    batch1.set(
      doc(db, COL.DAILY_SUMMARIES, dailySummaryId(userId, pharmacyId, date)),
      {
        ...dailySummary,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // forecast_snapshots/{userId}_{pharmacyId}_{date}
    batch1.set(
      doc(db, COL.FORECAST_SNAPSHOTS, forecastSnapshotId(userId, pharmacyId, date)),
      {
        ...forecastSnap,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    await batch1.commit()
    batch1Success = true
    console.log('[historyService] Batch 1 committed: daily_summary + forecast_snapshot')

    // Audit log for batch 1
    await logAction({
      action:     AUDIT_ACTION.CREATE,
      collection: COL.DAILY_SUMMARIES,
      docId:      dailySummaryId(userId, pharmacyId, date),
      userId:     actorId || userId,
      userRole:   actorRole,
      after:      {
        overallAchievement: dailySummary.overallAchievement,
        weakestKpi:         dailySummary.weakestKpi,
        riskLevel:          dailySummary.riskLevel,
        forecastAchievement:dailySummary.forecastAchievement,
      },
    })
  } catch (e) {
    // Batch 1 failure — log clearly, continue to batch 2
    console.error('[historyService] Batch 1 failed (daily_summary + forecast_snapshot):', {
      userId, pharmacyId, date,
      error: e.message,
      stack: e.stack,
    })
  }

  // ── BATCH 2: Branch-level snapshots ───────────────────────────
  // risk_snapshot + ranking_history
  // These require more data — fetch independently from batch 1
  try {
    const [todayBranchEntries, branchMTDEntries, branchPharmacists, prevRanking] = await Promise.all([
      fetchBranchTodayEntries(pharmacyId, date),
      fetchBranchMTDEntries(pharmacyId, month),
      fetchBranchPharmacists(pharmacyId),
      fetchPreviousRanking(pharmacyId, month),
    ])

    const pharmacistUids = branchPharmacists.map((p) => p.uid)

    const riskSnap = generateRiskSnapshot(
      pharmacyId, date,
      todayBranchEntries, branchMTDEntries,
      target, pharmacistUids,
    )

    // Build ranking profiles — group MTD entries per pharmacist
    const rankingProfiles = branchPharmacists.map((p) => ({
      userId:      p.uid,
      displayName: p.displayName,
      mtdEntries:  branchMTDEntries.filter((e) => e.userId === p.uid),
    }))

    const rankingHistory = computeRankingHistory(
      pharmacyId, month,
      rankingProfiles,
      target,
      prevRanking,
    )

    const batch2 = writeBatch(db)

    // risk_snapshots/{pharmacyId}_{date}
    batch2.set(
      doc(db, COL.RISK_SNAPSHOTS, riskSnapshotId(pharmacyId, date)),
      {
        ...riskSnap,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // ranking_history/{pharmacyId}_{month}
    batch2.set(
      doc(db, COL.RANKING_HISTORY, rankingHistoryId(pharmacyId, month)),
      {
        ...rankingHistory,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    await batch2.commit()
    console.log('[historyService] Batch 2 committed: risk_snapshot + ranking_history', {
      riskLevel:         riskSnap.riskLevel,
      submissionRate:    riskSnap.submissionRate,
      missingCount:      riskSnap.missingPharmacists.length,
      pharmacistsRanked: rankingHistory.rankings.length,
    })
  } catch (e) {
    // Batch 2 failure — log clearly, but KPI save already succeeded
    console.error('[historyService] Batch 2 failed (risk_snapshot + ranking_history):', {
      pharmacyId, date,
      error: e.message,
      stack: e.stack,
    })
  }

  // Summary log
  console.log('[historyService] History snapshot trigger complete:', {
    userId, pharmacyId, date,
    batch1: batch1Success ? 'OK' : 'FAILED',
    collectionsTargeted: [
      COL.DAILY_SUMMARIES,
      COL.FORECAST_SNAPSHOTS,
      COL.RISK_SNAPSHOTS,
      COL.RANKING_HISTORY,
    ],
  })
}
