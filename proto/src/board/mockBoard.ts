/**
 * Mock roster data for the board frame (wayfinder ticket 04). No solver, no
 * persistence — a deterministic rotation so the grid has 100 x 42 real-looking
 * cells to scroll, fold and read. Replace when the real domain layer lands.
 */

import type { ShiftColorId } from './shiftColors'

/**
 * A shift's code (wayfinder ticket 15: the catalog is planner-editable, so
 * this is no longer a fixed literal union). `'OFF'` is the one reserved
 * value — always present, never a row in the editable catalog.
 */
export type ShiftCode = string

export const OFF_CODE = 'OFF' as const

/** One row of the editable shift catalog (ticket 15). */
export type ShiftDef = {
  code: string
  label: string
  /** `HHMM`, 24h clock. `end <= start` means the shift crosses midnight. */
  start: string
  end: string
  /** Counts toward the fairness "Nights" column (ticket 08) — a rename shouldn't silently stop counting. */
  isNight?: boolean
  /** Which curated swatch (`board/shiftColors.ts`) this shift renders in — identity-based, not positional, so a reorder or a 5th+ shift never reassigns or collides someone else's colour. Optional so old fixtures/tests without a colour still fall back cleanly. */
  color?: ShiftColorId
}

export type Team = {
  id: string
  name: string
  /** The team's default preference — a new hire starts here until they set their own. */
  wants: ShiftCode[]
  avoids: ShiftCode[]
}

/**
 * Not every person is on a team — a new hire before staffing, someone
 * between assignments. `teamId` holds this sentinel rather than a real
 * `Team.id` in that case; it is never a key into the roster's own team
 * list. Board/Roster/Teams all render it as a plain "Unassigned" bucket.
 */
export const UNASSIGNED_TEAM_ID = '__unassigned__'
export const UNASSIGNED_TEAM: Team = { id: UNASSIGNED_TEAM_ID, name: 'Unassigned', wants: [], avoids: [] }

export type Person = {
  id: string
  name: string
  /** A real `Team.id`, or `UNASSIGNED_TEAM_ID` — see the sentinel's own doc comment. */
  teamId: string
  rotationOffset: number
  /** Shift codes this person cannot legally work (e.g. no cert for NIGHT cover). */
  ineligible: ShiftCode[]
  /** Approved days off within the period, ISO dates. Optional: most people have none. */
  timeOff?: string[]
  /** Weekdays (0 Sun .. 6 Sat) this person is never scheduled, every week. */
  recurringOff?: number[]
  /** Shift codes this person has asked for more of. Ignored while `useTeamPreference` is true. */
  wants?: ShiftCode[]
  /** Shift codes this person has asked to avoid. Ignored while `useTeamPreference` is true. */
  avoids?: ShiftCode[]
  /** True: this person's preference is the team's default. False: `wants`/`avoids` above are their own. */
  useTeamPreference?: boolean
  /**
   * Soft-removed (ticket 16): hidden from the Roster table, excluded from
   * future solves, but never deleted — every other surface keeps showing
   * them (strikethrough + a "Removed" label) so their existing assignments
   * and history stay intact and honest, not silently erased.
   */
  removed?: boolean
}

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

export type Assignment = {
  code: ShiftCode
  start: string | null
  end: string | null
  /** Set once a planner hand-edits the cell. The solver may not overwrite a pinned cell. */
  pinned: boolean
  /** Set when a hand-edit assigns a code the person is not eligible for. Accepted, not blocked. */
  ineligible: boolean
}

/**
 * The canonical "not scheduled" cell, shared as a read-path fallback: any
 * render that looks up a person × date pair the schedule map hasn't been
 * backfilled with yet (a person added on Roster while a period already
 * holds an applied schedule) reads as OFF instead of crashing on a missing
 * key. Frozen and identity-stable so memoized consumers never re-fire.
 */
export const OFF_ASSIGNMENT: Assignment = Object.freeze({
  code: OFF_CODE,
  start: null,
  end: null,
  pinned: false,
  ineligible: false,
})

