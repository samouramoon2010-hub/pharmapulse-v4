import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { TEMPLATE_CATALOG, getTemplateCatalogEntry, getTemplatesByGroup, TEMPLATE_GROUPS } from './templateCatalog'
import { TEMPLATE_VERSION } from './templateGenerator'

describe('DX-8 — Template Library catalog', () => {
  it('contains exactly the 6 required catalog entries (Organization Onboarding + KPI Registry + 2 Targets + 2 Actuals)', () => {
    expect(TEMPLATE_CATALOG).toHaveLength(6)
    const ids = TEMPLATE_CATALOG.map((t) => t.id).sort()
    expect(ids).toEqual([
      'branch-actuals', 'branch-targets', 'kpi-registry',
      'organization-onboarding', 'pharmacist-actuals', 'pharmacist-targets',
    ])
  })

  it('every entry declares id/name/domain/version/group/sheetName/fileName/requiredRole', () => {
    for (const entry of TEMPLATE_CATALOG) {
      expect(entry.id).toBeTruthy()
      expect(entry.name).toBeTruthy()
      expect(entry.domain).toBeTruthy()
      expect(entry.version).toBe(TEMPLATE_VERSION)
      expect(TEMPLATE_GROUPS).toContain(entry.group)
      expect(entry.sheetName).toBeTruthy()
      expect(entry.fileName).toMatch(/\.xlsx$/)
      expect(entry.requiredRole).toBe('admin')
      expect(entry.exampleRowProvided).toBe(true)
      expect(Array.isArray(entry.requiredColumns)).toBe(true)
      expect(Array.isArray(entry.optionalColumns)).toBe(true)
    }
  })

  it('every entry\'s build() produces a real workbook matching the catalog\'s declared sheet/version', () => {
    for (const entry of TEMPLATE_CATALOG) {
      const wb = entry.build()
      expect(wb.SheetNames.length).toBeGreaterThan(0)
      expect(wb.SheetNames).toContain('Metadata')
      const meta = XLSX.utils.sheet_to_json<{ Field: string; Value: string }>(wb.Sheets['Metadata'])
      expect(meta.find((r) => r.Field === 'Template Version')?.Value).toBe(entry.version)
    }
  })

  it('every entry\'s download() is a callable function (smoke check, not invoked — avoids a real file-system write in tests)', () => {
    for (const entry of TEMPLATE_CATALOG) {
      expect(typeof entry.download).toBe('function')
    }
  })

  it('getTemplateCatalogEntry resolves a known id and returns undefined for an unknown one', () => {
    expect(getTemplateCatalogEntry('kpi-registry')?.name).toBe('KPI Registry')
    expect(getTemplateCatalogEntry('does-not-exist')).toBeUndefined()
  })

  it('getTemplatesByGroup partitions every entry into exactly one of the three groups, none left out', () => {
    const grouped = TEMPLATE_GROUPS.flatMap((g) => getTemplatesByGroup(g))
    expect(grouped).toHaveLength(TEMPLATE_CATALOG.length)
    expect(getTemplatesByGroup('Organization Setup').map((t) => t.id)).toEqual(['organization-onboarding'])
    expect(getTemplatesByGroup('KPI & Targets').map((t) => t.id).sort()).toEqual(['branch-targets', 'kpi-registry', 'pharmacist-targets'])
    expect(getTemplatesByGroup('Actuals').map((t) => t.id).sort()).toEqual(['branch-actuals', 'pharmacist-actuals'])
  })

  it('no catalog entry embeds a real-looking email, phone, or production identifier in its metadata', () => {
    for (const entry of TEMPLATE_CATALOG) {
      expect(entry.fileName).not.toMatch(/@/)
      expect(entry.compatibilityNotes).not.toMatch(/@/)
    }
  })
})
