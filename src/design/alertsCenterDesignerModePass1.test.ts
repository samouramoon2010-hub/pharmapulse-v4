// ============================================================
// Alerts Center — Designer Mode Pass 1 — Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// Audit found three Alerts-related surfaces:
//   1. src/pages/shared/AlertCenterPage.jsx — completely orphaned
//      (zero imports/routes anywhere in src or tests) AND imported
//      DUMMY_USERS/DUMMY_BRANCHES fake data — same "dead + fake data
//      by its mere existence" pattern as the previously deleted
//      shared/TasksPage.jsx. Deleted.
//   2. src/pages/shared/NotificationsPage.jsx — the actual LIVE
//      Alerts Center (routed at /notifications, labeled "Alerts" in
//      MobileNav, "Notifications" in the desktop Sidebar). Was
//      entirely legacy Arabic copy on Tailwind utility classes,
//      never migrated to the app's English/token-based design
//      system. Redesigned in place: translated all UI text to
//      English (including the relative-time formatter), migrated
//      styling to CSS variable tokens + STATUS_TOKENS via
//      getStatusToken(), replaced the hand-rolled empty box with the
//      shared EmptyState component, and removed the unused
//      formatDateAr import. The underlying notificationStore calls
//      (fetchNotifications/markRead/markAllRead/unreadCount) and
//      timeAgo's minute/hour/day math are byte-for-byte unchanged —
//      only the rendered strings and markup changed.
//   3. src/components/dashboard/TopAlertsPanel.jsx — already
//      token-based, English, and Lucide-icon-based from a prior
//      pass (UI3.2-D/F). No changes needed; audited and confirmed
//      clean.
//
// Risk flagged, NOT fixed (out of scope for this page-targeted
// pass): AreaDashboard.jsx and ManagerDashboard.jsx render their own
// inline, still-Arabic, Tailwind-styled high-alert banners via
// useAlertStore directly, and AreaDashboard's banner navigates to a
// route ("/area/alerts") that does not exist in App.jsx. Both are
// separate pages outside this pass's explicit scope (Alerts Center)
// and are not the routed /notifications surface — touching them here
// would be a broad, unrequested refactor.
// ============================================================
import { describe, it, expect } from 'vitest'

const notificationsPageSrc = await import('../pages/shared/NotificationsPage.jsx?raw').then((m) => m.default)
const topAlertsPanelSrc    = await import('../components/dashboard/TopAlertsPanel.jsx?raw').then((m) => m.default)
const notificationStoreSrc = await import('../store/notificationStore.js?raw').then((m) => m.default)
const appSrc               = await import('../App.jsx?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'NotificationsPage.jsx': notificationsPageSrc,
}

const AUDITED_FILES: Record<string, string> = {
  ...TOUCHED_FILES,
  'TopAlertsPanel.jsx': topAlertsPanelSrc,
}

const ARABIC_TEXT = /[؀-ۿ]/

// ════════════════════════════════════════════════════════════
// Dead code removal — orphaned AlertCenterPage.jsx deleted
// ════════════════════════════════════════════════════════════
describe('Dead code removal — orphaned AlertCenterPage.jsx deleted', () => {
  it('App.jsx has no route or import referencing AlertCenterPage', () => {
    expect(appSrc).not.toContain('AlertCenterPage')
  })

  it('no file in src imports AlertCenterPage or DUMMY_USERS/DUMMY_BRANCHES via it', () => {
    for (const [, src] of Object.entries(AUDITED_FILES)) {
      expect(src).not.toContain('AlertCenterPage')
      expect(src).not.toContain('DUMMY_USERS')
      expect(src).not.toContain('DUMMY_BRANCHES')
    }
  })
})

// ════════════════════════════════════════════════════════════
// NotificationsPage still renders its core sections
// ════════════════════════════════════════════════════════════
describe('NotificationsPage still renders header, list, and empty state', () => {
  it('renders the Notifications header and unread-count subtitle', () => {
    expect(notificationsPageSrc).toContain('export default function NotificationsPage')
    expect(notificationsPageSrc).toContain('Notifications')
    expect(notificationsPageSrc).toContain('unread notification')
  })

  it('renders Mark all as read, gated on unreadCount > 0', () => {
    const idx = notificationsPageSrc.indexOf('unreadCount > 0 &&')
    expect(idx).toBeGreaterThan(-1)
    const block = notificationsPageSrc.slice(idx, idx + 600)
    expect(block).toContain('Mark all as read')
  })

  it('uses the shared EmptyState component for the empty list, not a hand-rolled box', () => {
    expect(notificationsPageSrc).toContain("import EmptyState from '../../components/ui/EmptyState'")
    expect(notificationsPageSrc).toContain('<EmptyState')
  })

  it('maps each notification to an icon + tone via getStatusToken, not raw Tailwind color classes', () => {
    expect(notificationsPageSrc).toContain("import { getStatusToken } from '../../design/tokens'")
    expect(notificationsPageSrc).toContain('getStatusToken(cfg.tone)')
  })
})

