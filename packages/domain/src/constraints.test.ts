import { describe, expect, it } from 'vitest'
import type {
  Assignment,
  CoverageTable,
  Person,
  Schedule,
  ScheduleBoundary,
  ShiftCode,
  ShiftDef,
  SolveSettings,
  Tag,
  Violation,
} from './index'
import {
  checkEligibility,
  checkH1Coverage,
  checkH2WeeklyHours,
  checkH3Rest,
  checkH5TimeOff,
  checkSchedule,
  checkTagCoverage,
  checkTagRules,
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  makePerson,
  makeTag,
  makeTagGroup,
  makeTagRule,
  paidHours,
  restHoursBetween,
  shiftDurationHours,
  shiftSpan,
  violationCellKey,
  violationsByCell,
} from './index'

function makeTestAssignment(
  code: ShiftCode,
  overrides?: Partial<Assignment>,
): Assignment {
  const shifts = DEFAULT_SHIFTS
  const def = shifts.find((s) => s.code === code)
  return {
    code,
    start: def?.start ?? null,
    end: def?.end ?? null,
    pinned: false,
    ineligible: false,
    ...overrides,
  }
}

function makeTestSchedule(entries: Record<string, Partial<Assignment>>): Schedule {
  const schedule: Schedule = new Map()
  for (const [key, partial] of Object.entries(entries)) {
    const code = partial.code ?? 'OFF'
    schedule.set(key, makeTestAssignment(code, partial))
  }
  return schedule
}

function settingsWith(
  enabledOverrides: Partial<SolveSettings['hardRules']['enabled']>,
  maxHoursPerWeek = 40,
  minRestHours = 11,
): SolveSettings {
  return {
    ...DEFAULT_SOLVE_SETTINGS,
    hardRules: {
      enabled: {
        ...DEFAULT_SOLVE_SETTINGS.hardRules.enabled,
        ...enabledOverrides,
      },
      maxHoursPerWeek,
      minRestHours,
    },
  }
}

describe('shiftDurationHours and shiftSpan', () => {
  it('computes normal shift duration within same day', () => {
    expect(shiftDurationHours(DEFAULT_SHIFTS, 'EARLY')).toBe(8)
    expect(shiftDurationHours(DEFAULT_SHIFTS, 'MID')).toBe(8)
    expect(shiftDurationHours(DEFAULT_SHIFTS, 'LATE')).toBe(8)
  })

  it('handles cross-midnight shifts (2200 to 0600) as +24h', () => {
    // NIGHT is 2200 (1320m) to 0600 (360m). End <= start means end becomes 360 + 1440 = 1800m.
    // (1800 - 1320) / 60 = 480 / 60 = 8h.
    const span = shiftSpan(DEFAULT_SHIFTS, 'NIGHT')
    expect(span).toEqual({ start: 1320, end: 1800 })
    expect(shiftDurationHours(DEFAULT_SHIFTS, 'NIGHT')).toBe(8)
  })

  it('returns 0 hours for OFF', () => {
    expect(shiftDurationHours(DEFAULT_SHIFTS, 'OFF')).toBe(0)
    expect(shiftSpan(DEFAULT_SHIFTS, 'OFF')).toBeNull()
  })
})

describe('paidHours', () => {
  it('equals clock duration when there is no unpaid break', () => {
    expect(paidHours(DEFAULT_SHIFTS, 'EARLY')).toBe(shiftDurationHours(DEFAULT_SHIFTS, 'EARLY'))
    expect(paidHours(DEFAULT_SHIFTS, 'EARLY')).toBe(8)
  })

  it('subtracts the unpaid break from the clock span', () => {
    const shifts: ShiftDef[] = [{ code: 'D', label: 'Day', start: '0900', end: '1730', unpaidBreakMinutes: 30 }]
    // clock span 8.5h minus a 30m break = 8.0h paid
    expect(shiftDurationHours(shifts, 'D')).toBe(8.5)
    expect(paidHours(shifts, 'D')).toBe(8)
  })

  it('never goes below zero, and is zero for OFF', () => {
    const shifts: ShiftDef[] = [{ code: 'X', label: 'Tiny', start: '0900', end: '0930', unpaidBreakMinutes: 60 }]
    expect(paidHours(shifts, 'X')).toBe(0)
    expect(paidHours(DEFAULT_SHIFTS, 'OFF')).toBe(0)
  })
})

