// ============================================================
// PR-1H — Stabilization bug-fix regression tests
//
// Covers the three confirmed, fixed defects from the PR-1H certification
// sweep:
//   1. historyService.js fired 4 diagnostic console.log() calls on every
//      KPI entry save (pure noise, no functional effect) — removed.
//   2. KpiEntryPage.jsx's per-KPI hint icon had a `title` attribute only,
//      with no accessible name for screen readers — added aria-label.
//   3. LoginPageV2.jsx (the real production /login page) had a real
//      personal email address ("samir@alathirpharmacy.com") hardcoded as
//      the placeholder text in both the login-email and password-reset
//      fields — every prior preview/concept page was already checked
//      against this exact string, but the production page itself never
//      was. Replaced with a generic example address.
//
// See docs/production/PR1H_BUG_REGISTER.md.
// ============================================================
import { describe, it, expect } from 'vitest'

const historyServiceSrc = await import('../services/historyService.js?raw').then((m) => m.default)
const kpiEntryPageSrc   = await import('../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
const loginPageV2Src    = await import('../pages/auth/LoginPageV2.jsx?raw').then((m) => m.default)

describe('PR-1H bug fix 1 — historyService.js no longer logs diagnostic noise on every save', () => {
  it('has no console.log calls (error-level logging is still allowed and expected)', () => {
    expect(historyServiceSrc).not.toMatch(/console\.log\(/)
  })

  it('still logs real failures via console.error (error handling was not removed)', () => {
    expect(historyServiceSrc).toMatch(/console\.error\(/)
  })

  it('does not leave a dead batch1Success variable behind', () => {
    expect(historyServiceSrc).not.toContain('batch1Success')
  })
})

describe('PR-1H bug fix 2 — KPI Entry hint icon is accessible to screen readers', () => {
  it('the hint icon span has an aria-label bound to the hint text', () => {
    expect(kpiEntryPageSrc).toMatch(/<span className="text-xs text-slate-600" title=\{hint\} role="img" aria-label=\{hint\}>/)
  })

  it('keeps the existing title attribute (sighted hover tooltip unaffected)', () => {
    expect(kpiEntryPageSrc).toContain('title={hint}')
  })
})

describe('PR-1H bug fix 3 — production /login no longer exposes a real personal email', () => {
  it('LoginPageV2.jsx (the real production /login page) does not contain the leaked personal email', () => {
    expect(loginPageV2Src).not.toContain('samir@alathirpharmacy.com')
    expect(loginPageV2Src).not.toMatch(/@alathirpharmacy\.com/i)
  })

  it('uses a generic, non-personal example email as the placeholder instead', () => {
    expect(loginPageV2Src).toContain('placeholder="name@yourpharmacy.com"')
  })

  it('both the login field and the reset-password field use the same generic placeholder', () => {
    const matches = loginPageV2Src.match(/placeholder="name@yourpharmacy\.com"/g) || []
    expect(matches.length).toBe(2)
  })
})
