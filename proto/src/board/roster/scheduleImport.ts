/**
 * Schedule import (wayfinder ticket 21) — a manager's "we already have a
 * schedule" starting point, distinct from `csvImport.ts`'s roster-only
 * onboarding import. A row carries both who's on it and what they actually
 * worked, so applying it creates people/teams *and* assignments in one
 * shot and never touches the solver. Kept pure and apart from
 * `ScheduleImport.tsx` the same way `csvImport.ts` stays apart from
 * `ImportStep.tsx` — parsing and applying are both testable without a DOM.
 */
import { assignmentKey, OFF_CODE, type Assignment, type Person, type ShiftDef, type Team } from '../mockBoard'
import { addPerson, setPersonName, setPersonTeam } from './rosterOps'
import { addTeam } from './teamOps'

export type ScheduleCsvRow = { name: string; team: string; codesByDate: Record<string, string> }
export type ScheduleCsvParse = { rows: ScheduleCsvRow[]; dates: string[]; errors: string[] }

function splitCsvLine(line: string): string[] {
  // Same bare-comma-split + quote-strip as csvImport.ts's local helper —
  // duplicated rather than imported because that one is private to this
  // file's sibling and the two formats (name/team vs. name/team/dates)
  // shouldn't share a signature just to save four lines.
  return line.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1').trim())
}

/** Real calendar round-trip, not a regex — catches shapes like `2024-02-30` that a `\d{4}-\d{2}-\d{2}` pattern would wave through. */
function isValidIsoDate(cell: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cell)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const roundTripped = new Date(Date.UTC(year, month - 1, day))
  return (
    roundTripped.getUTCFullYear() === year &&
    roundTripped.getUTCMonth() === month - 1 &&
    roundTripped.getUTCDate() === day
  )
}

/**
 * Header is `name[,team],<date>,<date>,...` — at least one date column,
 * every date column a real `YYYY-MM-DD`, no repeats. Unlike
 * `parseEmployeeCsv`'s fixed two-column shape, the column count here
 * depends on how many dates the pasted schedule covers.
 */
export function parseScheduleCsv(text: string): ScheduleCsvParse {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return { rows: [], dates: [], errors: ['That file is empty.'] }

  const header = splitCsvLine(lines[0]!)
  if ((header[0] ?? '').toLowerCase() !== 'name') {
    return { rows: [], dates: [], errors: ['The first column must be a header named "name".'] }
  }

  const hasTeamCol = (header[1] ?? '').toLowerCase() === 'team'
  const dateStartIdx = hasTeamCol ? 2 : 1
  const dateCells = header.slice(dateStartIdx)

  if (dateCells.length === 0) {
    return { rows: [], dates: [], errors: ['The header needs at least one date column (YYYY-MM-DD).'] }
  }

  const dates: string[] = []
  const seenDates = new Set<string>()
  for (let i = 0; i < dateCells.length; i++) {
    const cell = dateCells[i]!
    const columnNumber = dateStartIdx + i + 1
    if (!isValidIsoDate(cell)) {
      return {
        rows: [],
        dates: [],
        errors: [`Column ${columnNumber} ("${cell}") is not a valid date (YYYY-MM-DD).`],
      }
    }
    if (seenDates.has(cell)) {
      return {
        rows: [],
        dates: [],
        errors: [`Column ${columnNumber} repeats date ${cell} — each date can only appear once.`],
      }
    }
    seenDates.add(cell)
    dates.push(cell)
  }

  if (lines.length === 1) return { rows: [], dates, errors: ['No schedule rows found below the header.'] }

  const rows: ScheduleCsvRow[] = []
  const errors: string[] = []
  const seenNames = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!)
    const name = cells[0] ?? ''
    if (!name) {
      errors.push(`Row ${i + 1}: missing a name — skipped.`)
      continue
    }

    const nameKey = name.toLowerCase()
    if (seenNames.has(nameKey)) {
      // A repeated name in a schedule import is ambiguous (which row's
      // codes win?) rather than merely sloppy — unlike a blank name, this
      // aborts the whole parse instead of skipping the offending row.
      return {
        rows: [],
        dates,
        errors: [`"${name}" appears more than once — each person should have one row.`],
      }
    }
    seenNames.add(nameKey)

    const team = hasTeamCol ? cells[1] ?? '' : ''
    const codesByDate: Record<string, string> = {}
    for (let d = 0; d < dates.length; d++) {
      const cell = cells[dateStartIdx + d] ?? ''
      if (cell) codesByDate[dates[d]!] = cell
    }
    rows.push({ name, team, codesByDate })
  }

  return { rows, dates, errors }
}

