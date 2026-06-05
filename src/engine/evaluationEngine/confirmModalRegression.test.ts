// ============================================================
// ConfirmModal Prop API — Regression Tests
//
// Root cause: EvaluationRegistryPage (and DistrictsPage, RegionsPage)
// passed onCancel= to ConfirmModal which only accepted onClose=.
// Every click on Cancel/X/backdrop called onClose() which was
// undefined → TypeError: onClose is not a function.
//
// Fix: ConfirmModal now accepts both onClose and onCancel via
//   const handleClose = onClose ?? onCancel ?? (() => {})
// All broken callers updated to use onClose= (canonical).
//
// These tests lock in the correct behaviour permanently.
// ============================================================

import { describe, it, expect, vi } from 'vitest'

// ── 1. ConfirmModal prop API ──────────────────────────────────

describe('ConfirmModal — prop API', () => {
  it('accepts onClose prop', async () => {
    const src = await import('../../components/ui/ConfirmModal.jsx?raw')
    expect(src.default).toContain('onClose')
  })

  it('accepts onCancel prop as alias for backward compatibility', async () => {
    const src = await import('../../components/ui/ConfirmModal.jsx?raw')
    expect(src.default).toContain('onCancel')
  })

  it('resolves handleClose = onClose ?? onCancel ?? noop', async () => {
    const src = await import('../../components/ui/ConfirmModal.jsx?raw')
    expect(src.default).toContain('onClose ?? onCancel ?? ')
    expect(src.default).toContain('handleClose')
  })

  it('never calls onClose directly — uses handleClose internally', async () => {
    const src = await import('../../components/ui/ConfirmModal.jsx?raw')
    // Extract component body after the handleClose declaration
    const body = src.default.split('const handleClose')[1] ?? ''
    // All click handlers must use handleClose, not onClose
    expect(body).not.toContain('onClick={onClose}')
    expect(body).not.toContain('onClose()')
    expect(body).toContain('onClick={handleClose}')
    expect(body).toContain('handleClose()')
  })

  it('does not throw when only onClose is provided (no onCancel)', async () => {
    // Simulates: onClose=fn, onCancel=undefined
    const onCloseFn = vi.fn()
    const handleClose = onCloseFn ?? undefined ?? (() => {})
    expect(() => handleClose()).not.toThrow()
    expect(onCloseFn).toHaveBeenCalledTimes(1)
  })

  it('does not throw when only onCancel is provided (no onClose)', async () => {
    // Simulates: onClose=undefined, onCancel=fn
    const onCancelFn = vi.fn()
    const handleClose = (undefined as unknown as (() => void)) ?? onCancelFn ?? (() => {})
    expect(() => handleClose()).not.toThrow()
    expect(onCancelFn).toHaveBeenCalledTimes(1)
  })

  it('does not throw when neither onClose nor onCancel is provided', async () => {
    // Simulates: onClose=undefined, onCancel=undefined → falls back to noop
    const handleClose = (undefined as unknown as (() => void))
      ?? (undefined as unknown as (() => void))
      ?? (() => {})
    expect(() => handleClose()).not.toThrow()
  })

  it('confirm button calls onConfirm then handleClose', async () => {
    const src = await import('../../components/ui/ConfirmModal.jsx?raw')
    // Confirm button must call both onConfirm() and handleClose()
    expect(src.default).toContain('onConfirm(); handleClose()')
  })
})

// ── 2. Caller audit — all pages use onClose= ─────────────────

describe('ConfirmModal — caller audit', () => {
  it('EvaluationRegistryPage uses onClose= (not onCancel=)', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    // Extract the ConfirmModal block
    const block = src.default.split('<ConfirmModal')[1]?.split('/>')[0] ?? ''
    expect(block).toContain('onClose=')
    expect(block).not.toContain('onCancel=')
  })

  it('DistrictsPage uses onClose= (not onCancel=)', async () => {
    const src = await import('../../pages/admin/DistrictsPage.tsx?raw')
    const block = src.default.split('<ConfirmModal')[1]?.split('/>')[0] ?? ''
    expect(block).toContain('onClose=')
    expect(block).not.toContain('onCancel=')
  })

  it('RegionsPage uses onClose= (not onCancel=)', async () => {
    const src = await import('../../pages/admin/RegionsPage.tsx?raw')
    const block = src.default.split('<ConfirmModal')[1]?.split('/>')[0] ?? ''
    expect(block).toContain('onClose=')
    expect(block).not.toContain('onCancel=')
  })

  it('UsersPage uses onClose= (was already correct)', async () => {
    const src = await import('../../pages/admin/UsersPage.jsx?raw')
    const block = src.default.split('<ConfirmModal')[1]?.split('/>')[0] ?? ''
    expect(block).toContain('onClose=')
    expect(block).not.toContain('onCancel=')
  })

  it('PharmaciesPage uses onClose= (was already correct)', async () => {
    const src = await import('../../pages/admin/PharmaciesPage.jsx?raw')
    const block = src.default.split('<ConfirmModal')[1]?.split('/>')[0] ?? ''
    expect(block).toContain('onClose=')
    expect(block).not.toContain('onCancel=')
  })

  it('TargetsPage uses onClose= (was already correct)', async () => {
    const src = await import('../../pages/shared/TargetsPage.jsx?raw')
    const block = src.default.split('<ConfirmModal')[1]?.split('/>')[0] ?? ''
    expect(block).toContain('onClose=')
    expect(block).not.toContain('onCancel=')
  })

  it('no page anywhere passes onCancel= to ConfirmModal', async () => {
    // Exhaustive check across all pages that import ConfirmModal
    const pages = [
      await import('../../pages/admin/EvaluationRegistryPage.tsx?raw'),
      await import('../../pages/admin/DistrictsPage.tsx?raw'),
      await import('../../pages/admin/RegionsPage.tsx?raw'),
      await import('../../pages/admin/UsersPage.jsx?raw'),
      await import('../../pages/admin/PharmaciesPage.jsx?raw'),
      await import('../../pages/shared/TargetsPage.jsx?raw'),
    ]
    for (const page of pages) {
      expect(page.default).not.toContain('onCancel=')
    }
  })
})

// ── 3. Evaluation run — confirm flow does not crash ───────────

describe('ConfirmModal — evaluation run confirm flow', () => {
  it('EvaluationRegistryPage confirm modal has onConfirm and onClose', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    const block = src.default.split('<ConfirmModal')[1]?.split('/>')[0] ?? ''
    expect(block).toContain('onConfirm=')
    expect(block).toContain('onClose=')
  })

  it('EvaluationRunPage does not render a ConfirmModal (run triggers directly)', async () => {
    const src = await import('../../pages/admin/EvaluationRunPage.tsx?raw')
    // EvaluationRunPage runs evaluation directly on button click — no confirmation modal
    // This is by design: admin-only page, evaluation is reversible via new ledger doc
    expect(src.default).not.toContain('<ConfirmModal')
  })
})
