import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import type { Assignment } from '../board/mockBoard'

/**
 * The board's own schedule — `baseAssignments` and whether a solve has ever
 * landed (ticket 11's `hasSchedule`) — shared per period the same way
 * people/teams/shifts already are (ticket 15 found the gap live: this was
 * local `useState` in `BoardGrid`, so navigating to Settings and back
 * silently wiped a just-applied schedule, which also made the stale banner
 * unreachable — Settings can never be visited without first losing
 * `hasSchedule`). Hand-edit overrides and undo history stay local to
 * `useBoardEditing` — narrower gap, out of scope here (mirrors ticket 11's
 * own "editing stays live only during a solve" scoping call).
 */
export type ScheduleState = {
  assignments: Map<string, Assignment>
  hasSchedule: boolean
}

export const scheduleByPeriodAtom = atom<Record<string, ScheduleState>>({})

export function useBoardSchedule(
  periodId: string,
  initialAssignments: Map<string, Assignment>,
): [Map<string, Assignment>, boolean, (assignments: Map<string, Assignment>, hasSchedule: boolean) => void] {
  const [byPeriod, setByPeriod] = useAtom(scheduleByPeriodAtom)

  useEffect(() => {
    setByPeriod((prev) =>
      prev[periodId] ? prev : { ...prev, [periodId]: { assignments: initialAssignments, hasSchedule: false } },
    )
  }, [periodId])

  const state = byPeriod[periodId] ?? { assignments: initialAssignments, hasSchedule: false }

  const setSchedule = useCallback(
    (assignments: Map<string, Assignment>, hasSchedule: boolean) =>
      setByPeriod((prev) => ({ ...prev, [periodId]: { assignments, hasSchedule } })),
    [periodId, setByPeriod],
  )

  return [state.assignments, state.hasSchedule, setSchedule]
}
