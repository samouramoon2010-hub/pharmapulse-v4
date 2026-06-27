// ============================================================
// PR-1E5 — PWA, Safe Area, Accessibility & Performance
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

async function src(path: string): Promise<string> {
  // @ts-expect-error — ?raw import has no type declaration
  return (await import(/* @vite-ignore */ `${path}?raw`)).default
}

const appLayout = () => src('../../components/layout/AppLayout.jsx')
const mobileNav = () => src('../../components/layout/MobileNav.jsx')
const sidebar = () => src('../../components/layout/Sidebar.jsx')
const offlineBanner = () => src('../../components/ui/OfflineBanner.jsx')
const syncStatusIndicator = () => src('../../components/ui/SyncStatusIndicator.jsx')

const indexCssSrc = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const indexCss = async () => indexCssSrc

function readRepoFile(relPath: string): string {
  return readFileSync(new URL(`../../../${relPath}`, import.meta.url), 'utf8')
}

// ════════════════════════════════════════════════════════════
// 1. Viewport / index.html — no zoom-disabling
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — viewport meta does not disable user zoom', () => {
  it('viewport meta has no maximum-scale or user-scalable=no', () => {
    const html = readRepoFile('index.html')
    expect(html).toContain('width=device-width, initial-scale=1.0')
    expect(html).not.toMatch(/maximum-scale/i)
    expect(html).not.toMatch(/user-scalable\s*=\s*no/i)
  })
  it('document lang/dir are set for RTL Arabic', () => {
    const html = readRepoFile('index.html')
    expect(html).toContain('lang="ar"')
    expect(html).toContain('dir="rtl"')
  })
})

// ════════════════════════════════════════════════════════════
// 2. PWA manifest — honest, complete fields
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — PWA manifest is complete and makes no false claims', () => {
  it('manifest has display/start_url/orientation/icons/colors set', () => {
    const vite = readRepoFile('vite.config.js')
    expect(vite).toContain("display: 'standalone'")
    expect(vite).toContain("start_url: '/'")
    expect(vite).toContain("orientation: 'any'")
    expect(vite).toMatch(/icons:\s*\[/)
    expect(vite).toContain('theme_color')
    expect(vite).toContain('background_color')
  })
  it('no push-notification backend/subscription code was introduced', () => {
    const vite = readRepoFile('vite.config.js')
    expect(vite).not.toMatch(/pushManager|showNotification|PushSubscription/)
  })
  it('uses autoUpdate registration — no custom update-prompt infra needed', () => {
    const vite = readRepoFile('vite.config.js')
    expect(vite).toContain("registerType: 'autoUpdate'")
  })
})

