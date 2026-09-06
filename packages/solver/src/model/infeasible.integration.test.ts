import { beforeAll, describe, expect, it } from 'vitest'
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
import { toHighsSolve } from '../highs/worker'
import type { HighsSolve } from '../highs/worker'
import { buildModel } from './model'
import type { ModelInput } from './model'
import { buildProposal } from './proposal'
import { deriveConflictCore } from './infeasible'

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

describe('HiGHS Infeasible diagnostics and relaxation integration tests (real WASM)', () => {
  it('Fixture 1: over-tight coverage (min > headcount) -> Infeasible -> H1 core -> apply relaxation -> Feasible & 0 violations', () => {
    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
    ]
    const period = { start: '2026-08-17', end: '2026-08-17' } // 1 day (Monday)
    // EARLY needs min 2, but only 1 person exists
    const coverage: CoverageTable = {
      byDow: {
        1: { EARLY: { min: 2, max: 2 } },
      },
      dateOverrides: {},
    }

    const input = makeModelInput({ people, coverage, period })

    // 1. Model is genuinely infeasible in HiGHS
    const { lp } = buildModel(input)
    const initialResult = highs.solve(lp)
    expect(initialResult.Status).toBe('Infeasible')

    // 2. deriveConflictCore names the true culprit
    const { conflictCore, relaxations } = deriveConflictCore(input)
    expect(conflictCore.length).toBeGreaterThan(0)
    const firstCore = conflictCore[0]
    expect(firstCore).toBeDefined()
    if (firstCore !== undefined) {
      expect(firstCore.ruleIds).toEqual(['H1'])
      expect(firstCore.message).toContain('EARLY')
      expect(firstCore.message).toContain('2 people')
      expect(firstCore.message).toContain('1 person')
    }

    // 3. Apply the FIRST offered relaxation
    expect(relaxations.length).toBeGreaterThan(0)
    const firstRelaxation = relaxations[0]
    expect(firstRelaxation).toBeDefined()
    if (firstRelaxation === undefined) return

    const relaxedInput = firstRelaxation.apply(input)

    // 4. Rebuild & re-solve -> must be Optimal
    const { lp: relaxedLp, meta: relaxedMeta } = buildModel(relaxedInput)
    const relaxedResult = highs.solve(relaxedLp)
    expect(relaxedResult.Status).toBe('Optimal')

    // 5. buildProposal + domain checkSchedule -> zero H1/H2/H3/H5 violations
    const proposal = buildProposal(
      relaxedInput,
      relaxedResult.Columns ?? {},
      relaxedMeta,
    )
    const violations = checkSchedule({
      people: relaxedInput.people,
      shifts: relaxedInput.shifts,
      coverage: relaxedInput.coverage,
      settings: relaxedInput.settings,
      period: relaxedInput.period,
      schedule: proposal.schedule,
    })
    const hardViolations = violations.filter((v) =>
      ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
    )
    expect(hardViolations).toHaveLength(0)
  })

  it('Fixture 2: H5-starved date (everyone recurringOff Monday + Monday min>0) -> Infeasible -> H1+H5 core -> apply relaxation -> Feasible & 0 violations', () => {
    // Both Alice and Bob have recurringOff on Mondays (dow 1)
    const people = [
      makePerson({ id: 'p1', name: 'Alice', recurringOff: [1] }),
      makePerson({ id: 'p2', name: 'Bob', recurringOff: [1] }),
    ]
    const period = { start: '2026-08-17', end: '2026-08-17' } // Monday
    const coverage: CoverageTable = {
      byDow: {
        1: { EARLY: { min: 1, max: 1 } },
      },
      dateOverrides: {},
    }

    const input = makeModelInput({ people, coverage, period })

    // 1. Model is genuinely infeasible in HiGHS
    const { lp } = buildModel(input)
    const initialResult = highs.solve(lp)
    expect(initialResult.Status).toBe('Infeasible')

    // 2. deriveConflictCore names the true culprit: H1 and H5
    const { conflictCore, relaxations } = deriveConflictCore(input)
    expect(conflictCore.length).toBeGreaterThan(0)
    const firstCore = conflictCore[0]
    expect(firstCore).toBeDefined()
    if (firstCore !== undefined) {
      expect(firstCore.ruleIds).toContain('H1')
      expect(firstCore.ruleIds).toContain('H5')
      expect(firstCore.message).toContain('EARLY')
      expect(firstCore.message).toContain('Mondays')
      expect(firstCore.message).toContain('1 person')
      expect(firstCore.message).toContain('0 people')
    }

    // 3. Apply the FIRST offered relaxation
    expect(relaxations.length).toBeGreaterThan(0)
    const firstRelaxation = relaxations[0]
    expect(firstRelaxation).toBeDefined()
    if (firstRelaxation === undefined) return

    const relaxedInput = firstRelaxation.apply(input)

    // 4. Rebuild & re-solve -> must be Optimal
    const { lp: relaxedLp, meta: relaxedMeta } = buildModel(relaxedInput)
    const relaxedResult = highs.solve(relaxedLp)
    expect(relaxedResult.Status).toBe('Optimal')

    // 5. buildProposal + domain checkSchedule -> zero H1/H2/H3/H5 violations
    const proposal = buildProposal(
      relaxedInput,
      relaxedResult.Columns ?? {},
      relaxedMeta,
    )
    const violations = checkSchedule({
      people: relaxedInput.people,
      shifts: relaxedInput.shifts,
      coverage: relaxedInput.coverage,
      settings: relaxedInput.settings,
      period: relaxedInput.period,
      schedule: proposal.schedule,
    })
    const hardViolations = violations.filter((v) =>
      ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
    )
    expect(hardViolations).toHaveLength(0)
  })

  it('Fixture 3: weekly-hours starvation (H2 cap makes demanded hours impossible) -> Infeasible -> H1+H2 core -> apply relaxation -> Feasible & 0 violations', () => {
    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
    ]
    // 3 days in week 0: Mon, Tue, Wed. Each requires 8h EARLY shift.
    // Total demanded hours = 24h. Cap = 16h per week.
    const period = { start: '2026-08-17', end: '2026-08-19' }
    const coverage: CoverageTable = {
      byDow: {
        1: { EARLY: { min: 1, max: 1 } },
        2: { EARLY: { min: 1, max: 1 } },
        3: { EARLY: { min: 1, max: 1 } },
      },
      dateOverrides: {},
    }
    const settings: SolveSettings = {
      ...DEFAULT_SOLVE_SETTINGS,
      hardRules: {
        ...DEFAULT_SOLVE_SETTINGS.hardRules,
        maxHoursPerWeek: 16,
      },
    }

    const input = makeModelInput({ people, coverage, period, settings })

    // 1. Model is genuinely infeasible in HiGHS
    const { lp } = buildModel(input)
    const initialResult = highs.solve(lp)
    expect(initialResult.Status).toBe('Infeasible')

    // 2. deriveConflictCore names the true culprit: H1 and H2
    const { conflictCore, relaxations } = deriveConflictCore(input)
    expect(conflictCore.length).toBeGreaterThan(0)
    const firstCore = conflictCore[0]
    expect(firstCore).toBeDefined()
    if (firstCore !== undefined) {
      expect(firstCore.ruleIds).toContain('H1')
      expect(firstCore.ruleIds).toContain('H2')
      expect(firstCore.message).toContain('24 hours')
      expect(firstCore.message).toContain('16 hours')
    }

    // 3. Apply the FIRST offered relaxation
    expect(relaxations.length).toBeGreaterThan(0)
    const firstRelaxation = relaxations[0]
    expect(firstRelaxation).toBeDefined()
    if (firstRelaxation === undefined) return

    const relaxedInput = firstRelaxation.apply(input)

    // 4. Rebuild & re-solve -> must be Optimal
    const { lp: relaxedLp, meta: relaxedMeta } = buildModel(relaxedInput)
    const relaxedResult = highs.solve(relaxedLp)
    expect(relaxedResult.Status).toBe('Optimal')

    // 5. buildProposal + domain checkSchedule -> zero H1/H2/H3/H5 violations
    const proposal = buildProposal(
      relaxedInput,
      relaxedResult.Columns ?? {},
      relaxedMeta,
    )
    const violations = checkSchedule({
      people: relaxedInput.people,
      shifts: relaxedInput.shifts,
      coverage: relaxedInput.coverage,
      settings: relaxedInput.settings,
      period: relaxedInput.period,
      schedule: proposal.schedule,
    })
    const hardViolations = violations.filter((v) =>
      ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
    )
    expect(hardViolations).toHaveLength(0)
  })
})