/**
 * Applies parsed rows on top of whatever roster already exists (ticket 21:
 * importing a schedule into an already-onboarded period must reconcile
 * against real people, unlike `applyCsvImport`'s always-empty-roster
 * onboarding case). A name matches an existing person case-insensitively
 * before a new one is created; team matching/creation mirrors
 * `applyCsvImport` exactly. Unknown shift codes abort the whole import
 * (returning the original `people`/`teams` untouched) since a half-applied
 * schedule would be worse than none — out-of-period dates are just noise
 * from a pasted export and get dropped with a warning instead.
 */
export function applyScheduleImport(
  rows: ScheduleCsvRow[],
  people: Person[],
  teams: Team[],
  shifts: ShiftDef[],
  periodDateIsos: string[],
): { people: Person[]; teams: Team[]; assignments: Map<string, Assignment>; errors: string[]; warnings: string[] } {
  const periodDates = new Set(periodDateIsos)
  const shiftTimes = new Map<string, readonly [string, string]>(
    shifts.map((s) => [s.code.toUpperCase(), [s.start, s.end] as const]),
  )
  const validCodes = new Set<string>([OFF_CODE, ...shiftTimes.keys()])

  const unknownCodes = new Set<string>()
  let outOfPeriodCount = 0
  const normalizedRows: { name: string; team: string; codes: Map<string, string> }[] = []

  for (const row of rows) {
    const codes = new Map<string, string>()
    for (const [date, rawCode] of Object.entries(row.codesByDate)) {
      if (!periodDates.has(date)) {
        outOfPeriodCount++
        continue
      }
      const code = rawCode.toUpperCase()
      if (!validCodes.has(code)) unknownCodes.add(code)
      codes.set(date, code)
    }
    normalizedRows.push({ name: row.name, team: row.team, codes })
  }

  if (unknownCodes.size > 0) {
    const list = [...unknownCodes].sort().join(', ')
    const plural = unknownCodes.size > 1
    return {
      people,
      teams,
      assignments: new Map(),
      errors: [
        `Unknown shift code${plural ? 's' : ''} ${list} — add ${plural ? 'them' : 'it'} under Settings → Shifts first.`,
      ],
      warnings: [],
    }
  }

  const warnings: string[] = []
  if (outOfPeriodCount > 0) {
    warnings.push(
      `${outOfPeriodCount} cell${outOfPeriodCount > 1 ? 's' : ''} fell outside the period and ${outOfPeriodCount > 1 ? 'were' : 'was'} skipped.`,
    )
  }

  let nextPeople = people
  let nextTeams = teams
  const personIdByRow: string[] = []

  for (const row of normalizedRows) {
    const existing = nextPeople.find((p) => p.name.toLowerCase() === row.name.toLowerCase())
    let personId: string
    if (existing) {
      personId = existing.id
    } else {
      nextPeople = addPerson(nextPeople)
      personId = nextPeople[nextPeople.length - 1]!.id
      nextPeople = setPersonName(nextPeople, personId, row.name)
    }

    if (row.team) {
      let team = nextTeams.find((t) => t.name.toLowerCase() === row.team.toLowerCase())
      if (!team) {
        nextTeams = addTeam(nextTeams, row.team)
        team = nextTeams[nextTeams.length - 1]!
      }
      nextPeople = setPersonTeam(nextPeople, personId, team.id)
    }

    personIdByRow.push(personId)
  }

  const codesByPersonId = new Map<string, Map<string, string>>()
  normalizedRows.forEach((row, i) => codesByPersonId.set(personIdByRow[i]!, row.codes))

  // Complete matrix, not just the imported cells: the board renders every
  // roster row for every period date, including people the pasted
  // schedule never mentioned (they simply read OFF, same as `emptyAssignments`).
  const assignments = new Map<string, Assignment>()
  for (const person of nextPeople) {
    const codes = codesByPersonId.get(person.id)
    for (const date of periodDateIsos) {
      const code = codes?.get(date) ?? OFF_CODE
      const times = code === OFF_CODE ? undefined : shiftTimes.get(code)
      const [start, end] = times ?? [null, null]
      assignments.set(assignmentKey(person.id, date), { code, start, end, pinned: false, ineligible: false })
    }
  }

  return { people: nextPeople, teams: nextTeams, assignments, errors: [], warnings }
}
