// ============================================================
// Governance reference integrity — Maintenance Quick Wins
//
// AGENTS.md previously referenced a non-existent `@Codex.design.md`
// (a dangling typo — the project actually ships CLAUDE.design.md,
// and CLAUDE.md itself correctly references it). Fixed by pointing
// AGENTS.md at the real file instead of fabricating a Codex.design.md
// stand-in. This test pins both files to the same, real target so
// the reference cannot silently drift again.
//
// Raw-source-scan convention (no jsdom — vitest Node environment),
// consistent with the certification suites under src/design/.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

const agentsMd = readFileSync(resolve(ROOT, 'AGENTS.md'), 'utf-8')
const claudeMd = readFileSync(resolve(ROOT, 'CLAUDE.md'), 'utf-8')

describe('Governance file references point at real, existing files', () => {
  it('CLAUDE.design.md exists in the repo root', () => {
    expect(existsSync(resolve(ROOT, 'CLAUDE.design.md'))).toBe(true)
  })

  it('AGENTS.md references @CLAUDE.design.md (not the dangling @Codex.design.md typo)', () => {
    expect(agentsMd).toContain('@CLAUDE.design.md')
    expect(agentsMd).not.toContain('Codex.design.md')
  })

  it('CLAUDE.md references @CLAUDE.design.md (unchanged, already correct)', () => {
    expect(claudeMd).toContain('@CLAUDE.design.md')
  })

  it('no Codex.design.md file was fabricated to satisfy the old reference', () => {
    expect(existsSync(resolve(ROOT, 'Codex.design.md'))).toBe(false)
  })
})
