/**
 * The solver port. Import `solve` from here, never from `stubSolver`
 * directly — swapping in the real engine later means changing this one
 * line, not any UI code (wayfinder ticket 10).
 */
export type {
  ConflictCoreItem,
  RelaxationOption,
  ScheduleMap,
  SolveOptions,
  SolveOrg,
  SolvePeriod,
  SolveRequest,
  SolveResult,
  SolveRules,
  SolverPort,
} from './types'

export { stubSolve as solve } from './stubSolver'
