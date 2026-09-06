/// <reference path="./ambient.d.ts" />

import { describe, expect, it } from 'vitest'
import highsLoader from 'highs'
import type { Workspace } from '@crewdoku/domain'
import {
  activePeople,
  checkSchedule,
  emptySchedule,
} from '@crewdoku/domain'
import type { HighsSolve, ModelInput } from '@crewdoku/solver'
import {
  buildModel,
  buildProposal,
  toHighsSolve,
} from '@crewdoku/solver'
import { buildFixtureWorkspace, tightenCoverage } from './fixtures'

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

// Measures internals deliberately (wasm load, model build, highs solve, proposal build, checkSchedule).
describe('Performance benchmark (100 people × 42 days)', () => {
  it.runIf(process.env.CREWDOKU_PERF === '1')(
    'full-scale run measures wasm, build, solve, proposal, check, and memory',
    async () => {
      // 1. WASM Load measurement
      const wasmStart = performance.now()
      const rawHighs = await highsLoader()
      const highs: HighsSolve = toHighsSolve(rawHighs)
      const wasmLoadMs = performance.now() - wasmStart

      // 2. Fixture build
      const workspace = buildFixtureWorkspace({ people: 100, days: 42 })
      const input = workspaceToModelInput(workspace)

      // 3. Model build measurement
      const buildStart = performance.now()
      const { lp, meta } = buildModel(input)
      const modelBuildMs = performance.now() - buildStart

      const lpChars = lp.length
      const varCount = meta.varCount

      // 4. Feasible solve measurement + memory delta
      if (typeof gc === 'function') {
        gc()
      }
      const initialHeap = process.memoryUsage().heapUsed

      const solveFeasibleStart = performance.now()
      const solveResult = highs.solve(lp)
      const solveFeasibleMs = performance.now() - solveFeasibleStart

      const postSolveHeap = process.memoryUsage().heapUsed
      const heapDeltaMb = ((postSolveHeap - initialHeap) / (1024 * 1024)).toFixed(2)

      expect(solveResult.Status).toBe('Optimal')

      // 5. Infeasible solve measurement (tightened variant)
      const tightenedWorkspace = tightenCoverage(workspace)
      const tightenedInput = workspaceToModelInput(tightenedWorkspace)
      const { lp: tightenedLp } = buildModel(tightenedInput)

      const solveInfeasibleStart = performance.now()
      const tightenedResult = highs.solve(tightenedLp)
      const solveInfeasibleMs = performance.now() - solveInfeasibleStart

      expect(tightenedResult.Status).toBe('Infeasible')

      // 6. Proposal build and checker check measurement
      const proposalCheckStart = performance.now()
      const proposal = buildProposal(input, solveResult.Columns ?? {}, meta)
      const violations = checkSchedule({
        people: input.people,
        shifts: input.shifts,
        coverage: input.coverage,
        settings: input.settings,
        period: input.period,
        schedule: proposal.schedule,
      })
      const proposalCheckMs = performance.now() - proposalCheckStart

      // Assert solved 100x42 proposal is clean of hard violations
      const hardViolations = violations.filter((v) =>
        ['H1', 'H2', 'H3', 'H5'].includes(v.ruleId),
      )
      expect(hardViolations).toHaveLength(0)

      // 7. Output clean performance block
      const outputBlock = [
        'CREWDOKU PERF 100x42',
        ` wasm_load_ms=${wasmLoadMs.toFixed(2)}`,
        ` model_build_ms=${modelBuildMs.toFixed(2)}`,
        ` lp_chars=${lpChars}`,
        ` var_count=${varCount}`,
        ` solve_feasible_ms=${solveFeasibleMs.toFixed(2)}`,
        ` solve_infeasible_ms=${solveInfeasibleMs.toFixed(2)}`,
        ` proposal_check_ms=${proposalCheckMs.toFixed(2)}`,
        ` heap_delta_mb=${heapDeltaMb}`,
      ].join('\n')

      console.log(outputBlock)
    },
    120_000,
  )
})
