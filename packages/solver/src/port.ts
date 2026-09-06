/**
 * Solver port facade.
 *
 * Determinism:
 * Given identical ModelInput and byte-identical LP problem text, HiGHS single-threaded
 * WASM solving is deterministic and yields identical variable assignments. The resulting
 * SolvedProposal is cell-for-cell identical across runs.
 *
 * Pins-sacred semantics:
 * Pinned assignments in ModelInput.current are preserved verbatim into the resulting
 * proposal schedule (retaining pinned: true and ineligible status). Neither the MILP
 * solve nor proposal overlay moves or overwrites a pinned cell.
 *
 * Scale and latency (~4.1 s at scale):
 * Solving a full-scale board (100 people × 42 days) takes approximately 4.1 s wall-clock time.
 * Consequently, the solve port is inherently asynchronous. User interfaces must treat solving
 * as a background task with loading indicators, log streaming, and cancellation support.
 *
 * Async and cancellation guidance:
 * For production browser UI, wire `solveLp` to `HighsSolverAdapter.prototype.solve`, which runs
 * HiGHS inside a dedicated Web Worker, provides streamed progress logs, and exposes `cancel()`.
 * For unit tests, scripts, or harness runs where Web Worker threads are not needed, wire `solveLp`
 * directly to `toHighsSolve(await highsLoader()).solve`.
 */

import type { ColumnPrimal, HighsSolveResult } from './highs/worker'
import type { ConflictCoreItem, Relaxation } from './model/infeasible'
import { deriveConflictCore } from './model/infeasible'
import type { ModelInput } from './model/model'
import { buildModel } from './model/model'
import type { SolvedProposal } from './model/proposal'
import { buildProposal } from './model/proposal'

export type LpSolveResult = HighsSolveResult

export type SolveLpFn = (
  lp: string,
) => Promise<LpSolveResult> | LpSolveResult

export type SolveOutcome =
  | SolvedProposal
  | {
      status: 'infeasible'
      conflictCore: ConflictCoreItem[]
      relaxations: Relaxation[]
    }

/**
 * Executes a solve workflow for the given model input using the provided LP solver function.
 *
 * 1. Builds the MILP model via `buildModel(input)`.
 * 2. Invokes `solveLp(lp)`.
 * 3. Inspects `result.Status`:
 *    - 'Optimal': maps columns and returns `SolvedProposal` via `buildProposal`.
 *    - 'Infeasible': diagnoses causes via `deriveConflictCore(input)` and returns conflict core + relaxations.
 *    - Any other status: throws a plain `Error` indicating the solver failed. HiGHS errors (out of memory,
 *      timeout, load error) are engine bugs or environment failures, not normal planner-facing domain states.
 */
export async function runSolve(
  input: ModelInput,
  solveLp: SolveLpFn,
): Promise<SolveOutcome> {
  const { lp, meta } = buildModel(input)
  const result = await solveLp(lp)

  if (result.Status === 'Optimal') {
    const rawColumns = result.Columns ?? {}
    const columns: Record<string, ColumnPrimal> = {}
    for (const [colName, colVal] of Object.entries(rawColumns)) {
      if (colVal !== undefined) {
        columns[colName] = colVal
      }
    }
    return buildProposal(input, columns, meta)
  }

  if (result.Status === 'Infeasible') {
    const { conflictCore, relaxations } = deriveConflictCore(input)
    return {
      status: 'infeasible',
      conflictCore,
      relaxations,
    }
  }

  throw new Error(`Solver returned unexpected status: ${result.Status}`)
}
