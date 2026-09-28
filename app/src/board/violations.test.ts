import { describe, expect, it } from 'vitest'
import { detectViolations, partitionViolationsForBoard, type Violation } from './violations'
import {
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  makeTag,
  makeTagRule,
  type Assignment,
  type CoverageTable,
  type Person,
  type ScheduleBoundary,
  type TagWhen,
} from '@crewdoku/domain'
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

// H3 is the one rule that crosses a period edge: the first day is checked
// against the day before the period, the last day against the day after.
// Those days belong to the neighbouring period, so only their shift code is
// known — the caller passes it as `boundary`.
describe('detectViolations H3 across period edges', () => {
  const dates = [date('2026-01-05', 1, 5), date('2026-01-06', 2, 6)]

  function detectBoundary(
    get: (personId: string, dateIso: string) => Assignment,
    boundary: ScheduleBoundary,
    enabled = ENABLED,
  ) {
    return detectViolations([person('p1', 'Anna')], dates, get, DEFAULT_SHIFTS, enabled, NO_HOURS_CAP, MIN_REST_HOURS, boundary)
  }

  it('flags a short rest between the day before the period and its first day', () => {
    const violations = detectBoundary(
      board({ 'p1|2026-01-05': assignment('EARLY'), 'p1|2026-01-06': assignment('OFF') }),
      { before: { p1: 'NIGHT' }, after: {} },
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      id: 'rest-before|p1|2026-01-05',
      kind: 'rest',
      personId: 'p1',
      dateIso: '2026-01-05',
    })
    expect(violations[0]!.message).toBe('Anna has only 0h rest between Sun Jan 4 Night and Mon Jan 5 Early')
  })

  it('flags a short rest between the last day and the day after the period', () => {
    const violations = detectBoundary(
      board({ 'p1|2026-01-05': assignment('OFF'), 'p1|2026-01-06': assignment('NIGHT') }),
      { before: {}, after: { p1: 'EARLY' } },
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      id: 'rest-after|p1|2026-01-06',
      kind: 'rest',
      personId: 'p1',
      dateIso: '2026-01-06',
    })
    expect(violations[0]!.message).toBe('Anna has only 0h rest between Tue Jan 6 Night and Wed Jan 7 Early')
  })

  it('anchors each edge break on the in-period day, ids unique across both edges', () => {
    const get = board({ 'p1|2026-01-05': assignment('EARLY'), 'p1|2026-01-06': assignment('NIGHT') })
    const violations = detectBoundary(get, { before: { p1: 'NIGHT' }, after: { p1: 'EARLY' } })
    expect(violations.map((v) => v.id)).toEqual(['rest-before|p1|2026-01-05', 'rest-after|p1|2026-01-06'])
  })

  it('leaves enough rest across either edge unflagged', () => {
    const get = board({ 'p1|2026-01-05': assignment('EARLY'), 'p1|2026-01-06': assignment('LATE') })
    // MID -> EARLY is 12h across the start edge, LATE -> LATE 16h across the
    // end, and the in-period EARLY -> LATE 24h — all over the 11h minimum.
    expect(detectBoundary(get, { before: { p1: 'MID' }, after: { p1: 'LATE' } })).toHaveLength(0)
  })

  it('treats a missing or off outside day as no constraint', () => {
    const get = board({ 'p1|2026-01-05': assignment('EARLY'), 'p1|2026-01-06': assignment('NIGHT') })
    expect(detectBoundary(get, { before: {}, after: {} })).toHaveLength(0)
    expect(detectBoundary(get, { before: { p2: 'NIGHT' }, after: { p1: 'OFF' } })).toHaveLength(0)
  })

  it('skips both edges when H3 is off', () => {
    const get = board({ 'p1|2026-01-05': assignment('EARLY'), 'p1|2026-01-06': assignment('NIGHT') })
    const off = { ...ENABLED, H3: false }
    expect(detectBoundary(get, { before: { p1: 'NIGHT' }, after: { p1: 'EARLY' } }, off)).toHaveLength(0)
  })

  it('defaults to no boundary, so days outside the period are not checked', () => {
    const get = board({ 'p1|2026-01-05': assignment('EARLY'), 'p1|2026-01-06': assignment('MID') })
    // The NIGHT before the period would flag Jan 5 if the caller passed a boundary.
    expect(detectBoundary(get, { before: { p1: 'NIGHT' }, after: {} })).toHaveLength(1)
    expect(detect([person('p1', 'Anna')], dates, get)).toHaveLength(0)
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

  it('routes a workspace-level tag-coverage break to the null lane, never to a cell', () => {
    const unplaced: Violation = {
      id: 'tagCoverage|tag1|EARLY|2026-01-05|min',
      kind: 'tagCoverage',
      personId: null,
      dateIso: '2026-01-05',
      message: 'Spanish: Early on Mon Jan 5 has 1 person holding this tag, but it needs at least 2',
      params: { tag: 'Spanish', shift: 'Early', date: 'Mon Jan 5', band: 'min', limit: 2, count: 1 },
    }
    const { cellMessages, otherByPerson } = partitionViolationsForBoard(
      [unplaced],
      new Set(['p1']),
      new Set(dates.map((d) => d.iso)),
    )
    expect(cellMessages.size).toBe(0)
    expect(otherByPerson.get(null)).toEqual([unplaced])
  })
})

