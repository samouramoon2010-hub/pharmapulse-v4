import { describe, it, expect } from 'vitest'
import {
  EXPORT_TEMPLATE_CATALOG, getExportTemplate, getAvailableExportTemplates,
  isExportTemplateAvailable, getExportTemplatesForRole,
} from './exportTemplateRegistry'

describe('DX-10 — Export Template Registry', () => {
  it('has exactly 6 templates with unique IDs', () => {
    const ids = EXPORT_TEMPLATE_CATALOG.map((t) => t.id)
    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(6)
  })

  it('every template defines required fields', () => {
    for (const t of EXPORT_TEMPLATE_CATALOG) {
      expect(t.name).toBeTruthy()
      expect(t.supportedRoles.length).toBeGreaterThan(0)
      expect(t.supportedFormats.length).toBeGreaterThan(0)
      expect(t.workbookVersion).toBeTruthy()
      expect(Array.isArray(t.sheets)).toBe(true)
      expect(Array.isArray(t.knownLimitations)).toBe(true)
    }
  })

  it('available templates have no unavailableReason and at least one supported sheet', () => {
    for (const t of getAvailableExportTemplates()) {
      expect(t.unavailableReason).toBeNull()
      expect(t.sheets.length).toBeGreaterThan(0)
      expect(t.sheets.every((s) => s.supported)).toBe(true)
    }
  })

  it('unavailable templates (pharmacist-performance, evaluation-results) document a real blocker and ship no sheets', () => {
    for (const id of ['pharmacist-performance', 'evaluation-results'] as const) {
      const t = getExportTemplate(id)!
      expect(t.unavailableReason).toBeTruthy()
      expect(t.sheets).toHaveLength(0)
      expect(isExportTemplateAvailable(id)).toBe(false)
    }
  })

  it('the 4 implemented templates are available', () => {
    for (const id of ['executive-performance', 'branch-performance', 'kpi-performance', 'import-audit'] as const) {
      expect(isExportTemplateAvailable(id)).toBe(true)
    }
  })

  it('getExportTemplatesForRole filters correctly', () => {
    const adminTemplates = getExportTemplatesForRole('admin')
    expect(adminTemplates.length).toBe(EXPORT_TEMPLATE_CATALOG.filter((t) => t.supportedRoles.includes('admin')).length)
    expect(getExportTemplatesForRole('pharmacist')).toHaveLength(0)
  })

  it('import-audit template is admin-only', () => {
    const t = getExportTemplate('import-audit')!
    expect(t.supportedRoles).toEqual(['admin'])
  })
})