describe('restHoursBetween', () => {
  it('returns 0 hours between NIGHT and EARLY on consecutive days', () => {
    // NIGHT ends at 0600 (+24h = 1800m). Next day EARLY starts at 0600 (360m).
    // (1440 - 1800 + 360) / 60 = 0h.
    expect(restHoursBetween(DEFAULT_SHIFTS, 'NIGHT', 'EARLY')).toBe(0)
  })

  it('returns 24 hours between LATE and NIGHT on consecutive days', () => {
    // LATE ends at 2200 (1320m). Next day NIGHT starts at 2200 (1320m).
    // (1440 - 1320 + 1320) / 60 = 24h.
    expect(restHoursBetween(DEFAULT_SHIFTS, 'LATE', 'NIGHT')).toBe(24)
  })

  it('returns null if either shift is OFF', () => {
    expect(restHoursBetween(DEFAULT_SHIFTS, 'NIGHT', 'OFF')).toBeNull()
    expect(restHoursBetween(DEFAULT_SHIFTS, 'OFF', 'EARLY')).toBeNull()
  })
})

describe('checkEligibility (ported from proto/src/board/violations.test.ts:52-63)', () => {
  const period = { start: '2026-01-05', end: '2026-01-06' }
  const shifts = DEFAULT_SHIFTS
  const coverage = defaultCoverageTable(shifts, 2)
  const settings = settingsWith({})

  it('flags an ineligible hand-edit (person has NIGHT in ineligible)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna', ineligible: ['NIGHT'] })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'OFF' },
      'p1|2026-01-06': { code: 'NIGHT', pinned: true, ineligible: true },
    })

    const violations = checkEligibility({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.ruleId).toBe('eligibility')
      expect(first.personId).toBe('p1')
      expect(first.iso).toBe('2026-01-06')
      expect(first.shiftCode).toBe('NIGHT')
    }
  })

  it('flags when assignment has ineligible=true flag even if person record does not list it', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna', ineligible: [] })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'NIGHT', ineligible: true },
    })

    const violations = checkEligibility({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.personId).toBe('p1')
      expect(first.iso).toBe('2026-01-05')
    }
  })

  it('does not flag an OFF assignment even if person is ineligible for certain codes', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna', ineligible: ['NIGHT'] })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'OFF' },
    })

    const violations = checkEligibility({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })
})

