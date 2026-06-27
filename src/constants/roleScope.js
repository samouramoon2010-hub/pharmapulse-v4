// ============================================================
// Canonical Role + Scope Contract — PR-1B
//
// Single source of truth for: production UI label, role level,
// required scope type, and whether a role is organization-wide.
// Every surface that needs a role label or a "does this role need
// a branch/district/region" answer must import from here instead
// of hardcoding its own copy.
//
// Internal role values are never renamed — only how they are
// labeled and validated changes. 'manager' is kept as the
// long-standing backward-compatible alias for 'branch_manager';
// existing user documents with role:'manager' continue to work
// unchanged everywhere (scopeResolver, Firestore rules, this map).
//
// Scope source of truth (read by territorySync.ts, not invented
// here): pharmacyId (branch roles), districtId (district_supervisor),
// regionIds[] (regional_manager). admin/general_manager carry no
// branch/district/region field — their scope is the literal absence
// of one, resolved to { type: 'all' } by scopeResolver.ts.
//
// No "area" entity exists anywhere in this codebase. Area Manager
// is not a distinct role — general_manager's existing org-wide
// scope is the only available organization/area-level scope today.
// ============================================================

/** @typedef {'branch'|'district'|'region'|'none'} RequiredScopeType */

/**
 * @typedef {Object} RoleMeta
 * @property {string} value          - internal persisted role value (never renamed)
 * @property {string} label          - canonical production UI label (English)
 * @property {number} level          - higher = broader authority (for isAtLeast-style checks)
 * @property {RequiredScopeType} requiredScope
 * @property {boolean} isLegacyAlias - true for roles kept only for backward compatibility
 * @property {boolean} isOrgWide     - true when the role's scope is the whole organization
 */

/** @type {RoleMeta[]} */
export const ROLE_METADATA = [
  { value: 'admin',               label: 'Admin',               level: 100, requiredScope: 'none',     isLegacyAlias: false, isOrgWide: true  },
  { value: 'general_manager',     label: 'General Manager',     level: 90,  requiredScope: 'none',     isLegacyAlias: false, isOrgWide: true  },
  { value: 'regional_manager',    label: 'Regional Manager',    level: 70,  requiredScope: 'region',   isLegacyAlias: false, isOrgWide: false },
  { value: 'district_supervisor', label: 'District Supervisor', level: 60,  requiredScope: 'district', isLegacyAlias: false, isOrgWide: false },
  { value: 'branch_manager',      label: 'Branch Manager',      level: 40,  requiredScope: 'branch',   isLegacyAlias: false, isOrgWide: false },
  // 'manager' is the pre-existing internal value for what production now
  // calls Branch Manager. Never renamed in Firestore — only relabeled.
  { value: 'manager',             label: 'Branch Manager',      level: 40,  requiredScope: 'branch',   isLegacyAlias: true,  isOrgWide: false },
  { value: 'pharmacist',          label: 'Pharmacist',           level: 10,  requiredScope: 'branch',   isLegacyAlias: false, isOrgWide: false },
]

const BY_VALUE = Object.fromEntries(ROLE_METADATA.map((r) => [r.value, r]))

/** Roles selectable in the New/Edit User form, in display order (legacy alias hidden from creation). */
export const CREATABLE_ROLES = ROLE_METADATA.filter((r) => !r.isLegacyAlias)

/**
 * Canonical production label for a role. Unknown roles fall back to the
 * raw value rather than throwing — a role added elsewhere in the data
 * model must never render as a blank or crash this lookup.
 */
export function getRoleLabel(role) {
  return BY_VALUE[role]?.label || role || 'Unknown'
}

/** Full metadata for a role, or null when the role is unrecognised. */
export function getRoleMeta(role) {
  return BY_VALUE[role] || null
}

/** Which scope-assignment field this role requires: 'branch' | 'district' | 'region' | 'none'. */
export function getRequiredScopeType(role) {
  return BY_VALUE[role]?.requiredScope ?? 'none'
}

export function isOrgWideRole(role) {
  return BY_VALUE[role]?.isOrgWide ?? false
}

/**
 * Canonical (non-alias) role value for grouping/filtering/stat display —
 * e.g. legacy 'manager' rows count and filter alongside 'branch_manager'
 * rather than rendering as a separate, identically-labeled chip. Internal
 * persisted values are never changed by this — it is a display/query
 * grouping helper only.
 */
export function getCanonicalRoleValue(role) {
  const meta = BY_VALUE[role]
  if (!meta) return role
  if (!meta.isLegacyAlias) return role
  const canonical = ROLE_METADATA.find((r) => !r.isLegacyAlias && r.label === meta.label)
  return canonical?.value || role
}

/** Role-specific, user-facing validation message — never exposes internal field names. */
export function getScopeRequiredMessage(role) {
  const label = getRoleLabel(role)
  switch (getRequiredScopeType(role)) {
    case 'branch':   return `Select a branch for this ${label.toLowerCase()}.`
    case 'district': return `Select a district for this ${label.toLowerCase()}.`
    case 'region':   return `Select a region for this ${label.toLowerCase()}.`
    default:         return null
  }
}
