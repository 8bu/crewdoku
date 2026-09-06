/**
 * Workspace aggregate — the whole-workspace state.
 *
 * Combines global entities (people, teams, shift catalog, coverage table,
 * solve settings) with periods and per-period schedules.
 * Pure composition, zero persistence dependencies.
 */

import { DEFAULT_SOLVE_SETTINGS } from './entities'
import type { CoverageTable, Period, Person, ShiftDef, SolveSettings, Team } from './entities'
import { DEFAULT_SHIFTS, defaultCoverageTable } from './factories'
import type { Schedule } from './schedule'

export type Workspace = {
  people: Person[]
  teams: Team[]
  shifts: ShiftDef[]
  coverage: CoverageTable
  settings: SolveSettings
  periods: Period[]
  schedules: Map<string, Schedule>
}

/**
 * Creates an empty starter workspace with default settings and empty collections.
 */
export function emptyWorkspace(): Workspace {
  return {
    people: [],
    teams: [],
    shifts: [],
    coverage: defaultCoverageTable(DEFAULT_SHIFTS, 1),
    settings: DEFAULT_SOLVE_SETTINGS,
    periods: [],
    schedules: new Map(),
  }
}
