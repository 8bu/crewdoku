/**
 * Workspace aggregate — the whole-workspace state.
 *
 * Combines global entities (people, teams, tags, shift catalog, coverage
 * tables, solve settings) with periods and per-period schedules.
 * Pure composition, zero persistence dependencies.
 */

import { DEFAULT_SOLVE_SETTINGS } from './entities'
import type { CoverageTable, Period, Person, ShiftDef, SolveSettings, Team } from './entities'
import { DEFAULT_SHIFTS, defaultCoverageTable } from './factories'
import type { Schedule } from './schedule'
import type { Tag, TagGroup } from './tags'

export type Workspace = {
  people: Person[]
  teams: Team[]
  tagGroups: TagGroup[]
  tags: Tag[]
  shifts: ShiftDef[]
  coverage: CoverageTable
  /** Per-tag coverage band tables (H7), keyed by `Tag.id`; a tag without an entry has no requirement. */
  tagCoverage: Record<string, CoverageTable>
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
    tagGroups: [],
    tags: [],
    shifts: [],
    coverage: defaultCoverageTable(DEFAULT_SHIFTS, 1),
    tagCoverage: {},
    settings: DEFAULT_SOLVE_SETTINGS,
    periods: [],
    schedules: new Map(),
  }
}
