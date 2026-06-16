import type {
  Assignment,
  Coverage,
  Employee,
  Org,
  Rules,
  Shift,
  Team,
} from '../entities/types'

/**
 * Raw solver result. `status` is a free string carrying the solver's verdict
 * (e.g. HiGHS' 'Optimal' / 'Infeasible' / 'Unbounded'); callers branch on it.
 * `columns` maps LP variable names to their solved primal value. Both `Primal`
 * and `primal` casings are tolerated (HiGHS WASM has used both).
 */
export interface Solution {
  status: string
  objective: number
  columns: Record<string, { Primal?: number; primal?: number }>
}

export type SolveResult = Solution

/**
 * SolverPort is the boundary between the pure domain (which builds the LP) and
 * the runtime adapter (which owns the WASM+worker thread). The domain never imports a
 * solver implementation; it only depends on this interface.
 */
export interface SolverPort {
  solve(lp: string, options?: Record<string, unknown>): Promise<Solution>
}

/**
 * Plain-JSON snapshot of the whole app state, exchanged with persistence.
 * `assignments` is a flat array (NOT a Map) so it serializes losslessly.
 */
export interface AppStateDTO {
  org: Org | null
  teams: Team[]
  shifts: Shift[]
  employees: Employee[]
  coverages: Coverage[]
  rules: Rules
  assignments: Assignment[]
  period: { startDate: string; weeks: number }
}

/** StoragePort persists/loads only plain JSON (AppStateDTO); no domain schema. */
export interface StoragePort {
  save(state: AppStateDTO): Promise<void>
  load(): Promise<AppStateDTO | null>
}
