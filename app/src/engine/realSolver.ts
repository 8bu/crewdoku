/**
 * The real solver port (app ticket 03). Runs the `@crewdoku/solver` HiGHS MILP
 * inside a dedicated Web Worker via `HighsSolverAdapter`, streaming per-solve
 * log lines and supporting true in-flight cancellation.
 *
 * One adapter is shared across solves: it lazily spawns a worker on the first
 * solve and, on `cancelSolve()`, terminates it and drops any queued messages so
 * the next solve starts a fresh worker.
 */
import {
  HighsSolverAdapter,
  runSolve,
  type LogHandler,
  type ModelInput,
  type SolveOutcome,
} from '@crewdoku/solver'

const adapter = new HighsSolverAdapter()

export async function solve(input: ModelInput, onLog?: LogHandler): Promise<SolveOutcome> {
  return runSolve(input, async (lp) => {
    const solution = await adapter.solve(lp, {}, onLog)
    return {
      Status: solution.status,
      ObjectiveValue: solution.objective,
      Columns: solution.columns,
    }
  })
}

export function cancelSolve(): void {
  adapter.cancel()
}