export type BoardData = {
  teams: Team[]
  people: Person[]
  dates: BoardDate[]
  assignments: Map<string, Assignment>
}

/**
 * The default catalog a new period seeds from (ticket 15) — same four codes
 * and times the prototype always shipped, now editable rather than fixed.
 * Kept here, not in `state/shifts.ts`, so it sits next to the other seed
 * data (`TEAM_NAMES`, `FIRST_NAMES`) this file already owns.
 */
export const DEFAULT_SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400', color: 'amber' },
  { code: 'MID', label: 'Mid', start: '1000', end: '1800', color: 'teal' },
  { code: 'LATE', label: 'Late', start: '1400', end: '2200', color: 'orange' },
  { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true, color: 'navy' },
]

/** Only for this file's own mock generation — everything live reads the real catalog (`state/shifts.ts`). */
const SHIFT_TIMES: Record<string, [string, string]> = Object.fromEntries(
  DEFAULT_SHIFTS.map((s) => [s.code, [s.start, s.end]]),
)
const SHIFT_ROTATION: ShiftCode[] = [...DEFAULT_SHIFTS.map((s) => s.code), OFF_CODE]

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const TEAM_NAMES = [
  'Team A', 'Team B', 'Team C', 'Team D',
  'Team E', 'Team F', 'Team G', 'Team H',
]

/** One default preference per team, hand-picked rather than a formula — only eight of them. */
const TEAM_PREFS: { wants: ShiftCode[]; avoids: ShiftCode[] }[] = [
  { wants: ['EARLY'], avoids: [] },
  { wants: [], avoids: ['NIGHT'] },
  { wants: ['LATE'], avoids: [] },
  { wants: [], avoids: [] },
  { wants: ['MID'], avoids: ['NIGHT'] },
  { wants: [], avoids: ['LATE'] },
  { wants: ['NIGHT'], avoids: [] },
  { wants: [], avoids: [] },
]

const FIRST_NAMES = [
  'Alex', 'Bao', 'Casey', 'Dara', 'Elin', 'Farah', 'Gio', 'Huy',
  'Ines', 'Jael', 'Kian', 'Lena', 'Minh', 'Nadia', 'Omar', 'Priya',
  'Quyen', 'Ravi', 'Sana', 'Toma',
]

const LAST_NAMES = [
  'Adler', 'Bui', 'Castillo', 'Doan', 'Eriksen', 'Farrow', 'Giang', 'Huynh',
  'Iyer', 'Jansen', 'Kowalski', 'Lam', 'Mercer', 'Nguyen', 'Osei', 'Pham',
  'Quach', 'Reyes', 'Sato', 'Tran',
]

// Holiday offsets are indices into the generated date range, not real
// calendar dates — the range shifts with the selected period.
const HOLIDAY_OFFSETS: Record<number, string> = {
  3: 'Founders Day',
  24: 'Regional Holiday',
}

export function assignmentKey(personId: string, iso: string): string {
  return `${personId}|${iso}`
}

