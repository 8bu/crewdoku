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
export type CsvError =
  | { kind: 'empty' }
  | { kind: 'noHeader' }
  | { kind: 'noRows' }
  | { kind: 'missingName'; line: number }
export type CsvParseResult = { rows: CsvRow[]; errors: CsvError[] }

function splitCsvLine(line: string): string[] {
  // Only ever asked to carry a name and a team name — no embedded-comma
  // fields to worry about, just a bare double-quote wrapper some
  // spreadsheet exports add around every cell.
  return line.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1').trim())
}

/** Header row is required and must name both columns — order and case don't matter. */
export function parseEmployeeCsv(text: string): CsvParseResult {
  const rows = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(splitCsvLine)
  return parseEmployeeRows(rows)
}

/**
 * The shared core behind both the CSV and the `.xlsx` import: given rows that
 * are already split into cells, it detects the `name`/`team` header and reads
 * each row off it. Row-based so a spreadsheet reader feeds it the same shape a
 * CSV split produces.
 */
export function parseEmployeeRows(cellRows: string[][]): CsvParseResult {
  const rows = cellRows.filter((cells) => cells.some((cell) => cell.trim().length > 0))

  if (rows.length === 0) return { rows: [], errors: [{ kind: 'empty' }] }

  const header = rows[0]!.map((cell) => cell.trim().toLowerCase())
  const nameIdx = header.indexOf('name')
  const teamIdx = header.indexOf('team')
  if (nameIdx === -1 || teamIdx === -1) {
    return { rows: [], errors: [{ kind: 'noHeader' }] }
  }
  if (rows.length === 1) return { rows: [], errors: [{ kind: 'noRows' }] }

  const parsed: CsvRow[] = []
  const errors: CsvError[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!
    const name = (cells[nameIdx] ?? '').trim()
    const team = (cells[teamIdx] ?? '').trim()
    if (!name) {
      errors.push({ kind: 'missingName', line: i + 1 })
      continue
    }
    parsed.push({ name, team })
  }
  return { rows: parsed, errors }
}

/**
 * Renders parsed rows as the paste-box text both import surfaces share: one
 * person per line, `Name` or `Name, Team`. The inverse of `parsePastedRoster`.
 */
export function employeeRowsToLines(rows: CsvRow[]): string[] {
  return rows.map((r) => (r.team ? `${r.name}, ${r.team}` : r.name))
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

/**
 * The People step's paste box: one person per line, `Name` or `Name, Team`
 * (tab also splits, so a two-column spreadsheet range pastes straight in).
 * A lone `name, team` header line from a copied sheet is dropped; anything
 * else is taken at face value.
 */
export function parsePastedRoster(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  for (const line of text.split(/\r\n|\r|\n/)) {
    const cells = line.split(/[,\t]/).map((c) => c.trim())
    const name = cells[0] ?? ''
    const team = cells[1] ?? ''
    if (!name) continue
    rows.push({ name, team })
  }
  const first = rows[0]
  if (first && first.name.toLowerCase() === 'name' && first.team.toLowerCase() === 'team') rows.shift()
  return rows
}