describe('checkH3Rest (ported from proto/src/board/violations.test.ts:65-94)', () => {
  const period = { start: '2026-01-05', end: '2026-01-06' }
  const shifts = DEFAULT_SHIFTS
  const coverage = defaultCoverageTable(shifts, 2)
  const settings = settingsWith({}, 10_000, 11)

  it('flags back-to-back shifts with no rest (NIGHT then EARLY)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'NIGHT' },
      'p1|2026-01-06': { code: 'EARLY' },
    })

    const violations = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.ruleId).toBe('H3')
      expect(first.personId).toBe('p1')
      expect(first.iso).toBe('2026-01-06')
      expect(first.restHours).toBe(0)
      expect(first.minRestHours).toBe(11)
    }
  })

  it('skips the rest check across a day off in either direction', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })

    const violations1 = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule: makeTestSchedule({
        'p1|2026-01-05': { code: 'NIGHT' },
        'p1|2026-01-06': { code: 'OFF' },
      }),
    })
    expect(violations1).toHaveLength(0)

    const violations2 = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule: makeTestSchedule({
        'p1|2026-01-05': { code: 'OFF' },
        'p1|2026-01-06': { code: 'EARLY' },
      }),
    })
    expect(violations2).toHaveLength(0)
  })

  it('does not flag NIGHT into NIGHT with 16h rest when minRest is 11h', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'NIGHT' },
      'p1|2026-01-06': { code: 'NIGHT' },
    })

    const violations = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })

  it('respects H3 enabled toggle: disabled H3 reports nothing', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'NIGHT' },
      'p1|2026-01-06': { code: 'EARLY' },
    })

    const disabledSettings = settingsWith({ H3: false }, 10_000, 11)
    const violations = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings: disabledSettings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })

  it('flags too little rest between the shift before the period and the first day', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    // Nothing on 2026-01-06: only the edge can flag the first day.
    const schedule = makeTestSchedule({ 'p1|2026-01-05': { code: 'EARLY' } })
    const boundary: ScheduleBoundary = { before: { p1: 'NIGHT' }, after: {} }

    const violations = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
      boundary,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.ruleId).toBe('H3')
      expect(first.personId).toBe('p1')
      expect(first.iso).toBe('2026-01-05')
      expect(first.shiftCode).toBe('EARLY')
      expect(first.restHours).toBe(0)
      expect(first.minRestHours).toBe(11)
      expect(first.message).toBe(
        'Anna has only 0h rest between Sun 2026-01-04 NIGHT and Mon 2026-01-05 EARLY; minimum is 11h.',
      )
    }
  })

  it('flags too little rest between the last day and the shift after the period', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({ 'p1|2026-01-06': { code: 'NIGHT' } })
    const boundary: ScheduleBoundary = { before: {}, after: { p1: 'EARLY' } }

    const violations = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
      boundary,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.ruleId).toBe('H3')
      expect(first.iso).toBe('2026-01-06')
      expect(first.shiftCode).toBe('NIGHT')
      expect(first.restHours).toBe(0)
      expect(first.message).toBe(
        'Anna has only 0h rest between Tue 2026-01-06 NIGHT and Wed 2026-01-07 EARLY; minimum is 11h.',
      )
    }
  })

  it('checks no edge without a boundary, and none for OFF or a compatible neighbour', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    // The days outside the period would both break rest (0h into EARLY after
    // NIGHT), but only a boundary can see a day the period does not contain.
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'EARLY' },
      'p1|2026-01-06': { code: 'NIGHT' },
    })

    const withoutBoundary = checkH3Rest({ people: [p1], shifts, coverage, settings, period, schedule })
    expect(withoutBoundary).toHaveLength(0)

    const offBoundary: ScheduleBoundary = { before: { p1: 'OFF' }, after: { p1: 'OFF' } }
    const withOff = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
      boundary: offBoundary,
    })
    expect(withOff).toHaveLength(0)

    // EARLY (0600-1400) before EARLY on 2026-01-05 leaves 16h, and NIGHT
    // (2200-0600) after NIGHT on 2026-01-06 leaves 16h: both edges clear 11h.
    const compatible: ScheduleBoundary = { before: { p1: 'EARLY' }, after: { p1: 'NIGHT' } }
    const withCompatible = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
      boundary: compatible,
    })
    expect(withCompatible).toHaveLength(0)

    // A neighbour who is not on the roster contributes nothing either.
    const unknownPerson: ScheduleBoundary = { before: { p9: 'NIGHT' }, after: { p9: 'NIGHT' } }
    const withUnknown = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
      boundary: unknownPerson,
    })
    expect(withUnknown).toHaveLength(0)
  })

  it('flags both edges in one pass with distinct ids', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    // EARLY -> NIGHT inside the period leaves 32h, so only the edges break.
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'EARLY' },
      'p1|2026-01-06': { code: 'NIGHT' },
    })
    const boundary: ScheduleBoundary = { before: { p1: 'NIGHT' }, after: { p1: 'MID' } }

    const violations = checkH3Rest({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
      boundary,
    })

    expect(violations.map((v) => v.id)).toEqual(['H3|p1|2026-01-05', 'H3|p1|2026-01-06|after'])
    expect(violations.map((v) => v.iso)).toEqual(['2026-01-05', '2026-01-06'])
    expect(violations.map((v) => v.shiftCode)).toEqual(['EARLY', 'NIGHT'])
    expect(violations[1]?.message).toBe(
      'Anna has only 4h rest between Tue 2026-01-06 NIGHT and Wed 2026-01-07 MID; minimum is 11h.',
    )
  })
})

