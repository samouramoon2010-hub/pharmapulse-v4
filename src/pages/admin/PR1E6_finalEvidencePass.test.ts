// ============================================================
// PR-1E6 Final Evidence Completion Pass — regression tests for the
// three real defects found via this pass's extended viewport/modal
// sweep (1024px landscape tablet, 390/430/820/1440/1920px, and the
// KPI Entry Discard/date-change ConfirmModal):
//
//  1. AppLayout.jsx's clamp() padding-right ramped linearly instead
//     of stepping at the lg breakpoint, so the fixed-position <aside>
//     overlapped <main> for any viewport in the 1024px–(1024+sidebar
//     width)px range.
//  2. index.css's .cmd-trigger rule hardcoded display:flex with no
//     media query, beating the JSX's own `hidden md:flex` Tailwind
//     classes at the same specificity — the search trigger floated
//     over mobile content below the md breakpoint.
//  3. ConfirmModal.jsx had no role="dialog"/aria-modal, no focus
//     management, and no Escape handling — affecting every caller
//     app-wide (KPI Entry guards, destructive confirmations, user
//     create/edit, import commit).
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

async function src(path: string): Promise<string> {
  // @ts-expect-error — ?raw import has no type declaration
  return (await import(/* @vite-ignore */ `${path}?raw`)).default
}

const appLayout = () => src('../../components/layout/AppLayout.jsx')
const confirmModal = () => src('../../components/ui/ConfirmModal.jsx')
const indexCssSrc = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const indexCss = async () => indexCssSrc

// ════════════════════════════════════════════════════════════
// 1. AppLayout sidebar/main-content overlap at 1024–1279px
// ════════════════════════════════════════════════════════════
describe('PR-1E6 Final — AppLayout padding-right steps at the lg breakpoint instead of ramping', () => {
  it('multiplies the vw delta so the clamp() reaches its max within ~1px of 1024px, not over the full sidebar width', async () => {
    const s = await appLayout()
    expect(s).toContain('calc((100vw - 1023px) * 999)')
    // the old, broken ramp (no multiplier) must not be present
    expect(s).not.toContain('calc(100vw - 1023px), ${sidebarW}')
  })
  it('still uses the sidebarW CSS variable as the clamp() ceiling (collapsed/expanded width unchanged)', async () => {
    const s = await appLayout()
    const idx = s.indexOf('paddingRight:`clamp(')
    expect(idx).toBeGreaterThan(-1)
    expect(s.slice(idx, idx + 120)).toContain('${sidebarW}')
  })
})

// ════════════════════════════════════════════════════════════
// 2. .cmd-trigger no longer fights the Tailwind hidden/md:flex classes
// ════════════════════════════════════════════════════════════
describe('PR-1E6 Final — .cmd-trigger display is controlled only by Tailwind utility classes', () => {
  it('index.css no longer hardcodes display:flex on .cmd-trigger', async () => {
    const s = await indexCss()
    const idx = s.indexOf('.cmd-trigger {')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, s.indexOf('}', idx))
    expect(block).not.toContain('display: flex')
  })
  it('still styles spacing/colors on .cmd-trigger (visual regression guard)', async () => {
    const s = await indexCss()
    const idx = s.indexOf('.cmd-trigger {')
    const block = s.slice(idx, s.indexOf('}', idx))
    expect(block).toContain('align-items: center')
    expect(block).toContain('border-radius: 7px')
  })
})

// ════════════════════════════════════════════════════════════
// 3. ConfirmModal accessibility — role, focus management, Escape
// ════════════════════════════════════════════════════════════
describe('PR-1E6 Final — ConfirmModal has dialog semantics and focus management', () => {
  it('the dialog element carries role="dialog", aria-modal, and a tabIndex so it can receive focus', async () => {
    const s = await confirmModal()
    expect(s).toContain('role="dialog"')
    expect(s).toContain('aria-modal="true"')
    expect(s).toContain('tabIndex={-1}')
  })
  it('focuses the dialog on open and remembers the previously-focused trigger element', async () => {
    const s = await confirmModal()
    expect(s).toContain('triggerRef.current = document.activeElement')
    expect(s).toContain('dialogRef.current?.focus()')
  })
  it('returns focus to the trigger element on close (cleanup of the open effect)', async () => {
    const s = await confirmModal()
    expect(s).toContain('triggerRef.current?.focus?.()')
  })
  it('Escape key closes the modal via the same handleClose used by the Cancel/X buttons', async () => {
    const s = await confirmModal()
    const idx = s.indexOf("e.key === 'Escape'")
    expect(idx).toBeGreaterThan(-1)
    expect(s.slice(idx, idx + 40)).toContain('handleClose()')
  })
  it('does not change onConfirm/onCancel/onClose prop contract (no caller needs to change)', async () => {
    const s = await confirmModal()
    expect(s).toContain('open, onClose, onCancel, onConfirm,')
  })
})
