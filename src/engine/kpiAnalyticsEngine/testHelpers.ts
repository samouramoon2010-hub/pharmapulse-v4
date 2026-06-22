// ============================================================
// Shared test helper — Phase 5A
//
// KPI_STATUS_BADGE, kpiBadge, kpiVsExpected, enterpriseStatusColor,
// the Focus KPI Command Card, and the KPI tile grid were extracted
// from DashboardPage.jsx into src/components/kpi/ so
// BranchIntelligencePage can reuse them without forking.
//
// Existing source-scan regression tests (kpiCardPolish,
// enterpriseUxSprintPhaseNext, segmentedBar, kpiLabellingGuards,
// dashboardCleanupSprint) previously scanned DashboardPage.jsx?raw
// directly. They now use this helper, which concatenates
// DashboardPage.jsx with the extracted shared files so the same
// string-presence assertions continue to hold post-extraction.
// ============================================================

export async function getCombinedDashboardSource(): Promise<string> {
  const [dashboard, helpers, tile, focusCard, topAlerts, activityFeed, healthHeatmap] = await Promise.all([
    import('../../pages/dashboard/DashboardPage.jsx?raw'),
    import('../../components/kpi/kpiVisualHelpers.js?raw'),
    import('../../components/kpi/KpiTile.jsx?raw'),
    import('../../components/kpi/FocusKpiCommandCard.jsx?raw'),
    import('../../components/dashboard/TopAlertsPanel.jsx?raw'),
    import('../../components/dashboard/ActivityFeedPanel.jsx?raw'),
    import('../../components/dashboard/KpiHealthHeatmap.jsx?raw'),
  ])
  // Order matters: many regression tests use indexOf('<marker comment>')
  // followed by a relative slice to assert on nearby code. The marker
  // comments (e.g. "Focus KPI Command Card", "Row 1: KPI name", "Row 7:
  // Segmented progress bar") now live in their full form inside the
  // extracted files, while DashboardPage.jsx retains only short
  // cross-reference comments mentioning the same phrases. Putting the
  // extracted files FIRST ensures indexOf finds the full original block.
  //
  // UI3.2-D/F: the inline "Live Priority Alerts" / "Live Operational Feed"
  // blocks were extracted into TopAlertsPanel.jsx / ActivityFeedPanel.jsx
  // (same data, same styling) — included here so existing alert-pill /
  // activity-feed string-presence assertions continue to hold.
  const combined = (
    (focusCard as any).default +
    '\n' + (tile as any).default +
    '\n' + (helpers as any).default +
    '\n' + (topAlerts as any).default +
    '\n' + (activityFeed as any).default +
    '\n' + (healthHeatmap as any).default +
    '\n' + (dashboard as any).default
  )
  // Normalize CRLF→LF: several regression tests assert on literal
  // multi-line '\n' boundaries, which would otherwise break on a Windows
  // checkout (core.autocrlf=true) without any change to actual content.
  return combined.replace(/\r\n/g, '\n')
}