describe('checkH2WeeklyHours', () => {
  const period = { start: '2026-01-05', end: '2026-01-11' } // 7-day week (Mon to Sun)
  const shifts = DEFAULT_SHIFTS
  const coverage = defaultCoverageTable(shifts, 2)

  it('does not flag when weekly hours equal or are under cap (5 x 8h = 40h <= 40h)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'EARLY' },
      'p1|2026-01-06': { code: 'EARLY' },
      'p1|2026-01-07': { code: 'EARLY' },
      'p1|2026-01-08': { code: 'EARLY' },
      'p1|2026-01-09': { code: 'EARLY' },
      'p1|2026-01-10': { code: 'OFF' },
      'p1|2026-01-11': { code: 'OFF' },
    })

    const violations = checkH2WeeklyHours({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({ H2: true }, 40),
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })

  it('flags when weekly hours exceed cap (6 x 8h = 48h > 40h)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'EARLY' },
      'p1|2026-01-06': { code: 'EARLY' },
      'p1|2026-01-07': { code: 'EARLY' },
      'p1|2026-01-08': { code: 'EARLY' },
      'p1|2026-01-09': { code: 'EARLY' },
      'p1|2026-01-10': { code: 'EARLY' },
      'p1|2026-01-11': { code: 'OFF' },
    })

    const violations = checkH2WeeklyHours({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({ H2: true }, 40),
      period,
      schedule,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.ruleId).toBe('H2')
      expect(first.personId).toBe('p1')
      expect(first.iso).toBe('2026-01-05') // Anchored to first worked day
      expect(first.actualHours).toBe(48)
      expect(first.maxHours).toBe(40)
    }
  })

  it('handles cross-midnight shifts correctly for weekly hours (6 x 8h NIGHT = 48h > 40h)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'NIGHT' },
      'p1|2026-01-06': { code: 'NIGHT' },
      'p1|2026-01-07': { code: 'NIGHT' },
      'p1|2026-01-08': { code: 'NIGHT' },
      'p1|2026-01-09': { code: 'NIGHT' },
      'p1|2026-01-10': { code: 'NIGHT' },
      'p1|2026-01-11': { code: 'OFF' },
    })

    const violations = checkH2WeeklyHours({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({ H2: true }, 40),
      period,
      schedule,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.actualHours).toBe(48)
    }
  })

  it('respects H2 enabled toggle: disabled H2 reports nothing', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'EARLY' },
      'p1|2026-01-06': { code: 'EARLY' },
      'p1|2026-01-07': { code: 'EARLY' },
      'p1|2026-01-08': { code: 'EARLY' },
      'p1|2026-01-09': { code: 'EARLY' },
      'p1|2026-01-10': { code: 'EARLY' },
    })

    const violations = checkH2WeeklyHours({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({ H2: false }, 40),
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })
})

