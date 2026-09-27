import { describe, expect, it } from 'vitest'
import { expandRange, rangeLength, replacePersonLeave, toLeaveRanges } from './leaveRanges'
import type { Person } from '@crewdoku/domain'

function person(overrides: Partial<Person> = {}): Person {
  return { id: 'p1', name: 'Alex', teamId: 't1', ineligible: [], ...overrides }
}

describe('toLeaveRanges', () => {
  it('merges consecutive days into one run', () => {
    expect(toLeaveRanges(['2026-05-04', '2026-05-05', '2026-05-06'])).toEqual([
      { start: '2026-05-04', end: '2026-05-06' },
    ])
  })

  it('splits at a gap', () => {
    expect(toLeaveRanges(['2026-05-04', '2026-05-06', '2026-05-07'])).toEqual([
      { start: '2026-05-04', end: '2026-05-04' },
      { start: '2026-05-06', end: '2026-05-07' },
    ])
  })

  it('handles unsorted input with duplicates', () => {
    expect(toLeaveRanges(['2026-05-06', '2026-05-04', '2026-05-05', '2026-05-04'])).toEqual([
      { start: '2026-05-04', end: '2026-05-06' },
    ])
  })

  it('merges across a month boundary', () => {
    expect(toLeaveRanges(['2026-09-30', '2026-10-01'])).toEqual([
      { start: '2026-09-30', end: '2026-10-01' },
    ])
  })

  it('merges across a year boundary', () => {
    expect(toLeaveRanges(['2026-12-31', '2027-01-01', '2026-12-30'])).toEqual([
      { start: '2026-12-30', end: '2027-01-01' },
    ])
  })

  it('returns no ranges for no days', () => {
    expect(toLeaveRanges([])).toEqual([])
  })
})

describe('expandRange', () => {
  it('lists every inclusive day across a month boundary', () => {
    expect(expandRange({ start: '2026-01-30', end: '2026-02-02' })).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('expands a single day to itself', () => {
    expect(expandRange({ start: '2026-03-09', end: '2026-03-09' })).toEqual(['2026-03-09'])
  })

  it('returns nothing when end is before start', () => {
    expect(expandRange({ start: '2026-03-09', end: '2026-03-08' })).toEqual([])
  })
})

describe('rangeLength', () => {
  it('counts a single day as one', () => {
    expect(rangeLength({ start: '2026-03-09', end: '2026-03-09' })).toBe(1)
  })

  it('counts inclusively across a month boundary', () => {
    expect(rangeLength({ start: '2026-01-30', end: '2026-02-02' })).toBe(4)
  })
})

describe('replacePersonLeave', () => {
  it('books days, keeping the result sorted and de-duplicated', () => {
    const people = replacePersonLeave([person({ timeOff: ['2026-05-09'] })], 'p1', null, {
      start: '2026-05-04',
      end: '2026-05-05',
    })
    expect(people[0]!.timeOff).toEqual(['2026-05-04', '2026-05-05', '2026-05-09'])
  })

  it('removes only the given run', () => {
    const people = replacePersonLeave(
      [person({ timeOff: ['2026-05-04', '2026-05-05', '2026-05-09'] })],
      'p1',
      { start: '2026-05-04', end: '2026-05-05' },
      null,
    )
    expect(people[0]!.timeOff).toEqual(['2026-05-09'])
  })

  it('moves a run by shifting it', () => {
    const people = replacePersonLeave(
      [person({ timeOff: ['2026-05-04', '2026-05-05'] })],
      'p1',
      { start: '2026-05-04', end: '2026-05-05' },
      { start: '2026-05-07', end: '2026-05-08' },
    )
    expect(people[0]!.timeOff).toEqual(['2026-05-07', '2026-05-08'])
  })

  it('resizes a run by extending its end', () => {
    const people = replacePersonLeave(
      [person({ timeOff: ['2026-05-04', '2026-05-05'] })],
      'p1',
      { start: '2026-05-04', end: '2026-05-05' },
      { start: '2026-05-04', end: '2026-05-07' },
    )
    expect(people[0]!.timeOff).toEqual([
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
    ])
  })

  it('leaves other people untouched by reference', () => {
    const other = person({ id: 'p2', timeOff: ['2026-05-04'] })
    const people = replacePersonLeave([person(), other], 'p1', null, {
      start: '2026-05-04',
      end: '2026-05-04',
    })
    expect(people[1]).toBe(other)
  })

  it('treats a missing timeOff as empty', () => {
    const target = person()
    expect(target.timeOff).toBeUndefined()
    const people = replacePersonLeave([target], 'p1', null, {
      start: '2026-05-04',
      end: '2026-05-05',
    })
    expect(people[0]!.timeOff).toEqual(['2026-05-04', '2026-05-05'])
  })

  it('returns copy-equal people for an unknown id', () => {
    const people = [person({ id: 'p1' }), person({ id: 'p2' })]
    const next = replacePersonLeave(
      people,
      'nope',
      { start: '2026-05-04', end: '2026-05-05' },
      { start: '2026-05-06', end: '2026-05-07' },
    )
    expect(next).toEqual(people)
    expect(next[0]).toBe(people[0])
    expect(next[1]).toBe(people[1])
  })
})
