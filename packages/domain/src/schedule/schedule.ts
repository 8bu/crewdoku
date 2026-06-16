import type { Assignment, ID, ISODate } from '../entities/types'

export interface Schedule {
  assignments: Map<string, Assignment>
}

/** Composite key for an assignment: `${employeeId}|${date}`. */
export function keyOf(employeeId: ID, date: ISODate): string {
  return `${employeeId}|${date}`
}

export function makeSchedule(initial?: Assignment[]): Schedule {
  const assignments = new Map<string, Assignment>()
  if (initial) {
    for (const a of initial) {
      assignments.set(keyOf(a.employeeId, a.date), a)
    }
  }
  return { assignments }
}

export function getAssignment(
  s: Schedule,
  employeeId: ID,
  date: ISODate,
): Assignment | undefined {
  return s.assignments.get(keyOf(employeeId, date))
}

/** Overwrites any existing assignment for the same (employee, date). */
export function setAssignment(s: Schedule, a: Assignment): void {
  s.assignments.set(keyOf(a.employeeId, a.date), a)
}

export function removeAssignment(
  s: Schedule,
  employeeId: ID,
  date: ISODate,
): void {
  s.assignments.delete(keyOf(employeeId, date))
}

/**
 * Deletes all assignments for one employee, keyed off the stored
 * Assignment.employeeId field (id-safe; never string-splits the key).
 */
export function removeEmployee(s: Schedule, employeeId: ID): void {
  for (const [key, a] of s.assignments) {
    if (a.employeeId === employeeId) {
      s.assignments.delete(key)
    }
  }
}

export function assignmentsFor(s: Schedule, employeeId: ID): Assignment[] {
  const out: Assignment[] = []
  for (const a of s.assignments.values()) {
    if (a.employeeId === employeeId) out.push(a)
  }
  return out
}