describe('checkH5TimeOff', () => {
  const period = { start: '2026-01-05', end: '2026-01-11' } // Mon 2026-01-05 to Sun 2026-01-11
  const shifts = DEFAULT_SHIFTS
  const coverage = defaultCoverageTable(shifts, 2)
  const settings = settingsWith({ H5: true })

  it('flags scheduled non-OFF shift on person timeOff date', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna', timeOff: ['2026-01-07'] })
    const schedule = makeTestSchedule({
      'p1|2026-01-07': { code: 'EARLY' },
    })

    const violations = checkH5TimeOff({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.ruleId).toBe('H5')
      expect(first.personId).toBe('p1')
      expect(first.iso).toBe('2026-01-07')
      expect(first.shiftCode).toBe('EARLY')
    }
  })

  it('flags scheduled non-OFF shift on person recurringOff weekday (e.g. 0 = Sunday)', () => {
    // 2026-01-11 is Sunday (weekday 0)
    const p1 = makePerson({ id: 'p1', name: 'Anna', recurringOff: [0] })
    const schedule = makeTestSchedule({
      'p1|2026-01-11': { code: 'LATE' },
    })

    const violations = checkH5TimeOff({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(1)
    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.ruleId).toBe('H5')
      expect(first.iso).toBe('2026-01-11')
    }
  })

  it('does not flag OFF assignment on timeOff or recurringOff date', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna', timeOff: ['2026-01-07'], recurringOff: [0] })
    const schedule = makeTestSchedule({
      'p1|2026-01-07': { code: 'OFF' },
      'p1|2026-01-11': { code: 'OFF' },
    })

    const violations = checkH5TimeOff({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })

  it('respects H5 enabled toggle: disabled H5 reports nothing', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna', timeOff: ['2026-01-07'] })
    const schedule = makeTestSchedule({
      'p1|2026-01-07': { code: 'EARLY' },
    })

    const violations = checkH5TimeOff({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({ H5: false }),
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })
})

describe('checkH1Coverage (ported from proto/src/board/coverage.test.ts:44-94)', () => {
  const period = { start: '2026-01-07', end: '2026-01-07' }
  const shifts = DEFAULT_SHIFTS
  // table min: 2, max: 4 for every shift
  const table = defaultCoverageTable(shifts, 2)
  const settings = settingsWith({ H1: true })

  it('flags a shift short of the minimum (count=1, min=2)', () => {
    const people = [makePerson({ id: 'p1', name: 'p1' }), makePerson({ id: 'p2', name: 'p2' })]
    const schedule = makeTestSchedule({
      'p1|2026-01-07': { code: 'NIGHT' },
      'p2|2026-01-07': { code: 'OFF' },
    })

    const violations = checkH1Coverage({
      people,
      shifts,
      coverage: table,
      settings,
      period,
      schedule,
    })

    const nightViol = violations.find((v) => v.shiftCode === 'NIGHT')
    expect(nightViol).toBeDefined()
    if (nightViol) {
      expect(nightViol.ruleId).toBe('H1')
      expect(nightViol.personId).toBeNull()
      expect(nightViol.iso).toBe('2026-01-07')
      expect(nightViol.count).toBe(1)
      expect(nightViol.min).toBe(2)
    }
  })

  it('flags a shift over the ceiling (count=5, max=4)', () => {
    // Fill EARLY, MID, LATE with 2 people each (within band 2..4), and NIGHT with 5 (over max 4)
    const inRange = ['EARLY', 'MID', 'LATE'].flatMap((code) =>
      [0, 1].map((i) => makePerson({ id: `${code}${i}`, name: `${code}${i}` })),
    )
    const over = Array.from({ length: 5 }, (_, i) => makePerson({ id: `night${i}`, name: `night${i}` }))

    const entries: Record<string, Partial<Assignment>> = {}
    for (const p of inRange) {
      const code = p.id.slice(0, -1)
      entries[`${p.id}|2026-01-07`] = { code }
    }
    for (const p of over) {
      entries[`${p.id}|2026-01-07`] = { code: 'NIGHT' }
    }

    const violations = checkH1Coverage({
      people: [...inRange, ...over],
      shifts,
      coverage: table,
      settings,
      period,
      schedule: makeTestSchedule(entries),
    })

    const nightViol = violations.find((v) => v.shiftCode === 'NIGHT')
    expect(nightViol).toBeDefined()
    if (nightViol) {
      expect(nightViol.ruleId).toBe('H1')
      expect(nightViol.count).toBe(5)
      expect(nightViol.max).toBe(4)
    }

    // EARLY, MID, LATE should have no violations
    expect(violations.filter((v) => v.shiftCode !== 'NIGHT')).toHaveLength(0)
  })

  it('respects H1 enabled toggle: disabled H1 reports nothing', () => {
    const people = [makePerson({ id: 'p1', name: 'p1' })]
    const schedule = makeTestSchedule({
      'p1|2026-01-07': { code: 'OFF' },
    })

    const violations = checkH1Coverage({
      people,
      shifts,
      coverage: table,
      settings: settingsWith({ H1: false }),
      period,
      schedule,
    })

    expect(violations).toHaveLength(0)
  })
})

describe('checkSchedule (integration & sorting from proto/src/board/violations.test.ts:96-109)', () => {
  // Proto's detectViolations (proto/src/board/violations.ts:94-185) evaluates H2, H3, H5, and eligibility;
  // coverage (H1) was tested separately in proto/src/board/coverage.test.ts.
  // Proto's fixture used NO_HOURS_CAP = 10_000 so H2 would not trip, and had no H1 checks.
  // Note on H3: proto/src/board/violations.ts:135-146 flags exactly ONE cell (the second day, date.iso),
  // as verified by proto/src/board/violations.test.ts:72-73.
  // To isolate the test scenario to eligibility and rest sorting without coverage interference,
  // we pass an unconstrained coverage table and disable H1.
  const shifts = DEFAULT_SHIFTS
  const coverage = { byDow: {}, dateOverrides: {} }
  const settings = settingsWith({ H1: false }, 10_000, 11)

  it('sorts by date then person so a far-away break still has a stable place', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna', ineligible: ['NIGHT'] })
    const p2 = makePerson({ id: 'p2', name: 'Zed' })
    const period = { start: '2026-01-05', end: '2026-01-19' }

    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'OFF' },
      'p1|2026-01-06': { code: 'OFF' },
      'p1|2026-01-19': { code: 'NIGHT', ineligible: true },
      'p2|2026-01-05': { code: 'NIGHT' },
      'p2|2026-01-06': { code: 'EARLY' },
      'p2|2026-01-19': { code: 'OFF' },
    })

    const violations = checkSchedule({
      people: [p2, p1], // p2 first in list
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })

    const dates = violations.map((v) => v.iso)
    expect(dates).toEqual(['2026-01-06', '2026-01-19'])

    const first = violations[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.personId).toBe('p2')
      expect(first.ruleId).toBe('H3')
    }

    const second = violations[1]
    expect(second).toBeDefined()
    if (second) {
      expect(second.personId).toBe('p1')
      expect(second.ruleId).toBe('eligibility')
    }
  })

  it('carries the boundary through to H3 on the period edges', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const period = { start: '2026-01-05', end: '2026-01-06' }
    // A hand-made schedule: NIGHT the day before, EARLY on the first day, and
    // EARLY again on the last day (which is fine after an OFF in between).
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'EARLY' },
      'p1|2026-01-06': { code: 'OFF' },
    })
    const boundary: ScheduleBoundary = { before: { p1: 'NIGHT' }, after: {} }

    const violations = checkSchedule({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
      boundary,
    })

    const rest = violations.filter((v) => v.ruleId === 'H3')
    expect(rest).toHaveLength(1)
    const first = rest[0]
    expect(first).toBeDefined()
    if (first) {
      expect(first.iso).toBe('2026-01-05')
      expect(first.shiftCode).toBe('EARLY')
      expect(first.restHours).toBe(0)
      expect(first.message).toBe(
        'Anna has only 0h rest between Sun 2026-01-04 NIGHT and Mon 2026-01-05 EARLY; minimum is 11h.',
      )
    }

    const withoutBoundary = checkSchedule({
      people: [p1],
      shifts,
      coverage,
      settings,
      period,
      schedule,
    })
    expect(withoutBoundary.filter((v) => v.ruleId === 'H3')).toHaveLength(0)
  })
})