/** Inclusive day count between two ISO dates — a period's real length, not the mock generator's default. */
export function periodLengthDays(start: string, end: string): number {
  const { y: y1, m: m1, d: d1 } = parseISO(start)
  const { y: y2, m: m2, d: d2 } = parseISO(end)
  const startMs = Date.UTC(y1, m1 - 1, d1)
  const endMs = Date.UTC(y2, m2 - 1, d2)
  return Math.round((endMs - startMs) / 86_400_000) + 1
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

const ROTATING_CODES: Exclude<ShiftCode, 'OFF'>[] = ['EARLY', 'MID', 'LATE', 'NIGHT']

function buildPeople(numPeople: number, teams: Team[], dates: BoardDate[]): Person[] {
  const people: Person[] = []
  for (let i = 0; i < numPeople; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!
    const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]!
    const team = teams[i % teams.length]!
    // Roughly one person in five is missing a cert for one shift — enough to
    // demo the "hand-edit assigns an ineligible code" path without a real rule engine.
    const ineligible: ShiftCode[] = i % 5 === 0 ? [SHIFT_ROTATION[(i + 2) % 4]!] : []
    // One person in six has already booked a couple of days off this period.
    const timeOff: string[] =
      i % 6 === 0 && dates.length > 20
        ? [dates[(i * 3 + 5) % dates.length]!.iso, dates[(i * 3 + 19) % dates.length]!.iso]
        : []
    // One person in eleven has a standing weekly commitment (e.g. never Sundays).
    const recurringOff: number[] = i % 11 === 0 ? [i % 7] : []
    // Most people just take their team's default; roughly one in three has
    // asked for their own instead.
    const wants: ShiftCode[] = i % 4 === 0 ? [ROTATING_CODES[i % 4]!] : []
    const avoidCandidate = ROTATING_CODES[(i + 2) % 4]!
    const avoids: ShiftCode[] = i % 7 === 0 && !wants.includes(avoidCandidate) ? [avoidCandidate] : []
    const useTeamPreference = wants.length === 0 && avoids.length === 0
    // Roughly one person in twenty starts unassigned — the roster isn't
    // fully staffed the moment it exists, and the model shouldn't pretend
    // otherwise.
    const teamId = i % 20 === 0 ? UNASSIGNED_TEAM_ID : team.id
    people.push({
      id: `p${i + 1}`,
      name: `${first} ${last}`,
      teamId,
      rotationOffset: i % SHIFT_ROTATION.length,
      ineligible,
      timeOff,
      recurringOff,
      wants,
      avoids,
      useTeamPreference,
    })
  }
  return people
}

function buildAssignments(people: Person[], dates: BoardDate[]): Map<string, Assignment> {
  const assignments = new Map<string, Assignment>()
  for (const person of people) {
    for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
      const date = dates[dateIndex]!
      let code: ShiftCode

      if (date.holidayName) {
        code = 'OFF'
      } else {
        const cycle = (dateIndex + person.rotationOffset) % SHIFT_ROTATION.length
        code = SHIFT_ROTATION[cycle]!
        // Weekends thin out to roughly half the working slots. Keyed off the
        // person's id, not `rotationOffset` — see the identical fix's note
        // in `engine/stubSolver.ts` (a mod-2 check on the same number that
        // already decided `code` via mod-4 always zeroed EARLY, never LATE).
        if (date.isWeekend && code !== 'OFF' && (dateIndex + Number(person.id.slice(1))) % 2 === 0) {
          code = 'OFF'
        }
      }

      const [start, end] = code === 'OFF' ? [null, null] : SHIFT_TIMES[code]!
      assignments.set(assignmentKey(person.id, date.iso), {
        code,
        start,
        end,
        pinned: false,
        ineligible: false,
      })
    }
  }
  return assignments
}

/**
 * The board's real starting point (ticket 11): nobody assigned anything yet,
 * nothing pinned. `generateBoardData`'s `assignments` field is mock filler
 * kept for the standalone /coverage demo — the live board starts here and
 * only gets real content once `solve()` returns.
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
 * no teams, no people, no assignments — the onboarding import flow is what
 * populates a period like this, not this file's mock generator.
 */
export function emptyBoardData(periodStart: string, numDates: number): BoardData {
  return { teams: [], people: [], dates: buildDates(periodStart, numDates), assignments: new Map() }
}

export function generateBoardData(
  periodStart: string,
  numDates = 42,
  numPeople = 100,
): BoardData {
  const teams: Team[] = TEAM_NAMES.map((name, i) => ({
    id: `t${i + 1}`,
    name,
    wants: TEAM_PREFS[i % TEAM_PREFS.length]!.wants,
    avoids: TEAM_PREFS[i % TEAM_PREFS.length]!.avoids,
  }))
  const dates = buildDates(periodStart, numDates)
  const people = buildPeople(numPeople, teams, dates)
  const assignments = buildAssignments(people, dates)
  return { teams, people, dates, assignments }
}
