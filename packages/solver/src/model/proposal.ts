/**
 * Solved proposal schedule builder.
 *
 * Determinism assumption:
 * The HiGHS MILP model produces byte-identical LP output for identical ModelInput.
 * Running single-threaded WASM HiGHS on byte-identical LP problem input is deterministic
 * and yields identical variable solutions. This module guarantees that given identical
 * ModelInput and HiGHS column solutions, the resulting proposal schedule is deterministic
 * and cell-for-cell identical.
 */

import type { Schedule } from '@crewdoku/domain'
import { emptySchedule } from '@crewdoku/domain'
import type { ModelInput, ModelMeta } from './model'
import { mapSolution } from './mapSolution'
import type { SolutionColumns } from './mapSolution'

export type SolvedProposal = {
  status: 'solved'
  schedule: Schedule
}

/**
 * Builds a complete reviewable proposal Schedule from a HiGHS solution.
 *
 * - Starts from an empty schedule matrix (emptySchedule for input.people and input.period)
 *   where every person × date cell defaults to OFF_ASSIGNMENT.
 * - Overlays pinned assignments from input.current verbatim (preserving pinned: true
 *   and ineligible flag).
 * - Overlays the sparse solution decoded by mapSolution.
 *
 * The resulting schedule is a complete person × date matrix.
 */
export function buildProposal(
  input: ModelInput,
  columns: SolutionColumns,
  meta: ModelMeta,
): SolvedProposal {
  const schedule = emptySchedule(input.people, input.period.start, input.period.end)

  // 1. Overlay pinned assignments from input.current verbatim
  for (const person of input.people) {
    const prefix = `${person.id}|`
    for (const [key, assignment] of input.current) {
      if (assignment.pinned && key.startsWith(prefix)) {
        schedule.set(key, assignment)
      }
    }
  }

  // 2. Overlay sparse solution cells from mapSolution
  const sparseSolution = mapSolution(columns, meta)
  for (const [key, assignment] of sparseSolution) {
    schedule.set(key, assignment)
  }

  return {
    status: 'solved',
    schedule,
  }
}
