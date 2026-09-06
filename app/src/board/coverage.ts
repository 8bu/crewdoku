/**
 * Coverage detection for the board (ticket 06, rebuilt on ticket 15's real
 * table). Pure and framework-free, like `violations.ts` — scans the
 * *current* view of every assignment (base schedule plus overrides) and
 * rolls it up into a filled-vs-needed count per shift per day, plus a
 * per-day worst-of status for the header bar.
 *
 * Min/max used to be computed from team count (one person per team, double
 * that as the ceiling) — ticket 15 replaced that placeholder with a real
 * authored table (`state/coverageRules.ts`), so this module now takes the
 * live shift catalog and that table instead of a bare `teamCount`.
 */

import { coverageBandFor, type Assignment, type CoverageTable, type Person, type ShiftDef } from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'
import { isEligible } from './eligibility'

export type CoverageStatus = 'short' | 'ok' | 'over'

export type ShiftCoverage = {
  shift: string
  count: number
  min: number
  max: number
  status: CoverageStatus
}

export type DayCoverage = {
  dateIso: string
  /** Worst of the day's shifts: short beats over beats ok. */
  status: CoverageStatus
  shifts: ShiftCoverage[]
}

function statusOf(count: number, min: number, max: number): CoverageStatus {
  if (count < min) return 'short'
  if (count > max) return 'over'
  return 'ok'
}

function worstOf(shifts: ShiftCoverage[]): CoverageStatus {
  if (shifts.some((s) => s.status === 'short')) return 'short'
  if (shifts.some((s) => s.status === 'over')) return 'over'
  return 'ok'
}

export function computeCoverage(
  people: Person[],
  dates: BoardDate[],
  shifts: ShiftDef[],
  table: CoverageTable,
  getAssignment: (personId: string, dateIso: string) => Assignment,
): Map<string, DayCoverage> {
  const byDate = new Map<string, DayCoverage>()

  for (const date of dates) {
    const counts: Record<string, number> = Object.fromEntries(shifts.map((s) => [s.code, 0]))
    for (const person of people) {
      const code = getAssignment(person.id, date.iso).code
      if (code in counts) counts[code]!++
    }
    const shiftCoverages = shifts.map((s) => {
      const band = coverageBandFor(table, s.code, date.iso, date.weekday)
      const count = counts[s.code]!
      return { shift: s.code, count, min: band.min, max: band.max, status: statusOf(count, band.min, band.max) }
    })
    byDate.set(date.iso, { dateIso: date.iso, status: worstOf(shiftCoverages), shifts: shiftCoverages })
  }
  return byDate
}

/** Eligible for the shift and not already working that day — the drill-down's "could fix it" set. */
export function eligibleFreePeople(
  people: Person[],
  dateIso: string,
  shiftCode: string,
  getAssignment: (personId: string, dateIso: string) => Assignment,
): Person[] {
  return people.filter((p) => isEligible(p, shiftCode) && getAssignment(p.id, dateIso).code === 'OFF')
}
