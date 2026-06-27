// ============================================================
// Template Library Catalog (DX-8, Template System Hardening)
//
// One coherent, governed catalog over the existing per-domain
// template generators (templateGenerator.ts) — this module does NOT
// duplicate any build/download logic, it only describes and indexes
// what already exists, plus the closure gap filled in this bundle
// (Organization Onboarding had adapters but no downloadable template
// until now).
// ============================================================

import type * as XLSX from 'xlsx'
import { TEMPLATE_VERSION } from './templateGenerator'
import {
  buildOrganizationOnboardingTemplate, downloadOrganizationOnboardingTemplate,
  buildKpiRegistryTemplate, downloadKpiRegistryTemplate,
  buildBranchTargetsTemplate, downloadBranchTargetsTemplate,
  buildPharmacistTargetsTemplate, downloadPharmacistTargetsTemplate,
  buildBranchActualsTemplate, downloadBranchActualsTemplate,
  buildPharmacistActualsTemplate, downloadPharmacistActualsTemplate,
} from './templateGenerator'

export type TemplateGroup = 'Organization Setup' | 'KPI & Targets' | 'Actuals'

export interface TemplateCatalogEntry {
  id:                 string
  name:               string
  domain:             string
  version:            string
  group:              TemplateGroup
  sheetName:          string
  requiredColumns:    string[]
  optionalColumns:    string[]
  exampleRowProvided: true
  fileName:           string
  /** Human-readable note on what changes between supported versions. */
  compatibilityNotes: string
  /** Required role to use this import — surfaced in the UI, never silently widened. */
  requiredRole:       'admin'
  build:    () => XLSX.WorkBook
  download: () => void
}

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  {
    id: 'organization-onboarding', name: 'Organization Onboarding', domain: 'GROUP, BRANCH, PHARMACIST, ASSIGNMENT',
    version: TEMPLATE_VERSION, group: 'Organization Setup', sheetName: 'Groups, Branches, Pharmacists, Assignments',
    requiredColumns: ['Code (Groups/Branches)', 'Employee ID (Pharmacists/Assignments)'],
    optionalColumns: ['Region', 'City', 'Group', 'Manager', 'Email', 'Phone', 'Joining Date', 'Leaving Date', 'Status'],
    exampleRowProvided: true, fileName: 'PharmaPulse_Organization_Onboarding_Import_Template.xlsx',
    compatibilityNotes: 'Closure gap filled in DX-8 — no prior template version existed for this domain.',
    requiredRole: 'admin', build: buildOrganizationOnboardingTemplate, download: downloadOrganizationOnboardingTemplate,
  },
  {
    id: 'kpi-registry', name: 'KPI Registry', domain: 'KPI_REGISTRY',
    version: TEMPLATE_VERSION, group: 'KPI & Targets', sheetName: 'KPI Registry',
    requiredColumns: ['KPI Key', 'KPI Name English', 'Unit', 'Category', 'Direction'],
    optionalColumns: ['KPI Name Arabic', 'Description English', 'Lifecycle Stage', 'Dashboard Enabled', 'Target Enabled', 'Aggregation Method', 'Active', 'Sort Order'],
    exampleRowProvided: true, fileName: 'PharmaPulse_KPI_Registry_Import_Template.xlsx',
    compatibilityNotes: 'Stable since DX-4.', requiredRole: 'admin',
    build: buildKpiRegistryTemplate, download: downloadKpiRegistryTemplate,
  },
  {
    id: 'branch-targets', name: 'Branch Targets', domain: 'BRANCH_TARGET',
    version: TEMPLATE_VERSION, group: 'KPI & Targets', sheetName: 'Branch Targets',
    requiredColumns: ['Month', 'Branch Code', 'KPI Key', 'Target Value'], optionalColumns: [],
    exampleRowProvided: true, fileName: 'PharmaPulse_Branch_Targets_Import_Template.xlsx',
    compatibilityNotes: 'Stable since DX-5a.', requiredRole: 'admin',
    build: buildBranchTargetsTemplate, download: downloadBranchTargetsTemplate,
  },
  {
    id: 'pharmacist-targets', name: 'Pharmacist Targets', domain: 'PHARMACIST_TARGET',
    version: TEMPLATE_VERSION, group: 'KPI & Targets', sheetName: 'Pharmacist Targets',
    requiredColumns: ['Month', 'Pharmacist Identifier', 'Branch Code', 'KPI Key', 'Target Value'], optionalColumns: [],
    exampleRowProvided: true, fileName: 'PharmaPulse_Pharmacist_Targets_Import_Template.xlsx',
    compatibilityNotes: 'Stable since DX-5b.', requiredRole: 'admin',
    build: buildPharmacistTargetsTemplate, download: downloadPharmacistTargetsTemplate,
  },
  {
    id: 'branch-actuals', name: 'Branch Actuals', domain: 'BRANCH_ACTUALS',
    version: TEMPLATE_VERSION, group: 'Actuals', sheetName: 'Branch Actuals',
    requiredColumns: ['Date', 'Branch Code', 'KPI Key', 'Actual Value'], optionalColumns: [],
    exampleRowProvided: true, fileName: 'PharmaPulse_Branch_Actuals_Import_Template.xlsx',
    compatibilityNotes: 'Stable since DX-6.', requiredRole: 'admin',
    build: buildBranchActualsTemplate, download: downloadBranchActualsTemplate,
  },
  {
    id: 'pharmacist-actuals', name: 'Pharmacist Actuals', domain: 'PHARMACIST_ACTUALS',
    version: TEMPLATE_VERSION, group: 'Actuals', sheetName: 'Pharmacist Actuals',
    requiredColumns: ['Date', 'Pharmacist Identifier', 'Branch Code', 'KPI Key', 'Actual Value'], optionalColumns: [],
    exampleRowProvided: true, fileName: 'PharmaPulse_Pharmacist_Actuals_Import_Template.xlsx',
    compatibilityNotes: 'Stable since DX-6. Subject to DX-7 large-file row ceiling.', requiredRole: 'admin',
    build: buildPharmacistActualsTemplate, download: downloadPharmacistActualsTemplate,
  },
]

export function getTemplateCatalogEntry(id: string): TemplateCatalogEntry | undefined {
  return TEMPLATE_CATALOG.find((t) => t.id === id)
}

export function getTemplatesByGroup(group: TemplateGroup): TemplateCatalogEntry[] {
  return TEMPLATE_CATALOG.filter((t) => t.group === group)
}

export const TEMPLATE_GROUPS: TemplateGroup[] = ['Organization Setup', 'KPI & Targets', 'Actuals']
