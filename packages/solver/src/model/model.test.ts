import { describe, expect, it } from 'vitest'
import type {
  CoverageTable,
  ISODate,
  Person,
  Schedule,
  ShiftDef,
  SolveSettings,
} from '@crewdoku/domain'
import {
  assignmentKey,
  DEFAULT_SOLVE_SETTINGS,
  emptySchedule,
  makePerson,
  OFF_ASSIGNMENT,
} from '@crewdoku/domain'
import { buildModel } from './model'
import { mapSolution } from './mapSolution'

const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400', isNight: false },
  { code: 'LATE', label: 'Late', start: '1400', end: '2200', isNight: false },
  { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true },
]

function makeCoverage(min = 1, max = 2): CoverageTable {
  const row = {
    EARLY: { min, max },
    LATE: { min: 0, max: 2 },
    NIGHT: { min: 0, max: 1 },
  }
  return {
    byDow: {
      0: row,
      1: row,
      2: row,
      3: row,
      4: row,
      5: row,
      6: row,
    },
    dateOverrides: {},
  }
}

function basicInput(overrides?: {
  people?: Person[]
  shifts?: ShiftDef[]
  coverage?: CoverageTable
  settings?: SolveSettings
  current?: Schedule
  start?: ISODate
  end?: ISODate
}) {
  const people = overrides?.people ?? [
    makePerson({ id: 'p1', name: 'Alice' }),
    makePerson({ id: 'p2', name: 'Bob' }),
  ]
  const shifts = overrides?.shifts ?? SHIFTS
  const coverage = overrides?.coverage ?? makeCoverage()
  const settings = overrides?.settings ?? DEFAULT_SOLVE_SETTINGS
  const start = overrides?.start ?? '2026-08-17'
  const end = overrides?.end ?? '2026-08-23'
  const current = overrides?.current ?? emptySchedule(people, start, end)

  return {
    people,
    shifts,
    coverage,
    settings,
    period: { start, end },
    current,
  }
}

