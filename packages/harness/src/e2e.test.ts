import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import highsLoader from 'highs'
import type { Workspace } from '@crewdoku/domain'
import {
  activePeople,
  assignmentKey,
  checkSchedule,
  emptySchedule,
  getAssignment,
} from '@crewdoku/domain'
import {
  exportWorkspaceFile,
  IdbWorkspaceStorage,
  importWorkspaceFile,
} from '@crewdoku/persistence'
import type { HighsSolve, ModelInput, SolveOutcome } from '@crewdoku/solver'
import { runSolve, toHighsSolve } from '@crewdoku/solver'
import { buildFixtureWorkspace, tightenCoverage } from './fixtures'

let highs: HighsSolve

beforeAll(async () => {
  const loaded = await highsLoader()
  highs = toHighsSolve(loaded)
})

function workspaceToModelInput(w: Workspace): ModelInput {
  const active = activePeople(w.people)
  const period = w.periods[0]
  if (period === undefined) {
    throw new Error('Workspace must contain at least one period')
  }

  const existingSchedule = w.schedules.get(period.id)
  const current = existingSchedule ?? emptySchedule(active, period.start, period.end)

  return {
    people: active,
    shifts: w.shifts,
    coverage: w.coverage,
    settings: w.settings,
    period: { start: period.start, end: period.end },
    current,
    teams: w.teams,
  }
}

