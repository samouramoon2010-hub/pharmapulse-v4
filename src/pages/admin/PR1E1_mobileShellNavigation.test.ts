// ============================================================
// PR-1E1 — Mobile Application Shell & Role-Aware Navigation
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getMobilePrimaryNav, MOBILE_NAV_MAX_PRIMARY } from '../../config/mobileNav'

// @ts-expect-error — ?raw import has no type declaration
async function mobileNavSrc() { return (await import('../../components/layout/MobileNav.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function sidebarSrc() { return (await import('../../components/layout/Sidebar.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function appLayoutSrc() { return (await import('../../components/layout/AppLayout.jsx?raw')).default }
function indexCssSrc() { return readFileSync(join(__dirname, '../../index.css'), 'utf8') }

const ALL_ROLES = ['admin', 'manager', 'branch_manager', 'district_supervisor', 'regional_manager', 'general_manager', 'pharmacist']

// ════════════════════════════════════════════════════════════
// 1. Role matrix — getMobilePrimaryNav (pure function, real
//    behavior under test, not source-pattern matching)
// ════════════════════════════════════════════════════════════
describe('PR-1E1 — role matrix: exact primary destinations', () => {
  it('pharmacist: Home, KPI Entry, Performance, My Intelligence', () => {
    const paths = getMobilePrimaryNav('pharmacist').map((i) => i.path)
    expect(paths).toEqual(['/dashboard', '/entry', '/performance', '/my-intelligence'])
  })

  it('manager (legacy alias) matches branch_manager exactly', () => {
    expect(getMobilePrimaryNav('manager')).toEqual(getMobilePrimaryNav('branch_manager'))
  })

  it('branch_manager: Home, KPI Entry, Team, Executive BI — no Rankings (admin-only route)', () => {
    const paths = getMobilePrimaryNav('branch_manager').map((i) => i.path)
    expect(paths).toEqual(['/dashboard', '/entry', '/team', '/executive'])
    expect(paths).not.toContain('/admin/rankings')
  })

  it('district_supervisor: Home, Reports, Team, Executive BI — no KPI Entry, no pharmacist self-performance', () => {
    const paths = getMobilePrimaryNav('district_supervisor').map((i) => i.path)
    expect(paths).toEqual(['/dashboard', '/reports', '/team', '/executive'])
    expect(paths).not.toContain('/entry')
    expect(paths).not.toContain('/performance')
  })

  it('regional_manager matches district_supervisor exactly (same NAV_CONFIG shape as Sidebar)', () => {
    expect(getMobilePrimaryNav('regional_manager')).toEqual(getMobilePrimaryNav('district_supervisor'))
  })

  it('general_manager: Home, Reports, Team, Executive BI — no KPI Entry, no pharmacist self-performance, no branch-required-only route', () => {
    const paths = getMobilePrimaryNav('general_manager').map((i) => i.path)
    expect(paths).toEqual(['/dashboard', '/reports', '/team', '/executive'])
    expect(paths).not.toContain('/performance')
  })

  it('admin: Home, Reports, Rankings, Executive BI — the only role offered Rankings', () => {
    const paths = getMobilePrimaryNav('admin').map((i) => i.path)
    expect(paths).toEqual(['/dashboard', '/reports', '/admin/rankings', '/executive'])
  })

  it('no role exceeds the maximum primary item count', () => {
    for (const role of ALL_ROLES) {
      expect(getMobilePrimaryNav(role).length).toBeLessThanOrEqual(MOBILE_NAV_MAX_PRIMARY)
    }
  })

  it('every role gets exactly 4 primary items (a valid 4th route exists for all 7 roles)', () => {
    for (const role of ALL_ROLES) {
      expect(getMobilePrimaryNav(role)).toHaveLength(4)
    }
  })

  it('district/regional/general management roles never receive pharmacist self-performance', () => {
    for (const role of ['district_supervisor', 'regional_manager', 'general_manager']) {
      const paths = getMobilePrimaryNav(role).map((i) => i.path)
      expect(paths).not.toContain('/performance')
    }
  })

  it('only admin receives the admin-only Rankings route', () => {
    for (const role of ALL_ROLES) {
      const paths = getMobilePrimaryNav(role).map((i) => i.path)
      if (role === 'admin') expect(paths).toContain('/admin/rankings')
      else expect(paths).not.toContain('/admin/rankings')
    }
  })

  it('KPI Entry is only offered to roles with a "My Work" data-entry responsibility (pharmacist, manager, branch_manager)', () => {
    for (const role of ALL_ROLES) {
      const paths = getMobilePrimaryNav(role).map((i) => i.path)
      const expectsEntry = ['pharmacist', 'manager', 'branch_manager'].includes(role)
      expect(paths.includes('/entry')).toBe(expectsEntry)
    }
  })

  it('Home is always the first item for every role', () => {
    for (const role of ALL_ROLES) {
      expect(getMobilePrimaryNav(role)[0].path).toBe('/dashboard')
    }
  })

  it('every item exposes an icon, a label, and a real route path (no internal route fragments as labels)', () => {
    for (const role of ALL_ROLES) {
      for (const item of getMobilePrimaryNav(role)) {
        expect(item.icon).toBeTruthy()
        expect(item.label).toMatch(/^[A-Za-z ]+$/)
        expect(item.path.startsWith('/')).toBe(true)
        expect(item.path).not.toContain('_')
      }
    }
  })

  it('unknown/missing role falls back to the pharmacist nav rather than throwing or rendering blank', () => {
    expect(getMobilePrimaryNav(undefined)).toEqual(getMobilePrimaryNav('pharmacist'))
    expect(getMobilePrimaryNav('not_a_real_role')).toEqual(getMobilePrimaryNav('pharmacist'))
  })
})

// ════════════════════════════════════════════════════════════
// 2. MobileNav.jsx — single canonical config, no duplicated
//    route logic, accessible "More" trigger
// ════════════════════════════════════════════════════════════
describe('PR-1E1 — MobileNav: canonical config, no duplicated route logic', () => {
  it('imports the centralized resolver instead of branching on role inline', async () => {
    const src = await mobileNavSrc()
    expect(src).toContain("import { getMobilePrimaryNav } from '../../config/mobileNav'")
    expect(src).not.toMatch(/role === 'admin'\s*\?/)
  })
  it('the FAB pattern (always /entry regardless of role) has been removed', async () => {
    const src = await mobileNavSrc()
    expect(src).not.toContain('mobile-fab')
  })
  it('nav region has an accessible label', async () => {
    const src = await mobileNavSrc()
    expect(src).toMatch(/aria-label="Primary mobile navigation"/)
  })
  it('each item shows visible text, not only an icon', async () => {
    const src = await mobileNavSrc()
    expect(src).toContain('<span>{item.label}</span>')
  })
  it('active item exposes aria-current="page"', async () => {
    const src = await mobileNavSrc()
    expect(src).toMatch(/aria-current=\{active \? 'page' : undefined\}/)
  })
  it('More trigger has aria-haspopup, aria-expanded, and aria-controls wired to the drawer id', async () => {
    const src = await mobileNavSrc()
    expect(src).toContain('aria-haspopup="dialog"')
    expect(src).toContain('aria-expanded={moreOpen}')
    expect(src).toContain('aria-controls="mobile-more-drawer"')
  })
  it('More does not navigate to a fake /more route', async () => {
    const src = await mobileNavSrc()
    expect(src).not.toMatch(/navigate\(['"]\/more['"]\)/)
    expect(src).not.toContain("'/more'")
  })
  it('More calls the lifted onOpenMore callback rather than owning its own drawer state', async () => {
    const src = await mobileNavSrc()
    expect(src).toContain('onClick={onOpenMore}')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Sidebar.jsx mobile drawer — reused as "More", not duplicated
// ════════════════════════════════════════════════════════════
describe('PR-1E1 — More drawer: reuses existing Sidebar drawer, proper dialog semantics', () => {
  it('drawer carries the id MobileNav\'s More button controls', async () => {
    const src = await sidebarSrc()
    expect(src).toContain('id="mobile-more-drawer"')
  })
  it('drawer has dialog semantics: role, aria-modal, aria-label', async () => {
    const src = await sidebarSrc()
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toMatch(/aria-label="More navigation"/)
  })
  it('Escape closes the drawer', async () => {
    const src = await sidebarSrc()
    expect(src).toMatch(/e\.key === 'Escape'/)
  })
  it('opening the drawer moves focus into it (onto the close button)', async () => {
    const src = await sidebarSrc()
    expect(src).toContain('closeButtonRef.current?.focus()')
  })
  it('drawer still resolves role-aware nav via the existing resolveNav/NAV_CONFIG — no second route list', async () => {
    const src = await sidebarSrc()
    expect(src).toContain('resolveNav(role)')
    expect(src).not.toContain('getMobilePrimaryNav')
  })
  it('drawer still excludes devOnly routes in production (unchanged PR-1C behavior)', async () => {
    const src = await sidebarSrc()
    expect(src).toContain("item.devOnly")
  })
  it('Sign Out remains reachable through the existing authenticated logout flow', async () => {
    const src = await sidebarSrc()
    expect(src).toContain('handleLogout')
    expect(src).toContain('await logout()')
  })
  it('selecting a route closes the drawer (go() calls onClose)', async () => {
    const src = await sidebarSrc()
    expect(src).toMatch(/const go = \(path\) => \{ navigate\(path\); onClose\?\.\(\) \}/)
  })
  it('drawer respects safe-area-inset-bottom', async () => {
    const src = await sidebarSrc()
    expect(src).toContain("paddingBottom: 'env(safe-area-inset-bottom)'")
  })
  it('desktop Sidebar <aside> (hidden lg:flex) is untouched by the drawer changes', async () => {
    const src = await sidebarSrc()
    expect(src).toContain('hidden lg:flex flex-col fixed right-0 top-0 bottom-0 z-30')
  })
})

// ════════════════════════════════════════════════════════════
// 4. AppLayout.jsx — single drawer-open state, focus restoration,
//    no duplicate Live/sync indicator, safe-area-correct padding
// ════════════════════════════════════════════════════════════
describe('PR-1E1 — AppLayout: one drawer, focus restoration, safe-area padding', () => {
  it('hamburger and More both open the same mobileOpen state (no second drawer)', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('openMobileDrawer(hamburgerRef)')
    expect(src).toContain('openMobileDrawer(moreTriggerRef)')
    expect((src.match(/useState\(false\)/g) || []).length).toBeGreaterThanOrEqual(1)
  })
  it('closing the drawer restores focus to whichever trigger opened it', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('lastTriggerRef.current?.focus()')
  })
  it('hamburger button exposes dialog-trigger semantics matching the drawer id', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('aria-haspopup="dialog"')
    expect(src).toContain('aria-controls="mobile-more-drawer"')
  })
  it('MobileNav receives the lifted onOpenMore/moreOpen/moreTriggerRef props', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('onOpenMore={() => openMobileDrawer(moreTriggerRef)}')
    expect(src).toContain('moreOpen={mobileOpen}')
    expect(src).toContain('moreTriggerRef={moreTriggerRef}')
  })
  it('only one SyncStatusIndicator is rendered (no duplicate Live/sync indicator regression)', async () => {
    const src = await appLayoutSrc()
    expect((src.match(/<SyncStatusIndicator/g) || []).length).toBe(1)
  })
  it('page content bottom padding accounts for both the mobile nav height and the safe-area inset', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain("calc(1.5rem + var(--mobile-nav-h) + env(safe-area-inset-bottom))")
  })
  it('no raw document/user IDs are rendered in the shell', async () => {
    const src = await appLayoutSrc()
    expect(src).not.toMatch(/userProfile\.uid/)
    expect(src).not.toMatch(/userProfile\.id\b/)
  })
})

// ════════════════════════════════════════════════════════════
// 5. Shell layout / CSS — touch targets, no leftover dead CSS
// ════════════════════════════════════════════════════════════
describe('PR-1E1 — shell CSS: touch targets, safe-area, no dead rules', () => {
  it('mobile-nav-item has a minimum 44px touch target and shares width evenly (flex: 1)', () => {
    const css = indexCssSrc()
    expect(css).toMatch(/\.mobile-nav-item\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.mobile-nav-item\s*\{[^}]*flex:\s*1/)
  })
  it('the removed FAB CSS rule is not left behind as dead code', () => {
    const css = indexCssSrc()
    expect(css).not.toContain('.mobile-fab')
  })
  it('mobile-nav itself still respects safe-area-inset-bottom (PR-1E0 finding, unchanged)', () => {
    const css = indexCssSrc()
    expect(css).toMatch(/\.mobile-nav\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/)
  })
  it('sticky-save-bar regression: KPI Entry save bar still clears the bottom nav below lg', () => {
    const css = indexCssSrc()
    expect(css).toContain('.sticky-save-bar { bottom: calc(var(--mobile-nav-h) + env(safe-area-inset-bottom) + 8px); }')
  })
})
