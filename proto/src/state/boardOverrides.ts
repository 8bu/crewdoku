import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import type { Overrides } from '../board/editHistory'

/**
 * Hand-edit/applied-proposal overrides — shared per period the same way
 * people/teams/shifts are (ticket 15 found live: this was local `useState`
 * in `useBoardEditing`, so navigating away from `/board` and back silently
 * dropped every pin and every applied proposal, which also made the stale
 * banner unreachable — there was never a schedule left to call stale by the
 * time Settings could be visited). Undo/redo history stays local to
 * `useBoardEditing` — a fresh mount starting with an empty undo stack but
 * the *data* intact is a small, defensible loss next to losing the data
 * itself.
 */
export const overridesByPeriodAtom = atom<Record<string, Overrides>>({})

export function useBoardOverrides(periodId: string): [Overrides, (updater: (prev: Overrides) => Overrides) => void] {
  const [byPeriod, setByPeriod] = useAtom(overridesByPeriodAtom)

  useEffect(() => {
    setByPeriod((prev) => (prev[periodId] ? prev : { ...prev, [periodId]: new Map() }))
  }, [periodId])

  const overrides = byPeriod[periodId] ?? new Map()

  const setOverrides = useCallback(
    (updater: (prev: Overrides) => Overrides) =>
      setByPeriod((prev) => ({ ...prev, [periodId]: updater(prev[periodId] ?? new Map()) })),
    [periodId, setByPeriod],
  )

  return [overrides, setOverrides]
}
