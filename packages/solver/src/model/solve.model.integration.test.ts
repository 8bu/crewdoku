import { beforeAll, describe, expect, it } from 'vitest'
import highsLoader from 'highs'
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
  checkSchedule,
  DEFAULT_SOLVE_SETTINGS,
  emptySchedule,
  makePerson,
  makeTag,
  makeTagRule,
} from '@crewdoku/domain'
import { toHighsSolve } from '../highs/worker'
import type { HighsSolve } from '../highs/worker'
import { buildModel } from './model'
import { mapSolution } from './mapSolution'
import { runSolve } from '../port'

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

/** Coverage asking for NIGHT headcount every day and nothing else. */
function nightCoverage(min = 1, max = 1): CoverageTable {
  const row = { NIGHT: { min, max } }
  return {
    byDow: { 0: row, 1: row, 2: row, 3: row, 4: row, 5: row, 6: row },
    dateOverrides: {},
  }
}

function overlaySolution(
  people: readonly Person[],
  period: { start: ISODate; end: ISODate },
  current: Schedule,
  decoded: Schedule,
): Schedule {
  const finalSchedule = emptySchedule(people, period.start, period.end)

  // 1. Overlay pinned assignments from current
  for (const person of people) {
    for (const [key, a] of current) {
      if (a.pinned && key.startsWith(`${person.id}|`)) {
        finalSchedule.set(key, { ...a })
      }
    }
  }

  // 2. Overlay solver-proposed assignments
  for (const [key, a] of decoded) {
    finalSchedule.set(key, { ...a })
  }

  return finalSchedule
}

