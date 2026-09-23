/**
 * Deterministic test fixtures for the harness end-to-end test.
 */
import type {
  CoverageRow,
  CoverageTable,
  ISODate,
  Period,
  Person,
  Schedule,
  ShiftDef,
  Team,
  Workspace,
} from '@crewdoku/domain'
import {
  addDays,
  assignmentKey,
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  eachDate,
  emptySchedule,
  makePeriod,
  makePerson,
  makeTeam,
} from '@crewdoku/domain'

export interface FixtureOptions {
  people: number
  days: number
  start?: ISODate
}

/**
 * Builds a deterministic workspace fixture without any Math.random.
 *
 * Sizing & Feasibility Formula:
 * - Headcount N, shifts S = DEFAULT_SHIFTS.length (4: EARLY, MID, LATE, NIGHT).
 * - Safe min per shift per day: Math.max(1, Math.floor(opts.people / (DEFAULT_SHIFTS.length * 2))).
 *   For N = 12, S = 4: floor(12 / 8) = 1. Total min required across 4 shifts = 4. 12 people can easily cover 4.
 *   For N = 100, S = 4: floor(100 / 8) = 12. Total min required across 4 shifts = 48. 100 people can easily cover 48.
 * - Max per shift per day: opts.people.
 *
 * Deterministic sprinkles:
 * - 4 teams round-robin (index % 4).
 * - Time off: every 7th person (i % 7 === 0) has timeOff on day 3 (day index 2).
 * - Recurring off: every 11th person (i % 11 === 0) has recurringOff: [0] (Sunday).
 * - Ineligible: every 5th person (i % 5 === 0) has ineligible: ['NIGHT'].
 * - One pinned cell: person 0 has a pinned EARLY shift on day 1.
 * - One removed person: last person (index N - 1) has removed: true.
 */
export function buildFixtureWorkspace(opts: FixtureOptions): Workspace {
  const startDate: ISODate = opts.start ?? '2026-08-17'
  const endDate: ISODate = addDays(startDate, opts.days - 1)

  // 1. Teams (4 teams round-robin)
  const teams: Team[] = [
    makeTeam({ id: 'team-0', name: 'Team Alpha', wants: ['EARLY'], avoids: ['NIGHT'] }),
    makeTeam({ id: 'team-1', name: 'Team Beta', wants: ['MID'], avoids: ['EARLY'] }),
    makeTeam({ id: 'team-2', name: 'Team Gamma', wants: ['LATE'], avoids: ['MID'] }),
    makeTeam({ id: 'team-3', name: 'Team Delta', wants: ['NIGHT'], avoids: ['LATE'] }),
  ]

  // 2. People
  const people: Person[] = []
  const allDates = eachDate(startDate, endDate)
  const day3 = allDates.length >= 3 ? allDates[2] : allDates[0]

  for (let i = 0; i < opts.people; i++) {
    const isLast = i === opts.people - 1
    const team = teams[i % 4]
    const timeOff: ISODate[] = []
    if (i % 7 === 0 && day3 !== undefined) {
      timeOff.push(day3)
    }

    const recurringOff: number[] = []
    if (i % 11 === 0) {
      recurringOff.push(0) // Sunday
    }

    const ineligible: string[] = []
    if (i % 5 === 0) {
      ineligible.push('NIGHT')
    }

    const person = makePerson({
      id: `person-${i.toString().padStart(3, '0')}`,
      name: `Person ${i.toString().padStart(3, '0')}`,
      teamId: team !== undefined ? team.id : 'team-0',
      ineligible,
      timeOff: timeOff.length > 0 ? timeOff : undefined,
      recurringOff: recurringOff.length > 0 ? recurringOff : undefined,
      removed: isLast ? true : false,
      useTeamPreference: true,
    })
    people.push(person)
  }

  // 3. Shifts
  const shifts: ShiftDef[] = [...DEFAULT_SHIFTS]

  // 4. Coverage table
  const minSafe = Math.max(1, Math.floor(opts.people / (shifts.length * 2)))
  const maxSafe = opts.people

  const baseRow: CoverageRow = {}
  for (const shift of shifts) {
    baseRow[shift.code] = { min: minSafe, max: maxSafe }
  }

  const byDow: Record<number, CoverageRow> = {}
  for (let dow = 0; dow < 7; dow++) {
    byDow[dow] = { ...baseRow }
  }

  const coverage: CoverageTable = {
    byDow,
    dateOverrides: {},
  }

  // 5. Period
  const period: Period = makePeriod({
    id: 'period-fixture',
    label: `Fixture Period (${opts.days}d)`,
    start: startDate,
    end: endDate,
  })

  // 6. Schedule with one pinned cell for person-000 on day 1
  const schedules = new Map<string, Schedule>()
  const schedule = emptySchedule(people, startDate, endDate)

  const firstPerson = people[0]
  const earlyDef = shifts.find((s) => s.code === 'EARLY')
  if (firstPerson !== undefined && earlyDef !== undefined) {
    const cellKey = assignmentKey(firstPerson.id, startDate)
    schedule.set(cellKey, {
      code: earlyDef.code,
      start: earlyDef.start,
      end: earlyDef.end,
      pinned: true,
      ineligible: false,
    })
  }

  schedules.set(period.id, schedule)

  return {
    people,
    teams,
    shifts,
    coverage,
    settings: { ...DEFAULT_SOLVE_SETTINGS },
    periods: [period],
    schedules,
  }
}

/**
 * Creates an infeasible variant of the workspace by bumping one shift's minimum
 * requirement above total headcount on ONE weekday only (Monday, dow 1).
 *
 * Single-cause design:
 * HiGHS relaxations from deriveConflictCore operate per-violation (relaxing one
 * weekday's coverage band). By constraining only Monday, the FIRST relaxation
 * offered directly fixes the single infeasibility cause, provably restoring
 * feasibility and legality in a single step.
 */
export function tightenCoverage(w: Workspace): Workspace {
  const overHeadcount = w.people.length + 5
  const newByDow: Record<number, CoverageRow> = { ...w.coverage.byDow }

  // Bump Monday (dow = 1) EARLY shift min above headcount
  const mondayRow = newByDow[1] ?? {}
  const updatedMonday: CoverageRow = { ...mondayRow }
  const early = updatedMonday.EARLY ?? { min: 1, max: w.people.length }
  updatedMonday.EARLY = {
    min: overHeadcount,
    max: Math.max(overHeadcount, early.max),
  }
  newByDow[1] = updatedMonday

  return {
    ...w,
    coverage: {
      byDow: newByDow,
      dateOverrides: { ...w.coverage.dateOverrides },
    },
  }
}
