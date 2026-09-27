import type { Assignment, Person, ShiftCode, ShiftDef } from '@crewdoku/domain'
import { isEligible } from './eligibility'

/**
 * A hand-edit's assignment: pinned (the solver may not overwrite it), carrying
 * the catalog's clock times, and flagged when the person isn't eligible for the
 * code. The board's cells and the calendar's chips both write through this, so
 * the same drag or keypress leaves the identical value behind whichever surface
 * made it.
 */
export function buildAssignment(shifts: ShiftDef[], person: Person, code: ShiftCode): Assignment {
  const def = shifts.find((s) => s.code === code)
  return { code, start: def?.start ?? null, end: def?.end ?? null, pinned: true, ineligible: !isEligible(person, code) }
}
