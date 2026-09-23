// @vitest-environment node
/**
 * The one-click "See a sample schedule" workspace is the demo, so it has to
 * hold up twice over: it must look like a real bakehouse (four shifts with a
 * night bake, three teams, certifications, approved days off, repeating days
 * off, per-person preferences, dated coverage overrides) and it must actually
 * solve. This suite drives it through the same path the board uses —
 * `buildModelInput` -> the real HiGHS engine -> `checkSchedule` — for a period
 * starting on every weekday, then pins the showcase shape down on its own.
 *
 * Node environment: the sample's whole point is that it solves on any start
 * weekday, and the wasm `highs` build (the one the harness loads) needs node;
 * the app's jsdom default would not load it.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import highsLoader from 'highs'
import {
  activePeople,
  checkSchedule,
  coverageBandFor,
  eachDate,
  emptySchedule,
  OFF_CODE,
  splitAssignmentKey,
  UNASSIGNED_TEAM_ID,
  weekdayOf,
  type Person,
  type Schedule,
  type Violation,
} from '@crewdoku/domain'
import type { HighsSolve, ModelInput, SolveOutcome } from '@crewdoku/solver'
import { runSolve, toHighsSolve } from '@crewdoku/solver'
import { buildModelInput } from '../engine/modelInput'
import { buildSampleWorkspace, type SampleSeed } from './sampleWorkspace'

let highs: HighsSolve

beforeAll(async () => {
  highs = toHighsSolve(await highsLoader())
})

/** One period start per weekday: Monday 2026-10-05 through Sunday 2026-10-11. */
const START_DATES: string[] = eachDate('2026-10-05', '2026-10-11')

/**
 * A real HiGHS solve plus a `checkSchedule` sweep on a fortnight of demo data
 * runs in well under a second here, but the wasm engine is the wildcard on a
 * loaded CI runner — far past vitest's 5 s default.
 */
const SOLVE_TIMEOUT_MS = 60_000

const BAKE = 'BAKE'
const CLOSE = 'CLOSE'

/** The sample's one period, looked up by the seed's own id. */
function periodOf(seed: SampleSeed) {
  const period = seed.workspace.periods.find((candidate) => candidate.id === seed.periodId)
  if (period === undefined) {
    throw new Error('sample workspace has no period matching its periodId')
  }
  return period
}

/** The exact model input the board sends: active people, an empty board, the period's dates. */
function modelInputFor(seed: SampleSeed): ModelInput {
  const period = periodOf(seed)
  return buildModelInput({
    people: seed.workspace.people,
    teams: seed.workspace.teams,
    shifts: seed.workspace.shifts,
    coverage: seed.workspace.coverage,
    settings: seed.workspace.settings,
    dates: eachDate(period.start, period.end),
    current: emptySchedule(activePeople(seed.workspace.people), period.start, period.end),
  })
}

type PlacedCell = { person: Person; iso: string; code: string }

/** Every non-OFF cell of a proposal, paired with the person it belongs to. */
function placedCells(schedule: Schedule, people: readonly Person[]): PlacedCell[] {
  const byId = new Map(people.map((person) => [person.id, person]))
  const cells: PlacedCell[] = []
  for (const [key, assignment] of schedule) {
    if (assignment.code === OFF_CODE) continue
    const { personId, iso } = splitAssignmentKey(key)
    const person = byId.get(personId)
    if (person === undefined) {
      throw new Error(`proposal assigns a shift to a person outside the model: ${personId}`)
    }
    cells.push({ person, iso, code: assignment.code })
  }
  return cells
}

/** Readable failure output: which cells broke, not just how many. */
function describeCells(cells: readonly PlacedCell[]): string[] {
  return cells.map((cell) => `${cell.person.name} ${cell.iso} ${cell.code}`)
}

function describeViolations(violations: readonly Violation[]): string[] {
  return violations.map((violation) => `${violation.ruleId} ${violation.iso} ${violation.message}`)
}

/** Flattens an infeasible result's conflict core so a red run names its cause. */
function describeOutcome(outcome: SolveOutcome): string {
  if (outcome.status === 'solved') return 'solved'
  const core = outcome.conflictCore.map((item) => `${item.ruleIds.join('+')}: ${item.message}`)
  return `sample did not solve; conflict core: ${core.join(' | ')}`
}

