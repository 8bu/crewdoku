import { describe, expect, it } from 'vitest'
import highsLoader from 'highs'
import type {
  CoverageTable,
  ISODate,
  Person,
  ShiftDef,
  SolveSettings,
} from '@crewdoku/domain'
import {
  checkSchedule,
  DEFAULT_SOLVE_SETTINGS,
  emptySchedule,
  makePerson,
} from '@crewdoku/domain'
import { toHighsSolve } from './highs/worker'
import type { ModelInput } from './model/model'
import type { LpSolveResult, SolveOutcome } from './port'
import { runSolve } from './port'

const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400', isNight: false },
  { code: 'LATE', label: 'Late', start: '1400', end: '2200', isNight: false },
  { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true },
]

function makeModelInput(params: {
  people: Person[]
  coverage: CoverageTable
  period: { start: ISODate; end: ISODate }
  settings?: SolveSettings
}): ModelInput {
  const settings = params.settings ?? DEFAULT_SOLVE_SETTINGS
  const current = emptySchedule(params.people, params.period.start, params.period.end)
  return {
    people: params.people,
    shifts: SHIFTS,
    coverage: params.coverage,
    settings,
    period: params.period,
    current,
  }
}

describe('runSolve port unit tests', () => {
  it('returns SolvedProposal with complete matrix when solveLp returns Optimal', async () => {
    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
      makePerson({ id: 'p2', name: 'Bob' }),
    ]
    const period = { start: '2026-08-17', end: '2026-08-18' }
    const coverage: CoverageTable = {
      byDow: {
        1: { EARLY: { min: 1, max: 1 } },
        2: { EARLY: { min: 1, max: 1 } },
      },
      dateOverrides: {},
    }
    const input = makeModelInput({ people, coverage, period })

    const fakeSolveLp = async (_lp: string): Promise<LpSolveResult> => ({
      Status: 'Optimal',
      ObjectiveValue: 10,
      Columns: {
        // Real var scheme: x_{empI}_{dateI}_{shiftToken} with dense indices.
        x_0_0_EARLY: { Primal: 1 },
        x_1_1_EARLY: { Primal: 1 },
      },
    })

    const outcome: SolveOutcome = await runSolve(input, fakeSolveLp)

    expect(outcome.status).toBe('solved')
    if (outcome.status !== 'solved') return

    // Verify complete matrix: every person x date is present
    expect(outcome.schedule.size).toBe(4) // 2 people x 2 dates
    expect(outcome.schedule.get('p1|2026-08-17')?.code).toBe('EARLY')
    expect(outcome.schedule.get('p1|2026-08-18')?.code).toBe('OFF')
    expect(outcome.schedule.get('p2|2026-08-17')?.code).toBe('OFF')
    expect(outcome.schedule.get('p2|2026-08-18')?.code).toBe('EARLY')
  })

  it('returns conflictCore and relaxations targeting H1 when solveLp returns Infeasible on starved fixture', async () => {
    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
      makePerson({ id: 'p2', name: 'Bob' }),
    ]
    const period = { start: '2026-08-17', end: '2026-08-17' }
    // Needs 3 people on Mon 2026-08-17, but only 2 exist -> H1 starvation
    const coverage: CoverageTable = {
      byDow: {
        1: { EARLY: { min: 1, max: 2 } },
      },
      dateOverrides: {
        '2026-08-17': { EARLY: { min: 3, max: 3 } },
      },
    }
    const input = makeModelInput({ people, coverage, period })

    const fakeSolveLp = async (_lp: string): Promise<LpSolveResult> => ({
      Status: 'Infeasible',
    })

    const outcome = await runSolve(input, fakeSolveLp)

    expect(outcome.status).toBe('infeasible')
    if (outcome.status !== 'infeasible') return

    expect(outcome.conflictCore.length).toBeGreaterThan(0)
    const h1Conflict = outcome.conflictCore.find((c) => c.ruleIds.includes('H1'))
    expect(h1Conflict).toBeDefined()

    expect(outcome.relaxations.length).toBeGreaterThan(0)
    const relaxation = outcome.relaxations[0]
    expect(relaxation).toBeDefined()
    if (relaxation !== undefined) {
      const relaxedInput = relaxation.apply(input)
      expect(relaxedInput.coverage.dateOverrides['2026-08-17']?.EARLY?.min).toBe(2)
    }
  })

  it('rejects with plain Error naming status when solveLp returns non-Optimal/non-Infeasible status', async () => {
    const people = [makePerson({ id: 'p1', name: 'Alice' })]
    const period = { start: '2026-08-17', end: '2026-08-17' }
    const coverage: CoverageTable = {
      byDow: { 1: { EARLY: { min: 1, max: 1 } } },
      dateOverrides: {},
    }
    const input = makeModelInput({ people, coverage, period })

    const fakeSolveLp = async (_lp: string): Promise<LpSolveResult> => ({
      Status: 'Load error',
    })

    await expect(runSolve(input, fakeSolveLp)).rejects.toThrow(
      'Solver returned unexpected status: Load error',
    )
  })

  it('solves a tiny feasible fixture via real WASM HiGHS producing checker-clean schedule', async () => {
    const rawHighs = await highsLoader()
    const highs = toHighsSolve(rawHighs)

    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
      makePerson({ id: 'p2', name: 'Bob' }),
    ]
    const period = { start: '2026-08-17', end: '2026-08-18' }
    const coverage: CoverageTable = {
      byDow: {
        1: { EARLY: { min: 1, max: 1 } },
        2: { EARLY: { min: 1, max: 1 } },
      },
      dateOverrides: {},
    }
    const input = makeModelInput({ people, coverage, period })

    const outcome = await runSolve(input, (lp) => highs.solve(lp))

    expect(outcome.status).toBe('solved')
    if (outcome.status !== 'solved') return

    const violations = checkSchedule({
      people: input.people,
      shifts: input.shifts,
      coverage: input.coverage,
      settings: input.settings,
      period: input.period,
      schedule: outcome.schedule,
    })
    const hardViolations = violations.filter((v) =>
      ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
    )
    expect(hardViolations).toHaveLength(0)
  })
})
