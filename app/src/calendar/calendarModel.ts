/**
 * The /calendar page's model: one day's chip stacks, and the pure half of its
 * editing. Deliberately hook-free — `useCalendarSource` and
 * `useCalendarEditing` wire it to the atoms — so the grouping, the filters, the
 * rule flags, and the patches a swap or a shift change writes are all provable
 * without a DOM.
 *
 * Every period is read directly rather than through the shell's selected one
 * (`state/scheduleView.ts`), because one month view spans periods without ever
 * changing the selection.
 */

import {
  activePeople,
  assignmentKey,
  type Person,
  type ShiftCode,
  type ShiftDef,
  type SolveSettings,
  type Team,
} from '@crewdoku/domain'
import { buildAssignment } from '../board/buildAssignment'
import { commitEdit, emptyHistory, type CellPatch, type Overrides } from '../board/editHistory'
import { seedBoardData } from '../board/periodSeed'
import { detectViolations, type ViolationKind } from '../board/violations'
import type { ScheduleState } from '../state/schedule'
import {
  boundaryFor,
  effectiveAssignment,
  periodForDate,
  periodHasSchedule,
} from '../state/scheduleView'
import { filterPeople, matchesShiftFilter, type ScheduleFilters } from '../state/scheduleFilters'
import type { Period } from '../state/shell'

export type CalendarSource = {
  periods: Period[]
  schedules: Record<string, ScheduleState>
  overrides: Record<string, Overrides>
  people: Person[]
  teams: Team[]
  shifts: ShiftDef[]
  settings: SolveSettings
}

/** One rule break on a chip, in the board's own words (`board/violations.ts`). */
export type ChipFlag = { kind: ViolationKind; message: string }

export type DayChip = {
  personId: string
  name: string
  teamId: string
  /** The team's index in `teams`, mod 6 — the dot's colour; null for unassigned. */
  teamColor: number | null
  flags: readonly ChipFlag[]
}

/** One day's line for a shift code, in catalog order. */
export type ShiftGroup = {
  code: ShiftCode
  label: string
  /** The catalog's colour token (`ShiftDef.color`). */
  color: string | undefined
  chips: readonly DayChip[]
}

export type DayStack = {
  iso: string
  periodId: string | null
  /** The day belongs to a period that has a schedule — the only days a chip can be dropped on. */
  editable: boolean
  groups: readonly ShiftGroup[]
  leave: readonly DayChip[]
}

/** How many dot colours the team palette cycles through. */
const TEAM_DOT_COLORS = 6

/** The team's colour slot, or no dot at all for unassigned people and teams that are gone. */
function dotColor(teams: readonly Team[], teamId: string): number | null {
  const index = teams.findIndex((team) => team.id === teamId)
  return index === -1 ? null : index % TEAM_DOT_COLORS
}

/**
 * Every rule break on the requested days, keyed `personId|iso` — a chip reads
 * its own entry, and nothing else has to know how violations are shaped.
 *
 * Only periods with a schedule are checked, and each is checked over its whole
 * date range: the weekly-hours rule sums a period's own weeks, so trimming the
 * range to the visible days would report a different total. The boundary makes
 * the rest check see the neighbouring period's edge days, the same as the
 * board's.
 */
function flagsByCell(source: CalendarSource, isos: readonly string[]): Map<string, ChipFlag[]> {
  const wanted = new Set(isos)
  const people = activePeople(source.people)
  const rules = source.settings.hardRules
  const byCell = new Map<string, ChipFlag[]>()
  for (const period of source.periods) {
    if (!periodHasSchedule(source.schedules, period.id)) continue
    if (!isos.some((iso) => period.start <= iso && iso <= period.end)) continue
    const violations = detectViolations(
      people,
      seedBoardData(period).dates,
      (personId, iso) => effectiveAssignment(source.schedules, source.overrides, period.id, personId, iso),
      source.shifts,
      rules.enabled,
      rules.maxHoursPerWeek,
      rules.minRestHours,
      boundaryFor(period, source.periods, people, source.schedules, source.overrides),
    )
    for (const violation of violations) {
      if (!wanted.has(violation.dateIso)) continue
      const key = assignmentKey(violation.personId, violation.dateIso)
      const flag: ChipFlag = { kind: violation.kind, message: violation.message }
      const flags = byCell.get(key)
      if (flags) flags.push(flag)
      else byCell.set(key, [flag])
    }
  }
  return byCell
}

/**
 * A day's stack. Days no period covers, and days whose period was never
 * generated or imported, are empty and not editable — but they still carry who
 * is on leave, because leave is bookable on any day.
 */