describe('violationCellKey and violationsByCell', () => {
  it('indexes violations by cell key and skips H1 violations without personId', () => {
    const v1: Violation = {
      id: 'eligibility|p1|2026-01-06',
      ruleId: 'eligibility',
      personId: 'p1',
      iso: '2026-01-06',
      shiftCode: 'NIGHT',
      message: 'Anna is not eligible for NIGHT',
    }
    const v2: Violation = {
      id: 'H1|2026-01-06|EARLY|short',
      ruleId: 'H1',
      personId: null,
      iso: '2026-01-06',
      shiftCode: 'EARLY',
      message: 'EARLY short',
    }

    expect(violationCellKey(v1)).toBe('p1|2026-01-06')
    expect(violationCellKey(v2)).toBeNull()

    const byCell = violationsByCell([v1, v2])
    expect(byCell.size).toBe(1)
    expect(byCell.get('p1|2026-01-06')).toEqual([v1])
  })
})

describe('checkTagRules (H6 strict tag avoids)', () => {
  const period = { start: '2026-01-05', end: '2026-01-06' } // Mon, Tue
  const shifts = DEFAULT_SHIFTS
  const coverage: CoverageTable = { byDow: {}, dateOverrides: {} }

  /** A tag whose strict avoid covers every NIGHT, built through the factories. */
  function nightOffTag(name: string): Tag {
    const rule = makeTagRule('avoid', 'NIGHT', { type: 'always' }, true)
    return { ...makeTag(name, makeTagGroup('Faith').id), rules: [rule] }
  }

  it('flags an active holder scheduled on a strictly avoided shift', () => {
    const tag = nightOffTag('Night off')
    const p1 = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'EARLY' }, // not avoided
      'p1|2026-01-06': { code: 'NIGHT' },
    })

    const violations = checkTagRules({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({}),
      period,
      schedule,
      tags: [tag],
    })

    expect(violations).toHaveLength(1)
    const violation = violations[0]
    expect(violation).toBeDefined()
    if (violation) {
      expect(violation.ruleId).toBe('H6')
      expect(violation.id).toBe('H6|p1|2026-01-06')
      expect(violation.personId).toBe('p1')
      expect(violation.iso).toBe('2026-01-06')
      expect(violation.shiftCode).toBe('NIGHT')
      expect(violation.message).toBe(
        'Ana is scheduled for NIGHT on Tue 2026-01-06, but the tag Night off strictly avoids that shift.',
      )
    }
  })

  it('names the first tag in workspace order when several strictly avoid the cell', () => {
    const first = nightOffTag('First tag')
    const second = nightOffTag('Second tag')
    const p1 = makePerson({ id: 'p1', name: 'Ana', tagIds: [first.id, second.id] })
    const schedule = makeTestSchedule({ 'p1|2026-01-06': { code: 'NIGHT' } })

    const violations = checkTagRules({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({}),
      period,
      schedule,
      tags: [first, second],
    })

    expect(violations).toHaveLength(1)
    expect(violations[0]?.message).toContain('First tag')
  })

  it('does not flag a soft tag avoid or a tag want', () => {
    const softRule = makeTagRule('avoid', 'NIGHT', { type: 'always' })
    const wantRule = makeTagRule('want', 'NIGHT', { type: 'always' })
    const soft: Tag = { ...makeTag('Soft night off'), rules: [softRule] }
    const want: Tag = { ...makeTag('Night lover'), rules: [wantRule] }
    const p1 = makePerson({ id: 'p1', name: 'Ana', tagIds: [soft.id, want.id] })
    const schedule = makeTestSchedule({ 'p1|2026-01-06': { code: 'NIGHT' } })

    const violations = checkTagRules({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({}),
      period,
      schedule,
      tags: [soft, want],
    })

    expect(violations).toHaveLength(0)
  })

  it('reports nothing while H6 is disabled', () => {
    const tag = nightOffTag('Night off')
    const p1 = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const schedule = makeTestSchedule({ 'p1|2026-01-06': { code: 'NIGHT' } })

    const violations = checkTagRules({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({ H6: false }),
      period,
      schedule,
      tags: [tag],
    })

    expect(violations).toHaveLength(0)
  })

  it('excludes soft-removed people', () => {
    const tag = nightOffTag('Night off')
    const removed = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id], removed: true })
    const schedule = makeTestSchedule({ 'p1|2026-01-06': { code: 'NIGHT' } })

    const violations = checkTagRules({
      people: [removed],
      shifts,
      coverage,
      settings: settingsWith({}),
      period,
      schedule,
      tags: [tag],
    })

    expect(violations).toHaveLength(0)
  })

  it('reads tags from the slice only: a person with no tag catalog gets no H6', () => {
    const tag = nightOffTag('Night off')
    const p1 = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const schedule = makeTestSchedule({ 'p1|2026-01-06': { code: 'NIGHT' } })

    const violations = checkTagRules({ people: [p1], shifts, coverage, settings: settingsWith({}), period, schedule })

    expect(violations).toHaveLength(0)
  })

  it('is reported by checkSchedule', () => {
    const tag = nightOffTag('Night off')
    const p1 = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const schedule = makeTestSchedule({ 'p1|2026-01-06': { code: 'NIGHT' } })

    const violations = checkSchedule({
      people: [p1],
      shifts,
      coverage,
      settings: settingsWith({}),
      period,
      schedule,
      tags: [tag],
    })

    expect(violations.filter((v) => v.ruleId === 'H6')).toHaveLength(1)
  })
})

