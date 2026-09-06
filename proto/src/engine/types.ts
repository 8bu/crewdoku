/**
 * The solver port (wayfinder ticket 10). UI code imports `solve` from
 * `engine/index.ts` and depends only on these types — never on
 * `stubSolver` directly — so the real engine can replace the stub later
 * without touching UI code.
 */
import type { Assignment, BoardDate, Person, ShiftDef, Team } from '../board/mockBoard'
import type { CoverageTable } from '../state/coverageRules'
import type { HardRuleId } from '../state/solveSettings'

export type SolveOrg = {
  teams: Team[]
  people: Person[]
  /** The live shift catalog (ticket 15) — codes, labels, times. */
  shifts: ShiftDef[]
}

export type SolveRules = {
  /** Real per-shift, per-weekday (with date overrides) headcount table — ticket 15's H1 source of truth. */
  coverage: CoverageTable
  /** Hours required between one shift ending and the next starting — ticket 07's rest check (H3). */
  minRestHours: number
  /** Weekly hour cap — ticket 15's H2. */
  maxHoursPerWeek: number
  /** Which hard rules this solve should try to honour. H4 is structural and isn't checked here. */
  enabled: Record<HardRuleId, boolean>
}

export type SolvePeriod = {
  dates: BoardDate[]
}

/** Keyed like `mockBoard.assignmentKey` — `${personId}|${iso}`. A pinned entry is a pin. */
export type ScheduleMap = Map<string, Assignment>

export type SolveOptions = {
  /** Simulates a several-second real solve; 0 resolves on the next tick. */
  delayMs?: number
  /** Skips solving and always returns infeasible, to design the infeasible screen against a real call. */
  forceInfeasible?: boolean
}

export type SolveRequest = {
  org: SolveOrg
  rules: SolveRules
  period: SolvePeriod
  /** The board as it stands before this solve. A `pinned` entry here is a pin the solver must not move. */
  schedule: ScheduleMap
  options?: SolveOptions
}

export type ConflictCoreItem = {
  id: string
  /** Plain-word reason this rule can't be met — the map's "explained in plain sentences" rule. */
  message: string
}

export type RelaxationOption = {
  id: string
  label: string
  /** Applied to `rules` before a retry; returns a new, looser `SolveRules`. */
  relax: (rules: SolveRules) => SolveRules
}

export type SolveResult =
  | { status: 'solved'; schedule: ScheduleMap }
  | { status: 'infeasible'; conflictCore: ConflictCoreItem[]; relaxations: RelaxationOption[] }

/** The shape the real engine will also implement. */
export type SolverPort = (request: SolveRequest) => Promise<SolveResult>
