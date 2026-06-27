// ============================================================
// PR-1A — Debug UID Exposure Masking
//
// Both panels are already gated behind a NODE_ENV check and never
// render in a production build. This bundle adds defense-in-depth:
// even inside the dev-only panel, the full UID is truncated rather
// than printed in full, in case NODE_ENV is ever misconfigured in a
// non-local environment.
// ============================================================

import { describe, it, expect } from 'vitest'

async function evalRegistrySrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('./EvaluationRegistryPage.tsx?raw')).default
}

async function kpiEntrySrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../pharmacist/KpiEntryPage.jsx?raw')).default
}

describe('PR-1A — EvaluationRegistryPage debug panel masks the UID', () => {
  it('truncates userProfile.uid instead of printing it in full', async () => {
    const s = await evalRegistrySrc()
    expect(s).not.toContain('{userProfile?.uid ?? \'undefined\'}')
    expect(s).toContain('userProfile.uid.slice(0, 6)')
  })

  it('debug panel remains gated to non-production builds', async () => {
    const s = await evalRegistrySrc()
    expect(s).toContain("process.env.NODE_ENV !== 'production'")
  })
})

describe('PR-1A — KpiEntryPage debug line masks the UID', () => {
  it('truncates uid instead of printing it in full', async () => {
    const s = await kpiEntrySrc()
    expect(s).not.toContain('uid: {uid || \'NULL\'}')
    expect(s).toContain('uid.slice(0, 6)')
  })

  it('debug line remains gated to development builds', async () => {
    const s = await kpiEntrySrc()
    expect(s).toContain("process.env.NODE_ENV === 'development'")
  })
})