describe('checkTagCoverage (H7 tag coverage bands)', () => {
  const period = { start: '2026-01-05', end: '2026-01-05' } // Monday
  const shifts = DEFAULT_SHIFTS
  const coverage: CoverageTable = { byDow: {}, dateOverrides: {} }
  // Monday: EARLY needs 2..3 holders of the tag; NIGHT has no band at all.
  const tagTable: CoverageTable = { byDow: { 1: { EARLY: { min: 2, max: 3 } } }, dateOverrides: {} }

  const tag: Tag = makeTag('Nurses')

  function sliceWith(people: Person[], entries: Record<string, Partial<Assignment>>) {
    return {
      people,
      shifts,
      coverage,
      settings: settingsWith({}),
      period,
      schedule: makeTestSchedule(entries),
      tags: [tag],
      tagCoverage: { [tag.id]: tagTable },
    }
  }

  it('flags a shift short of the tag minimum', () => {
    const holder = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const other = makePerson({ id: 'p2', name: 'Bo' })
    const violations = checkTagCoverage(
      sliceWith([holder, other], { 'p1|2026-01-05': { code: 'EARLY' }, 'p2|2026-01-05': { code: 'EARLY' } }),
    )

    expect(violations).toHaveLength(1)
    const violation = violations[0]
    expect(violation).toBeDefined()
    if (violation) {
      expect(violation.ruleId).toBe('H7')
      expect(violation.id).toBe(`H7|${tag.id}|2026-01-05|EARLY|short`)
      expect(violation.personId).toBeNull()
      expect(violation.count).toBe(1)
      expect(violation.min).toBe(2)
      expect(violation.shiftCode).toBe('EARLY')
      expect(violation.message).toBe(
        'Nurses: EARLY on Mon 2026-01-05 has 1 person holding this tag; it needs at least 2.',
      )
    }
  })

  it('flags a shift over the tag ceiling', () => {
    const holders = ['p1', 'p2', 'p3', 'p4'].map((id) => makePerson({ id, name: id, tagIds: [tag.id] }))
    const entries: Record<string, Partial<Assignment>> = {}
    for (const person of holders) entries[`${person.id}|2026-01-05`] = { code: 'EARLY' }

    const violations = checkTagCoverage(sliceWith(holders, entries))

    expect(violations).toHaveLength(1)
    const violation = violations[0]
    expect(violation).toBeDefined()
    if (violation) {
      expect(violation.id).toBe(`H7|${tag.id}|2026-01-05|EARLY|over`)
      expect(violation.count).toBe(4)
      expect(violation.max).toBe(3)
      expect(violation.personId).toBeNull()
    }
  })

  it('reads a shift with no band in the tag table as no requirement', () => {
    const holder = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const violations = checkTagCoverage(sliceWith([holder], { 'p1|2026-01-05': { code: 'NIGHT' } }))

    // Only EARLY carries a band on Mondays; NIGHT is unconstrained even at zero holders.
    expect(violations.filter((v) => v.shiftCode === 'NIGHT')).toHaveLength(0)
    expect(violations.filter((v) => v.shiftCode === 'EARLY')).toHaveLength(1)
  })

  it('counts zero when the only holder is off that day', () => {
    const holder = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const violations = checkTagCoverage(sliceWith([holder], { 'p1|2026-01-05': { code: 'OFF' } }))

    expect(violations).toHaveLength(1)
    expect(violations[0]?.id).toBe(`H7|${tag.id}|2026-01-05|EARLY|short`)
    expect(violations[0]?.count).toBe(0)
  })

  it('excludes soft-removed holders from the count', () => {
    const holder = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const removed = makePerson({ id: 'p2', name: 'Bo', tagIds: [tag.id], removed: true })
    const violations = checkTagCoverage(
      sliceWith([holder, removed], { 'p1|2026-01-05': { code: 'EARLY' }, 'p2|2026-01-05': { code: 'EARLY' } }),
    )

    expect(violations).toHaveLength(1)
    expect(violations[0]?.count).toBe(1)
  })

  it('ignores a tag with no coverage table', () => {
    const untabled: Tag = makeTag('Drivers')
    const holder = makePerson({ id: 'p1', name: 'Ana', tagIds: [untabled.id] })
    const violations = checkTagCoverage({
      people: [holder],
      shifts,
      coverage,
      settings: settingsWith({}),
      period,
      schedule: makeTestSchedule({ 'p1|2026-01-05': { code: 'EARLY' } }),
      tags: [untabled],
      tagCoverage: { [tag.id]: tagTable },
    })

    expect(violations).toHaveLength(0)
  })

  it('reports nothing while H7 is disabled', () => {
    const holder = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const violations = checkTagCoverage({
      ...sliceWith([holder], { 'p1|2026-01-05': { code: 'EARLY' } }),
      settings: settingsWith({ H7: false }),
    })

    expect(violations).toHaveLength(0)
  })

  it('is reported by checkSchedule', () => {
    const holder = makePerson({ id: 'p1', name: 'Ana', tagIds: [tag.id] })
    const violations = checkSchedule(
      sliceWith([holder], { 'p1|2026-01-05': { code: 'EARLY' } }),
    )
    expect(violations.filter((v) => v.ruleId === 'H7')).toHaveLength(1)
  })
})
