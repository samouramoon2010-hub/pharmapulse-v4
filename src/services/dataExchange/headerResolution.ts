// ============================================================
// DX-Data-2 — Manual column-mapping fallback.
//
// Every onboarding/targets/actuals adapter already classifies each
// source header as STRUCTURAL_ALIAS or UNRESOLVED via resolveColumns()
// (DX-2/DX-3), but nothing in the UI ever read that result — an
// unrecognized header just silently produced a missing field and a
// generic "required" validation error downstream, with no way for an
// admin to tell the system what a column actually means. This module
// re-exposes each adapter's own HEADER_ALIASES (single source of
// truth — never duplicated) so the page can detect unresolved headers
// before Validate runs, and resolves a manual mapping by writing the
// value under the field's own canonical alias key, so every existing
// pickField() lookup downstream picks it up exactly as if the source
// header had matched in the first place. No adapter logic changes.
// ============================================================

import { findAliasMatch } from './adapters/columnAliasUtils'
import { HEADER_ALIASES as REGION_ALIASES } from './adapters/regionsAdapter'
import { HEADER_ALIASES as GROUP_ALIASES } from './adapters/groupsAdapter'
import { HEADER_ALIASES as BRANCH_ALIASES } from './adapters/branchesAdapter'
import { HEADER_ALIASES as PHARMACIST_ALIASES } from './adapters/pharmacistsAdapter'
import { HEADER_ALIASES as ASSIGNMENT_ALIASES } from './adapters/assignmentsAdapter'
import { HEADER_ALIASES as KPI_REGISTRY_ALIASES } from './adapters/kpiRegistryAdapter'
import { HEADER_ALIASES as BRANCH_TARGET_ALIASES } from './adapters/branchTargetsAdapter'
import { HEADER_ALIASES as PHARMACIST_TARGET_ALIASES } from './adapters/pharmacistTargetsAdapter'
import { HEADER_ALIASES as BRANCH_ACTUALS_ALIASES } from './adapters/branchActualsAdapter'
import { HEADER_ALIASES as PHARMACIST_ACTUALS_ALIASES } from './adapters/pharmacistActualsAdapter'

export const DOMAIN_FIELD_ALIASES: Record<string, Record<string, string[]>> = {
  REGION:             REGION_ALIASES,
  GROUP:              GROUP_ALIASES,
  BRANCH:             BRANCH_ALIASES,
  PHARMACIST:         PHARMACIST_ALIASES,
  ASSIGNMENT:         ASSIGNMENT_ALIASES,
  KPI_REGISTRY:       KPI_REGISTRY_ALIASES,
  BRANCH_TARGET:      BRANCH_TARGET_ALIASES,
  PHARMACIST_TARGET:  PHARMACIST_TARGET_ALIASES,
  BRANCH_ACTUALS:     BRANCH_ACTUALS_ALIASES,
  PHARMACIST_ACTUALS: PHARMACIST_ACTUALS_ALIASES,
}

// Human-readable labels for the manual-mapping dropdown — same field
// keys as each adapter's HEADER_ALIASES, just presentable.
export const DOMAIN_FIELD_LABELS: Record<string, Record<string, string>> = {
  REGION: {
    code: 'Region Code', name: 'Region Name', manager: 'Manager', status: 'Status',
  },
  GROUP: {
    code: 'Group Code', name: 'Group Name', region: 'Region', manager: 'Manager', status: 'Status',
  },
  BRANCH: {
    code: 'Branch Code', name: 'Branch Name', region: 'Region', city: 'City',
    group: 'Group / District', manager: 'Manager', status: 'Status',
  },
  PHARMACIST: {
    employeeId: 'Employee ID', name: 'Name', email: 'Email', phone: 'Phone', role: 'Role',
    branch: 'Branch', joining: 'Joining Date', leaving: 'Leaving Date', status: 'Status',
  },
  ASSIGNMENT: {
    employeeId: 'Employee ID', branch: 'Branch', type: 'Assignment Type', start: 'Start Date', end: 'End Date',
  },
  KPI_REGISTRY: {
    key: 'KPI Key', labelEn: 'Name (English)', labelAr: 'Name (Arabic)',
    descriptionEn: 'Description (English)', descriptionAr: 'Description (Arabic)',
    unit: 'Unit', category: 'Category', lifecycle: 'Lifecycle Stage',
    dashboard: 'Dashboard Enabled', evaluation: 'Evaluation Enabled', targetEnabled: 'Target Enabled',
    direction: 'Direction', aggregation: 'Aggregation Method', decimal: 'Decimal Precision',
    minValue: 'Minimum Value', maxValue: 'Maximum Value', active: 'Active', sortOrder: 'Sort Order',
  },
  BRANCH_TARGET: { month: 'Month', branch: 'Branch Code', kpi: 'KPI Key', value: 'Target Value' },
  PHARMACIST_TARGET: {
    month: 'Month', pharmacistId: 'Pharmacist Identifier', branch: 'Branch Code', kpi: 'KPI Key', value: 'Target Value',
  },
  BRANCH_ACTUALS: { date: 'Date', branch: 'Branch Code', kpi: 'KPI Key', value: 'Actual Value' },
  PHARMACIST_ACTUALS: {
    date: 'Date', pharmacistId: 'Pharmacist Identifier', branch: 'Branch Code', kpi: 'KPI Key', value: 'Actual Value',
  },
}

/** Headers in `headerRow` that no alias for `domain` recognizes — the
 *  same UNRESOLVED set each adapter's resolveColumns() already computes. */
export function findUnresolvedHeaders(domain: string, headerRow: string[]): string[] {
  const aliasMap = DOMAIN_FIELD_ALIASES[domain]
  if (!aliasMap) return []
  return headerRow.filter((header) => !findAliasMatch(header, aliasMap))
}

/** Applies an admin-chosen header -> field mapping to every row, by
 *  writing the value under the field's own first (canonical) alias —
 *  so pickField() picks it up downstream with zero adapter changes. */
export function applyManualHeaderMapping(
  domain: string,
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,   // sourceHeader -> field key
): Record<string, unknown>[] {
  const aliasMap = DOMAIN_FIELD_ALIASES[domain]
  const activeMappings = Object.entries(mapping).filter(([, fieldKey]) => fieldKey)
  if (!aliasMap || activeMappings.length === 0) return rows

  return rows.map((row) => {
    const next = { ...row }
    for (const [sourceHeader, fieldKey] of activeMappings) {
      const canonicalAlias = aliasMap[fieldKey]?.[0]
      if (!canonicalAlias || !(sourceHeader in row)) continue
      next[canonicalAlias] = row[sourceHeader]
    }
    return next
  })
}