describe('buildModel unit tests', () => {
  it('is byte-identical for identical input (determinism)', () => {
    const input1 = basicInput()
    const input2 = basicInput()

    const res1 = buildModel(input1)
    const res2 = buildModel(input2)

    expect(res1.lp).toBe(res2.lp)
    expect(res1.meta.varNames).toEqual(res2.meta.varNames)
    expect(res1.meta.rowCount).toBe(res2.meta.rowCount)
  })

  it('omits variables for ineligible person-shift pairs (Decision 1)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Alice', ineligible: ['NIGHT'] })
    const p2 = makePerson({ id: 'p2', name: 'Bob', ineligible: [] })
    const input = basicInput({ people: [p1, p2] })

    const { meta } = buildModel(input)

    const p1NightVars = meta.varNames.filter((v) => v.startsWith('x_0_') && v.endsWith('_NIGHT'))
    const p2NightVars = meta.varNames.filter((v) => v.startsWith('x_1_') && v.endsWith('_NIGHT'))

    expect(p1NightVars).toHaveLength(0)
    expect(p2NightVars.length).toBeGreaterThan(0)
  })

  it('emits zero matching rows when rules are disabled', () => {
    const settings: SolveSettings = {
      hardRules: {
        enabled: { H1: false, H2: false, H3: false, H5: false },
        maxHoursPerWeek: 40,
        minRestHours: 11,
      },
      softGoalOrder: ['S1', 'S2', 'S3', 'S4', 'S5'],
      softGoalEnabled: {
        S1: false,
        S2: false,
        S3: false,
        S4: false,
        S5: false,
      },
    }

    const input = basicInput({ settings })
    const { lp } = buildModel(input)

    expect(lp).not.toMatch(/\bh1_/)
    expect(lp).not.toMatch(/\bh1cap_/)
    expect(lp).not.toMatch(/\bh2_/)
    expect(lp).not.toMatch(/\bh3_/)
    expect(lp).not.toMatch(/\bh5_/)
    expect(lp).not.toMatch(/\bs1_/)
    expect(lp).not.toMatch(/\bs4_/)
    expect(lp).not.toMatch(/\bs5_/)
    expect(lp).not.toMatch(/\bnmax\b/)
    expect(lp).not.toMatch(/\bwmax\b/)
  })

  it('adjusts H1 RHS by pinned constants and clamps at 0 (Decision 2)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Alice' })
    const p2 = makePerson({ id: 'p2', name: 'Bob' })
    const start = '2026-08-17'
    const end = '2026-08-17' // 1 day
    const current = emptySchedule([p1, p2], start, end)

    // Pin Alice to EARLY
    current.set(assignmentKey(p1.id, start), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })

    // Min 1, Max 2
    const input = basicInput({
      people: [p1, p2],
      start,
      end,
      current,
      coverage: makeCoverage(1, 2),
    })

    const { lp } = buildModel(input)

    // With 1 pinned EARLY:
    // effMin = max(0, 1 - 1) = 0
    // effMax = max(0, 2 - 1) = 1
    const h1MinRow = lp.split('\n').find((l) => l.includes('h1_EARLY_0:'))
    const h1MaxRow = lp.split('\n').find((l) => l.includes('h1cap_EARLY_0:'))

    expect(h1MinRow).toBeDefined()
    expect(h1MinRow).toMatch(/>= 0$/)
    expect(h1MaxRow).toBeDefined()
    expect(h1MaxRow).toMatch(/<= 1$/)

    // If pins alone exceed max (e.g. 2 pinned when max was 1), clamped at 0
    const current2 = emptySchedule([p1, p2], start, end)
    current2.set(assignmentKey(p1.id, start), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })
    current2.set(assignmentKey(p2.id, start), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })

    const input2 = basicInput({
      people: [p1, p2],
      start,
      end,
      current: current2,
      coverage: makeCoverage(1, 1),
    })

    const { lp: lp2 } = buildModel(input2)
    const h1MaxRow2 = lp2.split('\n').find((l) => l.includes('h1cap_EARLY_0:'))
    expect(h1MaxRow2).toMatch(/<= 0$/)
  })

  it('reduces H2 RHS by pinned hours and clamps at 0 (Decision 2)', () => {
    const p1 = makePerson({ id: 'p1', name: 'Alice' })
    const start = '2026-08-17'
    const end = '2026-08-23'
    const current = emptySchedule([p1], start, end)

    // Pin Alice to 3x 8h shifts = 24h
    current.set(assignmentKey(p1.id, '2026-08-17'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })
    current.set(assignmentKey(p1.id, '2026-08-18'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })
    current.set(assignmentKey(p1.id, '2026-08-19'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })

    const settings: SolveSettings = {
      ...DEFAULT_SOLVE_SETTINGS,
      hardRules: {
        ...DEFAULT_SOLVE_SETTINGS.hardRules,
        maxHoursPerWeek: 40,
      },
    }

    const input = basicInput({
      people: [p1],
      start,
      end,
      current,
      settings,
    })

    const { lp } = buildModel(input)
    // 40 - 24 = 16h remaining
    const h2Row = lp.split('\n').find((l) => l.includes('h2_0_0:'))
    expect(h2Row).toBeDefined()
    expect(h2Row).toMatch(/<= 16$/)

    // Now pin 6x 8h shifts = 48h (> 40h cap) -> clamped at 0
    for (let d = 20; d <= 22; d++) {
      current.set(assignmentKey(p1.id, `2026-08-${d}`), {
        code: 'EARLY',
        start: '0600',
        end: '1400',
        pinned: true,
        ineligible: false,
      })
    }

    const { lp: lpOver } = buildModel(input)
    const h2RowOver = lpOver.split('\n').find((l) => l.includes('h2_0_0:'))
    expect(h2RowOver).toBeDefined()
    expect(h2RowOver).toMatch(/<= 0$/)
  })

  it('accounts for unpaidBreakMinutes via paidHours in H2 constraints and pinned hours', () => {
    const p1 = makePerson({ id: 'p1', name: 'Alice' })
    const start = '2026-08-17'
    const end = '2026-08-23'
    const current = emptySchedule([p1], start, end)

    // Shift with 8h clock span (0600-1400) and 30min unpaid break -> 7.5 paid hours
    const shiftsWithBreak: ShiftDef[] = [
      { code: 'EARLY', label: 'Early', start: '0600', end: '1400', isNight: false, unpaidBreakMinutes: 30 },
    ]

    // Pin 2 days of EARLY (2 * 7.5 = 15h)
    current.set(assignmentKey(p1.id, '2026-08-17'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })
    current.set(assignmentKey(p1.id, '2026-08-18'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })

    const settings: SolveSettings = {
      ...DEFAULT_SOLVE_SETTINGS,
      hardRules: {
        ...DEFAULT_SOLVE_SETTINGS.hardRules,
        maxHoursPerWeek: 40,
      },
    }

    const input = basicInput({
      people: [p1],
      shifts: shiftsWithBreak,
      start,
      end,
      current,
      settings,
    })

    const { lp } = buildModel(input)
    // Pinned = 15h, Remaining RHS = 40 - 15 = 25h
    const h2Row = lp.split('\n').find((l) => l.includes('h2_0_0:'))
    expect(h2Row).toBeDefined()
    expect(h2Row).toMatch(/<= 25$/)
    // Coefficient for unpinned variables should be 7.5 (not 8)
    expect(h2Row).toContain('+ 7.5 x_0_')
  })

  it('drops H3 row when both consecutive days are pinned, constrains free side when one is pinned (Decision 2)', () => {
    // NIGHT (2200-0600) -> EARLY (0600-1400) has 0h rest (< 11h min rest)
    const p1 = makePerson({ id: 'p1', name: 'Alice' })
    const start = '2026-08-17'
    const end = '2026-08-18'
    const current = emptySchedule([p1], start, end)

    // Pin NIGHT on day 1 and EARLY on day 2
    current.set(assignmentKey(p1.id, '2026-08-17'), {
      code: 'NIGHT',
      start: '2200',
      end: '0600',
      pinned: true,
      ineligible: false,
    })
    current.set(assignmentKey(p1.id, '2026-08-18'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })

    const input = basicInput({ people: [p1], start, end, current })
    const { lp } = buildModel(input)

    // Both pinned -> H3 row between them is dropped
    const h3BothPinned = lp.split('\n').filter((l) => l.includes('h3_0_0_1_NIGHT_EARLY:'))
    expect(h3BothPinned).toHaveLength(0)

    // Now unpin day 2: day 1 is pinned NIGHT, day 2 is free.
    // Incompatible pair: NIGHT -> EARLY.
    // Free side EARLY on day 2 must be forced to 0!
    current.set(assignmentKey(p1.id, '2026-08-18'), OFF_ASSIGNMENT)
    const { lp: lpOnePinned } = buildModel(input)
    const h3OnePinned = lpOnePinned.split('\n').find((l) => l.includes('h3_0_0_1_NIGHT_EARLY:'))
    expect(h3OnePinned).toBeDefined()
    expect(h3OnePinned).toContain('x_0_1_EARLY = 0')
  })

  it('drops H5 row when a cell on a timeOff date is pinned (pin wins, Decision 2)', () => {
    const p1 = makePerson({
      id: 'p1',
      name: 'Alice',
      timeOff: ['2026-08-17'],
    })
    const start = '2026-08-17'
    const end = '2026-08-18'
    const current = emptySchedule([p1], start, end)

    // Without pin: day 0 has h5_off_0_0: ... = 0
    const inputUnpinned = basicInput({ people: [p1], start, end, current })
    const { lp: lpUnpinned } = buildModel(inputUnpinned)
    expect(lpUnpinned).toContain('h5_off_0_0:')

    // With pin on day 0: pin wins, H5 row dropped for that cell
    current.set(assignmentKey(p1.id, '2026-08-17'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })

    const inputPinned = basicInput({ people: [p1], start, end, current })
    const { lp: lpPinned } = buildModel(inputPinned)
    expect(lpPinned).not.toContain('h5_off_0_0:')
  })

  it('mapSolution produces sparse schedule ignoring aux vars and unselected columns', () => {
    const input = basicInput()
    const { meta } = buildModel(input)

    const columns = {
      x_0_0_EARLY: { Primal: 1.0 },
      x_1_1_LATE: { Primal: 0.99 },
      x_0_1_EARLY: { Primal: 0.2 }, // <= 0.5, ignored
      nmax: { Primal: 3 }, // aux var, ignored
      wmax: { Primal: 2 }, // aux var, ignored
    }

    const decoded = mapSolution(columns, meta)

    expect(decoded.size).toBe(2)
    const a1 = decoded.get(assignmentKey('p1', '2026-08-17'))
    expect(a1).toEqual({
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: false,
      ineligible: false,
    })

    const a2 = decoded.get(assignmentKey('p2', '2026-08-18'))
    expect(a2).toEqual({
      code: 'LATE',
      start: '1400',
      end: '2200',
      pinned: false,
      ineligible: false,
    })
  })
})
