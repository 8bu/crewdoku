import { describe, expect, it } from 'vitest'
import { computeCoverage, eligibleFreePeople } from './coverage'
import { DEFAULT_SHIFTS, defaultCoverageTable, type Assignment, type Person } from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'

const table = defaultCoverageTable(DEFAULT_SHIFTS, 2)

function person(id: string, ineligible: Assignment['code'][] = []): Person {
  return { id, name: id, teamId: 't1', ineligible: ineligible as never }
}

function date(iso: string): BoardDate {
  return {
    iso,
    weekday: 3,
    dayOfMonth: 7,
    monthShort: 'Jan',
    isWeekend: false,
    isMonday: false,
    weekIndex: 0,
    holidayName: null,
  }
}

function assignment(code: Assignment['code']): Assignment {
  const times: Record<string, [string, string] | [null, null]> = {
    EARLY: ['0600', '1400'],
    MID: ['1000', '1800'],
    LATE: ['1400', '2200'],
    NIGHT: ['2200', '0600'],
    OFF: [null, null],
  }
  const [start, end] = times[code]!
  return { code, start, end, pinned: false, ineligible: false }
}

function board(assignments: Record<string, Assignment>) {
  return (personId: string, dateIso: string) => assignments[`${personId}|${dateIso}`]!
}

describe('computeCoverage', () => {
  const d = date('2026-01-07')

  it('flags a shift short of the per-team minimum', () => {
    const people = [person('p1'), person('p2')]
    const get = board({ 'p1|2026-01-07': assignment('NIGHT'), 'p2|2026-01-07': assignment('OFF') })
    const coverage = computeCoverage(people, [d], DEFAULT_SHIFTS, table, get)
    const day = coverage.get('2026-01-07')!
    expect(day.status).toBe('short')
    expect(day.shifts.find((s) => s.shift === 'NIGHT')).toMatchObject({ count: 1, min: 2, max: 4, status: 'short' })
  })

  it('flags a shift over the ceiling once every other shift is within range', () => {
    // EARLY/MID/LATE sit right at the minimum; NIGHT overshoots the max.
    const inRange = ['EARLY', 'MID', 'LATE'].flatMap((code) =>
      [0, 1].map((i) => ({ id: `${code}${i}`, code: code as Assignment['code'] })),
    )
    const over = Array.from({ length: 5 }, (_, i) => ({ id: `night${i}`, code: 'NIGHT' as const }))
    const roster = [...inRange, ...over]
    const people = roster.map((r) => person(r.id))
    const get = board(Object.fromEntries(roster.map((r) => [`${r.id}|2026-01-07`, assignment(r.code)])))
    const coverage = computeCoverage(people, [d], DEFAULT_SHIFTS, table, get)
    const day = coverage.get('2026-01-07')!
    expect(day.shifts.find((s) => s.shift === 'NIGHT')).toMatchObject({ count: 5, min: 2, max: 4, status: 'over' })
    expect(day.status).toBe('over')
  })

  it('reads ok when every shift sits within its min/max band', () => {
    const roster = ['EARLY', 'MID', 'LATE', 'NIGHT'].flatMap((code) =>
      [0, 1].map((i) => ({ id: `${code}${i}`, code: code as Assignment['code'] })),
    )
    const people = roster.map((r) => person(r.id))
    const get = board(Object.fromEntries(roster.map((r) => [`${r.id}|2026-01-07`, assignment(r.code)])))
    const coverage = computeCoverage(people, [d], DEFAULT_SHIFTS, table, get)
    expect(coverage.get('2026-01-07')!.status).toBe('ok')
  })

  it('short beats over when both appear on the same day', () => {
    const people = [
      person('p1'), person('p2'), person('p3'), person('p4'), person('p5'), // NIGHT, over
      person('p6'), // EARLY, short
    ]
    const get = board({
      'p1|2026-01-07': assignment('NIGHT'),
      'p2|2026-01-07': assignment('NIGHT'),
      'p3|2026-01-07': assignment('NIGHT'),
      'p4|2026-01-07': assignment('NIGHT'),
      'p5|2026-01-07': assignment('NIGHT'),
      'p6|2026-01-07': assignment('EARLY'),
    })
    const coverage = computeCoverage(people, [d], DEFAULT_SHIFTS, table, get)
    expect(coverage.get('2026-01-07')!.status).toBe('short')
  })
})

describe('eligibleFreePeople', () => {
  const d = date('2026-01-07')

  it('excludes anyone already working and anyone not eligible for the shift', () => {
    const eligible = person('p1')
    const working = person('p2')
    const uncertified = person('p3', ['NIGHT'])
    const get = board({
      'p1|2026-01-07': assignment('OFF'),
      'p2|2026-01-07': assignment('EARLY'),
      'p3|2026-01-07': assignment('OFF'),
    })
    const free = eligibleFreePeople([eligible, working, uncertified], d.iso, 'NIGHT', get)
    expect(free.map((p) => p.id)).toEqual(['p1'])
  })
})
