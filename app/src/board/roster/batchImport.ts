/**
 * All-in-one batch import (wayfinder ticket 24) — one `.xlsx` workbook whose
 * People sheet carries a person's team, preferences and recurring days off,
 * with a separate TimeOff sheet for dated days off (one row per person per
 * date, joined back by name) and an optional Teams sheet for team-level
 * preferences. Replaces the CSV import's single flat `name,team` table while
 * keeping that import's split: parsing and applying are both pure and apart
 * from the screen that drives it, the same way `csvImport.ts` stays apart from
 * `ImportStep.tsx`.
 *
 * `parseWorkbook` takes the sheet name -> trimmed string cell rows map
 * `xlsxImport.ts`'s `readWorkbookSheets` produces and turns it into rows plus
 * row-level warnings, adding no knowledge of the live shift catalog. Codes and
 * dates are validated by `applyBatchImport`, which is the only function handed
 * a `ShiftDef[]` — the same division `applyScheduleImport` settles on, so a
 * workbook parsed against a stale Shifts sheet still resolves against the
 * current catalog. The `Shifts` sheet itself is reference-only and never read.
 */
import { OFF_CODE, type Person, type ShiftCode, type ShiftDef, type Team } from '@crewdoku/domain'
import { addPerson, setPersonName, setPersonTeam } from './rosterOps'
import { addTeam } from './teamOps'

export type TeamImportRow = { name: string; wants?: string[]; avoids?: string[] }
export type PersonImportRow = {
  name: string
  team?: string
  ineligible?: string[]
  wants?: string[]
  avoids?: string[]
  useTeamPreference?: boolean
  recurringOff?: number[]
}
export type TimeOffImportRow = { person: string; date: string }
export type BatchImportError =
  | { kind: 'noSheets' }
  | { kind: 'noPeopleOrTeams' }
  | { kind: 'missingNameHeader'; sheet: string }
  | { kind: 'unreadable' }
export type BatchImportWarning =
  | { kind: 'unknownCode'; sheet: string; row: number; code: string }
  | { kind: 'badDate'; row: number; value: string }
  | { kind: 'badWeekday'; row: number; value: string }
  | { kind: 'teamAutoCreated'; name: string }
  | { kind: 'unknownPerson'; sheet: string; row: number; name: string }
export type BatchImportParse = {
  teams: TeamImportRow[]
  people: PersonImportRow[]
  timeOff: TimeOffImportRow[]
  errors: BatchImportError[]
  warnings: BatchImportWarning[]
}
export type BatchImportCounts = {
  teamsCreated: number
  teamsUpdated: number
  teamsAutoCreated: number
  peopleAdded: number
}
export type BatchImportResult = {
  people: Person[]
  teams: Team[]
  warnings: BatchImportWarning[]
  counts: BatchImportCounts
}

/**
 * 1-based spreadsheet row (header = row 1) each parsed row came from, keyed by
 * the row object `parseWorkbook` built. The row types stay exactly the shape
 * callers consume — no bookkeeping field leaks into them — while
 * `applyBatchImport` still names the row in its warnings. A `WeakMap` so the
 * numbers never outlive the rows; `0` means the row was built by hand rather
 * than parsed (only tests do that, and none of them assert a row number).
 */
const sourceRowByRow = new WeakMap<object, number>()

/** Where a sheet's data starts and what its columns are called. */
type SheetLayout = { headerIndex: number; nameIndex: number; header: string[] }

/**
 * The header row is the first row with anything in it — a stray blank line
 * above it is common in hand-made workbooks — and every header cell is
 * trimmed and lowercased so `Team`/`TEAM`/`team` name the same column.
 * `undefined` when the sheet is empty or has no `name` column: both are the
 * one thing the caller can report and skip on, apart from each other.
 */
function readSheetLayout(rows: string[][]): SheetLayout | undefined {
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => cell.trim().length > 0))
  if (headerIndex === -1) return undefined
  const header = (rows[headerIndex] ?? []).map((cell) => cell.trim().toLowerCase())
  const nameIndex = header.indexOf('name')
  if (nameIndex === -1) return undefined
  return { headerIndex, nameIndex, header }
}