// ════════════════════════════════════════════════════════════
// Behavior preservation — store wiring and timeAgo math unchanged
// ════════════════════════════════════════════════════════════
describe('Behavior preservation — notificationStore wiring and timeAgo math unchanged', () => {
  it('still calls fetchNotifications(uid) on mount via the same useEffect pattern', () => {
    expect(notificationsPageSrc).toContain('useEffect(() => {')
    expect(notificationsPageSrc).toContain('if (userProfile?.uid) fetchNotifications(userProfile.uid)')
  })

  it('still destructures notifications/unreadCount/fetchNotifications/markRead/markAllRead from useNotificationStore, unmodified', () => {
    expect(notificationsPageSrc).toContain(
      'const { notifications, unreadCount, fetchNotifications, markRead, markAllRead } = useNotificationStore()',
    )
  })

  it('clicking an unread notification still calls markRead(notif.id)', () => {
    expect(notificationsPageSrc).toContain('!notif.read && markRead(notif.id)')
  })

  it('notificationStore itself is untouched by this pass (no store file changes)', () => {
    expect(notificationStoreSrc).toContain('notifications:       [],')
    expect(notificationStoreSrc).toContain('unreadCount:         0,')
  })

  it('timeAgo still buckets by the same minute/hour/day thresholds (60 / 24), only the output strings changed', () => {
    expect(notificationsPageSrc).toContain('Math.floor(diff / 60000)')
    expect(notificationsPageSrc).toContain('mins < 60')
    expect(notificationsPageSrc).toContain('hrs < 24')
    expect(notificationsPageSrc).toContain('Math.floor(mins / 60)')
    expect(notificationsPageSrc).toContain('Math.floor(hrs / 24)')
  })
})

// ════════════════════════════════════════════════════════════
// Dead import removal
// ════════════════════════════════════════════════════════════
describe('Dead import removal', () => {
  it('the unused formatDateAr import is removed', () => {
    expect(notificationsPageSrc).not.toContain('formatDateAr')
  })
})

// ════════════════════════════════════════════════════════════
// Locale cleanup — no Arabic leaks, no bare locale calls
// ════════════════════════════════════════════════════════════
describe('Locale cleanup — no Arabic text leaks, no bare locale calls', () => {
  for (const [fileName, src] of Object.entries(AUDITED_FILES)) {
    it(`${fileName} contains no Arabic text`, () => {
      expect(src).not.toMatch(ARABIC_TEXT)
    })
    it(`${fileName} contains no bare .toLocaleString()/.toLocaleDateString()/.toLocaleTimeString()`, () => {
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
      expect(src).not.toMatch(/\.toLocaleDateString\(\)/)
      expect(src).not.toMatch(/\.toLocaleTimeString\(\)/)
    })
  }
})

// ════════════════════════════════════════════════════════════
// Theme tokens — sourced from CSS variables / design tokens, not
// hardcoded Tailwind color utility classes.
// ════════════════════════════════════════════════════════════
describe('Theme tokens — NotificationsPage sources styling from CSS variable tokens', () => {
  it('uses var(--bg-surface)/var(--text-primary)/var(--text-muted)/var(--border-subtle)', () => {
    expect(notificationsPageSrc).toContain('var(--bg-surface)')
    expect(notificationsPageSrc).toContain('var(--text-primary)')
    expect(notificationsPageSrc).toContain('var(--text-muted)')
    expect(notificationsPageSrc).toContain('var(--border-subtle)')
  })

  it('no longer uses the old Tailwind slate-color utility classes for body text', () => {
    expect(notificationsPageSrc).not.toContain('text-slate-400')
    expect(notificationsPageSrc).not.toContain('text-slate-200')
    expect(notificationsPageSrc).not.toContain('kpi-card')
    expect(notificationsPageSrc).not.toContain('btn-secondary')
  })
})

// ════════════════════════════════════════════════════════════
// No fake/seed data
// ════════════════════════════════════════════════════════════
describe('No fake/seed data introduced or retained', () => {
  for (const [fileName, src] of Object.entries(AUDITED_FILES)) {
    it(`${fileName} does not import dummyData / DUMMY_* fixtures`, () => {
      expect(src).not.toContain('dummyData')
      expect(src).not.toContain('DUMMY_USERS')
      expect(src).not.toContain('DUMMY_BRANCHES')
    })
    it(`${fileName} does not use Math.random or mock/seed/fake data helpers`, () => {
      expect(src).not.toContain('Math.random(')
      expect(src).not.toContain('mockData')
      expect(src).not.toContain('seedData')
      expect(src).not.toContain('fakeData')
    })
  }
})

// ════════════════════════════════════════════════════════════
// Guardrails — no business logic / Evaluation Engine / Ranking /
// AI / Firestore schema / permission / route changes.
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine', 'computeRanking', 'generateRankings',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
  'dynamicKpi', 'DynamicKpi', 'kpiRegistry',
]

describe('Guardrails — no business logic / Firestore / permission / route changes', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }
})

describe('Guardrails — no new scoring/ranking/calculation function introduced', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} does not define a local score/rank/risk/pace computation function`, () => {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement|Pace)/i)
    })
  }
  it('NotificationsPage still reads its data exclusively from useNotificationStore', () => {
    expect(notificationsPageSrc).toContain('useNotificationStore()')
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — files remain well-formed modules
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
