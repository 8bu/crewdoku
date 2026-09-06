/**
 * Fairness totals for the board's pinned-right columns (ticket 08). Pure and
 * framework-free, like coverage.ts/violations.ts — rolls up the *current*
 * view of every assignment (base schedule plus overrides) per person over the
 * whole period, so a hand-edit updates a total the same render it updates the
 * cell (same live-off-overrides pattern as ticket 06/07).
 *
 * Hours used to be a flat 8-per-shift, and the cap an unconditional 40h/week
 * — both illustrative placeholders ticket 15 replaced with the real shift
 * catalog's per-code duration and Settings' real H2 cap
 * (`state/solveSettings.ts`).
 */

import type { Assignment, BoardDate, Person, ShiftDef } from './mockBoard'
import { shiftDurationHours } from './shiftDuration'

export type FairnessRow = {
  personId: string
  hours: number
  nights: number
  weekends: number
}

export type FairnessTotals = {
  byPerson: Map<string, FairnessRow>
  /** `maxHoursPerWeek` scaled to the period's length. */
  hoursCap: number
  /** Highest `hours` total in the period. Ties all read as the outlier. */
  maxHours: number
}

export function computeFairness(
  people: Person[],
  dates: BoardDate[],
  getAssignment: (personId: string, dateIso: string) => Assignment,
  shifts: ShiftDef[],
  maxHoursPerWeek: number,
): FairnessTotals {
  const nightCodes = new Set(shifts.filter((s) => s.isNight).map((s) => s.code))
  const byPerson = new Map<string, FairnessRow>()
  let maxHours = 0

  for (const person of people) {
    let hours = 0
    let nights = 0
    let weekends = 0
    for (const date of dates) {
      const { code } = getAssignment(person.id, date.iso)
      if (code === 'OFF') continue
      hours += shiftDurationHours(shifts, code)
      if (nightCodes.has(code)) nights++
      if (date.isWeekend) weekends++
    }
    byPerson.set(person.id, { personId: person.id, hours, nights, weekends })
    if (hours > maxHours) maxHours = hours
  }

  const weeks = dates.length / 7
  const hoursCap = Math.round(weeks * maxHoursPerWeek)

  return { byPerson, hoursCap, maxHours }
}
