/**
 * Entity factories and workspace seeds. Ids are stable and unique
 * (`crypto.randomUUID`, prefixed by kind for log readability). Seed values
 * match the prototype's defaults exactly so a new workspace reads the same
 * on day one.
 */

/// <reference path="./globals.d.ts" />

import type { ISODate } from './calendar'
import type {
  CoverageRow,
  CoverageTable,
  Period,
  Person,
  ShiftDef,
  Team,
} from './entities'
import { UNASSIGNED_TEAM_ID } from './entities'

function makeId(kind: string): string {
  return `${kind}-${crypto.randomUUID()}`
}

export function makePerson(init: Partial<Person> & { name: string }): Person {
  return {
    ...init,
    id: init.id ?? makeId('person'),
    teamId: init.teamId ?? UNASSIGNED_TEAM_ID,
    ineligible: init.ineligible ?? [],
  }
}

export function makeTeam(init: Partial<Team> & { name: string }): Team {
  return {
    ...init,
    id: init.id ?? makeId('team'),
    wants: init.wants ?? [],
    avoids: init.avoids ?? [],
  }
}

export function makePeriod(init: { label: string; start: ISODate; end: ISODate; id?: string }): Period {
  return { id: init.id ?? makeId('period'), label: init.label, start: init.start, end: init.end }
}

/** The default catalog a new workspace seeds from — the prototype's four codes. */
export const DEFAULT_SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400', color: 'amber' },
  { code: 'MID', label: 'Mid', start: '1000', end: '1800', color: 'teal' },
  { code: 'LATE', label: 'Late', start: '1400', end: '2200', color: 'orange' },
  { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true, color: 'navy' },
]

/**
 * The prototype's seed table: `teamCount` as the floor, double it as the
 * ceiling, every shift, every weekday. From there it is the planner's to edit.
 */
export function defaultCoverageTable(shifts: readonly ShiftDef[], teamCount: number): CoverageTable {
  const row: CoverageRow = Object.fromEntries(
    shifts.map((s) => [s.code, { min: teamCount, max: teamCount * 2 }]),
  )
  const byDow: Record<number, CoverageRow> = {}
  for (let dow = 0; dow < 7; dow++) byDow[dow] = { ...row }
  return { byDow, dateOverrides: {} }
}
