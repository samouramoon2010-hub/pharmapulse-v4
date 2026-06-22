// ============================================================
// UI 3.0 Blueprint Lock — light existence/structure test
//
// Per the bundle's own instruction: "No large test suite required
// unless project convention requires docs tests. If adding tests,
// keep them light: docs exist, required sections exist, guardrails
// documented." This file deliberately stays small.
// ============================================================
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const DOCS_DIR = new URL('../../docs/ui3/', import.meta.url)

const BLUEPRINT_FILES = [
  'dashboard-blueprint.md',
  'kpi-card-blueprint.md',
  'executive-dashboard-blueprint.md',
  'header-blueprint.md',
  'sidebar-blueprint.md',
  'tables-blueprint.md',
  'charts-blueprint.md',
  'mobile-blueprint.md',
  'implementation-rules.md',
]

function readDoc(name: string): string {
  return readFileSync(new URL(name, DOCS_DIR), 'utf8')
}

describe('UI 3.0 Blueprint Lock — docs exist', () => {
  for (const file of BLUEPRINT_FILES) {
    it(`${file} exists and is non-empty`, () => {
      const content = readDoc(file)
      expect(typeof content).toBe('string')
      expect(content.length).toBeGreaterThan(0)
    })
    it(`${file} is marked LOCKED`, () => {
      expect(readDoc(file)).toContain('Status: **LOCKED**')
    })
  }
})

describe('UI 3.0 Blueprint Lock — required sections exist', () => {
  it('dashboard-blueprint.md lists all 7 required dashboard sections', () => {
    const src = readDoc('dashboard-blueprint.md')
    for (const section of [
      'Command Header', 'Sidebar', 'Daily Mission Hero', 'KPI Cards Row',
      'Trend Chart', 'Heatmap', 'Smart Alerts',
    ]) {
      expect(src).toContain(section)
    }
  })
  it('kpi-card-blueprint.md lists all 9 required KPI card fields', () => {
    const src = readDoc('kpi-card-blueprint.md')
    for (const field of [
      'KPI name', 'Status badge', 'Large achievement %', 'Actual', 'Target',
      'Remaining gap', 'Required daily pace', 'Trajectory / delta', 'Mini trend / sparkline',
    ]) {
      expect(src).toContain(field)
    }
  })
  it('executive-dashboard-blueprint.md lists the required Executive Summary fields', () => {
    const src = readDoc('executive-dashboard-blueprint.md')
    for (const field of [
      'Overall score', 'Rank', 'Momentum', 'Primary risk', 'Top opportunity',
      'Best KPI', 'Focus KPI', 'Narrative recommendation', 'Portfolio trend', 'Branch ranking', 'Heatmap',
    ]) {
      expect(src).toContain(field)
    }
  })
  it('header-blueprint.md requires 52px height and no duplicate headers', () => {
    const src = readDoc('header-blueprint.md')
    expect(src).toContain('52px')
    expect(src).toContain('No duplicate headers')
  })
  it('sidebar-blueprint.md lists all 4 required groups', () => {
    const src = readDoc('sidebar-blueprint.md')
    for (const group of ['Intelligence Operations', 'Data Architecture', 'Actions / Work', 'Platform']) {
      expect(src).toContain(group)
    }
  })
  it('tables-blueprint.md requires sticky header and tabular numbers', () => {
    const src = readDoc('tables-blueprint.md')
    expect(src).toContain('Sticky header')
    expect(src).toContain('Tabular numbers')
  })
  it('charts-blueprint.md requires theme-aware palettes', () => {
    expect(readDoc('charts-blueprint.md')).toContain('Theme-aware palettes')
  })
  it('mobile-blueprint.md requires tables-to-cards conversion and bottom navigation', () => {
    const src = readDoc('mobile-blueprint.md')
    expect(src).toContain('Tables → cards')
    expect(src).toContain('Bottom navigation')
  })
})

describe('UI 3.0 Blueprint Lock — guardrails documented', () => {
  it('implementation-rules.md documents every required DO NOT guardrail', () => {
    const src = readDoc('implementation-rules.md')
    for (const rule of [
      'DO NOT invent layouts',
      'DO NOT add new dashboard widgets unless specified',
      'DO NOT change hierarchy',
      'DO NOT use hardcoded colors when theme tokens exist',
      'DO NOT use giant cards with little content',
      'DO NOT put insights below 13px',
      'DO NOT replace tables with only narratives',
      'DO NOT add canvas, particles, WebGL, or heavy animations',
    ]) {
      expect(src).toContain(rule)
    }
  })
  it('implementation-rules.md documents the unchanged-scope boundary (engine/Firestore/permissions/routing)', () => {
    const src = readDoc('implementation-rules.md')
    expect(src).toContain('Evaluation Engine')
    expect(src).toContain('Firestore schema')
    expect(src).toContain('Permissions / role configuration')
    expect(src).toContain('Routing')
  })
})

describe('UI 3.0 Blueprint Lock — certification file is consistent', () => {
  it('ui3-blueprint-lock.certification.md exists and references every blueprint file', () => {
    const src = readDoc('ui3-blueprint-lock.certification.md')
    for (const file of BLUEPRINT_FILES) {
      expect(src).toContain(file)
    }
  })
  it('certification confirms no production code changed', () => {
    expect(readDoc('ui3-blueprint-lock.certification.md')).toContain('No production changes in this bundle')
  })
})
