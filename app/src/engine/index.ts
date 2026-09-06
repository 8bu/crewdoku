/**
 * The solver port. Import `solve`/`cancelSolve` from here (app ticket 03 — the
 * real HiGHS engine replaced the ticket-01 stub; the ticket-10 promise held:
 * this one module changed, no board/generate code cared).
 */
export type {
  ConflictCoreItem,
  ModelInput,
  RelaxationOption,
  ScheduleMap,
  SolveResult,
} from './types'
export { buildModelInput } from './modelInput'
export { cancelSolve, solve } from './realSolver'