describe('Harness E2E (12 people × 14 days)', () => {
  it('done-line: load -> solve -> verify legal -> infeasible path -> persist -> reload', async () => {
    // 1. Build fixture workspace (12 people, 14 days)
    const workspace = buildFixtureWorkspace({ people: 12, days: 14 })
    const period = workspace.periods[0]
    expect(period).toBeDefined()
    if (period === undefined) return

    // 2. Build model input from workspace
    const input = workspaceToModelInput(workspace)
    expect(input.people.length).toBe(11) // 1 removed person among 12
    expect(input.period.start).toBe('2026-08-17')
    expect(input.period.end).toBe('2026-08-30')

    // Pinned cell check on day 1 for person-000
    const p0 = input.people[0]
    expect(p0).toBeDefined()
    if (p0 === undefined) return
    const pinnedKey = assignmentKey(p0.id, input.period.start)
    const pinnedAssignment = getAssignment(input.current, p0.id, input.period.start)
    expect(pinnedAssignment.pinned).toBe(true)
    expect(pinnedAssignment.code).toBe('EARLY')

    // 3. Solve via solver port runSolve facade
    const outcome = await runSolve(input, (lp) => highs.solve(lp))
    expect(outcome.status).toBe('solved')
    if (outcome.status !== 'solved') return
    const proposal = outcome

    // Pinned cell must remain intact in proposal
    const proposalPinned = proposal.schedule.get(pinnedKey)
    expect(proposalPinned).toBeDefined()
    expect(proposalPinned?.code).toBe('EARLY')
    expect(proposalPinned?.pinned).toBe(true)
    // 5. Verify zero H1/H2/H3/H5 violations
    const violations = checkSchedule({
      people: input.people,
      shifts: input.shifts,
      coverage: input.coverage,
      settings: input.settings,
      period: input.period,
      schedule: proposal.schedule,
    })
    const hardViolations = violations.filter((v) =>
      ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
    )
    expect(hardViolations).toHaveLength(0)

    // 6. Infeasible path: tightenCoverage -> runSolve -> infeasible -> apply relaxation loop -> legal
    // This mirrors the app's pick-one-relaxation-and-re-run loop: a bounded loop (max 5)
    // where each iteration diagnoses the conflict core, applies the first suggested relaxation,
    // and re-solves until the schedule becomes Optimal.
    const tightenedWorkspace = tightenCoverage(workspace)
    let loopInput = workspaceToModelInput(tightenedWorkspace)
    let loopOutcome: SolveOutcome = await runSolve(loopInput, (lp) => highs.solve(lp))
    expect(loopOutcome.status).toBe('infeasible')

    let iterations = 0
    while (loopOutcome.status === 'infeasible' && iterations < 5) {
      expect(loopOutcome.conflictCore.length).toBeGreaterThan(0)
      if (iterations === 0) {
        const h1Core = loopOutcome.conflictCore.find((c) => c.ruleIds.includes('H1'))
        expect(h1Core).toBeDefined()
      }

      expect(loopOutcome.relaxations.length).toBeGreaterThan(0)
      const firstRelaxation = loopOutcome.relaxations[0]
      expect(firstRelaxation).toBeDefined()
      if (firstRelaxation === undefined) break

      loopInput = firstRelaxation.apply(loopInput)
      loopOutcome = await runSolve(loopInput, (lp) => highs.solve(lp))
      iterations++
    }

    expect(loopOutcome.status).toBe('solved')
    if (loopOutcome.status !== 'solved') return
    const relaxedProposal = loopOutcome
    const relaxedViolations = checkSchedule({
      people: loopInput.people,
      shifts: loopInput.shifts,
      coverage: loopInput.coverage,
      settings: loopInput.settings,
      period: loopInput.period,
      schedule: relaxedProposal.schedule,
    })
    const relaxedHardViolations = relaxedViolations.filter((v) =>
      ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
    )
    expect(relaxedHardViolations).toHaveLength(0)

    // 7. Persist & reload: IdbWorkspaceStorage round-trip
    const storage = new IdbWorkspaceStorage()
    const workspaceWithProposal: Workspace = {
      ...workspace,
      schedules: new Map(workspace.schedules),
    }
    workspaceWithProposal.schedules.set(period.id, proposal.schedule)

    await storage.save(workspaceWithProposal)
    const loadedWorkspace = await storage.load()
    expect(loadedWorkspace).not.toBeNull()
    if (loadedWorkspace === null) return

    expect(loadedWorkspace.people).toEqual(workspaceWithProposal.people)
    expect(loadedWorkspace.teams).toEqual(workspaceWithProposal.teams)
    expect(loadedWorkspace.shifts).toEqual(workspaceWithProposal.shifts)
    expect(loadedWorkspace.coverage).toEqual(workspaceWithProposal.coverage)
    expect(loadedWorkspace.settings).toEqual(workspaceWithProposal.settings)
    expect(loadedWorkspace.periods).toEqual(workspaceWithProposal.periods)
    expect(loadedWorkspace.schedules.size).toBe(workspaceWithProposal.schedules.size)
    const loadedSchedule = loadedWorkspace.schedules.get(period.id)
    expect(loadedSchedule).toBeDefined()
    if (loadedSchedule !== undefined) {
      expect(Array.from(loadedSchedule.entries())).toEqual(
        Array.from(proposal.schedule.entries()),
      )
    }

    // 8. Export & import file round-trip equality
    const fileBlob = exportWorkspaceFile(workspaceWithProposal)
    const importResult = await importWorkspaceFile(fileBlob)
    expect(importResult.ok).toBe(true)
    if (!importResult.ok) return

    const importedWorkspace = importResult.workspace
    expect(importedWorkspace.people).toEqual(workspaceWithProposal.people)
    expect(importedWorkspace.teams).toEqual(workspaceWithProposal.teams)
    expect(importedWorkspace.shifts).toEqual(workspaceWithProposal.shifts)
    expect(importedWorkspace.coverage).toEqual(workspaceWithProposal.coverage)
    expect(importedWorkspace.settings).toEqual(workspaceWithProposal.settings)
    expect(importedWorkspace.periods).toEqual(workspaceWithProposal.periods)
    expect(importedWorkspace.schedules.size).toBe(workspaceWithProposal.schedules.size)
    const importedSchedule = importedWorkspace.schedules.get(period.id)
    expect(importedSchedule).toBeDefined()
    if (importedSchedule !== undefined) {
      expect(Array.from(importedSchedule.entries())).toEqual(
        Array.from(proposal.schedule.entries()),
      )
    }
    // Two real HiGHS solves (feasible + infeasible) plus a persistence
    // round-trip: well over vitest's 5s default on a loaded CI runner.
  }, 60000)
})
