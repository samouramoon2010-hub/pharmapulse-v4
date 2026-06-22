// ============================================================
// useActions — Actions Layer Hook (Phase 3C-2)
//
// Scope-aware React hook for reading suggestedActions.
// Consumes useScopeProfile() — never bypasses scope.
// Race-safe: stale async results are dropped on scope change.
//
// NO UI pages. NO signal generation. NO engine coupling.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, where, getDocs,
  type QueryConstraint,
} from 'firebase/firestore'
import { db }                from '../services/firebase'
import { useScopeProfile }   from './useScopeProfile'
import type { PharmacyScope } from '../services/scopeResolver'

// ── Types ─────────────────────────────────────────────────────

export interface ActionFilters {
  status?:   string
  priority?: string
  ownerId?:  string
  month?:    string
}

export interface SuggestedAction {
  id:                   string
  status:               string
  priority:             string
  signalType?:          string
  signalValue?:         number
  actionType?:          string
  relatedPharmacyId:    string
  relatedPharmacistId?: string
  relatedKpi?:          string
  ownerId?:             string
  ownerRole?:           string
  createdBy?:           string
  createdAt?:           unknown
  dueDate?:             string
  dismissReason?:       string
  month?:               string
}

export interface UseActionsState {
  actions: SuggestedAction[]
  loading: boolean
  error:   Error | null
  refresh: () => void
}

// ── Constants ─────────────────────────────────────────────────

const ACTIONS_COL = 'suggestedActions'
const CHUNK_SIZE  = 30  // Firestore 'in' query limit

// ── Utility: chunk array into groups of N ────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

// ── Core fetch (scope + client-side filters) ─────────────────
// Scope constraint applied in Firestore query.
// status / priority / ownerId / month applied client-side
// to avoid composite index requirements on a new collection.

async function fetchActions(
  scope: PharmacyScope,
  filters: ActionFilters,
): Promise<SuggestedAction[]> {
  if (scope.type === 'none') return []

  const col = collection(db, ACTIONS_COL)
  let results: SuggestedAction[] = []

  if (scope.type === 'all') {
    // No pharmacy filter — load all actions
    const snap = await getDocs(col)
    results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SuggestedAction))

  } else if (scope.type === 'single') {
    // Filter by the single assigned pharmacyId
    const q = query(
      col,
      where('relatedPharmacyId', '==', scope.id) as QueryConstraint,
    )
    const snap = await getDocs(q)
    results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SuggestedAction))

  } else if (scope.type === 'list') {
    const ids = scope.ids ?? []
    if (ids.length === 0) return []

    // Chunk ids to respect Firestore 'in' limit (max 30)
    const chunks = chunk(ids, CHUNK_SIZE)
    const rows = await Promise.all(
      chunks.map(async (group) => {
        const q = query(
          col,
          where('relatedPharmacyId', 'in', group) as QueryConstraint,
        )
        const snap = await getDocs(q)
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SuggestedAction))
      }),
    )
    results = rows.flat()
  }

  // Apply optional filters client-side
  if (filters.status)   results = results.filter((a) => a.status   === filters.status)
  if (filters.priority) results = results.filter((a) => a.priority === filters.priority)
  if (filters.ownerId)  results = results.filter((a) => a.ownerId  === filters.ownerId)
  if (filters.month)    results = results.filter((a) => a.month    === filters.month)

  return results
}

// ── useActions ────────────────────────────────────────────────

export function useActions(filters: ActionFilters = {}): UseActionsState {
  const { scope, loading: scopeLoading, error: scopeError } = useScopeProfile()

  const [actions, setActions] = useState<SuggestedAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<Error | null>(null)
  const [tick,    setTick]    = useState(0)

  // Stable serialised key — effect only re-runs when filters actually change
  const filtersKey = JSON.stringify(filters)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    // Waiting for scope resolution
    if (scopeLoading) {
      setLoading(true)
      return
    }

    // Scope resolution failed — surface error, clear actions
    if (scopeError) {
      setActions([])
      setError(scopeError)
      setLoading(false)
      return
    }

    // No scope or access denied — return empty without fetching
    if (!scope || scope.type === 'none') {
      setActions([])
      setError(null)
      setLoading(false)
      return
    }

    // Race safety — if scope or filters change while fetch is in flight,
    // the previous effect's cleanup sets cancelled = true and the stale
    // result is dropped before it can update state.
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchActions(scope, JSON.parse(filtersKey) as ActionFilters)
      .then((rows) => {
        if (!cancelled) {
          setActions(rows)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setActions([])
          setError(e instanceof Error ? e : new Error(String(e)))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeLoading, scopeError, filtersKey, tick])

  return { actions, loading, error, refresh }
}
