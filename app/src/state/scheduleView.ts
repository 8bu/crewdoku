import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { assignmentKey, EMPTY_BOUNDARY, OFF_ASSIGNMENT, OFF_CODE } from '@crewdoku/domain'
import type { Assignment, Person, ScheduleBoundary, ShiftCode } from '@crewdoku/domain'
import type { Overrides } from '../board/editHistory'
import { overridesByPeriodAtom } from './boardOverrides'
import { scheduleByPeriodAtom } from './schedule'
import type { ScheduleState } from './schedule'
import { addDaysISO, periodsAtom } from './shell'
import type { Period } from './shell'

/**
 * Cross-period reads over the per-period schedule store. Every period's base
 * matrix (`scheduleByPeriodAtom`) and hand-edit layer (`overridesByPeriodAtom`)
 * is loaded at boot, so the calendar and the period-edge rest rule read any
 * period without switching. Periods don't overlap (period create/edit refuses
 * it), so a date belongs to at most one period.
 */

/** The period whose range covers `iso`, or null for a date no period covers. */
export function periodForDate(periods: readonly Period[], iso: string): Period | null {
  for (const period of periods) {
    if (period.start <= iso && iso <= period.end) return period
  }
  return null
}

/**
 * Whether a period holds a schedule worth showing and editing: it was
 * generated or imported. Hand edits on any other period are never saved
 * (`collectWorkspace` skips it), so views treat it as empty and read-only.
 */
export function periodHasSchedule(schedules: Readonly<Record<string, ScheduleState>>, periodId: string): boolean {
  return schedules[periodId]?.hasSchedule === true
}

/** The cell as the board shows it: hand edit, else base schedule, else OFF. */
export function effectiveAssignment(
  schedules: Readonly<Record<string, ScheduleState>>,
  overrides: Readonly<Record<string, Overrides>>,
  periodId: string,
  personId: string,
  iso: string,
): Assignment {
  const key = assignmentKey(personId, iso)
  return overrides[periodId]?.get(key) ?? schedules[periodId]?.assignments.get(key) ?? OFF_ASSIGNMENT
}

function edgeCodes(
  people: readonly Person[],
  schedules: Readonly<Record<string, ScheduleState>>,
  overrides: Readonly<Record<string, Overrides>>,
  neighbour: Period | null,
  iso: string,
): Record<string, ShiftCode> {
  const codes: Record<string, ShiftCode> = {}
  if (!neighbour || !periodHasSchedule(schedules, neighbour.id)) return codes
  for (const person of people) {
    const code = effectiveAssignment(schedules, overrides, neighbour.id, person.id, iso).code
    if (code !== OFF_CODE) codes[person.id] = code
  }
  return codes
}

/**
 * The shifts on the days just outside `period`, from whichever scheduled
 * period covers them — what the rest rule (H3) checks the first and last day
 * against. A neighbour that was never generated or imported contributes
 * nothing, the same as no neighbour.
 */
export function boundaryFor(
  period: Period,
  periods: readonly Period[],
  people: readonly Person[],
  schedules: Readonly<Record<string, ScheduleState>>,
  overrides: Readonly<Record<string, Overrides>>,
): ScheduleBoundary {
  const beforeIso = addDaysISO(period.start, -1)
  const afterIso = addDaysISO(period.end, 1)
  const before = edgeCodes(people, schedules, overrides, periodForDate(periods, beforeIso), beforeIso)
  const after = edgeCodes(people, schedules, overrides, periodForDate(periods, afterIso), afterIso)
  if (Object.keys(before).length === 0 && Object.keys(after).length === 0) return EMPTY_BOUNDARY
  return { before, after }
}

/** `boundaryFor` over live state, recomputed when any period's schedule changes. */
export function useScheduleBoundary(period: Period | null, people: readonly Person[]): ScheduleBoundary {
  const periods = useAtomValue(periodsAtom)
  const schedules = useAtomValue(scheduleByPeriodAtom)
  const overrides = useAtomValue(overridesByPeriodAtom)
  return useMemo(
    () => (period ? boundaryFor(period, periods, people, schedules, overrides) : EMPTY_BOUNDARY),
    [period, periods, people, schedules, overrides],
  )
}
