/**
 * Workspace entities. The prototype's shapes (`proto/src/board/mockBoard.ts`,
 * `proto/src/state/coverageRules.ts`, `proto/src/state/solveSettings.ts`) are
 * the spec of meaning here; mock-generator artifacts (`rotationOffset`,
 * `seedMock`) and onboarding UI state (`setup`) deliberately do not carry.
 *
 * Scope rule (UI ticket 24, now a domain fact): people, teams, the shift
 * catalog, the coverage table, and solve settings are one workspace-global
 * set; a period owns only its schedule.
 */

import type { ISODate } from './calendar'

/**
 * A shift's code. The catalog is planner-editable, so this is an open
 * string, not a literal union. `'OFF'` is the one reserved value — always
 * present, never a row of the catalog.
 */
export type ShiftCode = string

export const OFF_CODE = 'OFF' as const

/** One row of the planner-editable shift catalog. */
export type ShiftDef = {
  code: ShiftCode
  label: string
  /** `HHMM`, 24h clock. `end <= start` means the shift crosses midnight. */
  start: string
  end: string
  /**
   * Unpaid break minutes inside the shift. Reduces paid hours (the H2 weekly
   * cap, the solver, and hour displays); the clock span is unchanged.
   * Absent or 0 means no break.
   */
  unpaidBreakMinutes?: number
  /** Counts as a night shift (S1 fairness; the board's "Nights" column). */
  isNight?: boolean
  /**
   * Opaque UI colour token. The domain stores and round-trips it so a
   * workspace snapshot is whole, but never interprets it.
   */
  color?: string
}

export type Team = {
  id: string
  name: string
  /** The team's default preference — a person on `useTeamPreference` reads these. */
  wants: ShiftCode[]
  avoids: ShiftCode[]
}

/**
 * Not every person is on a team. `Person.teamId` holds this sentinel in
 * that case; it is never a key into the workspace's team list.
 */
export const UNASSIGNED_TEAM_ID = '__unassigned__'

export type Person = {
  id: string
  name: string
  /** A real `Team.id`, or `UNASSIGNED_TEAM_ID`. */
  teamId: string
  /**
   * Shift codes this person cannot work (no certification). A capability
   * fact, not a solver rule: hand-edits against it are accepted and
   * flagged (`Assignment.ineligible`); the engine has no H6 constraint
   * (settled while charting — the rule set is H1–H5).
   */
  ineligible: ShiftCode[]
  /** Approved days off, ISO dates. Most people have none. */
  timeOff?: ISODate[]
  /** Weekdays (0 Sun .. 6 Sat) this person is never scheduled, every week. */
  recurringOff?: number[]
  /** Shift codes this person wants more of. Ignored while `useTeamPreference`. */
  wants?: ShiftCode[]
  /** Shift codes this person avoids. Ignored while `useTeamPreference`. */
  avoids?: ShiftCode[]
  /** True: preference is the team's default. False: `wants`/`avoids` are their own. */
  useTeamPreference?: boolean
  /**
   * Soft-removed (UI ticket 16): excluded from future solves, never
   * deleted — existing assignments and history stay intact.
   */
  removed?: boolean
}

/** A schedule period. Owns nothing but its date range; the schedule is keyed by its id. */
export type Period = {
  id: string
  label: string
  start: ISODate
  end: ISODate
}

/** Min/max headcount for one shift on one day. */
export type CoverageBand = { min: number; max: number }
/** Shift code -> band. */
export type CoverageRow = Record<string, CoverageBand>

/** The workspace-global coverage requirement table (H1). */
export type CoverageTable = {
  /** Weekday 0 (Sun) .. 6 (Sat) -> shift code -> band. The default. */
  byDow: Record<number, CoverageRow>
  /** ISO date -> shift code -> band. Wins over `byDow` for that date. */
  dateOverrides: Record<ISODate, CoverageRow>
}

/** No requirement: any headcount, zero included, satisfies it. */
export const UNCONSTRAINED_BAND: CoverageBand = Object.freeze({ min: 0, max: Infinity })

/** `dateOverrides[iso]` wins over `byDow[weekday]`; an unlisted shift reads as no requirement. */
export function coverageBandFor(
  table: CoverageTable,
  shiftCode: ShiftCode,
  iso: ISODate,
  weekday: number,
): CoverageBand {
  return table.dateOverrides[iso]?.[shiftCode] ?? table.byDow[weekday]?.[shiftCode] ?? UNCONSTRAINED_BAND
}

/**
 * The rule set, exactly the prototype's settings surface: H1 coverage band,
 * H2 weekly hours, H3 rest, H5 time off. H4 (one shift per person per day)
 * is structural — the schedule shape cannot represent a violation — so it
 * carries no toggle here. There is no H6 (settled while charting).
 */
export type HardRuleId = 'H1' | 'H2' | 'H3' | 'H5'

export const HARD_RULE_IDS: readonly HardRuleId[] = ['H1', 'H2', 'H3', 'H5']

export type SoftGoalId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'

export const SOFT_GOAL_IDS: readonly SoftGoalId[] = ['S1', 'S2', 'S3', 'S4', 'S5']

export type HardRuleSettings = {
  enabled: Record<HardRuleId, boolean>
  maxHoursPerWeek: number
  minRestHours: number
}

export type SolveSettings = {
  hardRules: HardRuleSettings
  /** Ranked, index 0 = highest priority. Always all five ids, just reordered. */
  softGoalOrder: SoftGoalId[]
  softGoalEnabled: Record<SoftGoalId, boolean>
}

export const DEFAULT_SOLVE_SETTINGS: SolveSettings = {
  hardRules: {
    enabled: { H1: true, H2: true, H3: true, H5: true },
    maxHoursPerWeek: 40,
    minRestHours: 11,
  },
  softGoalOrder: ['S1', 'S2', 'S3', 'S4', 'S5'],
  softGoalEnabled: { S1: true, S2: true, S3: true, S4: true, S5: true },
}
