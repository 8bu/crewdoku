import type { CsvRow } from '../board/roster/csvImport'

/**
 * A small, believable sample roster — twelve people across two teams, enough
 * to satisfy every template's sizing nudge. Shared by two callers: the org
 * picker's one-click demo workspace (`startSampleWorkspace`) and the first-run
 * wizard's "Use sample data" shortcut, so both show the same familiar names.
 */
export const SAMPLE_ROWS: CsvRow[] = [
  { name: 'Ava Bennett', team: 'Front of house' },
  { name: 'Liam Carter', team: 'Front of house' },
  { name: 'Sofia Delgado', team: 'Front of house' },
  { name: 'Noah Fischer', team: 'Front of house' },
  { name: 'Mia Okafor', team: 'Front of house' },
  { name: 'Ethan Reyes', team: 'Front of house' },
  { name: 'Hana Sato', team: 'Kitchen' },
  { name: 'Omar Haddad', team: 'Kitchen' },
  { name: 'Lucas Moreau', team: 'Kitchen' },
  { name: 'Priya Nair', team: 'Kitchen' },
  { name: 'Chloe Martin', team: 'Kitchen' },
  { name: 'Diego Alvarez', team: 'Kitchen' },
]

/** The sample roster as `Name, Team` lines — the exact shape the wizard's
 *  paste box expects, so it flows through the same parser a real paste does. */
export function sampleRosterText(): string {
  return SAMPLE_ROWS.map((row) => `${row.name}, ${row.team}`).join('\n')
}
