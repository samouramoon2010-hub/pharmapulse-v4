import { describe, it, expect } from 'vitest'
import { stripUndefinedDeep, isPlainObject } from './firestoreSanitize'

class FakeTimestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
}
class FakeFieldValue {
  private readonly _methodName: string
  constructor(methodName: string) { this._methodName = methodName }
}

describe('firestoreSanitize — stripUndefinedDeep', () => {
  it('removes top-level undefined fields', () => {
    const result = stripUndefinedDeep({ a: 1, b: undefined, c: 'x' })
    expect(result).toEqual({ a: 1, c: 'x' })
    expect('b' in result).toBe(false)
  })

  it('removes nested undefined fields, at any depth', () => {
    const result = stripUndefinedDeep({
      a: { b: { c: undefined, d: 1 }, e: undefined },
      f: 2,
    })
    expect(result).toEqual({ a: { b: { d: 1 } }, f: 2 })
  })

  it('removes undefined values from arrays safely, recursing into surviving items', () => {
    const result = stripUndefinedDeep({
      list: [1, undefined, { x: undefined, y: 2 }, undefined, 3],
    })
    expect(result).toEqual({ list: [1, { y: 2 }, 3] })
  })

  it('preserves false, 0, and an intentional empty string', () => {
    const result = stripUndefinedDeep({ flag: false, count: 0, note: '' })
    expect(result).toEqual({ flag: false, count: 0, note: '' })
  })

  it('preserves null (does not convert undefined to null, nor strip explicit null)', () => {
    const result = stripUndefinedDeep({ a: null, b: undefined })
    expect(result).toEqual({ a: null })
    expect(result.a).toBeNull()
  })

  it('passes a Date instance through untouched, never spread/cloned', () => {
    const date = new Date('2026-06-27T00:00:00.000Z')
    const result = stripUndefinedDeep({ when: date })
    expect(result.when).toBe(date)
  })

  it('passes a Firestore-Timestamp-shaped class instance through untouched', () => {
    const ts = new FakeTimestamp(123, 456)
    const result = stripUndefinedDeep({ createdAt: ts })
    expect(result.createdAt).toBe(ts)
  })

  it('passes a FieldValue sentinel (serverTimestamp()-shaped) through untouched', () => {
    const sentinel = new FakeFieldValue('serverTimestamp')
    const result = stripUndefinedDeep({ updatedAt: sentinel })
    expect(result.updatedAt).toBe(sentinel)
  })

  it('does not mutate the original payload', () => {
    const original = { a: 1, b: undefined, nested: { c: undefined, d: 2 } }
    const snapshot = JSON.parse(JSON.stringify({ a: original.a, nested: { d: original.nested.d } }))
    stripUndefinedDeep(original)
    expect(original.a).toBe(snapshot.a)
    expect(original.nested.d).toBe(snapshot.nested.d)
    expect('b' in original).toBe(true)     // original object is untouched
    expect('c' in original.nested).toBe(true)
  })

  it('does not remove required values that happen to sit next to undefined ones', () => {
    const result = stripUndefinedDeep({
      jobId: 'job-1', domain: 'BRANCH_ACTUALS', fileMeta: undefined, status: 'DRAFT',
    })
    expect(result).toEqual({ jobId: 'job-1', domain: 'BRANCH_ACTUALS', status: 'DRAFT' })
  })

  it('reproduces the exact production shape: a job object with fileMeta undefined', () => {
    // This is literally the shape that previously reached setDoc() and
    // triggered "Unsupported field value: undefined (found in field
    // fileMeta in document import_jobs/...)" in production.
    const job = {
      jobId: 'act-123-pharmacist-actuals',
      domain: 'PHARMACIST_ACTUALS',
      status: 'READY',
      fileMeta: undefined,
      mappingVersion: undefined,
      rowCounts: { parsed: 1, validated: 1, committed: 0, failed: 0, skipped: 0, remaining: 1 },
    }
    const cleaned = stripUndefinedDeep(job)
    expect('fileMeta' in cleaned).toBe(false)
    expect('mappingVersion' in cleaned).toBe(false)
    expect(cleaned.jobId).toBe('act-123-pharmacist-actuals')
    expect(cleaned.rowCounts).toEqual(job.rowCounts)
  })
})

describe('firestoreSanitize — isPlainObject', () => {
  it('is true for {} and object literals', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
  })

  it('is true for Object.create(null)', () => {
    expect(isPlainObject(Object.create(null))).toBe(true)
  })

  it('is false for arrays, null, primitives, Date, and class instances', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(undefined)).toBe(false)
    expect(isPlainObject('x')).toBe(false)
    expect(isPlainObject(1)).toBe(false)
    expect(isPlainObject(new Date())).toBe(false)
    expect(isPlainObject(new FakeTimestamp(1, 2))).toBe(false)
  })
})
