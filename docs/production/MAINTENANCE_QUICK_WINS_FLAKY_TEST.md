# Maintenance Quick Wins — Flaky Test Stabilization

Part 3 of the Maintenance Quick Wins phase.

## Which file

The instruction named `phase3c3e.test.ts`, but that file was already
modified in this branch for an unrelated reason (widening a source-slice
window for the new Item Sales sidebar nav item — see
`MAINTENANCE_QUICK_WINS_BASELINE.md` Part 1). The actual flaky test
identified in the July 2026 full-suite review (1 failure out of 25,570
tests, passed on rerun) was in a different file, matched by its exact
failure text:

```
src/pages/profileStudio/phase4aCertification.test.ts:662-664
```

## Original cause

```ts
it.each(['simulateProfile', 'calculateProfileHash', 'validatePublishReadiness'])(
  '%s is deterministic — same input produces the same output twice',
  (fnName) => {
    const draft = makeDraft(...)
    const fn = { simulateProfile, calculateProfileHash, validatePublishReadiness }[fnName]
    const a = JSON.stringify(fn(draft, {}))
    const b = JSON.stringify(fn(draft, {}))
    expect(a).toBe(b)   // ← flaked here for fnName === 'simulateProfile'
  },
)
```

Root cause traced to the production code path for `simulateProfile`
(`src/profileStudio/simulator.ts`):

```
simulateProfile()
  → createProfileSimTrace({ ...overallScore, baskets })
    → simulationTrace.ts: createProfileSimTrace() = { ...params, timestamp: nowIso() }
      → nowIso() = new Date().toISOString()   // wall-clock read
```

Every call to `simulateProfile()` embeds a fresh `timestamp` field (via
`nowIso()`) into the returned `traces` object — this is intentional,
correct production behavior: a simulation trace should record *when* it
ran. The test's two back-to-back calls (`fn(draft, {})` called twice)
therefore produce byte-identical JSON in the overwhelming majority of
runs (both calls land in the same millisecond), but will differ exactly
when the wall clock ticks over to the next millisecond between the two
calls — which is what happened in the observed single failure. This
matches the reported symptom exactly: 1 failure in one full-suite run,
0 failures on immediate rerun.

`calculateProfileHash` (`src/profileStudio/integrity.ts`) explicitly
excludes volatile fields (`createdAt`/`updatedAt`) from its hash input by
design — confirmed deterministic, not the source of the flake.
`validatePublishReadiness`'s date-dependent check
(`validateEffectiveDatingRules` in `advancedValidation.ts`, line 466)
compares against day-granularity `new Date()`, which could only flake
across a midnight UTC boundary — astronomically less likely than the
observed failure, and not what was reproduced.

## Reproduction

Given the failure is a rare millisecond-boundary race, it was not
independently reproduced by chance in this phase's testing (the original
report is treated as the reproduction — 1 failure in the July 2026 full
run, passing rerun). The root cause is proven by source inspection: any
test that stringifies two back-to-back calls to a function whose output
embeds `new Date().toISOString()` will fail whenever those two calls
straddle a millisecond boundary — a plain, provable race condition, not
a guess.

## Why the test (not production) is the fix target

Per this phase's guidance ("prefer changing the test only if production
code is correct"): the production code is correct. A simulation trace
recording a live timestamp of when the simulation ran is intentional,
documented behavior (see `ProfileSimTrace.timestamp` in
`simulationTrace.ts`) — no simulation engine that timestamps its own
output can be literally idempotent byte-for-byte across two separate
wall-clock instants. The test's implicit assumption (that two calls
produce *identical* JSON including a live timestamp) was the actual
defect, not the production code.

## Fix

Froze the wall clock for the duration of this one `describe` block only,
using vitest's fake timers:

```ts
describe('Task 5 — Kernel parity: no behavior drift (idempotence / determinism)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([...])('%s is deterministic — same input produces the same output twice', (fnName) => {
    // unchanged — same full JSON.stringify(a) === JSON.stringify(b) assertion
  })
})
```

- **No assertion weakened.** Still a full-object `JSON.stringify`
  equality check — including the timestamp field, which is now
  guaranteed identical because the clock cannot advance between the two
  calls.
- **No retries added.**
- **No timeout increased.**
- **Scope is minimal:** `vi`, `beforeEach`, `afterEach` added to the
  file's existing `import { describe, it, expect } from 'vitest'` (no
  duplicate import — verified no other `beforeEach`/`afterEach` existed
  in this 1131-test file before this change). Fake timers are scoped
  to this one `describe` block via `afterEach(() => vi.useRealTimers())`
  — they cannot leak into any other test in the file or the suite.

## Repeated-run evidence

Ran the fixed file 20 times consecutively:

```
Run 1:  Test Files  1 passed (1)
Run 2:  Test Files  1 passed (1)
Run 3:  Test Files  1 passed (1)
Run 4:  Test Files  1 passed (1)
Run 5:  Test Files  1 passed (1)
Run 6:  Test Files  1 passed (1)
Run 7:  Test Files  1 passed (1)
Run 8:  Test Files  1 passed (1)
Run 9:  Test Files  1 passed (1)
Run 10: Test Files  1 passed (1)
Run 11: Test Files  1 passed (1)
Run 12: Test Files  1 passed (1)
Run 13: Test Files  1 passed (1)
Run 14: Test Files  1 passed (1)
Run 15: Test Files  1 passed (1)
Run 16: Test Files  1 passed (1)
Run 17: Test Files  1 passed (1)
Run 18: Test Files  1 passed (1)
Run 19: Test Files  1 passed (1)
Run 20: Test Files  1 passed (1)
```

**0 failures across 20 runs** (1,131 tests × 20 = 22,620 individual test
executions, all green).

## Leak check

Re-ran the full `src/pages/profileStudio` + `src/profileStudio` suite
(22 files, 5,245 tests) after the fix — all pass, confirming the fake
timers scoped to one `describe` block did not affect any neighboring
test file or test in the same file.
