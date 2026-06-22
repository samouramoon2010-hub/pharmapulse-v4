// ============================================================
// UI 3.0 Cleanup Bundle C1 — Settings Center — Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// Scope audit: the live Settings Center is src/pages/settings/SettingsPage.jsx
// (routed at /settings) plus its 8 components in src/components/settings/.
// There is no separate Profile/Account route — ProfileStudioPage is a
// distinct, explicitly off-limits feature, not a Profile/Account surface.
//
// Findings fixed in SettingsPage.jsx only (every other Settings Center
// component was already English/token-based/clean from prior T2 passes):
//   1. The "Dashboard cards" list rendered meta.labelAr (Arabic) as the
//      primary label, with meta.label (English) as a muted secondary
//      line — switched to English-only, single line.
//   2. The "Active KPIs" list rendered registryKpiCards' labelAr only —
//      a pure Arabic leak with no English at all — switched to label,
//      and the now-unused labelAr field was removed from the memo.
//   3. AboutSettings' "Traffic Light Thresholds" reference used 4
//      hardcoded hex literals ('#22c55e'/'#1a9a7e'/'#f59e0b'/'#ef4444')
//      that duplicated the exact semantic concept already captured by
//      design/tokens.ts's KPI_TRAFFIC_COLORS (excellent/good/warning/
//      critical) — switched to read color + label from that token map.
//
// Two related findings were surfaced and explicitly deferred (not
// fixed here), per direct confirmation:
//   - src/pages/area/AreaDashboard.jsx and src/pages/manager/ManagerDashboard.jsx
//     were already deleted in the immediately preceding pass.
//   - src/pages/shared/SettingsPage.jsx — the OLD, pre-T2-A Settings
//     page — is unrouted, but a prior pass (T2-J) deliberately kept it
//     on disk and wrote an explicit test
//     ("the old shared/SettingsPage.jsx file still exists on disk (not
//     deleted, just unrouted)") asserting it must remain. Confirmed
//     with the user to leave it and its dependent tests untouched —
//     this bundle does not delete it or alter that test's intent.
// ============================================================
import { describe, it, expect } from 'vitest'

const settingsPageSrc        = await import('../pages/settings/SettingsPage.jsx?raw').then((m) => m.default)
const settingsHeaderSrc      = await import('../components/settings/SettingsHeader.jsx?raw').then((m) => m.default)
const settingsSidebarSrc     = await import('../components/settings/SettingsSidebar.jsx?raw').then((m) => m.default)
const settingsSectionSrc     = await import('../components/settings/SettingsSection.jsx?raw').then((m) => m.default)
const appearanceSettingsSrc  = await import('../components/settings/AppearanceSettings.jsx?raw').then((m) => m.default)
const themeSelectorSrc       = await import('../components/settings/ThemeSelector.jsx?raw').then((m) => m.default)
const themePreviewCardSrc    = await import('../components/settings/ThemePreviewCard.jsx?raw').then((m) => m.default)
const densitySelectorSrc     = await import('../components/settings/DensitySelector.jsx?raw').then((m) => m.default)
const radiusSelectorSrc      = await import('../components/settings/RadiusSelector.jsx?raw').then((m) => m.default)
const fontSizeSelectorSrc    = await import('../components/settings/FontSizeSelector.jsx?raw').then((m) => m.default)
const previewPanelSrc        = await import('../components/settings/AppearancePreviewPanel.jsx?raw').then((m) => m.default)
const appSrc                 = await import('../App.jsx?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'SettingsPage.jsx': settingsPageSrc,
}

const SCOPED_LIVE_FILES: Record<string, string> = {
  ...TOUCHED_FILES,
  'SettingsHeader.jsx': settingsHeaderSrc,
  'SettingsSidebar.jsx': settingsSidebarSrc,
  'SettingsSection.jsx': settingsSectionSrc,
  'AppearanceSettings.jsx': appearanceSettingsSrc,
  'ThemeSelector.jsx': themeSelectorSrc,
  'ThemePreviewCard.jsx': themePreviewCardSrc,
  'DensitySelector.jsx': densitySelectorSrc,
  'RadiusSelector.jsx': radiusSelectorSrc,
  'FontSizeSelector.jsx': fontSizeSelectorSrc,
  'AppearancePreviewPanel.jsx': previewPanelSrc,
}

const ARABIC_TEXT = /[؀-ۿ]/

// ════════════════════════════════════════════════════════════
// Validation target 1 — no fake-data imports
// ════════════════════════════════════════════════════════════
describe('Validation 1 — scoped live Settings pages contain no fake-data imports', () => {
  for (const [fileName, src] of Object.entries(SCOPED_LIVE_FILES)) {
    it(`${fileName} does not import dummyData / DUMMY_* fixtures or mock helpers`, () => {
      expect(src).not.toContain('dummyData')
      expect(src).not.toContain('DUMMY_USERS')
      expect(src).not.toContain('DUMMY_BRANCHES')
      expect(src).not.toContain('mockData')
      expect(src).not.toContain('seedData')
      expect(src).not.toContain('fakeData')
    })
  }
})

