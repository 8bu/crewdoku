import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback } from 'react'
import { periodsAtom } from './shell'

/**
 * "Settings changed since the board's last solve" (ticket 15, Q5) — a
 * temporal-drift flag, not a rule break: it never touches `violations.ts`'s
 * red. Settings.tsx marks all periods dirty on every shift/coverage/rule edit
 * via `useMarkAllSettingsDirty`; `BoardGrid` clears it for the active period
 * wherever a solve actually lands (the silent-commit branch and Apply), the
 * same two spots that already flip `hasSchedule`.
 */
export const dirtyByPeriodAtom = atom<Record<string, boolean>>({})

export function useSettingsDirty(periodId: string): [boolean, (dirty: boolean) => void] {
  const [dirtyByPeriod, setDirtyByPeriod] = useAtom(dirtyByPeriodAtom)
  const dirty = dirtyByPeriod[periodId] ?? false
  const setDirty = useCallback(
    (next: boolean) => setDirtyByPeriod((prev) => (prev[periodId] === next ? prev : { ...prev, [periodId]: next })),
    [periodId, setDirtyByPeriod],
  )
  return [dirty, setDirty]
}

export function useMarkAllSettingsDirty(): () => void {
  const periods = useAtomValue(periodsAtom)
  const setDirtyByPeriod = useSetAtom(dirtyByPeriodAtom)
  return useCallback(() => {
    setDirtyByPeriod((prev) => {
      const next = { ...prev }
      for (const p of periods) {
        next[p.id] = true
      }
      return next
    })
  }, [periods, setDirtyByPeriod])
}
