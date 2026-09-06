import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import type { ShiftDef } from '../board/mockBoard'

/**
 * The workspace-global shift catalog — shared between all surfaces (board,
 * roster, teams, solver, settings) and across all periods. Seeded lazily
 * from whichever route mounts first (`mockBoard.DEFAULT_SHIFTS`), then
 * Settings edits replace it globally for the entire workspace.
 */
export const shiftsAtom = atom<ShiftDef[] | null>(null)

export function useRosterShifts(
  initialShifts: ShiftDef[],
): [ShiftDef[], (updater: (prev: ShiftDef[]) => ShiftDef[]) => void] {
  const [shiftsState, setShiftsState] = useAtom(shiftsAtom)

  useEffect(() => {
    setShiftsState((prev) => prev ?? initialShifts)
  }, [])

  const shifts = shiftsState ?? initialShifts

  const setShifts = useCallback(
    (updater: (prev: ShiftDef[]) => ShiftDef[]) =>
      setShiftsState((prev) => updater(prev ?? initialShifts)),
    [initialShifts, setShiftsState],
  )

  return [shifts, setShifts]
}
