import {
  activePeople,
  type CoverageTable,
  type ISODate,
  type Person,
  type Schedule,
  type ShiftDef,
  type SolveSettings,
  type Team,
} from '@crewdoku/domain'
import type { ModelInput } from '@crewdoku/solver'

export type ModelInputParts = {
  people: readonly Person[]
  teams: readonly Team[]
  shifts: readonly ShiftDef[]
  coverage: CoverageTable
  settings: SolveSettings
  /** The period's calendar dates, in order — the board's own date column. */
  dates: readonly ISODate[]
  /** The board before this solve; pinned entries are pins the solver must keep. */
  current: Schedule
}

/**
 * Assembles the engine's `ModelInput` from the board's live state. Removed
 * people (UI ticket 16) drop out via `activePeople`, so the solver never hands
 * them a new assignment; their existing board entries carry through untouched
 * because the proposal only ever spans `ModelInput.people`.
 */
export function buildModelInput(parts: ModelInputParts): ModelInput {
  const start = parts.dates[0]
  const end = parts.dates[parts.dates.length - 1]
  if (start === undefined || end === undefined) {
    throw new Error('buildModelInput: the period has no dates')
  }
  return {
    people: activePeople(parts.people),
    shifts: parts.shifts,
    coverage: parts.coverage,
    settings: parts.settings,
    period: { start, end },
    current: parts.current,
    teams: parts.teams,
  }
}