describe.each(START_DATES)('sample fortnight starting %s', (start) => {
  it(
    'solves feasibly with every hard rule held and no capability ignored',
    async () => {
      const seed = buildSampleWorkspace(start)
      const input = modelInputFor(seed)
      const outcome = await runSolve(input, (lp) => highs.solve(lp))

      expect(outcome.status, describeOutcome(outcome)).toBe('solved')
      if (outcome.status !== 'solved') return
      const schedule = outcome.schedule

      const violations = checkSchedule({
        people: input.people,
        shifts: input.shifts,
        coverage: input.coverage,
        settings: input.settings,
        period: input.period,
        schedule,
      })
      expect(describeViolations(violations.filter((v) => v.ruleId !== 'eligibility'))).toEqual([])
      expect(describeViolations(violations.filter((v) => v.ruleId === 'eligibility'))).toEqual([])

      const cells = placedCells(schedule, input.people)

      // The board is staffed, not a legal-looking blank: every minimum the
      // coverage table asks for is filled. Read straight from the table, so
      // this holds even if H1 itself were switched off.
      const demandedShifts = eachDate(input.period.start, input.period.end).reduce(
        (total, iso) =>
          total +
          input.shifts.reduce(
            (sum, shift) => sum + coverageBandFor(input.coverage, shift.code, iso, weekdayOf(iso)).min,
            0,
          ),
        0,
      )
      expect(cells.length).toBeGreaterThanOrEqual(demandedShifts)

      // The night bake needs a certified baker: nobody else may touch it.
      const bake = cells.filter((cell) => cell.code === BAKE)
      expect(bake.length).toBeGreaterThan(0)
      expect(describeCells(bake.filter((cell) => cell.person.ineligible.includes(BAKE)))).toEqual([])

      // Approved days off and repeating days off hold for every person.
      const unavailable = cells.filter(
        (cell) =>
          cell.person.timeOff?.includes(cell.iso) === true ||
          cell.person.recurringOff?.includes(weekdayOf(cell.iso)) === true,
      )
      expect(describeCells(unavailable)).toEqual([])

      // A removed person is history: the solve never hands them a shift.
      const removed = seed.workspace.people.filter((person) => person.removed === true)
      expect(removed).toHaveLength(1)
      const removedPerson = removed[0]
      if (removedPerson === undefined) return
      expect(input.people.map((person) => person.id)).not.toContain(removedPerson.id)
      expect([...schedule.keys()].filter((key) => key.startsWith(`${removedPerson.id}|`))).toEqual([])

      // The demo shows the whole catalog, never a board that quietly drops a shift.
      const usedCodes = new Set(cells.map((cell) => cell.code))
      expect([...usedCodes].sort()).toEqual(input.shifts.map((shift) => shift.code).sort())
    },
    SOLVE_TIMEOUT_MS,
  )
})

describe('sample workspace showcase', () => {
  const TODAY = '2026-10-05'

  it('seeds a sample that reaches every engine capability', () => {
    const seed = buildSampleWorkspace(TODAY)
    const workspace = seed.workspace
    const period = periodOf(seed)
    const active = activePeople(workspace.people)

    // A night shift, so night fairness and the rest rule have something to bite on.
    expect(workspace.shifts.some((shift) => shift.isNight === true)).toBe(true)

    // A floater with no team, and a former staff member who must never be scheduled.
    expect(active.filter((person) => person.teamId === UNASSIGNED_TEAM_ID).length).toBeGreaterThanOrEqual(1)
    expect(workspace.people.filter((person) => person.removed === true)).toHaveLength(1)

    // Availability: a multi-day block of approved days off inside the period, and
    // a weekday someone is never scheduled on.
    const timeOffInside = (person: Person): string[] =>
      (person.timeOff ?? []).filter((iso) => iso >= period.start && iso <= period.end)
    expect(active.filter((person) => timeOffInside(person).length >= 2).length).toBeGreaterThanOrEqual(1)
    expect(active.some((person) => (person.recurringOff?.length ?? 0) > 0)).toBe(true)

    // Someone whose preference is their own, not their team's.
    expect(active.some((person) => person.useTeamPreference === false)).toBe(true)

    // BAKE and CLOSE are certifications, not free-for-alls: both are held by some
    // people and missing from others.
    expect(active.some((person) => person.ineligible.includes(BAKE))).toBe(true)
    expect(active.some((person) => !person.ineligible.includes(BAKE))).toBe(true)
    expect(active.some((person) => person.ineligible.includes(CLOSE))).toBe(true)

    // A dated coverage override inside the period, so the table is exercised too.
    const overrides = Object.keys(workspace.coverage.dateOverrides)
    expect(overrides.filter((iso) => iso >= period.start && iso <= period.end).length).toBeGreaterThanOrEqual(1)

    // The seed points at the one period it built.
    expect(workspace.periods.filter((candidate) => candidate.id === seed.periodId)).toHaveLength(1)
  })
})
