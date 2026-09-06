/**
 * Pure roster edits (wayfinder ticket 16) — kept apart from `Roster.tsx` so
 * add/remove/eligibility logic is testable without a DOM.
 */
import { UNASSIGNED_TEAM_ID, type Person, type ShiftCode } from '@crewdoku/domain'

function nextPersonId(people: Person[]): string {
  const max = people.reduce((highest, p) => {
    const n = Number(p.id.slice(1))
    return Number.isFinite(n) && n > highest ? n : highest
  }, 0)
  return `p${max + 1}`
}

/** A new person starts eligible for everything, unassigned, no name yet — a manager staffs them from here. */
export function addPerson(people: Person[]): Person[] {
  const person: Person = {
    id: nextPersonId(people),
    name: '',
    teamId: UNASSIGNED_TEAM_ID,
    ineligible: [],
  }
  return [...people, person]
}

/** Soft remove (8bu's call): flagged, never deleted — see `Person.removed`. */
export function removePerson(people: Person[], personId: string): Person[] {
  return people.map((p) => (p.id === personId ? { ...p, removed: true } : p))
}

export function setPersonName(people: Person[], personId: string, name: string): Person[] {
  return people.map((p) => (p.id === personId ? { ...p, name } : p))
}

export function setPersonTeam(people: Person[], personId: string, teamId: string): Person[] {
  return people.map((p) => (p.id === personId ? { ...p, teamId } : p))
}

export function toggleShiftEligibility(
  people: Person[],
  personId: string,
  code: Exclude<ShiftCode, 'OFF'>,
): Person[] {
  return people.map((p) => {
    if (p.id !== personId) return p
    const ineligible = p.ineligible.includes(code)
      ? p.ineligible.filter((c) => c !== code)
      : [...p.ineligible, code]
    return { ...p, ineligible }
  })
}

/** The Roster table's own view (ticket 16's decision): removed people don't show here. */
export function activeRoster(people: Person[]): Person[] {
  return people.filter((p) => !p.removed)
}
