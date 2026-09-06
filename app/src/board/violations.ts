/**
 * Rule-break detection for the board (ticket 07, extended ticket 15 with
 * real H2/H5 checks). Pure and framework-free, like `eligibility.ts` and
 * `editHistory.ts` — scans the *current* view of every assignment (base
 * schedule plus overrides) and returns every break in plain words.
 *
 * H1 (coverage) lives in `coverage.ts`, H4 (one shift/day) can't be broken
 * by construction — this module covers H2 (max hours/week), H3 (rest), H5
 * (time off/unavailability), and H6 (eligibility), each toggle-gated by
 * `enabled` the same way Settings' Advanced door controls them.
 */

import { assignmentKey, type Assignment, type Person, type ShiftDef } from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'
import { shiftDurationHours, shiftSpan } from './shiftDuration'
import type { HardRuleId } from '@crewdoku/domain'

export type ViolationKind = 'ineligible' | 'rest' | 'hours' | 'unavailable'

export type Violation = {
  id: string
  kind: ViolationKind
  personId: string
  /** The cell this violation is anchored to — where the list jumps to. */
  dateIso: string
  message: string
}

export type BoardViolationPlacement = {
  /** Messages already represented by a red dot on a rendered person/date cell. */
  cellMessages: Map<string, string[]>
  /** Remainder only: violations with no rendered cell that can own their detail. */
  otherByPerson: Map<string, Violation[]>
}

/**
 * Gives each violation exactly one detail surface. If its person/date cell is
 * present on the board, that cell's red dot owns the message. Only violations
 * without a rendered anchor flow into the pinned "Other violations" column.
 */
export function partitionViolationsForBoard(
  violations: Violation[],
  visiblePersonIds: ReadonlySet<string>,
  visibleDateIsos: ReadonlySet<string>,
): BoardViolationPlacement {
  const cellMessages = new Map<string, string[]>()
  const otherByPerson = new Map<string, Violation[]>()

  for (const violation of violations) {
    if (visiblePersonIds.has(violation.personId) && visibleDateIsos.has(violation.dateIso)) {
      const key = assignmentKey(violation.personId, violation.dateIso)
      const messages = cellMessages.get(key)
      if (messages) messages.push(violation.message)
      else cellMessages.set(key, [violation.message])
      continue
    }

    const others = otherByPerson.get(violation.personId)
    if (others) others.push(violation)
    else otherByPerson.set(violation.personId, [violation])
  }

  return { cellMessages, otherByPerson }
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Hours between one day's shift ending and the next day's shift starting. `null` if either day is off. */
function restHours(shifts: ShiftDef[], prevCode: string, nextCode: string): number | null {
  const prev = shiftSpan(shifts, prevCode)
  const next = shiftSpan(shifts, nextCode)
  if (!prev || !next) return null
  return (24 * 60 - prev.end + next.start) / 60
}

function dateLabel(date: BoardDate): string {
  return `${WEEKDAY_SHORT[date.weekday]} ${date.monthShort} ${date.dayOfMonth}`
}

function shiftLabel(code: string): string {
  return code === 'OFF' ? 'off' : code.charAt(0) + code.slice(1).toLowerCase()
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

function isUnavailable(person: Person, date: BoardDate): boolean {
  if (person.timeOff?.includes(date.iso)) return true
  if (person.recurringOff?.includes(date.weekday)) return true
  return false
}

export function detectViolations(
  people: Person[],
  dates: BoardDate[],
  getAssignment: (personId: string, dateIso: string) => Assignment,
  shifts: ShiftDef[],
  enabled: Record<HardRuleId, boolean>,
  maxHoursPerWeek: number,
  minRestHours: number,
): Violation[] {
  const violations: Violation[] = []

  for (const person of people) {
    let prevDate: BoardDate | null = null
    let prev: Assignment | null = null
    let weekIndex = -1
    let weekHours = 0
    let weekAnchor: BoardDate | null = null

    for (const date of dates) {
      const assignment = getAssignment(person.id, date.iso)

      if (assignment.ineligible) {
        violations.push({
          id: `ineligible|${assignmentKey(person.id, date.iso)}`,
          kind: 'ineligible',
          personId: person.id,
          dateIso: date.iso,
          message: `${person.name} is not eligible for ${shiftLabel(assignment.code)} on ${dateLabel(date)}`,
        })
      }

      if (enabled.H5 && assignment.code !== 'OFF' && isUnavailable(person, date)) {
        violations.push({
          id: `unavailable|${assignmentKey(person.id, date.iso)}`,
          kind: 'unavailable',
          personId: person.id,
          dateIso: date.iso,
          message: `${person.name} is scheduled for ${shiftLabel(assignment.code)} on ${dateLabel(date)} but isn't available that day`,
        })
      }

      if (enabled.H3 && prevDate && prev) {
        const gap = restHours(shifts, prev.code, assignment.code)
        if (gap !== null && gap < minRestHours) {
          violations.push({
            id: `rest|${assignmentKey(person.id, date.iso)}`,
            kind: 'rest',
            personId: person.id,
            dateIso: date.iso,
            message: `${person.name} has only ${formatHours(gap)} rest between ${dateLabel(prevDate)} ${shiftLabel(prev.code)} and ${dateLabel(date)} ${shiftLabel(assignment.code)}`,
          })
        }
      }

      if (enabled.H2) {
        if (date.weekIndex !== weekIndex) {
          if (weekAnchor && weekHours > maxHoursPerWeek) {
            violations.push({
              id: `hours|${assignmentKey(person.id, weekAnchor.iso)}|${weekIndex}`,
              kind: 'hours',
              personId: person.id,
              dateIso: weekAnchor.iso,
              message: `${person.name} is scheduled ${formatHours(weekHours)} the week of ${dateLabel(weekAnchor)}, over the ${maxHoursPerWeek}h cap`,
            })
          }
          weekIndex = date.weekIndex
          weekHours = 0
          weekAnchor = null
        }
        if (assignment.code !== 'OFF') {
          weekHours += shiftDurationHours(shifts, assignment.code)
          weekAnchor = weekAnchor ?? date
        }
      }

      prevDate = date
      prev = assignment
    }

    if (enabled.H2 && weekAnchor && weekHours > maxHoursPerWeek) {
      violations.push({
        id: `hours|${assignmentKey(person.id, weekAnchor.iso)}|${weekIndex}`,
        kind: 'hours',
        personId: person.id,
        dateIso: weekAnchor.iso,
        message: `${person.name} is scheduled ${formatHours(weekHours)} the week of ${dateLabel(weekAnchor)}, over the ${maxHoursPerWeek}h cap`,
      })
    }
  }

  return violations.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.personId.localeCompare(b.personId))
}