describe('HiGHS MILP model integration tests (real WASM)', () => {
  it('1. Feasible fixture: solves to optimality and passes domain checkSchedule with zero H1/H2/H3/H5 violations', () => {
    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
      makePerson({ id: 'p2', name: 'Bob' }),
      makePerson({ id: 'p3', name: 'Charlie' }),
    ]
    const period = { start: '2026-08-17', end: '2026-08-19' } // 3 days
    const current = emptySchedule(people, period.start, period.end)
    const coverage = makeCoverage(1, 1, 1, 1)

    const { lp, meta } = buildModel({
      people,
      shifts: SHIFTS,
      coverage,
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      current,
    })

    const result = highs.solve(lp)
    expect(result.Status).toBe('Optimal')

    const decoded = mapSolution(result.Columns ?? {}, meta)
    expect(decoded.size).toBeGreaterThan(0)

    const finalSchedule = overlaySolution(people, period, current, decoded)
    const violations = checkSchedule({
      people,
      shifts: SHIFTS,
      coverage,
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      schedule: finalSchedule,
    })

    const hardViolations = violations.filter((v) =>
      ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
    )
    expect(hardViolations).toHaveLength(0)
  })

  it('2. Pin fixture: model solves despite H3-violating neighbor pins, solver output never contradicts pins, checker flags the violation', () => {
    const people = [
      makePerson({ id: 'p1', name: 'Alice' }),
      makePerson({ id: 'p2', name: 'Bob' }),
    ]
    const period = { start: '2026-08-17', end: '2026-08-18' } // 2 days
    const current = emptySchedule(people, period.start, period.end)

    // Pin Alice to NIGHT on day 1 (ends 0600 next day) and EARLY on day 2 (starts 0600) -> 0h rest (< 11h)
    current.set(assignmentKey('p1', '2026-08-17'), {
      code: 'NIGHT',
      start: '2200',
      end: '0600',
      pinned: true,
      ineligible: false,
    })
    current.set(assignmentKey('p1', '2026-08-18'), {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    })

    // Coverage needs 1 EARLY per day
    const coverage: CoverageTable = {
      byDow: {
        0: { EARLY: { min: 1, max: 1 } },
        1: { EARLY: { min: 1, max: 1 } },
        2: { EARLY: { min: 1, max: 1 } },
        3: { EARLY: { min: 1, max: 1 } },
        4: { EARLY: { min: 1, max: 1 } },
        5: { EARLY: { min: 1, max: 1 } },
        6: { EARLY: { min: 1, max: 1 } },
      },
      dateOverrides: {},
    }

    const { lp, meta } = buildModel({
      people,
      shifts: SHIFTS,
      coverage,
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      current,
    })

    const result = highs.solve(lp)
    // Model still solves because H3 row between two pinned constants was dropped (Decision 2)
    expect(result.Status).toBe('Optimal')

    const decoded = mapSolution(result.Columns ?? {}, meta)

    // Solver output NEVER contradicts pins: decoded schedule has NO entry for Alice's pinned days
    expect(decoded.has(assignmentKey('p1', '2026-08-17'))).toBe(false)
    expect(decoded.has(assignmentKey('p1', '2026-08-18'))).toBe(false)

    // On day 2, Alice's pinned EARLY satisfied the 1 EARLY requirement, so Bob doesn't need to work EARLY
    // On day 1, Alice was NIGHT, so Bob was assigned EARLY by solver
    expect(decoded.get(assignmentKey('p2', '2026-08-17'))?.code).toBe('EARLY')

    // Overlay and check violations: the bad rest pair is detected by the domain checker
    const finalSchedule = overlaySolution(people, period, current, decoded)
    const violations = checkSchedule({
      people,
      shifts: SHIFTS,
      coverage,
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      schedule: finalSchedule,
    })

    const h3Violations = violations.filter(
      (v) => v.ruleId === 'H3' && v.personId === 'p1',
    )
    expect(h3Violations.length).toBeGreaterThan(0)
  })

  it('3. S-rank discrimination fixture: S1 (night fairness) vs S2 (preference match) trade off directly', () => {
    // 2 people: Alice wants NIGHT, Bob has no preference
    const alice = makePerson({
      id: 'p1',
      name: 'Alice',
      wants: ['NIGHT'],
      avoids: [],
      useTeamPreference: false,
    })
    const bob = makePerson({
      id: 'p2',
      name: 'Bob',
      wants: [],
      avoids: [],
      useTeamPreference: false,
    })
    const people = [alice, bob]
    const period = { start: '2026-08-17', end: '2026-08-18' } // 2 days
    const current = emptySchedule(people, period.start, period.end)

    // Coverage: exactly 1 NIGHT required each day (total 2 nights across the period)
    const coverage: CoverageTable = {
      byDow: {
        0: { NIGHT: { min: 1, max: 1 } },
        1: { NIGHT: { min: 1, max: 1 } },
        2: { NIGHT: { min: 1, max: 1 } },
        3: { NIGHT: { min: 1, max: 1 } },
        4: { NIGHT: { min: 1, max: 1 } },
        5: { NIGHT: { min: 1, max: 1 } },
        6: { NIGHT: { min: 1, max: 1 } },
      },
      dateOverrides: {},
    }

    // Solve 1: S1 ranked higher than S2 -> prioritize spreading nights evenly
    const settingsS1First: SolveSettings = {
      ...DEFAULT_SOLVE_SETTINGS,
      softGoalOrder: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    }

    const modelS1 = buildModel({
      people,
      shifts: SHIFTS,
      coverage,
      settings: settingsS1First,
      period,
      current,
    })

    const resS1 = highs.solve(modelS1.lp)
    expect(resS1.Status).toBe('Optimal')
    const decodedS1 = mapSolution(resS1.Columns ?? {}, modelS1.meta)

    // When S1 is first, nights must be SPREAD (Alice gets 1, Bob gets 1)
    let aliceNightsS1 = 0
    let bobNightsS1 = 0
    if (decodedS1.get(assignmentKey('p1', '2026-08-17'))?.code === 'NIGHT') aliceNightsS1++
    if (decodedS1.get(assignmentKey('p1', '2026-08-18'))?.code === 'NIGHT') aliceNightsS1++
    if (decodedS1.get(assignmentKey('p2', '2026-08-17'))?.code === 'NIGHT') bobNightsS1++
    if (decodedS1.get(assignmentKey('p2', '2026-08-18'))?.code === 'NIGHT') bobNightsS1++

    expect(aliceNightsS1).toBe(1)
    expect(bobNightsS1).toBe(1)

    // Solve 2: S2 ranked higher than S1 -> prioritize Alice's preference (wants NIGHT)
    const settingsS2First: SolveSettings = {
      ...DEFAULT_SOLVE_SETTINGS,
      softGoalOrder: ['S2', 'S1', 'S3', 'S4', 'S5', 'S6'],
    }

    const modelS2 = buildModel({
      people,
      shifts: SHIFTS,
      coverage,
      settings: settingsS2First,
      period,
      current,
    })

    const resS2 = highs.solve(modelS2.lp)
    expect(resS2.Status).toBe('Optimal')
    const decodedS2 = mapSolution(resS2.Columns ?? {}, modelS2.meta)

    // When S2 is first, nights are CONCENTRATED on Alice who wanted them (Alice gets 2, Bob gets 0)
    let aliceNightsS2 = 0
    let bobNightsS2 = 0
    if (decodedS2.get(assignmentKey('p1', '2026-08-17'))?.code === 'NIGHT') aliceNightsS2++
    if (decodedS2.get(assignmentKey('p1', '2026-08-18'))?.code === 'NIGHT') aliceNightsS2++
    if (decodedS2.get(assignmentKey('p2', '2026-08-17'))?.code === 'NIGHT') bobNightsS2++
    if (decodedS2.get(assignmentKey('p2', '2026-08-18'))?.code === 'NIGHT') bobNightsS2++

    expect(aliceNightsS2).toBe(2)
    expect(bobNightsS2).toBe(0)
  })

  it('4. S6 steers the solver: a tag want pulls its holder onto the wanted shift', () => {
    const tag = makeTag('Late risers')
    tag.rules.push(makeTagRule('want', 'LATE', { type: 'always' }))
    const alice = makePerson({
      id: 'p1',
      name: 'Alice',
      wants: [],
      avoids: [],
      useTeamPreference: false,
      tagIds: [tag.id],
    })
    const bob = makePerson({ id: 'p2', name: 'Bob', useTeamPreference: false })
    const people = [alice, bob]
    const period = { start: '2026-08-17', end: '2026-08-18' }
    const current = emptySchedule(people, period.start, period.end)

    // EARLY and LATE each need exactly 1 per day, so every day is a tie
    // (EARLY, LATE) or (LATE, EARLY) until S6 prices the tag want.
    const model = buildModel({
      people,
      shifts: SHIFTS,
      coverage: makeCoverage(1, 1, 1, 1),
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      current,
      tags: [tag],
    })
    const result = highs.solve(model.lp)
    expect(result.Status).toBe('Optimal')
    const decoded = mapSolution(result.Columns ?? {}, model.meta)

    for (const d of ['2026-08-17', '2026-08-18']) {
      expect(decoded.get(assignmentKey('p1', d))?.code).toBe('LATE')
      expect(decoded.get(assignmentKey('p2', d))?.code).toBe('EARLY')
    }
  })

  it('5. A tag avoid cancels its holder\'s own want, even with S2 ranked first (avoid wins)', () => {
    const bare = makeTag('Night owls')
    const avoided = makeTag('Night owls')
    avoided.rules.push(makeTagRule('avoid', 'NIGHT', { type: 'always' }))
    const period = { start: '2026-08-17', end: '2026-08-18' }

    const run = (tagId: string): Schedule => {
      const alice = makePerson({
        id: 'p1',
        name: 'Alice',
        wants: ['NIGHT'],
        avoids: [],
        useTeamPreference: false,
        tagIds: [tagId],
      })
      const bob = makePerson({ id: 'p2', name: 'Bob', useTeamPreference: false })
      const people = [alice, bob]
      const model = buildModel({
        people,
        shifts: SHIFTS,
        coverage: nightCoverage(),
        // S2 first: the personal want is worth 100000 a night if it applies.
        settings: { ...DEFAULT_SOLVE_SETTINGS, softGoalOrder: ['S2', 'S6', 'S1', 'S3', 'S4', 'S5'] },
        period,
        current: emptySchedule(people, period.start, period.end),
        tags: tagId === bare.id ? [bare] : [avoided],
      })
      const result = highs.solve(model.lp)
      expect(result.Status).toBe('Optimal')
      return mapSolution(result.Columns ?? {}, model.meta)
    }

    // Control: with a ruled-out tag the want stands and she takes both nights.
    const control = run(bare.id)
    expect(control.get(assignmentKey('p1', '2026-08-17'))?.code).toBe('NIGHT')
    expect(control.get(assignmentKey('p1', '2026-08-18'))?.code).toBe('NIGHT')

    // The tag avoid cancels that want and prices the cell, so Bob takes them.
    const avoidedRun = run(avoided.id)
    expect(avoidedRun.get(assignmentKey('p1', '2026-08-17'))?.code).not.toBe('NIGHT')
    expect(avoidedRun.get(assignmentKey('p1', '2026-08-18'))?.code).not.toBe('NIGHT')
    expect(avoidedRun.get(assignmentKey('p2', '2026-08-17'))?.code).toBe('NIGHT')
    expect(avoidedRun.get(assignmentKey('p2', '2026-08-18'))?.code).toBe('NIGHT')
  })

  it('6. Any avoid beats any want: a personal avoid cancels the tag want for the same shift', () => {
    const tag = makeTag('Night lovers')
    tag.rules.push(makeTagRule('want', 'NIGHT', { type: 'always' }))
    const alice = makePerson({
      id: 'p1',
      name: 'Alice',
      wants: [],
      avoids: ['NIGHT'],
      useTeamPreference: false,
      tagIds: [tag.id],
    })
    const bob = makePerson({ id: 'p2', name: 'Bob', useTeamPreference: false })
    const people = [alice, bob]
    const period = { start: '2026-08-17', end: '2026-08-18' }
    const current = emptySchedule(people, period.start, period.end)

    // S6 is ranked first: had the tag want stood, Alice would be the cheapest
    // pick by a wide margin. It must not: the avoid cancels it.
    const model = buildModel({
      people,
      shifts: SHIFTS,
      coverage: nightCoverage(),
      settings: { ...DEFAULT_SOLVE_SETTINGS, softGoalOrder: ['S6', 'S2', 'S1', 'S3', 'S4', 'S5'] },
      period,
      current,
      tags: [tag],
    })
    const result = highs.solve(model.lp)
    expect(result.Status).toBe('Optimal')
    const decoded = mapSolution(result.Columns ?? {}, model.meta)

    expect(decoded.get(assignmentKey('p1', '2026-08-17'))?.code).not.toBe('NIGHT')
    expect(decoded.get(assignmentKey('p1', '2026-08-18'))?.code).not.toBe('NIGHT')
    expect(decoded.get(assignmentKey('p2', '2026-08-17'))?.code).toBe('NIGHT')
    expect(decoded.get(assignmentKey('p2', '2026-08-18'))?.code).toBe('NIGHT')
  })

  it('7. H6 forbids a strictly avoided cell, and the softenTagAvoid relaxation recovers a schedule', async () => {
    const tag = makeTag('Night owls')
    tag.rules.push(makeTagRule('avoid', 'NIGHT', { type: 'always' }, true))
    // Alice holds the tag; Bob cannot work NIGHT at all. With H6 on, nobody can.
    const alice = makePerson({ id: 'p1', name: 'Alice', tagIds: [tag.id] })
    const bob = makePerson({ id: 'p2', name: 'Bob', ineligible: ['NIGHT'] })
    const people = [alice, bob]
    const period = { start: '2026-08-17', end: '2026-08-18' }
    const current = emptySchedule(people, period.start, period.end)
    const input = {
      people,
      shifts: SHIFTS,
      coverage: nightCoverage(),
      settings: DEFAULT_SOLVE_SETTINGS,
      period,
      current,
      tags: [tag],
    }

    const outcome = await runSolve(input, (lp) => highs.solve(lp))
    expect(outcome.status).toBe('infeasible')
    if (outcome.status !== 'infeasible') return

    const item = outcome.conflictCore.find((c) => c.kind === 'tagAvoid.starvation')
    expect(item).toBeDefined()
    expect(item?.params.tag).toBe('Night owls')

    const relax = outcome.relaxations.find((r) => r.kind === 'softenTagAvoid')
    expect(relax).toBeDefined()
    if (relax === undefined) return

    const relaxed = await runSolve(relax.apply(input), (lp) => highs.solve(lp))
    expect(relaxed.status).toBe('solved')
    if (relaxed.status !== 'solved') return
    expect(relaxed.schedule.get(assignmentKey('p1', '2026-08-17'))?.code).toBe('NIGHT')
    expect(relaxed.schedule.get(assignmentKey('p1', '2026-08-18'))?.code).toBe('NIGHT')
  })
})
