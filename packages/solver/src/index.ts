/**
 * @crewdoku/solver — HiGHS Web Worker solver adapter, MILP model build,
 * solution-to-proposal mapping, conflict core and relaxations.
 */

export { CancelledError, HighsSolverAdapter } from './highs/adapter'
export type {
  ColumnResult,
  HighsOptions,
  HighsSolverAdapterOptions,
  LogHandler,
  Solution,
  WorkerLike,
} from './highs/adapter'
export type {
  CancelMessage,
  ColumnPrimal,
  HighsSolve,
  HighsSolveResult,
  SolveMessage,
  SolveMeta,
  WorkerInMessage,
  WorkerOutMessage,
} from './highs/worker'
export { toHighsSolve } from './highs/worker'

export { buildModel } from './model/model'
export type { ModelInput, ModelMeta } from './model/model'
export { mapSolution } from './model/mapSolution'
export type { SolutionColumns } from './model/mapSolution'
export { buildProposal } from './model/proposal'
export type { SolvedProposal } from './model/proposal'
export { rankWeights } from './model/weights'
export { deriveConflictCore } from './model/infeasible'
export type {
  ConflictCoreItem,
  ConflictResult,
  Relaxation,
} from './model/infeasible'

export { runSolve } from './port'
export type {
  LpSolveResult,
  SolveLpFn,
  SolveOutcome,
} from './port'
