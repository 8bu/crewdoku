import type { Person, ShiftCode } from './mockBoard'

/**
 * Hand-edits are never refused (ticket 05): the planner can type any code.
 * An ineligible code is accepted and flagged, matching the map's settled rule
 * that a violation marks the cell rather than blocking input.
 */
export function isEligible(person: Person, code: ShiftCode): boolean {
  if (code === 'OFF') return true
  return !person.ineligible.includes(code)
}
