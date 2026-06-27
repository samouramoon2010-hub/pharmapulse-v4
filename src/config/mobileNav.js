// ============================================================
// Canonical Mobile Navigation Model — PR-1E1
//
// Single source of truth for the mobile bottom nav's primary
// destinations, per role. MobileNav.jsx is the only consumer —
// Sidebar.jsx keeps its own NAV_CONFIG (the "More" drawer reuses
// Sidebar's existing role-aware resolveNav(role), it does not get
// a second copy of route metadata here).
//
// Every path below is a real, already-guarded App.jsx route. No
// route is invented and no permission is broadened — this module
// only decides which of a role's *already-authorized* routes are
// promoted to the bottom nav. See docs/production/MOBILE_NAVIGATION_MATRIX.md
// for the full audit trail (route guard cross-check, why each
// destination was chosen, and which spec-suggested destinations
// don't exist as real routes for that role).
// ============================================================
import {
  LayoutDashboard, ClipboardList, TrendingUp, Users,
  BarChart3, Trophy, Sparkles,
} from 'lucide-react'
import { getCanonicalRoleValue } from '../constants/roleScope'

const HOME       = { key: 'home',       icon: LayoutDashboard, label: 'Home',        path: '/dashboard', exact: true }
const KPI_ENTRY   = { key: 'entry',      icon: ClipboardList,   label: 'KPI Entry',    path: '/entry' }
const PERFORMANCE = { key: 'performance', icon: TrendingUp,      label: 'Performance',  path: '/performance' }
const MY_INTEL     = { key: 'my-intelligence', icon: Sparkles,   label: 'My Intelligence', path: '/my-intelligence' }
const TEAM         = { key: 'team',      icon: Users,           label: 'Team',         path: '/team' }
const REPORTS       = { key: 'reports',   icon: TrendingUp,      label: 'Reports',      path: '/reports' }
const RANKINGS       = { key: 'rankings', icon: Trophy,          label: 'Rankings',     path: '/admin/rankings' }
const EXECUTIVE_BI    = { key: 'executive', icon: BarChart3,     label: 'Executive BI', path: '/executive' }

// Pharmacist — matches Sidebar's own "My Work" -> "Intelligence Operations"
// priority order (KPI Entry, then Performance, then My Intelligence).
const PHARMACIST_NAV = [HOME, KPI_ENTRY, PERFORMANCE, MY_INTEL]

// Branch Manager (and its legacy alias 'manager') — Sidebar's "My Work"
// puts KPI Entry first; "Intelligence Operations" puts Team ahead of
// Executive BI. Rankings is admin-only (no route access at all for this
// role, confirmed in App.jsx) so it is never offered here.
const BRANCH_MANAGER_NAV = [HOME, KPI_ENTRY, TEAM, EXECUTIVE_BI]

// District Supervisor / Regional Manager — no KPI Entry (Sidebar gives
// these roles no "My Work" group at all; supervisors manage territory,
// not individual data entry). No Rankings (admin-only route).
const TERRITORY_NAV = [HOME, REPORTS, TEAM, EXECUTIVE_BI]

// General Manager — same shape as the territory roles (no KPI Entry, no
// Rankings; Team works without branch context via the scope resolver).
const GENERAL_MANAGER_NAV = [HOME, REPORTS, TEAM, EXECUTIVE_BI]

// Admin — the only role with a real Rankings route. No Team (Team is not
// in admin's Sidebar config at all — admin oversees via Executive BI/
// Rankings, not the Team Intelligence surface).
const ADMIN_NAV = [HOME, REPORTS, RANKINGS, EXECUTIVE_BI]

const NAV_BY_CANONICAL_ROLE = {
  pharmacist:          PHARMACIST_NAV,
  branch_manager:      BRANCH_MANAGER_NAV,
  district_supervisor: TERRITORY_NAV,
  regional_manager:    TERRITORY_NAV,
  general_manager:     GENERAL_MANAGER_NAV,
  admin:               ADMIN_NAV,
}

export const MOBILE_NAV_MAX_PRIMARY = 4

/**
 * Resolve a role's primary bottom-nav items (max 4, "More" is rendered
 * separately by MobileNav.jsx itself). Legacy 'manager' resolves through
 * getCanonicalRoleValue (PR-1B) to the same array as 'branch_manager' —
 * no duplicated route list, no renamed persisted role value.
 */
export function getMobilePrimaryNav(role) {
  const canonical = getCanonicalRoleValue(role) || 'pharmacist'
  return NAV_BY_CANONICAL_ROLE[canonical] || PHARMACIST_NAV
}