// H6: a strict tag avoid forbids a cell outright, so a hand-edit that lands
// there is flagged (never blocked). A non-strict avoid stays a soft preference
// (S6) and is not a break; while H6 is off the strict rule folds into that same
// soft preference. Removed people drop out, as in the domain's `checkTagRules`.
describe('detectViolations H6 strict tag avoids', () => {
  const dates = [date('2026-01-05', 1, 5), date('2026-01-06', 2, 6)]

  /** Monday nights are forbidden by the tag; only `get` varies per test. */
  function detectWithTag(
    get: (personId: string, dateIso: string) => Assignment,
    {
      strict = true,
      enabled = ENABLED,
      removed = false,
      shift = 'NIGHT' as string | null,
      when = { type: 'weekly', weekdays: [1] } as TagWhen,
    } = {},
  ) {
    const tag = { ...makeTag('Muslim'), rules: [makeTagRule('avoid', shift, when, strict)] }
    const people: Person[] = [{ ...person('p1', 'Anna'), tagIds: [tag.id], removed }]
    return detectViolations(people, dates, get, DEFAULT_SHIFTS, enabled, NO_HOURS_CAP, MIN_REST_HOURS, undefined, {
      tags: [tag],
    })
  }

  it('flags a hand-edit onto a cell a strict avoid forbids', () => {
    const violations = detectWithTag(
      board({ 'p1|2026-01-05': assignment('NIGHT', { pinned: true }), 'p1|2026-01-06': assignment('OFF') }),
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ kind: 'tagAvoid', personId: 'p1', dateIso: '2026-01-05' })
    expect(violations[0]!.params).toMatchObject({ person: 'Anna', tag: 'Muslim', shift: 'Night' })
  })

  it('leaves a cell alone on a day the rule does not cover', () => {
    // The rule is Monday-only: the Tuesday NIGHT is fine.
    const violations = detectWithTag(
      board({ 'p1|2026-01-05': assignment('OFF'), 'p1|2026-01-06': assignment('NIGHT') }),
    )
    expect(violations).toEqual([])
  })

  it('does not flag a whole-day avoid on a day the person is off', () => {
    // The avoid covers every shift, every day: the OFF Monday is exactly what
    // it wants, the Tuesday EARLY is not.
    const violations = detectWithTag(
      board({ 'p1|2026-01-05': assignment('OFF'), 'p1|2026-01-06': assignment('EARLY') }),
      { shift: null, when: { type: 'always' } },
    )
    expect(violations.map((v) => v.dateIso)).toEqual(['2026-01-06'])
  })

  it('treats a non-strict avoid as a soft preference, not a break', () => {
    const violations = detectWithTag(
      board({ 'p1|2026-01-05': assignment('NIGHT'), 'p1|2026-01-06': assignment('OFF') }),
      { strict: false },
    )
    expect(violations).toEqual([])
  })

  it('ignores strict avoids while H6 is off', () => {
    const violations = detectWithTag(
      board({ 'p1|2026-01-05': assignment('NIGHT'), 'p1|2026-01-06': assignment('OFF') }),
      { enabled: { ...ENABLED, H6: false } },
    )
    expect(violations).toEqual([])
  })

  it('skips removed people, like the domain checker', () => {
    const violations = detectWithTag(
      board({ 'p1|2026-01-05': assignment('NIGHT'), 'p1|2026-01-06': assignment('OFF') }),
      { removed: true },
    )
    expect(violations).toEqual([])
  })

  it('reports nothing without a tag catalog', () => {
    const tag = makeTag('Muslim')
    const people: Person[] = [{ ...person('p1', 'Anna'), tagIds: [tag.id] }]
    expect(
      detectViolations(
        people,
        dates,
        board({ 'p1|2026-01-05': assignment('NIGHT'), 'p1|2026-01-06': assignment('OFF') }),
        DEFAULT_SHIFTS,
        ENABLED,
        NO_HOURS_CAP,
        MIN_REST_HOURS,
      ),
    ).toEqual([])
  })
})

