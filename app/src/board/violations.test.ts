import { describe, expect, it } from 'vitest'
import { detectViolations, partitionViolationsForBoard, type Violation } from './violations'
import { DEFAULT_SHIFTS, DEFAULT_SOLVE_SETTINGS, type Assignment, type Person } from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'

// A high cap keeps H2 (hours/week) out of the way for tests focused on
// eligibility/rest — same role `minPerShift: 0` played in the old fixture.
const ENABLED = DEFAULT_SOLVE_SETTINGS.hardRules.enabled
const NO_HOURS_CAP = 10_000
const MIN_REST_HOURS = 11

function detect(people: Person[], dates: BoardDate[], get: (personId: string, dateIso: string) => Assignment) {
  return detectViolations(people, dates, get, DEFAULT_SHIFTS, ENABLED, NO_HOURS_CAP, MIN_REST_HOURS)
}

function person(id: string, name = id): Person {
  return { id, name, teamId: 't1', ineligible: [] }
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

// Regression: the board's H2 must bucket weeks like the domain/solver — 7-day
// windows from the period start (weekIndexOf), counting paidHours — not the
// board's Monday-reset `date.weekIndex` with clock hours. A Sunday-start period
// is where the two disagree.
describe('detectViolations H2 weekly hours', () => {
  const CAP = 38

  // Contiguous BoardDates from a start date, carrying the board's Monday-reset
  // weekIndex exactly as mockBoard builds it, so these tests prove the checker
  // ignores it and buckets by period-start 7-day windows instead.
  function days(startIso: string, n: number): BoardDate[] {
    const out: BoardDate[] = []
    let weekIndex = -1
    for (let i = 0; i < n; i++) {
      const d = new Date(`${startIso}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + i)
      const iso = d.toISOString().slice(0, 10)
      const weekday = d.getUTCDay()
      const isMonday = weekday === 1
      if (isMonday || i === 0) weekIndex++
      out.push({
        iso,
        weekday,
        dayOfMonth: d.getUTCDate(),
        monthShort: 'Sep',
        isWeekend: weekday === 0 || weekday === 6,
        isMonday,
        weekIndex,
        holidayName: null,
      })
    }
    return out
  }

  function hoursViolations(dates: BoardDate[], worked: string[], shifts = DEFAULT_SHIFTS) {
    const map: Record<string, Assignment> = {}
    for (const dt of dates) map[`p1|${dt.iso}`] = worked.includes(dt.iso) ? assignment('EARLY') : assignment('OFF')
    return detectViolations([person('p1')], dates, board(map), shifts, ENABLED, CAP, MIN_REST_HOURS).filter(
      (v) => v.kind === 'hours',
    )
  }

  // Period starts Sunday 2026-09-13: period-week 0 is Sep13-19, week 1 Sep20-26.
  it('does not flag 5 shifts spanning a Monday boundary that sit <=4 in each period-start week', () => {
    // Sep16-19 (4 shifts, 32h) in week 0, Sep20 (8h) in week 1 — both under 38h.
    // The board's Monday week (Sep14-20) would wrongly see all five (40h).
    const v = hoursViolations(days('2026-09-13', 9), ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'])
    expect(v).toEqual([])
  })

  it('flags a genuine 40h period-start week', () => {
    // Sep14-18 (Mon-Fri) are all in period-week 0: 5 shifts = 40h > 38.
    const v = hoursViolations(days('2026-09-13', 9), ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])
    expect(v).toHaveLength(1)
    expect(v[0]!.message).toContain('over the 38h cap')
  })

  it('counts paid hours, subtracting unpaid breaks', () => {
    // 5 EARLY shifts in one period-week = 40h clock, but a 30-min unpaid break
    // each is 37.5h paid — under the 38h cap, so not flagged.
    const shifts = DEFAULT_SHIFTS.map((s) => (s.code === 'EARLY' ? { ...s, unpaidBreakMinutes: 30 } : s))
    const v = hoursViolations(days('2026-09-13', 9), ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'], shifts)
    expect(v).toEqual([])
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
