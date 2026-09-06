import { describe, expect, it } from 'vitest'
import { detectViolations, partitionViolationsForBoard, type Violation } from './violations'
import { DEFAULT_SHIFTS, type Assignment, type BoardDate, type Person } from './mockBoard'
import { DEFAULT_SOLVE_SETTINGS } from '../state/solveSettings'

// A high cap keeps H2 (hours/week) out of the way for tests focused on
// eligibility/rest — same role `minPerShift: 0` played in the old fixture.
const ENABLED = DEFAULT_SOLVE_SETTINGS.hardRules.enabled
const NO_HOURS_CAP = 10_000
const MIN_REST_HOURS = 11

function detect(people: Person[], dates: BoardDate[], get: (personId: string, dateIso: string) => Assignment) {
  return detectViolations(people, dates, get, DEFAULT_SHIFTS, ENABLED, NO_HOURS_CAP, MIN_REST_HOURS)
}

function person(id: string, name = id): Person {
  return { id, name, teamId: 't1', rotationOffset: 0, ineligible: [] }
}

function date(iso: string, weekday: number, dayOfMonth: number): BoardDate {
  return {
    iso,
    weekday,
    dayOfMonth,
    monthShort: 'Jan',
    isWeekend: weekday === 0 || weekday === 6,
    isMonday: weekday === 1,
    weekIndex: 0,
    holidayName: null,
  }
}

function assignment(code: Assignment['code'], overrides: Partial<Assignment> = {}): Assignment {
  const times: Record<string, [string, string] | [null, null]> = {
    EARLY: ['0600', '1400'],
    MID: ['1000', '1800'],
    LATE: ['1400', '2200'],
    NIGHT: ['2200', '0600'],
    OFF: [null, null],
  }
  const [start, end] = times[code]!
  return { code, start, end, pinned: false, ineligible: false, ...overrides }
}

function board(assignments: Record<string, Assignment>) {
  return (personId: string, dateIso: string) => assignments[`${personId}|${dateIso}`]!
}

describe('detectViolations', () => {
  const dates = [date('2026-01-05', 1, 5), date('2026-01-06', 2, 6)]

  it('flags an ineligible hand-edit', () => {
    const people = [person('p1', 'Anna')]
    const get = board({
      'p1|2026-01-05': assignment('OFF'),
      'p1|2026-01-06': assignment('NIGHT', { ineligible: true, pinned: true }),
    })
    const violations = detect(people, dates, get)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ kind: 'ineligible', personId: 'p1', dateIso: '2026-01-06' })
    expect(violations[0]!.message).toContain('Anna')
    expect(violations[0]!.message).toContain('Night')
  })

  it('flags back-to-back shifts with no rest', () => {
    const people = [person('p1', 'Anna')]
    const get = board({
      'p1|2026-01-05': assignment('NIGHT'),
      'p1|2026-01-06': assignment('EARLY'),
    })
    const violations = detect(people, dates, get)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ kind: 'rest', personId: 'p1', dateIso: '2026-01-06' })
    expect(violations[0]!.message).toMatch(/0h rest/)
  })

  it('does not flag a normal rotation with a full day of rest', () => {
    const people = [person('p1', 'Anna')]
    const get = board({
      'p1|2026-01-05': assignment('LATE'),
      'p1|2026-01-06': assignment('NIGHT'),
    })
    expect(detect(people, dates, get)).toHaveLength(0)
  })

  it('skips the rest check across a day off in either direction', () => {
    const people = [person('p1', 'Anna')]
    expect(
      detect(people, dates, board({ 'p1|2026-01-05': assignment('NIGHT'), 'p1|2026-01-06': assignment('OFF') })),
    ).toHaveLength(0)
    expect(
      detect(people, dates, board({ 'p1|2026-01-05': assignment('OFF'), 'p1|2026-01-06': assignment('EARLY') })),
    ).toHaveLength(0)
  })

  it('sorts by date then person so a far-away break still has a stable place', () => {
    const people = [person('p2', 'Zed'), person('p1', 'Anna')]
    const threeDates = [date('2026-01-05', 1, 5), date('2026-01-06', 2, 6), date('2026-01-19', 1, 19)]
    const get = board({
      'p1|2026-01-05': assignment('OFF'),
      'p1|2026-01-06': assignment('OFF'),
      'p1|2026-01-19': assignment('NIGHT', { ineligible: true }),
      'p2|2026-01-05': assignment('NIGHT'),
      'p2|2026-01-06': assignment('EARLY'),
      'p2|2026-01-19': assignment('OFF'),
    })
    const violations = detect(people, threeDates, get)
    expect(violations.map((v) => v.dateIso)).toEqual(['2026-01-06', '2026-01-19'])
  })
})

describe('partitionViolationsForBoard', () => {
  const dates = [date('2026-01-05', 1, 5), date('2026-01-06', 2, 6)]
  const people = [person('p1', 'Anna')]

  it('routes a cell-anchored violation to its cell dot and keeps the row remainder empty', () => {
    const violations = detect(
      people,
      dates,
      board({ 'p1|2026-01-05': assignment('NIGHT'), 'p1|2026-01-06': assignment('EARLY') }),
    )
    expect(violations).toHaveLength(1)
    const { cellMessages, otherByPerson } = partitionViolationsForBoard(
      violations,
      new Set(['p1']),
      new Set(dates.map((d) => d.iso)),
    )
    expect(cellMessages.get('p1|2026-01-06')).toEqual([violations[0]!.message])
    expect(otherByPerson.size).toBe(0)
  })

  it('routes a violation with no rendered cell into the per-person remainder, exactly once', () => {
    const unplaced: Violation = {
      id: 'hours|p1|off-board',
      kind: 'hours',
      personId: 'p1',
      dateIso: '2026-02-09',
      message: 'Anna is scheduled 48h the week of Mon Feb 9, over the 40h cap',
    }
    const { cellMessages, otherByPerson } = partitionViolationsForBoard(
      [unplaced],
      new Set(['p1']),
      new Set(dates.map((d) => d.iso)),
    )
    expect(cellMessages.size).toBe(0)
    expect(otherByPerson.get('p1')).toEqual([unplaced])
  })
})