/** A cell at `index`, or `''` when the column is absent (`-1`) or the row is short. */
function cellAt(cells: string[], index: number): string {
  return index === -1 ? '' : (cells[index] ?? '').trim()
}

/** One cell often carries several tokens; comma, semicolon and whitespace all separate them. */
function splitList(cell: string): string[] {
  return cell.split(/[\s,;]+/).filter((token) => token.length > 0)
}

/**
 * `yes/y/true/1/x/✓` and `no/n/false/0`, case-insensitive. Blank (and anything
 * unrecognised) stays `undefined` rather than guessing — `applyBatchImport`
 * then defaults it from whether the person has preferences of their own.
 */
function parseBoolean(cell: string): boolean | undefined {
  const value = cell.trim().toLowerCase()
  if (value === 'yes' || value === 'y' || value === 'true' || value === '1' || value === 'x' || value === '✓') {
    return true
  }
  if (value === 'no' || value === 'n' || value === 'false' || value === '0') return false
  return undefined
}

const WEEKDAY_BY_TOKEN: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

/** Weekday token (`mon`/`monday`/`1`) to 0 Sun .. 6 Sat; `undefined` for anything else. */
function parseWeekday(token: string): number | undefined {
  const value = token.trim().toLowerCase()
  if (/^[0-6]$/.test(value)) return Number(value)
  return WEEKDAY_BY_TOKEN[value]
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
 * The workbook key whose name matches one of `wanted` (case-insensitive), in
 * `wanted`'s preference order so a workbook carrying both `People` and
 * `Roster` resolves the same way every time. `undefined` when none is present.
 */
function findSheetName(sheets: Record<string, string[][]>, wanted: string[]): string | undefined {
  const keys = Object.keys(sheets)
  for (const name of wanted) {
    const key = keys.find((candidate) => candidate.trim().toLowerCase() === name)
    if (key !== undefined) return key
  }
  return undefined
}

/**
 * Turns a workbook's sheets into import rows. Sheet names (`Teams`, `People`
 * or its `Roster` alias, and `TimeOff` or `Time off`) and header names are
 * matched case-insensitively; a recognized sheet without a `name` column is
 * reported and skipped on its own, so a good People sheet still imports beside
 * a mis-labelled Teams one. Rows with a blank name are skipped silently (the
 * workbook's own spacing, not a bad value); a warning's `row` is the real
 * 1-based spreadsheet row it came from.
 *
 * The TimeOff sheet is the exception to the `name` rule — its person column is
 * `person` (falling back to `name`), because that sheet names people rather
 * than defining them — and is skipped without an error when it has neither,
 * since a valid People/Teams workbook must still import.
 *
 * Nothing here validates codes, dates or team names against live data: those
 * need `applyBatchImport`'s shift catalog and roster, so the cells stay raw.
 * Weekdays are the exception — `recurringOff` carries numbers, not tokens, in
 * `PersonImportRow`, so token parsing happens here and junk is dropped with a
 * `badWeekday` warning.
 */
export function parseWorkbook(sheets: Record<string, string[][]>): BatchImportParse {
  const teamsSheetName = findSheetName(sheets, ['teams'])
  const peopleSheetName = findSheetName(sheets, ['people', 'roster'])

  if (teamsSheetName === undefined && peopleSheetName === undefined) {
    const errors: BatchImportError[] =
      Object.keys(sheets).length === 0 ? [{ kind: 'noSheets' }] : [{ kind: 'noPeopleOrTeams' }]
    return { teams: [], people: [], timeOff: [], errors, warnings: [] }
  }

  const teams: TeamImportRow[] = []
  const people: PersonImportRow[] = []
  const timeOff: TimeOffImportRow[] = []
  const errors: BatchImportError[] = []
  const warnings: BatchImportWarning[] = []

  if (teamsSheetName !== undefined) {
    const rows = sheets[teamsSheetName] ?? []
    const layout = readSheetLayout(rows)
    if (layout === undefined) {
      errors.push({ kind: 'missingNameHeader', sheet: 'Teams' })
    } else {
      const wantsIndex = layout.header.indexOf('wants')
      const avoidsIndex = layout.header.indexOf('avoids')
      for (let i = layout.headerIndex + 1; i < rows.length; i++) {
        const cells = rows[i]!
        if (cells.every((cell) => cell.trim().length === 0)) continue
        const name = cellAt(cells, layout.nameIndex)
        if (!name) continue

        const row: TeamImportRow = { name }
        const wants = splitList(cellAt(cells, wantsIndex))
        if (wants.length > 0) row.wants = wants
        const avoids = splitList(cellAt(cells, avoidsIndex))
        if (avoids.length > 0) row.avoids = avoids
        sourceRowByRow.set(row, i + 1)
        teams.push(row)
      }
    }
  }

  if (peopleSheetName !== undefined) {
    const rows = sheets[peopleSheetName] ?? []
    const layout = readSheetLayout(rows)
    if (layout === undefined) {
      errors.push({ kind: 'missingNameHeader', sheet: 'People' })
    } else {
      const teamIndex = layout.header.indexOf('team')
      const ineligibleIndex = layout.header.indexOf('ineligible')
      const wantsIndex = layout.header.indexOf('wants')
      const avoidsIndex = layout.header.indexOf('avoids')
      const useTeamPreferenceIndex = layout.header.indexOf('useteampreference')
      const recurringOffIndex = layout.header.indexOf('recurringoff')

      for (let i = layout.headerIndex + 1; i < rows.length; i++) {
        const cells = rows[i]!
        if (cells.every((cell) => cell.trim().length === 0)) continue
        const name = cellAt(cells, layout.nameIndex)
        if (!name) continue

        const row: PersonImportRow = { name }
        const team = cellAt(cells, teamIndex)
        if (team) row.team = team

        const ineligible = splitList(cellAt(cells, ineligibleIndex))
        if (ineligible.length > 0) row.ineligible = ineligible
        const wants = splitList(cellAt(cells, wantsIndex))
        if (wants.length > 0) row.wants = wants
        const avoids = splitList(cellAt(cells, avoidsIndex))
        if (avoids.length > 0) row.avoids = avoids

        const useTeamPreference = parseBoolean(cellAt(cells, useTeamPreferenceIndex))
        if (useTeamPreference !== undefined) row.useTeamPreference = useTeamPreference

        const weekdayTokens = splitList(cellAt(cells, recurringOffIndex))
        if (weekdayTokens.length > 0) {
          const recurringOff: number[] = []
          for (const token of weekdayTokens) {
            const weekday = parseWeekday(token)
            if (weekday === undefined) {
              warnings.push({ kind: 'badWeekday', row: i + 1, value: token })
              continue
            }
            if (!recurringOff.includes(weekday)) recurringOff.push(weekday)
          }
          if (recurringOff.length > 0) row.recurringOff = recurringOff
        }

        sourceRowByRow.set(row, i + 1)
        people.push(row)
      }
    }
  }

  const timeOffSheetName = findSheetName(sheets, ['timeoff', 'time off'])
  if (timeOffSheetName !== undefined) {
    const rows = sheets[timeOffSheetName] ?? []
    const headerIndex = rows.findIndex((cells) => cells.some((cell) => cell.trim().length > 0))
    if (headerIndex !== -1) {
      const header = (rows[headerIndex] ?? []).map((cell) => cell.trim().toLowerCase())
      const namedPersonIndex = header.indexOf('person')
      const personIndex = namedPersonIndex === -1 ? header.indexOf('name') : namedPersonIndex
      const dateIndex = header.indexOf('date')
      if (personIndex !== -1) {
        for (let i = headerIndex + 1; i < rows.length; i++) {
          const cells = rows[i]!
          if (cells.every((cell) => cell.trim().length === 0)) continue
          const person = cellAt(cells, personIndex)
          if (!person) continue

          const row: TimeOffImportRow = { person, date: cellAt(cells, dateIndex) }
          sourceRowByRow.set(row, i + 1)
          timeOff.push(row)
        }
      }
    }
  }

  return { teams, people, timeOff, errors, warnings }
}

/** `unknownCode` warnings are per row and code — the same junk token beside two people is two warnings, twice in one row is one. */
function warningKey(warning: BatchImportWarning): string {
  switch (warning.kind) {
    case 'unknownCode':
      return `${warning.kind}|${warning.sheet}|${warning.row}|${warning.code.toLowerCase()}`
    case 'badDate':
    case 'badWeekday':
      return `${warning.kind}|${warning.row}|${warning.value.toLowerCase()}`
    case 'teamAutoCreated':
      return `${warning.kind}|${warning.name.toLowerCase()}`
    case 'unknownPerson':
      return `${warning.kind}|${warning.sheet}|${warning.row}|${warning.name.toLowerCase()}`
  }
}

/** Catalog-cased codes for a row's tokens, warning on and dropping every token the live catalog doesn't have. `undefined` when the sheet left the side out entirely. */
function resolveCodes(
  tokens: string[] | undefined,
  sheet: string,
  row: number,
  catalog: Map<string, ShiftCode>,
  warn: (warning: BatchImportWarning) => void,
): ShiftCode[] | undefined {
  if (tokens === undefined) return undefined
  const codes: ShiftCode[] = []
  for (const token of tokens) {
    const code = catalog.get(token.toUpperCase())
    if (code === undefined) {
      warn({ kind: 'unknownCode', sheet, row, code: token })
      continue
    }
    if (!codes.includes(code)) codes.push(code)
  }
  return codes
}

/** Replaces only the sides that carried real codes — a blank (or fully invalid) cell leaves that side of the team's preference alone. */
function setTeamPreferences(
  teams: Team[],
  teamId: string,
  wants: ShiftCode[] | undefined,
  avoids: ShiftCode[] | undefined,
): Team[] {
  return teams.map((team) => {
    if (team.id !== teamId) return team
    return {
      ...team,
      wants: wants !== undefined && wants.length > 0 ? wants : team.wants,
      avoids: avoids !== undefined && avoids.length > 0 ? avoids : team.avoids,
    }
  })
}

/** The import's optional person fields in one pass — `rosterOps` covers name and team, this covers the rest. */
function setPersonFields(people: Person[], personId: string, patch: Partial<Person>): Person[] {
  return people.map((person) => (person.id === personId ? { ...person, ...patch } : person))
}

/**
 * Applies a parsed workbook on top of whatever roster and teams already exist.
 * Teams land first so a person's `team` cell resolves against the Teams
 * sheet's own teams (and, failing that, against an existing team) before a new
 * one is auto-created; every created team is counted and warned about, and the
 * team is live for later rows, so a team named by ten people is created once.
 *
 * People always append — never matched by name the way `applyScheduleImport`
 * reconciles, because a batch roster import may legitimately hold two people
 * with the same name and has no id or date to key off. `recurringOff` numbers
 * come pre-parsed from `parseWorkbook`; codes are matched against `shifts`
 * case-insensitively and stored in the catalog's own casing, and `OFF` is
 * never a preference or an ineligibility, only a day off.
 *
 * The TimeOff sheet's rows arrive as `(person, date)` pairs and are applied
 * after the people loop, so they can join to the people this import just added
 * by name (case-insensitive, trimmed, first match wins); a row naming nobody
 * in that batch gets an `unknownPerson` warning rather than creating a person,
 * since the sheet only annotates people and never defines them.
 */
export function applyBatchImport(
  people: Person[],
  teams: Team[],
  shifts: ShiftDef[],
  parse: BatchImportParse,
): BatchImportResult {
  const catalog = new Map<string, ShiftCode>()
  for (const shift of shifts) {
    if (shift.code === OFF_CODE) continue
    catalog.set(shift.code.toUpperCase(), shift.code)
  }

  const warnings: BatchImportWarning[] = [...parse.warnings]
  const seenWarnings = new Set(warnings.map(warningKey))
  const warn = (warning: BatchImportWarning): void => {
    const key = warningKey(warning)
    if (seenWarnings.has(key)) return
    seenWarnings.add(key)
    warnings.push(warning)
  }

  let nextTeams = teams
  let teamsCreated = 0
  let teamsUpdated = 0

  for (const row of parse.teams) {
    const rowNumber = sourceRowByRow.get(row) ?? 0
    const wants = resolveCodes(row.wants, 'Teams', rowNumber, catalog, warn)
    const avoids = resolveCodes(row.avoids, 'Teams', rowNumber, catalog, warn)

    const existing = nextTeams.find((team) => team.name.trim().toLowerCase() === row.name.toLowerCase())
    if (existing === undefined) {
      nextTeams = addTeam(nextTeams, row.name)
      const created = nextTeams[nextTeams.length - 1]!
      nextTeams = setTeamPreferences(nextTeams, created.id, wants, avoids)
      teamsCreated++
    } else {
      nextTeams = setTeamPreferences(nextTeams, existing.id, wants, avoids)
      teamsUpdated++
    }
  }

  let nextPeople = people
  let teamsAutoCreated = 0
  let peopleAdded = 0
  const addedPersonIdByName = new Map<string, string>()

  for (const row of parse.people) {
    const rowNumber = sourceRowByRow.get(row) ?? 0
    nextPeople = addPerson(nextPeople)
    const added = nextPeople[nextPeople.length - 1]!
    nextPeople = setPersonName(nextPeople, added.id, row.name)
    const normalizedName = row.name.trim().toLowerCase()
    if (!addedPersonIdByName.has(normalizedName)) addedPersonIdByName.set(normalizedName, added.id)

    if (row.team !== undefined) {
      const teamName = row.team.trim()
      if (teamName) {
        let team = nextTeams.find((t) => t.name.trim().toLowerCase() === teamName.toLowerCase())
        if (team === undefined) {
          nextTeams = addTeam(nextTeams, teamName)
          team = nextTeams[nextTeams.length - 1]!
          warn({ kind: 'teamAutoCreated', name: teamName })
          teamsAutoCreated++
        }
        nextPeople = setPersonTeam(nextPeople, added.id, team.id)
      }
    }

    const ineligible = resolveCodes(row.ineligible, 'People', rowNumber, catalog, warn) ?? []
    const wants = resolveCodes(row.wants, 'People', rowNumber, catalog, warn) ?? []
    const avoids = resolveCodes(row.avoids, 'People', rowNumber, catalog, warn) ?? []

    const recurringOff = [...new Set(row.recurringOff ?? [])].sort((a, b) => a - b)

    const patch: Partial<Person> = {
      // Nobody said either way: a person with no preference of their own
      // reads the team's, one who named a want/avoid means it.
      useTeamPreference: row.useTeamPreference ?? (wants.length === 0 && avoids.length === 0),
    }
    if (ineligible.length > 0) patch.ineligible = ineligible
    if (recurringOff.length > 0) patch.recurringOff = recurringOff
    if (wants.length > 0) patch.wants = wants
    if (avoids.length > 0) patch.avoids = avoids
    nextPeople = setPersonFields(nextPeople, added.id, patch)
    peopleAdded++
  }

  const timeOffByPerson = new Map<string, string[]>()
  for (const row of parse.timeOff) {
    const rowNumber = sourceRowByRow.get(row) ?? 0
    const personId = addedPersonIdByName.get(row.person.trim().toLowerCase())
    if (personId === undefined) {
      warn({ kind: 'unknownPerson', sheet: 'TimeOff', row: rowNumber, name: row.person })
      continue
    }
    if (!isValidIsoDate(row.date)) {
      warn({ kind: 'badDate', row: rowNumber, value: row.date })
      continue
    }
    const dates = timeOffByPerson.get(personId) ?? []
    if (!dates.includes(row.date)) {
      dates.push(row.date)
      timeOffByPerson.set(personId, dates)
    }
  }
  for (const [personId, dates] of timeOffByPerson) {
    nextPeople = setPersonFields(nextPeople, personId, { timeOff: dates })
  }

  return {
    people: nextPeople,
    teams: nextTeams,
    warnings,
    counts: { teamsCreated, teamsUpdated, teamsAutoCreated, peopleAdded },
  }
}