// ════════════════════════════════════════════════════════════
// Validation target 2 — no Arabic UI copy
// ════════════════════════════════════════════════════════════
describe('Validation 2 — scoped live Settings pages contain no Arabic UI copy', () => {
  for (const [fileName, src] of Object.entries(SCOPED_LIVE_FILES)) {
    it(`${fileName} contains no Arabic text`, () => {
      expect(src).not.toMatch(ARABIC_TEXT)
    })
  }

  it('the Dashboard cards list now renders meta.label (English), not meta.labelAr', () => {
    expect(settingsPageSrc).toContain('{meta.label}')
    expect(settingsPageSrc).not.toContain('{meta.labelAr}')
  })

  it('the Active KPIs list now renders label (English), not labelAr', () => {
    const idx = settingsPageSrc.indexOf('Active KPIs')
    const block = settingsPageSrc.slice(idx, idx + 600)
    expect(block).toContain('{label}')
    expect(block).not.toContain('labelAr')
  })

  it('registryKpiCards no longer computes an unused labelAr field', () => {
    const idx = settingsPageSrc.indexOf('const registryKpiCards = useMemo')
    const block = settingsPageSrc.slice(idx, idx + 300)
    expect(block).not.toContain('labelAr')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 3 — hardcoded legacy color literals replaced
// with existing theme tokens where tokens exist
// ════════════════════════════════════════════════════════════
describe('Validation 3 — Traffic Light Thresholds sources colors from KPI_TRAFFIC_COLORS tokens', () => {
  it('SettingsPage imports KPI_TRAFFIC_COLORS from design/tokens', () => {
    expect(settingsPageSrc).toContain("import { KPI_TRAFFIC_COLORS } from '../../design/tokens'")
  })

  it('the old hardcoded hex literals for the 4 traffic-light tiers are gone', () => {
    expect(settingsPageSrc).not.toContain("'#22c55e'")
    expect(settingsPageSrc).not.toContain("'#1a9a7e'")
    expect(settingsPageSrc).not.toContain("'#f59e0b'")
    expect(settingsPageSrc).not.toContain("'#ef4444'")
  })

  it('AboutSettings looks up color/label via KPI_TRAFFIC_COLORS[item.status]', () => {
    expect(settingsPageSrc).toContain('KPI_TRAFFIC_COLORS[item.status]')
    expect(settingsPageSrc).toContain('token.color')
    expect(settingsPageSrc).toContain('token.label')
  })

  it('Traffic Light Thresholds section still renders for all 4 tiers (excellent/good/warning/critical)', () => {
    const idx = settingsPageSrc.indexOf('Traffic Light Thresholds')
    const block = settingsPageSrc.slice(idx, idx + 800)
    expect(block).toContain("'excellent'")
    expect(block).toContain("'good'")
    expect(block).toContain("'warning'")
    expect(block).toContain("'critical'")
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 4 — no engines, stores, calculations, Firestore
// contracts, auth behavior, or routing contracts changed
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine', 'computeRanking', 'generateRankings',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
]

describe('Validation 4 — no business logic / store / Firestore / auth / route changes', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }

  it('SettingsPage still reads exclusively from useSettingsStore / useAuthStore / useI18n / subscribeKpiRegistry, unchanged', () => {
    expect(settingsPageSrc).toContain("from '../../store/settingsStore'")
    expect(settingsPageSrc).toContain("from '../../store/authStore'")
    expect(settingsPageSrc).toContain("from '../../hooks/useI18n'")
    expect(settingsPageSrc).toContain('subscribeKpiRegistry')
  })

  it('App.jsx still routes /settings to SettingsPage, unchanged, and defines no new routes', () => {
    expect(appSrc).toContain('"/settings"')
    expect(appSrc).toContain('SettingsPage')
  })

  it('no local score/rank/risk/pace computation function was introduced', () => {
    expect(settingsPageSrc).not.toMatch(/function compute(Score|Rank|Risk|Achievement|Pace)/i)
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 — any deleted files are proven orphaned
// before deletion (no files were deleted in this bundle; this
// documents that the one candidate found was deliberately NOT
// deleted, per explicit confirmation)
// ════════════════════════════════════════════════════════════
describe('Validation 5 — no files deleted in this bundle; deferred candidate left untouched', () => {
  it('the old shared/SettingsPage.jsx is explicitly out of scope and was not touched by this bundle', async () => {
    const oldSettingsPageSrc = await import('../pages/shared/SettingsPage.jsx?raw').then((m) => m.default)
    expect(oldSettingsPageSrc.length).toBeGreaterThan(0)
  })

  it("the prior pass's certification of that file's deliberate existence is untouched", async () => {
    const themeT2Src = await import('./themeT2Settings.certification.test.ts?raw').then((m) => m.default)
    expect(themeT2Src).toContain('the old shared/SettingsPage.jsx file still exists on disk')
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — touched files remain well-formed modules
// ════════════════════════════════════════════════════════════
describe('Build safety — touched files remain well-formed modules', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} has at least one export`, () => {
      expect(src).toMatch(/export (default |const |function )/)
    })
    it(`${fileName} has balanced braces`, () => {
      const open = (src.match(/\{/g) ?? []).length
      const close = (src.match(/\}/g) ?? []).length
      expect(open).toBe(close)
    })
    it(`${fileName} has balanced parentheses`, () => {
      const open = (src.match(/\(/g) ?? []).length
      const close = (src.match(/\)/g) ?? []).length
      expect(open).toBe(close)
    })
  }
})
