import { beforeAll, describe, expect, it } from 'vitest'
import highsLoader from 'highs'
import type {
  CoverageTable,
  ISODate,
  Person,
  ShiftDef,
} from '@crewdoku/domain'
import {
  assignmentKey,
  DEFAULT_SOLVE_SETTINGS,
  emptySchedule,
  getAssignment,
  makePerson,
  OFF_ASSIGNMENT,
  periodLengthDays,
} from '@crewdoku/domain'
import { toHighsSolve } from '../highs/worker'
import type { HighsSolve } from '../highs/worker'
import { buildModel } from './model'
import type { ModelInput } from './model'
import type { SolutionColumns } from './mapSolution'
import { buildProposal } from './proposal'

let highs: HighsSolve

beforeAll(async () => {
  const loaded = await highsLoader()
  highs = toHighsSolve(loaded)
})

const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400', isNight: false },
  { code: 'LATE', label: 'Late', start: '1400', end: '2200', isNight: false },
  { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true },
]

function makeCoverage(minEarly = 1, maxEarly = 1, minLate = 1, maxLate = 1): CoverageTable {
  const row = {
    EARLY: { min: minEarly, max: maxEarly },
    LATE: { min: minLate, max: maxLate },
    NIGHT: { min: 0, max: 1 },
  }
  return {
    byDow: { 0: row, 1: row, 2: row, 3: row, 4: row, 5: row, 6: row },
    dateOverrides: {},
  }
}

describe('buildProposal (fake columns)', () => {
  it('builds a complete matrix where unassigned cells === OFF_ASSIGNMENT and pinned cells are carried through verbatim', () => {
    const people: Person[] = [
      makePerson({ id: 'p1', name: 'Alice' }),
      makePerson({ id: 'p2', name: 'Bob' }),
    ]
    const period = {
      start: '2026-08-17' as ISODate,
      end: '2026-08-19' as ISODate,
    }
    const current = emptySchedule(people, period.start, period.end)

    // Set a pinned cell on p1 (normal)
    const pinnedNormal = {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    }
    current.set(assignmentKey('p1', '2026-08-17'), pinnedNormal)

    // Set a pinned cell on p2 that is flagged ineligible
    const pinnedIneligible = {
      code: 'SPECIAL',
      start: '1000',
      end: '1800',
      pinned: true,
      ineligible: true,
    }
    current.set(assignmentKey('p2', '2026-08-18'), pinnedIneligible)

    const input: ModelInput = {
      people,
      shifts: SHIFTS,
      coverage: makeCoverage(1, 1, 0, 0),
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      current,
    }

    // Real meta from the real builder — tokens for these plain-ASCII codes
    // are the codes themselves, so the fake column names below stay stable.
    const { meta } = buildModel(input)

    // Fake columns record: assign p1 on 2026-08-18 with LATE (emp 0, date 1)
    const columns: SolutionColumns = {
      x_0_1_LATE: { Primal: 1.0 },
    }

    const proposal = buildProposal(input, columns, meta)

    expect(proposal.status).toBe('solved')

    const days = periodLengthDays(period.start, period.end)
    const expectedSize = people.length * days
    expect(proposal.schedule.size).toBe(expectedSize)

    // Pinned cells carried through verbatim
    const cellP1Day1 = proposal.schedule.get(assignmentKey('p1', '2026-08-17'))
    expect(cellP1Day1).toBe(pinnedNormal)
    expect(cellP1Day1?.pinned).toBe(true)
    expect(cellP1Day1?.ineligible).toBe(false)

    const cellP2Day2 = proposal.schedule.get(assignmentKey('p2', '2026-08-18'))
    expect(cellP2Day2).toBe(pinnedIneligible)
    expect(cellP2Day2?.pinned).toBe(true)
    expect(cellP2Day2?.ineligible).toBe(true)

    // Solver-decoded cell
    const cellP1Day2 = proposal.schedule.get(assignmentKey('p1', '2026-08-18'))
    expect(cellP1Day2).toEqual({
      code: 'LATE',
      start: '1400',
      end: '2200',
      pinned: false,
      ineligible: false,
    })

    // Unassigned cells refer to OFF_ASSIGNMENT by reference
    const cellP1Day3 = proposal.schedule.get(assignmentKey('p1', '2026-08-19'))
    expect(cellP1Day3).toBe(OFF_ASSIGNMENT)

    const cellP2Day1 = proposal.schedule.get(assignmentKey('p2', '2026-08-17'))
    expect(cellP2Day1).toBe(OFF_ASSIGNMENT)

    const cellP2Day3 = proposal.schedule.get(assignmentKey('p2', '2026-08-19'))
    expect(cellP2Day3).toBe(OFF_ASSIGNMENT)
  })
})

describe('buildProposal (real WASM determinism)', () => {
  it('solves the SAME ModelInput twice end-to-end and produces deeply equal schedules cell-for-cell', () => {
    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
      makePerson({ id: 'p2', name: 'Bob' }),
      makePerson({ id: 'p3', name: 'Charlie' }),
    ]
    const period = { start: '2026-08-17' as ISODate, end: '2026-08-19' as ISODate }
    const current = emptySchedule(people, period.start, period.end)

    // Pin one assignment
    const pinnedAlice = {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    }
    current.set(assignmentKey('p1', '2026-08-17'), pinnedAlice)

    const coverage = makeCoverage(1, 1, 1, 1)

    const input: ModelInput = {
      people,
      shifts: SHIFTS,
      coverage,
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      current,
    }

    // Solve 1
    const { lp: lp1, meta: meta1 } = buildModel(input)
    const result1 = highs.solve(lp1)
    expect(result1.Status).toBe('Optimal')
    const proposal1 = buildProposal(input, result1.Columns ?? {}, meta1)

    // Solve 2
    const { lp: lp2, meta: meta2 } = buildModel(input)
    const result2 = highs.solve(lp2)
    expect(result2.Status).toBe('Optimal')
    const proposal2 = buildProposal(input, result2.Columns ?? {}, meta2)

    // Assert identical LP output
    expect(lp1).toBe(lp2)

    // Assert proposal completeness
    const days = periodLengthDays(period.start, period.end)
    expect(proposal1.schedule.size).toBe(people.length * days)
    expect(proposal2.schedule.size).toBe(people.length * days)

    // Assert deep cell-for-cell equality across all entries
    for (const person of people) {
      for (const iso of ['2026-08-17' as ISODate, '2026-08-18' as ISODate, '2026-08-19' as ISODate]) {
        const cell1 = getAssignment(proposal1.schedule, person.id, iso)
        const cell2 = getAssignment(proposal2.schedule, person.id, iso)
        expect(cell1).toEqual(cell2)
      }
    }

    // Pinned cell unaltered
    const aliceCell = proposal1.schedule.get(assignmentKey('p1', '2026-08-17'))
    expect(aliceCell).toBe(pinnedAlice)
  })
})