// ════════════════════════════════════════════════════════════
// 3. Safe area — top inset on the sticky header, bottom inset
//    already correct on mobile nav / sticky save bar (no double-padding)
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — safe-area insets are applied without double-padding', () => {
  it('sticky topbar adds env(safe-area-inset-top) to height and paddingTop', async () => {
    const s = await appLayout()
    expect(s).toContain("height:'calc(var(--topbar-h) + env(safe-area-inset-top))'")
    expect(s).toContain("paddingTop:'env(safe-area-inset-top)'")
  })
  it('main content bottom padding accounts for mobile-nav height + its own safe-area inset (single addition, not doubled)', async () => {
    const s = await appLayout()
    expect(s).toContain("paddingBottom:'calc(1.5rem + var(--mobile-nav-h) + env(safe-area-inset-bottom))'")
  })
  it('.mobile-nav itself pads only its own safe-area-inset-bottom (the one place that owns it)', async () => {
    const css = await indexCss()
    expect(css).toMatch(/\.mobile-nav\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/)
  })
  it('.sticky-save-bar offsets by mobile-nav height + safe-area inset so it never sits under the bottom nav', async () => {
    const css = await indexCss()
    expect(css).toContain('.sticky-save-bar { bottom: calc(var(--mobile-nav-h) + env(safe-area-inset-bottom) + 8px); }')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Touch targets — 44px minimum on touch-primary widths only
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — icon buttons meet the 44px touch-target minimum on mobile, desktop unchanged', () => {
  it('a max-width media query bumps .btn-icon to 44px min without changing the base 32px desktop rule', async () => {
    const css = await indexCss()
    expect(css).toContain('.btn-icon { @apply w-8 h-8 p-0 rounded-lg; }')
    expect(css).toMatch(/@media \(max-width: 1023\.98px\) \{\s*\.btn-icon \{ min-width: 44px; min-height: 44px; \}/)
  })
  it('mobile-nav-item already had a 44px min-height (unchanged)', async () => {
    const css = await indexCss()
    expect(css).toMatch(/\.mobile-nav-item\s*\{[^}]*min-height:\s*44px/)
  })
})

// ════════════════════════════════════════════════════════════
// 5. Connectivity/offline indicator — single source, no duplication
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — exactly one connectivity indicator is visible per breakpoint', () => {
  it('SyncStatusIndicator ("Live"/"Syncing"/"Offline") is hidden below sm — no duplicate status on mobile', async () => {
    const s = await syncStatusIndicator()
    expect(s).toContain('hidden sm:flex')
  })
  it('OfflineBanner only renders while offline, at every width, and is not pointer-blocking', async () => {
    const s = await offlineBanner()
    expect(s).toContain('if (isOnline) return null')
    expect(s).toContain("pointerEvents: 'none'")
  })
  it('offline banner pending-count claim is backed by the real sync-tracker summary, not a fabricated number', async () => {
    const s = await offlineBanner()
    expect(s).toContain('pendingCount')
    const hook = await src('../../hooks/useSyncStatus')
    expect(hook).toContain('getSyncSummary')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Accessibility — mobile "More" drawer focus/keyboard behavior
//    (already built in PR-1E1, reconfirmed here as part of PR-1E5)
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — mobile drawer keyboard/focus behavior (no new custom keyboard emulation)', () => {
  it('drawer is a labeled dialog with Escape-to-close and focus moved to its close button on open', async () => {
    const s = await sidebar()
    expect(s).toContain('role="dialog"')
    expect(s).toContain('aria-modal="true"')
    expect(s).toContain("e.key === 'Escape'")
    expect(s).toContain('closeButtonRef.current?.focus()')
  })
  it('no custom keydown-based Tab-cycling focus trap was added (native dialog focus + Escape only)', async () => {
    const s = await sidebar()
    expect(s).not.toMatch(/e\.key === 'Tab'/)
  })
})

describe('PR-1E5 — mobile bottom nav exposes current page via aria-current, not color alone', () => {
  it('active nav item is marked aria-current="page", not just a color class', async () => {
    const s = await mobileNav()
    expect(s).toContain("aria-current={active ? 'page' : undefined}")
  })
})

// ════════════════════════════════════════════════════════════
// 7. Reduced motion — already CSS-level (PR-1D5), reconfirmed unchanged
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — reduced-motion preference is still respected at the CSS layer', () => {
  it('a prefers-reduced-motion: reduce media query still neutralizes decorative animation', async () => {
    const css = await indexCss()
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

// ════════════════════════════════════════════════════════════
// 8. No scope creep — no new push/biometric/offline-write-queue/
//    service-infra code, no Firestore/Auth change
// ════════════════════════════════════════════════════════════
describe('PR-1E5 — no scope creep', () => {
  it('no biometric/passkey/WebAuthn code was introduced', async () => {
    for (const loader of [appLayout, mobileNav, sidebar, offlineBanner, syncStatusIndicator]) {
      const s = await loader()
      expect(s).not.toMatch(/WebAuthn|navigator\.credentials|biometric|passkey/i)
    }
  })
  it('no new Firestore collection literal introduced in any touched file', async () => {
    for (const loader of [appLayout, mobileNav, sidebar]) {
      const s = await loader()
      expect(s).not.toMatch(/collection\(\s*db,\s*['"][a-zA-Z_]+['"]\s*\)/)
    }
  })
})
