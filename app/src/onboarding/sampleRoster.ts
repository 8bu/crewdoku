import { employeeRowsToLines, type CsvRow } from '../board/roster/csvImport'
import { SAMPLE_PEOPLE } from './sampleWorkspace'

/**
 * The sample roster as import rows — the same eighteen people and three teams
 * the one-click sample workspace seeds (`SAMPLE_PEOPLE`, minus the soft-removed
 * former staff member), so the wizard's shortcut and the org picker's demo show
 * one familiar crew. A person with no team is an empty team cell, which is what
 * `applyCsvImport` reads as the unassigned sentinel.
 *
 * Only the first-run wizard reads this now; the org picker's demo workspace
 * builds its roster through `buildSampleWorkspace`.
 */
export const SAMPLE_ROWS: CsvRow[] = SAMPLE_PEOPLE.filter((person) => !person.removed).map((person) => ({
  name: person.name,
  team: person.teamName ?? '',
}))

/** The sample roster as `Name, Team` lines — the exact shape the wizard's
 *  paste box expects, so it flows through the same parser a real paste does. */
export function sampleRosterText(): string {
  return employeeRowsToLines(SAMPLE_ROWS).join('\n')
}
