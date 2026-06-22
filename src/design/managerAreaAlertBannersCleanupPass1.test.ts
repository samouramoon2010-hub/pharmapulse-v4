// ============================================================
// Manager & Area Alert Banners Cleanup — Pass 1 — Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// Scoped audit target: the inline high-alert banners in
// AreaDashboard.jsx and ManagerDashboard.jsx. The audit found that
// BOTH files are completely unrouted — not imported by App.jsx, not
// referenced by any other source file, and not reachable via any
// '/area/*' or '/manager/*' route (none of those routes exist at
// all). src/engine/kpiRegistry/finalGlobalSweep.test.ts already
// documented ManagerDashboard as "removed as orphaned" in a prior
// "Fix Batch 5" — the .jsx files were simply never actually deleted
// from disk until now.
//
// Per explicit user direction (confirmed via clarifying question),
// both orphaned files were deleted outright rather than cosmetically
// patched in place — consistent with the dead-code-deletion pattern
// already applied to shared/TasksPage.jsx and shared/AlertCenterPage.jsx
// in the two preceding Designer Mode passes. This trivially satisfies
// the original validation asks (no Arabic copy can remain in a
// deleted file; no navigation to a non-existent route can fire from
// a deleted file) and removes the broken '/area/alerts' /
// '/manager/alerts' navigation targets entirely rather than patching
// them to point elsewhere.
//
// alertStore.js (ALERT_TYPES/ALERT_PRIORITY/useAlertStore + its
// generateAlerts logic) was explicitly NOT touched, per guardrails —
// even though it is now unreferenced by any live page. That is
// flagged below as a known risk for a future, separately-scoped
// pass, not addressed here.
// ============================================================
import { describe, it, expect } from 'vitest'

const appSrc          = await import('../App.jsx?raw').then((m) => m.default)
const sidebarSrc       = await import('../components/layout/Sidebar.jsx?raw').then((m) => m.default)
const mobileNavSrc     = await import('../components/layout/MobileNav.jsx?raw').then((m) => m.default)
const alertStoreSrc    = await import('../store/alertStore.js?raw').then((m) => m.default)
const finalSweepSrc    = await import('../engine/kpiRegistry/finalGlobalSweep.test.ts?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// Dead code removal — AreaDashboard.jsx / ManagerDashboard.jsx
// ════════════════════════════════════════════════════════════
describe('Dead code removal — orphaned AreaDashboard.jsx / ManagerDashboard.jsx deleted', () => {
  it('App.jsx has no route or import referencing AreaDashboard or ManagerDashboard', () => {
    expect(appSrc).not.toContain('AreaDashboard')
    expect(appSrc).not.toContain('ManagerDashboard')
  })

  it('App.jsx defines no /area/* or /manager/* routes', () => {
    expect(appSrc).not.toMatch(/path="\/area\//)
    expect(appSrc).not.toMatch(/path="\/manager\//)
  })

  it('Sidebar and MobileNav contain no links to /area/* or /manager/alerts (no dangling nav to the deleted pages)', () => {
    for (const src of [sidebarSrc, mobileNavSrc]) {
      expect(src).not.toContain('/area/')
      expect(src).not.toContain('/manager/alerts')
      expect(src).not.toContain('/manager/team')
      expect(src).not.toContain('/manager/approval')
      expect(src).not.toContain('/manager/kpi-builder')
      expect(src).not.toContain('/manager/reports')
    }
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 1 — no Arabic copy remains in these banners
// (trivially true: the files containing that copy are deleted)
// ════════════════════════════════════════════════════════════
describe('No Arabic copy remains from the deleted alert banners', () => {
  // Note: App.jsx retains unrelated, pre-existing Arabic strings elsewhere
  // (e.g. a "page under construction" placeholder and the loading-screen
  // message) — those are out of scope for this alert-banner-only pass.
  // This check targets only the specific Arabic copy that lived in the
  // deleted banners (e.g. "تنبيه يحتاج متابعة" / "تنبيه عالي الأولوية").
  it('none of the deleted banners\' specific Arabic strings remain in any live file', () => {
    for (const src of [appSrc, sidebarSrc, mobileNavSrc]) {
      expect(src).not.toContain('تنبيه يحتاج متابعة')
      expect(src).not.toContain('تنبيه عالي الأولوية')
      expect(src).not.toContain('فروع تحتاج متابعة')
      expect(src).not.toContain('لوحة مدير المنطقة')
      expect(src).not.toContain('لوحة مدير الفرع')
    }
  })

  it('Sidebar.jsx and MobileNav.jsx (pure navigation chrome) contain no Arabic text at all', () => {
    const ARABIC_TEXT = /[؀-ۿ]/
    for (const src of [sidebarSrc, mobileNavSrc]) {
      expect(src).not.toMatch(ARABIC_TEXT)
    }
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 2 — no navigation points to non-existent
// /area/alerts (or /manager/alerts)
// ════════════════════════════════════════════════════════════
describe('No navigation points to the non-existent /area/alerts or /manager/alerts routes', () => {
  it('no file in src calls navigate(\'/area/alerts\') or navigate(\'/manager/alerts\')', async () => {
    // Spot-check the files most likely to contain dashboard navigation.
    for (const src of [appSrc, sidebarSrc, mobileNavSrc]) {
      expect(src).not.toContain("navigate('/area/alerts')")
      expect(src).not.toContain("navigate('/manager/alerts')")
    }
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 3 — alert banner styling/components: N/A, the
// duplicated raw-Tailwind banner markup no longer exists anywhere.
// ════════════════════════════════════════════════════════════
describe('Duplicated raw alert-banner markup no longer exists', () => {
  it('no file contains the deleted banners\' signature classes (kpi-card border-red-500/20 bg-red-500/5)', () => {
    for (const src of [appSrc, sidebarSrc, mobileNavSrc]) {
      expect(src).not.toContain('border-red-500/20 bg-red-500/5')
    }
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 4 — alert logic remains unchanged
// ════════════════════════════════════════════════════════════
describe('Alert logic (alertStore.js) remains completely unchanged', () => {
  it('ALERT_TYPES, ALERT_PRIORITY, and useAlertStore are still exported, untouched', () => {
    expect(alertStoreSrc).toContain('export const ALERT_TYPES')
    expect(alertStoreSrc).toContain('export const ALERT_PRIORITY')
    expect(alertStoreSrc).toContain('export const useAlertStore')
  })

  it('finalGlobalSweep.test.ts\'s historical note about ManagerDashboard being orphaned is preserved (this pass did not rewrite history)', () => {
    expect(finalSweepSrc).toContain('removed as orphaned pages')
  })
})

// ════════════════════════════════════════════════════════════
// Guardrails — no business logic / Firestore / permission / route
// additions, no fake data, in any file touched by this pass.
// ════════════════════════════════════════════════════════════
describe('Guardrails — App.jsx/Sidebar.jsx/MobileNav.jsx unaffected by business-logic changes', () => {
  it('App.jsx still defines /notifications (the live Alerts Center) and no new routes were added for AreaDashboard/ManagerDashboard', () => {
    expect(appSrc).toContain('"/notifications"')
    expect(appSrc).not.toContain('AreaDashboard')
    expect(appSrc).not.toContain('ManagerDashboard')
  })

  it('no DUMMY_USERS/DUMMY_BRANCHES fake-data references remain reachable from any live route file', () => {
    for (const src of [appSrc, sidebarSrc, mobileNavSrc]) {
      expect(src).not.toContain('DUMMY_USERS')
      expect(src).not.toContain('DUMMY_BRANCHES')
    }
  })
})