// H7: a tag's own coverage band, counted over active people holding the tag —
// one workspace-level break per tag/date/shift, anchored to the date column.
describe('detectViolations H7 tag coverage', () => {
  const dates = [date('2026-01-05', 1, 5), date('2026-01-06', 2, 6)]
  const tag = makeTag('Spanish')
  const other = makeTag('Portuguese')

  /** Monday Early wants 2-3 of the tag; every other cell is unconstrained. */
  function table(min: number, max: number): CoverageTable {
    return { byDow: { 1: { EARLY: { min, max } } }, dateOverrides: {} }
  }

  function holders(): Person[] {
    return [
      { ...person('p1', 'Ana'), tagIds: [tag.id] },
      { ...person('p2', 'Beto'), tagIds: [tag.id] },
      { ...person('p3', 'Cara'), tagIds: [tag.id] },
    ]
  }

  function detectCoverage(
    people: Person[],
    get: (personId: string, dateIso: string) => Assignment,
    coverage: CoverageTable,
    { enabled = ENABLED, tags = [tag] } = {},
  ) {
    return detectViolations(people, dates, get, DEFAULT_SHIFTS, enabled, NO_HOURS_CAP, MIN_REST_HOURS, undefined, {
      tags,
      tagCoverage: { [tag.id]: coverage },
    })
  }

  /** Every person × date cell is OFF unless the map names a worked code. */
  function worked(codes: Record<string, Assignment['code']>) {
    const map: Record<string, Assignment> = {}
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      for (const dt of dates) {
        const key = `${id}|${dt.iso}`
        map[key] = assignment(codes[key] ?? 'OFF')
      }
    }
    return board(map)
  }

  it('flags a shift short of the tag band, anchored to the date', () => {
    const violations = detectCoverage(holders(), worked({ 'p1|2026-01-05': 'EARLY' }), table(2, 3))
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ kind: 'tagCoverage', personId: null, dateIso: '2026-01-05' })
    expect(violations[0]!.params).toMatchObject({ tag: 'Spanish', shift: 'Early', band: 'min', limit: 2, count: 1 })
  })

  it('flags a shift over the tag band', () => {
    const violations = detectCoverage(
      holders(),
      worked({ 'p1|2026-01-05': 'EARLY', 'p2|2026-01-05': 'EARLY', 'p3|2026-01-05': 'EARLY' }),
      table(1, 2),
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]!.params).toMatchObject({ tag: 'Spanish', shift: 'Early', band: 'max', limit: 2, count: 3 })
  })

  it('satisfies the band exactly at its edges', () => {
    expect(detectCoverage(holders(), worked({ 'p1|2026-01-05': 'EARLY', 'p2|2026-01-05': 'EARLY' }), table(2, 2))).toEqual(
      [],
    )
  })

  it('counts only people holding the tag', () => {
    const people = [...holders(), { ...person('p4', 'Dan'), tagIds: [other.id] }]
    const violations = detectCoverage(people, worked({ 'p1|2026-01-05': 'EARLY', 'p4|2026-01-05': 'EARLY' }), table(2, 3))
    expect(violations).toHaveLength(1)
    expect(violations[0]!.params).toMatchObject({ count: 1 })
  })

  it('excludes removed people from the tag count', () => {
    const people = holders()
    people[2] = { ...people[2]!, removed: true }
    const violations = detectCoverage(
      people,
      worked({ 'p1|2026-01-05': 'EARLY', 'p3|2026-01-05': 'EARLY' }),
      table(2, 3),
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]!.params).toMatchObject({ count: 1 })
  })

  it('ignores tag coverage while H7 is off', () => {
    expect(
      detectCoverage(holders(), worked({}), table(2, 3), { enabled: { ...ENABLED, H7: false } }),
    ).toEqual([])
  })

  it('ignores a tag with no coverage table', () => {
    expect(detectCoverage(holders(), worked({}), table(2, 3), { tags: [other] })).toEqual([])
  })
})
