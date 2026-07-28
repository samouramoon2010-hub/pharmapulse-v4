// ============================================================
// PR-1C — Registry, Profile Studio & Diagnostics certification
// ============================================================
import { describe, it, expect } from 'vitest'

async function kpiRegistryTableSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../../components/admin/kpi/KpiRegistryTable.jsx?raw')).default
}
async function kpiEditorModalSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
}
async function kpiManagementPageSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('./KpiManagementPage.jsx?raw')).default
}
async function profileStudioPageSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../profileStudio/ProfileStudioPage.jsx?raw')).default
}
async function evaluationRegistryPageSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('./EvaluationRegistryPage.tsx?raw')).default
}
async function sidebarSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../../components/layout/Sidebar.jsx?raw')).default
}
async function appSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../../App.jsx?raw')).default
}
async function assistantPageSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../assistant/AssistantPage.jsx?raw')).default
}

// ── KPI Registry: Core badge removal ────────────────────────────

describe('PR-1C — KpiRegistryTable no longer shows a Core badge', () => {
  it('removed the dedicated ProtectedBadge component', async () => {
    const s = await kpiRegistryTableSrc()
    expect(s).not.toContain('function ProtectedBadge')
  })

  it('protected-KPI tooltip uses business language, not the literal "Core KPIs" badge label', async () => {
    const s = await kpiRegistryTableSrc()
    expect(s).toContain('Protected system KPI')
    expect(s).not.toContain('title="Core KPIs are protected"')
  })

  it('still preserves isCore-driven target-input behavior (real runtime effect, not a badge)', async () => {
    const s = await kpiRegistryTableSrc()
    expect(s).toContain("enabled={uiStatus === 'ACTIVE' && kpi.isCore}")
  })
})

describe('PR-1C — KpiEditorModal does not expose the raw isCore field name', () => {
  it('subtitle no longer literally says "isCore"', async () => {
    const s = await kpiEditorModalSrc()
    expect(s).not.toContain('key and isCore are immutable')
    expect(s).toContain('protection status are immutable')
  })
})

// ── KPI archive dependency guard wiring ─────────────────────────

describe('PR-1C — KpiManagementPage archive flow runs a dependency check first', () => {
  it('imports and calls checkKpiArchiveDependencies before archiving', async () => {
    const s = await kpiManagementPageSrc()
    expect(s).toContain('checkKpiArchiveDependencies')
    expect(s).toContain('requestArchive')
    expect(s).toContain('confirmArchive')
  })

  it('archive button is wired to the dependency-checked flow, not the raw service call', async () => {
    const s = await kpiManagementPageSrc()
    expect(s).toContain('onArchive={requestArchive}')
  })
})

describe('PR-1C — KpiManagementPage groups warnings into Blockers vs Recommendations', () => {
  it('no longer renders one flat "Registry Validation Warnings" list', async () => {
    const s = await kpiManagementPageSrc()
    expect(s).not.toContain('Registry Validation Warnings')
    expect(s).toContain('Blockers (')
    expect(s).toContain('Recommendations (')
  })
})

// ── Profile Studio authoring-only disclaimer ────────────────────

describe('PR-1C — ProfileStudioPage discloses it does not activate live evaluation', () => {
  it('states publishing here does not affect the live Evaluation Engine', async () => {
    const s = await profileStudioPageSrc()
    expect(s).toMatch(/does\s+not activate it for live evaluation/)
    expect(s).toContain('Evaluation Registry')
  })
})

// ── Evaluation Registry version grouping ────────────────────────

describe('PR-1C — EvaluationRegistryPage folds older archived versions out of the main list', () => {
  it('computes primaryRows/archivedHistoryRows and renders the main table from primaryRows', async () => {
    const s = await evaluationRegistryPageSrc()
    expect(s).toContain('archivedHistoryRows')
    expect(s).toContain('rows={primaryRows}')
  })

  it('shows an explicit, on-demand version-history toggle instead of always-visible duplicate cards', async () => {
    const s = await evaluationRegistryPageSrc()
    expect(s).toContain('older archived version')
  })
})

// ── Diagnostics: dev-only nav gating ────────────────────────────

describe('PR-1C — Sidebar hides developer-only diagnostics from production navigation', () => {
  it('Dynamic KPI Shadow has no sidebar nav entry — route stays reachable by direct URL only', async () => {
    const s = await sidebarSrc()
    expect(s).not.toContain('Dynamic KPI Shadow')
    expect(s).not.toContain('/admin/dynamic-kpi-shadow')
  })

  it('devOnly nav-filtering mechanism still exists for any future dev-only diagnostics', async () => {
    const s = await sidebarSrc()
    expect(s).toContain("process.env.NODE_ENV !== 'production'")
    expect(s).toContain('!item.devOnly')
  })

  it('all admin diagnostics routes remain admin-gated in the router', async () => {
    const s = await appSrc()
    expect(s).toMatch(/dynamic-kpi-shadow.*PR roles=\{ADMIN\}/)
    expect(s).toMatch(/evaluation-run.*PR roles=\{ADMIN\}/)
    expect(s).toMatch(/classifications.*PR roles=\{ADMIN\}/)
  })
})

// ── Assistant capability honesty ────────────────────────────────

describe('PR-1C — Assistant capability wording stays honest', () => {
  it('describes itself as grounded/deterministic, never invented', async () => {
    const s = await assistantPageSrc()
    expect(s).toContain('never invented')
  })

  it('renders with no org-wide aiSettings — only the user\'s own personalAi (BYOK) is ever passed through', async () => {
    const s = await assistantPageSrc()
    expect(s).toContain('<AssistantPanel context={context} personalAi={personalAi} />')
    expect(s).not.toMatch(/aiSettings=\{/)
  })

  it('does not claim a connected AI provider or generative/autonomous behavior', async () => {
    const s = await assistantPageSrc()
    expect(s.toLowerCase()).not.toContain('generative ai')
    expect(s.toLowerCase()).not.toContain('autonomous action')
    expect(s.toLowerCase()).not.toContain('provider connected')
  })
})
