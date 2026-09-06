/**
 * Schedule export builders (wayfinder ticket 18) — the live schedule for the
 * active period as row matrices, serialized to CSV or handed to the XLSX
 * writer. One source of truth: `buildGridRows`/`buildPersonRows` feed both
 * formats, so a CSV and an XLSX of the same range can never disagree.
 *
 * Pure and framework-free like `coverage/coverageData.ts`, and fed the same live
 * inputs the board reads (roster, teams, shifts, range-filtered dates, and a
 * `getAssignment` resolver).
 *
 * The grid export deliberately mirrors `parseScheduleCsv`'s import format so an
 * exported grid can be re-imported into another period (ticket 18).
 */

import type { Assignment, BoardDate, Person, ShiftDef, Team } from '../board/mockBoard'
import { activeRoster } from '../board/roster/rosterOps'
import { shiftDurationHours } from '../board/shiftDuration'

export type ExportInputs = {
  people: Person[] // full roster; builders filter to activeRoster() and order by team internally
  teams: Team[]
  shifts: ShiftDef[]
  dates: BoardDate[] // already range-filtered by the caller
  getAssignment: (personId: string, dateIso: string) => Assignment
}

/** One cell of an export row — numbers stay numeric so XLSX gets real number cells. */
export type ExportCell = string | number

/** RFC 4180 CSV cell escaping: quote fields containing commas, double quotes, or newlines. */
function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

type OrderedPerson = {
  person: Person
  teamName: string
}

/**
 * Filter active people and group by teams array order, with unresolved-team members last.
 * Mirrors the grouping logic in `Roster.tsx` (ticket 18).
 */
function getOrderedPeople(people: Person[], teams: Team[]): OrderedPerson[] {
  const active = activeRoster(people)
  const known = new Set(teams.map((t) => t.id))
  const result: OrderedPerson[] = []

  for (const team of teams) {
    for (const person of active) {
      if (person.teamId === team.id) {
        result.push({ person, teamName: team.name })
      }
    }
  }

  for (const person of active) {
    if (!known.has(person.teamId)) {
      result.push({ person, teamName: '' })
    }
  }

  return result
}

function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  if (hhmm.length === 4) {
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
  }
  return hhmm
}

/** Grid rows: header `name,team,<ISO date>,...`; one row per active person; blank cell = OFF. */
export function buildGridRows(inputs: ExportInputs): string[][] {
  const header = ['name', 'team', ...inputs.dates.map((d) => d.iso)]
  const ordered = getOrderedPeople(inputs.people, inputs.teams)

  const rows = ordered.map(({ person, teamName }) => {
    const dateCells = inputs.dates.map((date) => {
      const assignment = inputs.getAssignment(person.id, date.iso)
      return assignment.code === 'OFF' ? '' : assignment.code
    })
    return [person.name, teamName, ...dateCells]
  })

  return [header, ...rows]
}

/** Per-person rows: header `name,team,date,shift,start,end,hours`; one row per person × non-OFF day. */
export function buildPersonRows(inputs: ExportInputs): ExportCell[][] {
  const header = ['name', 'team', 'date', 'shift', 'start', 'end', 'hours']
  const ordered = getOrderedPeople(inputs.people, inputs.teams)
  const rows: ExportCell[][] = [header]

  for (const { person, teamName } of ordered) {
    for (const date of inputs.dates) {
      const assignment = inputs.getAssignment(person.id, date.iso)
      if (assignment.code === 'OFF') continue

      const shiftDef = inputs.shifts.find((s) => s.code === assignment.code)
      const rawStart = assignment.start ?? shiftDef?.start ?? null
      const rawEnd = assignment.end ?? shiftDef?.end ?? null

      const hours = shiftDurationHours(inputs.shifts, assignment.code)

      rows.push([
        person.name,
        teamName,
        date.iso,
        assignment.code,
        formatTime(rawStart),
        formatTime(rawEnd),
        Math.round(hours * 100) / 100,
      ])
    }
  }

  return rows
}

function rowsToCsv(rows: ExportCell[][]): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(',')).join('\n') + '\n'
}

/** Grid CSV — `buildGridRows` serialized with RFC 4180 escaping. */
export function buildGridCsv(inputs: ExportInputs): string {
  return rowsToCsv(buildGridRows(inputs))
}

/** Per-person CSV — `buildPersonRows` serialized with RFC 4180 escaping. */
export function buildPersonCsv(inputs: ExportInputs): string {
  return rowsToCsv(buildPersonRows(inputs))
}

/**
 * Formats an export file name with slugified period label: `crewdoku-<label-slug>-<kind>.<ext>`.
 * Kind is free-form (e.g. template ids like `team-grid`, `board`, `person-list`, `coverage-pivot`).
 */
export function exportFileName(periodLabel: string, kind: string, ext: string = 'csv'): string {
  const slug = periodLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const finalSlug = slug.length > 0 ? slug : 'period'
  return `crewdoku-${finalSlug}-${kind}.${ext}`
}
