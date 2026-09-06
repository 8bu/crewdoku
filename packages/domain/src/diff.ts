/**
 * Pure schedule operations: diffing two schedules into an ordered list of cell changes.
 */

import type { ISODate } from './calendar'
import type { Assignment, Schedule } from './schedule'
import { getAssignment, splitAssignmentKey } from './schedule'

export type ScheduleChange = {
  personId: string
  iso: ISODate
  before: Assignment
  after: Assignment
}

function assignmentsEqual(a: Assignment, b: Assignment): boolean {
  return (
    a.code === b.code &&
    a.start === b.start &&
    a.end === b.end &&
    a.pinned === b.pinned &&
    a.ineligible === b.ineligible
  )
}

/**
 * Computes the diff between two schedules across the union of their cells.
 * Missing cells in either schedule are treated as OFF_ASSIGNMENT.
 * Compares all five Assignment fields: code, start, end, pinned, ineligible.
 * Results are sorted deterministically: ascending by iso date, then personId.
 */
export function diffSchedules(before: Schedule, after: Schedule): ScheduleChange[] {
  const allKeys = new Set<string>()
  for (const key of before.keys()) {
    allKeys.add(key)
  }
  for (const key of after.keys()) {
    allKeys.add(key)
  }

  const changes: ScheduleChange[] = []

  for (const key of allKeys) {
    const { personId, iso } = splitAssignmentKey(key)
    const beforeAssignment = getAssignment(before, personId, iso)
    const afterAssignment = getAssignment(after, personId, iso)

    if (!assignmentsEqual(beforeAssignment, afterAssignment)) {
      changes.push({
        personId,
        iso,
        before: beforeAssignment,
        after: afterAssignment,
      })
    }
  }

  changes.sort((a, b) => {
    const dateCmp = a.iso.localeCompare(b.iso)
    if (dateCmp !== 0) return dateCmp
    return a.personId.localeCompare(b.personId)
  })

  return changes
}
