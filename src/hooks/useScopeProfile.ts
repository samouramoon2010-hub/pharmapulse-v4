// ============================================================
// useScopeProfile — Phase 2C
//
// React integration layer for the Scope Resolver.
// Translates the current user's profile into a PharmacyScope
// that pages use for data filtering and access guards.
//
// Fast path:
//   resolveAllowedPharmacyIdsSync() is called on every
//   userProfile change. For admin/GM/single-branch roles this
//   always returns a non-null scope synchronously — zero async.
//
// Async fallback:
//   Only fires for district_supervisor / regional_manager when
//   their assignedPharmacyIds cache is absent (null / undefined).
//   loading = true while the compute is in flight.
//   On failure: scope is set to { type: 'none' } (restrict,
//   never expand) and error is captured.
//
// Race safety:
//   Each effect run sets a `cancelled` flag on cleanup.
//   Stale async results (from a superseded userProfile) are
//   dropped before they can update state.
//
// Dependencies:
//   uid, role, pharmacyId, assignedPharmacyIds
//   Changes to any of these trigger a full re-resolution.
//   assignedPharmacyIds is serialised to JSON for deep equality.
//
// Does NOT wire into any page.
// Does NOT modify App.jsx.
// Does NOT change Firestore rules or Executive BI.
// ============================================================

import { useState, useEffect } from 'react'
import { useAuthStore }               from '../store/authStore'
import {
  resolveAllowedPharmacyIdsSync,
  resolveAllowedPharmacyIds,
  type PharmacyScope,
} from '../services/scopeResolver'

// ── Return shape ──────────────────────────────────────────────

export interface ScopeProfileState {
  scope:   PharmacyScope | null
  loading: boolean
  error:   Error | null
}

// ── useScopeProfile ───────────────────────────────────────────

export function useScopeProfile(): ScopeProfileState {
  const { userProfile } = useAuthStore()

  const [state, setState] = useState<ScopeProfileState>({
    scope:   null,
    loading: false,
    error:   null,
  })

  // Derive stable primitives for the dependency array.
  // assignedPharmacyIds is serialised so array identity changes
  // do not cause spurious re-runs when the content is the same.
  const uid          = (userProfile?.uid ?? (userProfile as { id?: string } | null)?.id) ?? null
  const role         = userProfile?.role         ?? null
  const pharmacyId   = userProfile?.pharmacyId   ?? null
  const assignedKey  = JSON.stringify(
    (userProfile as { assignedPharmacyIds?: string[] | null } | null)?.assignedPharmacyIds ?? null,
  )

  useEffect(() => {
    // ── No user logged in ────────────────────────────────────
    if (!userProfile) {
      setState({ scope: null, loading: false, error: null })
      return
    }

    // Normalise the user object the resolvers expect
    const resolverUser = {
      uid:                 uid ?? '',
      role:                role ?? '',
      pharmacyId:          pharmacyId,
      assignedPharmacyIds: JSON.parse(assignedKey) as string[] | null,
    }

    // ── Fast path: synchronous resolve ───────────────────────
    const fast = resolveAllowedPharmacyIdsSync(resolverUser)
    if (fast !== null) {
      setState({ scope: fast, loading: false, error: null })
      return
    }

    // ── Async fallback: territory-role cache miss ────────────
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    resolveAllowedPharmacyIds(resolverUser)
      .then((profile) => {
        if (!cancelled) {
          setState({ scope: profile.scope, loading: false, error: null })
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            scope:   { type: 'none' },
            loading: false,
            error:   e instanceof Error ? e : new Error(String(e)),
          })
        }
      })

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, role, pharmacyId, assignedKey])

  return state
}
