/**
 * Coverage view aggregation (ticket 21) — the pivot behind `/coverage`.
 *
 * Pure and framework-free like `board/coverage.ts`, and fed the same live
 * inputs the board reads (real roster, real shift catalog, ticket 15's
 * authored coverage table, and a `getAssignment` that layers hand-edit
 * overrides over the applied schedule), so the two views can never disagree.
 * This replaces the original mock (`generateBoardData` + a hardcoded
 * EARLY/MID/LATE/NIGHT row set) that shipped with the route before any of
 * that state existed.
 *
 * The scope decides whose assignments are counted. `all` counts everyone
 * against the org table. A team lens filters *counts only* — the requirement
 * table is org-wide, so a per-team status would cry "short" while the org is
 * fine; under a team lens every `status` is `null` and the UI shows plain
 * numbers.
 */

import { coverageBandFor, type Assignment, type CoverageTable, type Person, type ShiftDef } from '@crewdoku/domain'
import type { BoardDate } from '../board/mockBoard'
import type { CoverageStatus } from '../board/coverage'

/** Whose assignments a coverage view counts. */
export type CoverageScope = { kind: 'all' } | { kind: 'team'; id: string }

export type CoverageViewCell = {
  shift: ShiftDef
  date: BoardDate
  /** In-scope people assigned this shift on this date. */
  people: Person[]
  count: number
  min: number
  max: number
  /** `null` under a team lens — see the module comment. */
  status: CoverageStatus | null
}

export type CoverageViewRow = {
  shift: ShiftDef
  cells: CoverageViewCell[]
  /** Period margins for this shift's row (0 under a team lens). */
  shortDays: number
  overDays: number
}

export type CoverageDayTotal = {
  date: BoardDate
  /** In-scope people on any shift that day. */
  assigned: number
  /** Sum of the day's per-shift minimums. */
  minTotal: number
  /** Worst of the day's shifts: short beats over beats ok. `null` under a lens. */
  status: CoverageStatus | null
}

export type CoverageView = {
  rows: CoverageViewRow[]
  dayTotals: CoverageDayTotal[]
  /** Period headline (org scope only; 0 under a lens that suppresses status). */
  shortCells: number
  overCells: number
  /** True under a team lens, where statuses are suppressed. */
  scoped: boolean
}

function statusOf(count: number, min: number, max: number): CoverageStatus {
  if (count < min) return 'short'
  if (count > max) return 'over'
  return 'ok'
}

export function buildCoverageView(
  people: Person[],
  dates: BoardDate[],
  shifts: ShiftDef[],
  /** The org-wide requirement table to judge against. */
  table: CoverageTable,
  getAssignment: (personId: string, dateIso: string) => Assignment,
  scope: CoverageScope,
): CoverageView {
  // A team lens has no per-team requirement, so it reads as "counts only" —
  // never a false "short".
  const scoped = scope.kind === 'team'
  const inScope = scope.kind === 'all' ? people : people.filter((p) => p.teamId === scope.id)

  // One pass over people × dates, bucketed by shift code.
  const byShiftDate = new Map<string, Person[][]>()
  for (const shift of shifts) byShiftDate.set(shift.code, dates.map(() => []))
  const assignedPerDay: number[] = dates.map(() => 0)

  dates.forEach((date, dateIndex) => {
    for (const person of inScope) {
      const code = getAssignment(person.id, date.iso).code
      const bucket = byShiftDate.get(code)
      if (!bucket) continue
      bucket[dateIndex]!.push(person)
      assignedPerDay[dateIndex]!++
    }
  })

  let shortCells = 0
  let overCells = 0
  const rows: CoverageViewRow[] = shifts.map((shift) => {
    let shortDays = 0
    let overDays = 0
    const cells = dates.map((date, dateIndex) => {
      const cellPeople = byShiftDate.get(shift.code)![dateIndex]!
      const band = coverageBandFor(table, shift.code, date.iso, date.weekday)
      const status = scoped ? null : statusOf(cellPeople.length, band.min, band.max)
      if (status === 'short') {
        shortDays++
        shortCells++
      } else if (status === 'over') {
        overDays++
        overCells++
      }
      return { shift, date, people: cellPeople, count: cellPeople.length, min: band.min, max: band.max, status }
    })
    return { shift, cells, shortDays, overDays }
  })

  const dayTotals: CoverageDayTotal[] = dates.map((date, dateIndex) => {
    let minTotal = 0
    let worst: CoverageStatus | null = scoped ? null : 'ok'
    for (const row of rows) {
      const cell = row.cells[dateIndex]!
      minTotal += cell.min
      if (cell.status === 'short') worst = 'short'
      else if (cell.status === 'over' && worst !== 'short') worst = 'over'
    }
    return { date, assigned: assignedPerDay[dateIndex]!, minTotal, status: worst }
  })

  return { rows, dayTotals, shortCells, overCells, scoped }
}
