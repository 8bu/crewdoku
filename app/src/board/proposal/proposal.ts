/**
 * PROTOTYPE (wayfinder ticket 12) — the proposal overlay's data layer.
 * Pure and framework-free, like coverage.ts/violations.ts/fairness.ts: takes
 * the board as it stood right before a solve and the schedule the solve
 * came back with, and produces the diff every variant reads from. A cell is
 * a change only if its code or times actually differ — a pinned cell never
 * shows up here, since the solver already carries it through untouched.
 */
import { assignmentKey, type Assignment, type Person, type ShiftDef } from '@crewdoku/domain'
import type { BoardDate } from '../mockBoard'
import type { ScheduleMap } from '../../engine/types'
import { computeFairness, type FairnessTotals } from '../fairness'

export type ProposalChange = {
  personId: string
  dateIso: string
  from: Assignment
  to: Assignment
}

export function diffProposal(
  people: Person[],
  dates: BoardDate[],
  getCurrent: (personId: string, dateIso: string) => Assignment,
  proposed: ScheduleMap,
): ProposalChange[] {
  const changes: ProposalChange[] = []
  for (const person of people) {
    for (const date of dates) {
      const to = proposed.get(assignmentKey(person.id, date.iso))
      if (!to) continue
      const from = getCurrent(person.id, date.iso)
      if (to.code === from.code && to.start === from.start && to.end === from.end) continue
      changes.push({ personId: person.id, dateIso: date.iso, from, to })
    }
  }
  return changes
}

export type PersonChangeGroup = {
  person: Person
  changes: ProposalChange[]
}

/** Grouped in roster order, not change order — a person's changes should read top to bottom by date. */
export function groupChangesByPerson(changes: ProposalChange[], people: Person[]): PersonChangeGroup[] {
  const byPerson = new Map<string, ProposalChange[]>()
  for (const change of changes) {
    const list = byPerson.get(change.personId)
    if (list) list.push(change)
    else byPerson.set(change.personId, [change])
  }
  const groups: PersonChangeGroup[] = []
  for (const person of people) {
    const list = byPerson.get(person.id)
    if (list && list.length > 0) groups.push({ person, changes: list })
  }
  return groups
}

export type FairnessMovement = {
  personId: string
  hours: { before: number; after: number }
  nights: { before: number; after: number }
  weekends: { before: number; after: number }
}

/** "The fairness columns show movement" — one delta row per person who has any change at all. */
export function computeFairnessMovement(
  changedPersonIds: ReadonlySet<string>,
  before: FairnessTotals,
  after: FairnessTotals,
): Map<string, FairnessMovement> {
  const map = new Map<string, FairnessMovement>()
  for (const personId of changedPersonIds) {
    const b = before.byPerson.get(personId)
    const a = after.byPerson.get(personId)
    if (!b || !a) continue
    map.set(personId, {
      personId,
      hours: { before: b.hours, after: a.hours },
      nights: { before: b.nights, after: a.nights },
      weekends: { before: b.weekends, after: a.weekends },
    })
  }
  return map
}

/** A pending proposal: the full solved schedule, its diff against the board, and the fairness it would produce. */
export type PendingProposal = {
  schedule: ScheduleMap
  changes: ProposalChange[]
  fairnessAfter: FairnessTotals
}

export function buildPendingProposal(
  people: Person[],
  dates: BoardDate[],
  getCurrent: (personId: string, dateIso: string) => Assignment,
  proposed: ScheduleMap,
  shifts: ShiftDef[],
  maxHoursPerWeek: number,
): PendingProposal {
  const changes = diffProposal(people, dates, getCurrent, proposed)
  const fairnessAfter = computeFairness(
    people,
    dates,
    (personId, dateIso) => {
      const key = assignmentKey(personId, dateIso)
      return proposed.get(key) ?? getCurrent(personId, dateIso)
    },
    shifts,
    maxHoursPerWeek,
  )
  return { schedule: proposed, changes, fairnessAfter }
}

export function shiftLabel(assignment: Assignment): string {
  if (assignment.code === 'OFF') return 'OFF'
  return `${assignment.code} ${assignment.start}–${assignment.end}`
}
