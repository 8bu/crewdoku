/**
 * The schedule: a complete person × date matrix of assignments, keyed
 * `${personId}|${iso}` — never sparse on the read path (`getAssignment`
 * falls back to the frozen OFF cell for any unbackfilled key).
 */

import type { ISODate } from './calendar'
import { eachDate } from './calendar'
import type { Person, ShiftCode } from './entities'
import { OFF_CODE } from './entities'

export type Assignment = {
  code: ShiftCode
  /** `HHMM`, or null for OFF. */
  start: string | null
  end: string | null
  /** Hand-edited by the planner. The solver may not overwrite a pinned cell. */
  pinned: boolean
  /** A hand-edit assigned a code the person is not eligible for. Accepted, flagged. */
  ineligible: boolean
}

/** The canonical "not scheduled" cell. Frozen and identity-stable. */
export const OFF_ASSIGNMENT: Assignment = Object.freeze({
  code: OFF_CODE,
  start: null,
  end: null,
  pinned: false,
  ineligible: false,
})

/** One period's schedule: `assignmentKey(personId, iso)` -> assignment. */
export type Schedule = Map<string, Assignment>

export function assignmentKey(personId: string, iso: ISODate): string {
  return `${personId}|${iso}`
}

/** Inverse of `assignmentKey`. Person ids never contain `|`. */
export function splitAssignmentKey(key: string): { personId: string; iso: ISODate } {
  const at = key.indexOf('|')
  return { personId: key.slice(0, at), iso: key.slice(at + 1) }
}

/** The cell for person × date, OFF when the matrix has no entry for it. */
export function getAssignment(schedule: Schedule, personId: string, iso: ISODate): Assignment {
  return schedule.get(assignmentKey(personId, iso)) ?? OFF_ASSIGNMENT
}

/** A complete all-OFF matrix for every person × date of the range. */
export function emptySchedule(people: readonly Person[], start: ISODate, end: ISODate): Schedule {
  const schedule: Schedule = new Map()
  const dates = eachDate(start, end)
  for (const person of people) {
    for (const iso of dates) schedule.set(assignmentKey(person.id, iso), OFF_ASSIGNMENT)
  }
  return schedule
}

/**
 * The people a solve schedules: soft-removed people (UI ticket 16) keep
 * their history but are excluded from future solves.
 */
export function activePeople(people: readonly Person[]): Person[] {
  return people.filter((p) => !p.removed)
}