function buildDayStack(
  source: CalendarSource,
  people: readonly Person[],
  flags: ReadonlyMap<string, ChipFlag[]>,
  iso: string,
  filters: ScheduleFilters,
): DayStack {
  const period = periodForDate(source.periods, iso)
  const editable = period !== null && periodHasSchedule(source.schedules, period.id)
  const toChip = (person: Person): DayChip => ({
    personId: person.id,
    name: person.name,
    teamId: person.teamId,
    teamColor: dotColor(source.teams, person.teamId),
    flags: flags.get(assignmentKey(person.id, iso)) ?? [],
  })

  // One line per catalog shift, in catalog order. OFF is no line, so anyone not
  // listed on this day is simply off.
  const groups: ShiftGroup[] = []
  if (period && editable) {
    const periodId = period.id
    for (const shift of source.shifts) {
      if (!matchesShiftFilter(filters, shift.code)) continue
      const chips = people
        .filter(
          (person) => effectiveAssignment(source.schedules, source.overrides, periodId, person.id, iso).code === shift.code,
        )
        .map(toChip)
      if (chips.length > 0) groups.push({ code: shift.code, label: shift.label, color: shift.color, chips })
    }
  }

  const leave = filters.showLeave ? people.filter((person) => person.timeOff?.includes(iso)).map(toChip) : []
  return { iso, periodId: period?.id ?? null, editable, groups, leave }
}

/** The chip stacks the calendar renders, one entry per requested day, in the order asked for. */
export function buildDayStacks(
  source: CalendarSource,
  isos: readonly string[],
  filters: ScheduleFilters,
): Map<string, DayStack> {
  const people = filterPeople(activePeople(source.people), filters)
  const flags = flagsByCell(source, isos)
  const stacks = new Map<string, DayStack>()
  for (const iso of isos) stacks.set(iso, buildDayStack(source, people, flags, iso, filters))
  return stacks
}

/** One period's share of a calendar edit. A swap across a period edge produces two of these. */
export type PeriodPatch = {
  periodId: string
  /** The new value of every cell this edit touches. */
  forward: CellPatch
  /** What those cells held before it — what undo puts back. */
  backward: CellPatch
}

/**
 * The board's own "capture what these cells held, then apply" (`commitEdit`)
 * supplies the backward patch, so undoing a calendar edit restores exactly what
 * undoing the same board edit would. The calendar only drops the history
 * wrapper around it and keeps its own stack.
 */
function periodPatch(periodId: string, overrides: Overrides, forward: CellPatch): PeriodPatch {
  const { history } = commitEdit(emptyHistory, overrides, forward)
  return { periodId, forward, backward: history.past[0]!.backward }
}

/**
 * Dragging a chip onto another day: that person's two days trade shifts.
 * Refused (`null`) when the drop can't be honoured — a same-day drop, a day
 * with no scheduled period to write into, or a swap that would trade a shift
 * for itself.
 */
export function buildSwapPatches(
  source: CalendarSource,
  personId: string,
  fromIso: string,
  toIso: string,
): PeriodPatch[] | null {
  if (fromIso === toIso) return null
  const person = source.people.find((p) => p.id === personId)
  const from = periodForDate(source.periods, fromIso)
  const to = periodForDate(source.periods, toIso)
  if (!person || !from || !to) return null
  if (!periodHasSchedule(source.schedules, from.id) || !periodHasSchedule(source.schedules, to.id)) return null

  const fromCode = effectiveAssignment(source.schedules, source.overrides, from.id, personId, fromIso).code
  const toCode = effectiveAssignment(source.schedules, source.overrides, to.id, personId, toIso).code
  if (fromCode === toCode) return null

  const forwardFrom: CellPatch = new Map()
  forwardFrom.set(assignmentKey(personId, fromIso), buildAssignment(source.shifts, person, toCode))
  const forwardTo: CellPatch = new Map()
  forwardTo.set(assignmentKey(personId, toIso), buildAssignment(source.shifts, person, fromCode))

  if (from.id === to.id) {
    const forward: CellPatch = new Map([...forwardFrom, ...forwardTo])
    return [periodPatch(from.id, source.overrides[from.id] ?? new Map(), forward)]
  }
  return [
    periodPatch(from.id, source.overrides[from.id] ?? new Map(), forwardFrom),
    periodPatch(to.id, source.overrides[to.id] ?? new Map(), forwardTo),
  ]
}

/**
 * Right-clicking a chip, or dropping it on another shift line of its own day:
 * one person's shift on one day, `OFF` included. Refused (`null`) when the day
 * isn't editable or the new code is the one already there.
 */
export function buildShiftChangePatches(
  source: CalendarSource,
  personId: string,
  iso: string,
  code: ShiftCode,
): PeriodPatch[] | null {
  const person = source.people.find((p) => p.id === personId)
  const period = periodForDate(source.periods, iso)
  if (!person || !period || !periodHasSchedule(source.schedules, period.id)) return null
  const current = effectiveAssignment(source.schedules, source.overrides, period.id, personId, iso).code
  if (current === code) return null

  const forward: CellPatch = new Map()
  forward.set(assignmentKey(personId, iso), buildAssignment(source.shifts, person, code))
  return [periodPatch(period.id, source.overrides[period.id] ?? new Map(), forward)]
}
