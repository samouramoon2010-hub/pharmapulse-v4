# Full Reset — RETAIN Allowlist

**Read-only dry-run document. No Firestore document, Firebase Auth user,
or application file was mutated to produce this list.**

## Live Read-Only Count Evidence (2026-07-06)

Verified live against project `pharmapulse-646de`, inside the confirmed
real admin's own authenticated session (masked uid `2hs9***`, masked
email `ad***@pharmapulse.com`, `role: admin`, `active: true`). All reads
only — `getCountFromServer`/`getDocs`/`getDoc`, zero writes. Full
methodology in `FULL_RESET_DRY_RUN_REPORT.md`.

| Protected collection | Live count |
|---|---|
| `kpi_registry` | 18 total, **18 active**, 0 archived |
| `kpi_audit_logs` | 0 |
| `evaluation_profiles` | 21 total (17 archived, 3 published, 1 draft) |
| `system_config` | 1 |
| `districts` | 0 |
| `regions` | 0 |
| `classifications` | 5 |
| `audit_logs` | 849 |

**Real admin, confirmed:** exactly 1 account with `role: admin` exists
among the 10 real (non-demo-tagged) `users` documents — no ambiguity, no
second candidate found.

This is the hard allowlist for any future cleanup tool. Every collection
and document class below **must never be deleted, archived, disabled, or
mutated** by a cleanup run, regardless of confidence level elsewhere in
the manifest. If a future automated tool cannot prove a document is
outside this list, it must default to skipping it (fail closed).

## Collections — always retain in full

| Collection | Why |
|---|---|
| `kpi_registry` | Definition layer for every KPI. Explicitly protected per this task's instructions — never deleted. Old KPIs are archived/deactivated *within* the registry, never removed as documents. |
| `kpi_audit_logs` | Append-only audit trail for KPI Registry changes (Milestone 3.5). Compliance-style record. |
| `evaluation_profiles` (and its `drafts` subcollection) | Versioned scoring-rule profiles — the legal record of how every historical score was computed. Drafts may represent in-progress admin work. |
| `system_config` | Runtime feature-flag/config documents required for the app to start correctly. |
| `districts` | Territory hierarchy root — referenced by `pharmacies`/`users`. |
| `regions` | Territory hierarchy tier — referenced by `pharmacies`/`users`, `districts`. |
| `classifications` | Branch classification/grouping — drives ranking/leaderboard cohorting. |
| `audit_logs` | Immutable action log. Compliance-style; resetting destroys the only who-did-what record. |

## Documents — retain regardless of collection-wide policy

| Class | Rule |
|---|---|
| Real admin/owner account | Any `users` document with `role ∈ {admin, general_manager}`, `active !== false`, `authStatus !== 'CLAIMED'`, and **no** `isDemoData` field. See `FULL_RESET_DRY_RUN_REPORT.md` §"Real admin protection" for the exact identification procedure — this document is excluded from every group in `FULL_RESET_DELETE_MANIFEST.md` without exception. |
| Real (non-demo) `pharmacies` | Any `pharmacies` document without `isDemoData === true`. |
| Real (non-demo) `users` | Any `users` document without `isDemoData === true` — this includes every real pharmacist, manager, district_supervisor, regional_manager, and general_manager account, not only the admin. |
| Real (non-demo) `targets` / `personal_targets` | Any document without `isDemoData === true`. |
| Real (non-demo) `kpi_entries` | Any document without `isDemoData === true` — including entries written manually by real users during onboarding/testing-by-real-staff, unless independently confirmed experimental (see MANUAL REVIEW rules — do not infer from absence of `isDemoData` alone that a manually-entered row is "real"; the instruction separately calls out "manually entered experimental KPI entries" as a DELETE CANDIDATE class distinct from the demo-tag mechanism — see `FULL_RESET_DELETE_MANIFEST.md` §2). |
| Active/published `evaluation_profiles` version | The profile version currently marked as the active/published version for scoring. Never touched even if older superseded versions are ever reviewed. |
| Any KPI in `kpi_registry` currently marked active | Retained even if a human decides it should later be archived — archiving is a registry-internal state change, not a document deletion, and is out of scope for this cleanup exercise entirely. |

## Confirmed via code (not inferred)

- `demo-cleanup.ts`'s own safety contract already enforces the same
  invariant this allowlist codifies: *"Every document is checked
  client-side BEFORE deletion: `doc.isDemoData === true` (must be present
  and exactly true). Any document missing this field is SKIPPED — never
  deleted."* This dry run adopts that same contract as the baseline
  safety rule for every DELETE CANDIDATE group, and extends it with
  additional groups the existing tool does not cover (see
  `FULL_RESET_DELETE_MANIFEST.md`).
- `src/demo/demo-seeder.ts` only ever creates `role: 'pharmacist'` users
  (confirmed: the only `role:` assignment in the seeder is
  `role: 'pharmacist'`, line 361). **No demo/fake admin account has ever
  been seeded by this tool.** This means any `users` document with
  `role ∈ {admin, general_manager}` can be trusted as real without
  needing to additionally rule out a seeded impostor — the seeder
  structurally cannot produce one.

## What this allowlist does NOT cover

This list is the *retain* side. The corresponding delete-candidate and
manual-review classification is in `FULL_RESET_DELETE_MANIFEST.md`. Where
a collection or document does not appear on this list and is not
explicitly classified as a delete candidate, it defaults to **MANUAL
REVIEW** — never to deletion by default.
