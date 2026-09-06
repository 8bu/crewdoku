/**
 * Onboarding's employee import (wayfinder ticket 14) — a manager's first
 * real action in a brand-new period. Kept pure and apart from the
 * `Onboarding` component the same way `rosterOps.ts`/`teamOps.ts` keep
 * their edits apart from the routes that use them, so parsing and applying
 * a CSV are both testable without a DOM or a file picker.
 */
import type { Person, Team } from '@crewdoku/domain'
import { addPerson, setPersonName, setPersonTeam } from './rosterOps'
import { addTeam } from './teamOps'

export type CsvRow = { name: string; team: string }
export type CsvParseResult = { rows: CsvRow[]; errors: string[] }

function splitCsvLine(line: string): string[] {
  // Only ever asked to carry a name and a team name — no embedded-comma
  // fields to worry about, just a bare double-quote wrapper some
  // spreadsheet exports add around every cell.
  return line.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1').trim())
}

/** Header row is required and must name both columns — order and case don't matter. */
export function parseEmployeeCsv(text: string): CsvParseResult {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return { rows: [], errors: ['That file is empty.'] }

  const header = splitCsvLine(lines[0]!).map((cell) => cell.toLowerCase())
  const nameIdx = header.indexOf('name')
  const teamIdx = header.indexOf('team')
  if (nameIdx === -1 || teamIdx === -1) {
    return { rows: [], errors: ['The first row must be a header with "name" and "team" columns.'] }
  }
  if (lines.length === 1) return { rows: [], errors: ['No employee rows found below the header.'] }

  const rows: CsvRow[] = []
  const errors: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!)
    const name = cells[nameIdx] ?? ''
    const team = cells[teamIdx] ?? ''
    if (!name) {
      errors.push(`Row ${i + 1}: missing a name — skipped.`)
      continue
    }
    rows.push({ name, team })
  }
  return { rows, errors }
}

/**
 * Applies parsed rows on top of whatever roster/teams already exist (both
 * are empty for a fresh onboarding period, but this stays correct even if
 * it never is). A row's team is matched case-insensitively against an
 * existing team before a new one is created; a blank team cell leaves the
 * person on the same `UNASSIGNED_TEAM_ID` sentinel `addPerson` already
 * defaults to.
 */
export function applyCsvImport(
  people: Person[],
  teams: Team[],
  rows: CsvRow[],
): { people: Person[]; teams: Team[] } {
  let nextPeople = people
  let nextTeams = teams

  for (const row of rows) {
    nextPeople = addPerson(nextPeople)
    const added = nextPeople[nextPeople.length - 1]!
    nextPeople = setPersonName(nextPeople, added.id, row.name)

    if (row.team) {
      let team = nextTeams.find((t) => t.name.toLowerCase() === row.team.toLowerCase())
      if (!team) {
        nextTeams = addTeam(nextTeams, row.team)
        team = nextTeams[nextTeams.length - 1]!
      }
      nextPeople = setPersonTeam(nextPeople, added.id, team.id)
    }
  }

  return { people: nextPeople, teams: nextTeams }
}
