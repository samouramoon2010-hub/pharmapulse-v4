// ============================================================
// Shared column-alias resolution for onboarding adapters (DX-2/DX-3).
//
// Generic, header-name → field matching, case-insensitive, EN/AR.
// Not domain-specific — every onboarding adapter (Groups, Branches,
// Pharmacists, Assignments) uses the same lookup so alias lists live
// in one place instead of four slightly different implementations.
// ============================================================

export function pickField(row: Record<string, unknown>, aliases: string[]): string | undefined {
  const lowerAliases = aliases.map((a) => a.trim().toLowerCase())
  for (const key of Object.keys(row)) {
    if (lowerAliases.includes(key.trim().toLowerCase())) {
      const v = row[key]
      if (v == null) continue
      const s = String(v).trim()
      if (s !== '') return s
    }
  }
  return undefined
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
