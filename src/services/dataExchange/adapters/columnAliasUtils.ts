// ============================================================
// Shared column-alias resolution for onboarding adapters (DX-2/DX-3).
//
// Generic, header-name → field matching, case-insensitive, EN/AR.
// Not domain-specific — every onboarding adapter (Groups, Branches,
// Pharmacists, Assignments) uses the same lookup so alias lists live
// in one place instead of four slightly different implementations.
// ============================================================

// Case-insensitive AND separator-insensitive: "Branch Code", "branch_code",
// "BranchCode", and "branch-code" all normalize to the same key, so alias
// lists only need one canonical spelling per language instead of every
// spacing/punctuation variant a source file might use.
export function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_\-./]+/g, '')
}

export function pickField(row: Record<string, unknown>, aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map(normalizeHeader)
  for (const key of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeHeader(key))) {
      const v = row[key]
      if (v == null) continue
      const s = String(v).trim()
      if (s !== '') return s
    }
  }
  return undefined
}

/** Resolves a single source header to its target field name using the same
 *  normalized comparison as pickField. Returns undefined when unresolved. */
export function findAliasMatch(header: string, aliasMap: Record<string, string[]>): string | undefined {
  const normalized = normalizeHeader(header)
  const entry = Object.entries(aliasMap).find(([, aliases]) => aliases.some((a) => normalizeHeader(a) === normalized))
  return entry?.[0]
}

const STATUS_ACTIVE_VALUES   = ['active', 'نشط', '1', 'true', 'yes']
const STATUS_INACTIVE_VALUES = ['inactive', 'غير نشط', '0', 'false', 'no']

/** Parses a status column into a boolean `active` flag. Returns null if unrecognized. */
export function parseStatusToActive(raw: string | undefined): boolean | null {
  if (raw == null || raw === '') return true // default: active, matches existing service defaults
  const lower = raw.trim().toLowerCase()
  if (STATUS_ACTIVE_VALUES.includes(lower)) return true
  if (STATUS_INACTIVE_VALUES.includes(lower)) return false
  return null
}
