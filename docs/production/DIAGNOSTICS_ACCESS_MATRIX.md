# Diagnostics & Migration Surfaces — Access Matrix (PR-1C)

Every admin-area page that is primarily a diagnostic, migration, or
internal-architecture surface (as opposed to day-to-day business
operation), with its classification and access rule.

| Surface | Route | Classification | Access rule |
|---|---|---|---|
| Dynamic KPI Shadow Visibility | `/admin/dynamic-kpi-shadow` | **Developer-only** | Route stays `admin`-gated (`PR roles={ADMIN}` in `App.jsx`) for defense-in-depth, but the Sidebar nav entry is marked `devOnly:true` and filtered out of the rendered menu in production builds (`resolveNav()` in `Sidebar.jsx`). Reachable by direct URL in dev mode only as a practical matter — not linked from production navigation. |
| Evaluation Run | `/admin/evaluation-run` | **Retain as admin-only** | Triggers real evaluation execution for real branches — an operational action, not a pure diagnostic. Stays in normal admin navigation, `admin`-gated. |
| Branch Classifications | `/admin/classifications` | **Retain as admin-only** | Business configuration (territory/branch tiering), not a migration tool. Stays in normal admin navigation, `admin`-gated. |
| Rankings (admin preview) | `/admin/rankings` | **Retain as admin-only** | Business-facing ranking preview, not internal architecture. Stays in normal admin navigation, `admin`-gated. |
| KPI Registry | `/admin/kpis` | **Retain as admin-only, simplified this section** | Genuine business configuration surface (PR-1C removed the misleading Core badge and added the archive dependency guard here — see `KPI_REGISTRY_GOVERNANCE.md`). |
| Evaluation Registry | `/admin/evaluation-registry` | **Retain as admin-only** | The official profile-authoring surface for the live engine. Version-grouping cleanup applied this section — see `EVALUATION_PROFILE_LIFECYCLE.md`. |
| Profile Studio | `/profile-studio` | **Retain — authoring tool, now explicitly labeled as such** | Visible to `admin`, `general_manager`, `district_supervisor`, `manager`. Not a diagnostic surface, but carried a real mislabeling risk (its own "Published" status could be mistaken for production activation) — fixed this section with an explicit banner. |
| Demo Data Seeder | `/admin/demo-data` | **Retain as admin-only** | Already environment-aware and batch-scoped (see `KPI_REGISTRY_GOVERNANCE.md` demo/test classification); not a migration tool, a deliberate admin utility. |

No surface in this list was found to require retirement (no dependency-free
dead migration tool was found) or to need a *new* hidden-from-business-users
treatment beyond Dynamic KPI Shadow, which was the one genuine
developer-only migration/parity diagnostic mixed into ordinary admin
navigation.

## Navigation rules verified

- Pharmacist, Branch Manager, District Supervisor, Regional Manager nav
  configs in `Sidebar.jsx` never included any of the surfaces above except
  Profile Studio (already role-scoped) and the now explicitly-labeled
  Evaluation Registry preview pages they're entitled to — confirmed via
  `NAV_CONFIG` per-role definitions.
- A normal (non-admin) production admin sees every surface above **except**
  Dynamic KPI Shadow, by design — every other surface is genuinely
  operationally useful to a production admin (KPI configuration, profile
  authoring, evaluation execution, branch classification, rankings, demo
  data), not just to a developer.
- Route guards (`<PR roles={...}>` in `App.jsx`) are unchanged and remain
  the authoritative enforcement layer — the Sidebar `devOnly` filter is a
  navigation-visibility convenience only, never the security boundary.

## Language cleanup

Reviewed all eight surfaces above for business-user-facing technical
jargon (API schema names, migration payload terminology, raw collection
names, serialization format details). None were found exposed outside of
the existing `process.env.NODE_ENV !== 'production'`-gated debug panels
already certified in PR-1A (see `debugUidMasking.pr1a.test.ts` and the
debug panel in `EvaluationRegistryPage.tsx` lines ~931–947, which prints
`uid`/`role`/`loading`/`profiles.length`/`filtered.length` only in
non-production builds). No change required.
