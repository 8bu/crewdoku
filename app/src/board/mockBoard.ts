/**
 * Board-data scaffolding: the display-only calendar column (`BoardDate`) and
 * the board frame (`BoardData`) the domain does not own, plus the empty
 * starting points a real period boots from. The mock roster generator that
 * once seeded the board (wayfinder ticket 04) is gone — the roster is
 * workspace-global (onboarding + persistence) and a period's schedule is
 * filled by Generate or a per-period import, never mock data (app ticket 05).
 *
 * (The filename is legacy; nothing here is mock any more.)
 */

import {
  UNASSIGNED_TEAM_ID,
  assignmentKey,
  type Assignment,
  type Person,
  type Team,
} from '@crewdoku/domain'

/**
 * Not every person is on a team — a new hire before staffing, someone between
 * assignments. `teamId` holds this sentinel rather than a real `Team.id` in
 * that case. Board/Roster/Teams all render it as a plain "Unassigned" bucket.
 */
export const UNASSIGNED_TEAM: Team = { id: UNASSIGNED_TEAM_ID, name: 'Unassigned', wants: [], avoids: [] }

/** A calendar column of the board — display fields the domain does not own. */
export type BoardDate = {
  iso: string
  weekday: number // 0 Sun .. 6 Sat
  dayOfMonth: number
  monthShort: string
  isWeekend: boolean
  isMonday: boolean
  weekIndex: number
  holidayName: string | null
}

export type BoardData = {
  teams: Team[]
  people: Person[]
  dates: BoardDate[]
  assignments: Map<string, Assignment>
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// Holiday offsets are indices into the date range, not real calendar dates —
// the range shifts with the selected period.
const HOLIDAY_OFFSETS: Record<number, string> = {
  3: 'Founders Day',
  24: 'Regional Holiday',
}

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y: y!, m: m!, d: d! }
}

function addDaysISO(iso: string, days: number): string {
  const { y, m, d } = parseISO(iso)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

function weekdayOf(iso: string): number {
  const { y, m, d } = parseISO(iso)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function buildDates(periodStart: string, numDates: number): BoardDate[] {
  const dates: BoardDate[] = []
  let weekIndex = -1
  for (let i = 0; i < numDates; i++) {
    const iso = addDaysISO(periodStart, i)
    const { m, d } = parseISO(iso)
    const weekday = weekdayOf(iso)
    const isMonday = weekday === 1
    if (isMonday || i === 0) weekIndex++
    dates.push({
      iso,
      weekday,
      dayOfMonth: d,
      monthShort: MONTH_SHORT[m - 1]!,
      isWeekend: weekday === 0 || weekday === 6,
      isMonday,
      weekIndex,
      holidayName: HOLIDAY_OFFSETS[i] ?? null,
    })
  }
  return dates
}

/**
 * A complete all-OFF matrix for a roster over a date range — every
 * person × date cell defaults to OFF. Used where a view needs a dense board
 * before any real schedule exists (e.g. the /coverage pivot).
 */
export function emptyAssignments(people: Person[], dates: BoardDate[]): Map<string, Assignment> {
  const assignments = new Map<string, Assignment>()
  for (const person of people) {
    for (const date of dates) {
      assignments.set(assignmentKey(person.id, date.iso), {
        code: 'OFF',
        start: null,
        end: null,
        pinned: false,
        ineligible: false,
      })
    }
  }
  return assignments
}

/**
 * A brand-new period's starting point (ticket 17/14): real calendar dates,
 * no teams, no people, no assignments — onboarding or a per-period import is
 * what populates a period like this.
 */
export function emptyBoardData(periodStart: string, numDates: number): BoardData {
  return { teams: [], people: [], dates: buildDates(periodStart, numDates), assignments: new Map() }
}
