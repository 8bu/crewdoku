import { describe, expect, it } from 'vitest'
import type { Assignment, Schedule, ShiftCode, ShiftDef, SolveSettings, Violation } from './index'
import {
  checkEligibility,
  checkH1Coverage,
  checkH2WeeklyHours,
  checkH3Rest,
  checkH5TimeOff,
  checkSchedule,
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  H4_STRUCTURAL_NOTE,
  makePerson,
  paidHours,
  restHoursBetween,
  shiftDurationHours,
  shiftSpan,
  SOFT_GOAL_DEFINITIONS,
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

  it('subtracts across a midnight-crossing shift', () => {
    const shifts: ShiftDef[] = [{ code: 'N', label: 'Night', start: '2200', end: '0600', unpaidBreakMinutes: 60 }]
    // clock span 8h minus a 60m break = 7h paid
    expect(paidHours(shifts, 'N')).toBe(7)
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

  it('returns 8 hours between NIGHT and LATE on consecutive days', () => {
    // NIGHT ends at 0600 (+24h = 1800m). Next day LATE starts at 1400 (840m).
    // (1440 - 1800 + 840) / 60 = 480 / 60 = 8h.
    expect(restHoursBetween(DEFAULT_SHIFTS, 'NIGHT', 'LATE')).toBe(8)
  })

  it('returns 16 hours between NIGHT and NIGHT on consecutive days', () => {
    // NIGHT ends at 0600 (+24h = 1800m). Next day NIGHT starts at 2200 (1320m).
    // (1440 - 1800 + 1320) / 60 = 960 / 60 = 16h.
    expect(restHoursBetween(DEFAULT_SHIFTS, 'NIGHT', 'NIGHT')).toBe(16)
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
      expect(first.message).toContain('Anna')
      expect(first.message).toContain('NIGHT')
      expect(first.message).toContain('not eligible')
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
      expect(first.message).toMatch(/0h rest/)
      expect(first.message).toContain('Anna')
    }
  })

  it('does not flag a normal rotation with a full day of rest (LATE then NIGHT)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'LATE' },
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

  it('flags NIGHT into LATE with 8h rest when minRest is 11h (cross-midnight rest edge case)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Anna' })
    const schedule = makeTestSchedule({
      'p1|2026-01-05': { code: 'NIGHT' },
      'p1|2026-01-06': { code: 'LATE' },
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
      expect(first.restHours).toBe(8)
      expect(first.message).toMatch(/8h rest/)
    }
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
      expect(first.message).toContain('Anna')
      expect(first.message).toContain('48h')
      expect(first.message).toContain('40h')
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
      expect(first.message).toContain('Anna')
      expect(first.message).toContain('not available')
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
      expect(nightViol.message).toContain('NIGHT on Wed 2026-01-07 has 1 person; it needs at least 2.')
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
      expect(nightViol.message).toContain('has 5 people; it needs at most 4.')
    }

    // EARLY, MID, LATE should have no violations
    expect(violations.filter((v) => v.shiftCode !== 'NIGHT')).toHaveLength(0)
  })

  it('reads ok when every shift sits within its min/max band', () => {
    const people = ['EARLY', 'MID', 'LATE', 'NIGHT'].flatMap((code) =>
      [0, 1].map((i) => makePerson({ id: `${code}${i}`, name: `${code}${i}` })),
    )
    const entries: Record<string, Partial<Assignment>> = {}
    for (const p of people) {
      const code = p.id.slice(0, -1)
      entries[`${p.id}|2026-01-07`] = { code }
    }

    const violations = checkH1Coverage({
      people,
      shifts,
      coverage: table,
      settings,
      period,
      schedule: makeTestSchedule(entries),
    })

    expect(violations).toHaveLength(0)
  })

  it('flags both short and over violations on the same day when both occur', () => {
    const people = [
      makePerson({ id: 'p1', name: 'p1' }),
      makePerson({ id: 'p2', name: 'p2' }),
      makePerson({ id: 'p3', name: 'p3' }),
      makePerson({ id: 'p4', name: 'p4' }),
      makePerson({ id: 'p5', name: 'p5' }), // NIGHT count = 5 (over max 4)
      makePerson({ id: 'p6', name: 'p6' }), // EARLY count = 1 (short of min 2)
    ]
    const schedule = makeTestSchedule({
      'p1|2026-01-07': { code: 'NIGHT' },
      'p2|2026-01-07': { code: 'NIGHT' },
      'p3|2026-01-07': { code: 'NIGHT' },
      'p4|2026-01-07': { code: 'NIGHT' },
      'p5|2026-01-07': { code: 'NIGHT' },
      'p6|2026-01-07': { code: 'EARLY' },
    })

    const violations = checkH1Coverage({
      people,
      shifts,
      coverage: table,
      settings,
      period,
      schedule,
    })

    expect(violations.some((v) => v.shiftCode === 'NIGHT' && (v.count ?? 0) > 4)).toBe(true)
    expect(violations.some((v) => v.shiftCode === 'EARLY' && (v.count ?? 0) < 2)).toBe(true)
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

describe('H4_STRUCTURAL_NOTE and SOFT_GOAL_DEFINITIONS', () => {
  it('has documented structural note for H4', () => {
    expect(H4_STRUCTURAL_NOTE).toContain('H4 (one shift per person per day) is structural')
  })

  it('defines soft goals S1 through S5 with correct direction and non-empty summary', () => {
    expect(SOFT_GOAL_DEFINITIONS.S1).toEqual({
      id: 'S1',
      direction: 'minimize',
      summary: 'Spread of night-shift counts across active people',
    })
    expect(SOFT_GOAL_DEFINITIONS.S2).toEqual({
      id: 'S2',
      direction: 'maximize',
      summary:
        'Preference match honoring wants and avoids, resolving via team defaults when useTeamPreference is true',
    })
    expect(SOFT_GOAL_DEFINITIONS.S3).toEqual({
      id: 'S3',
      direction: 'minimize',
      summary: 'Cell changes versus previous schedule',
    })
    expect(SOFT_GOAL_DEFINITIONS.S4).toEqual({
      id: 'S4',
      direction: 'minimize',
      summary: 'Spread of weekend-shift counts across active people',
    })
    expect(SOFT_GOAL_DEFINITIONS.S5).toEqual({
      id: 'S5',
      direction: 'minimize',
      summary: 'Penalized shift-to-shift transitions across consecutive days',
    })
  })
})
