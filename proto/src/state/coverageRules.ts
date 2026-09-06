import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import type { ShiftDef } from '../board/mockBoard'

/**
 * Coverage requirement — min/max headcount for one shift on one day (ticket
 * 15, Q2: "coverage per shift by day of week with date overrides" is a real
 * authored table now, not `board/coverage.ts`'s old `teamCount`-derived
 * placeholder). Workspace-global across all periods.
 */
export type CoverageBand = { min: number; max: number }
export type CoverageRow = Record<string, CoverageBand>

export type CoverageTable = {
  /** Weekday 0 (Sun) .. 6 (Sat) -> shift code -> band. The default. */
  byDow: Record<number, CoverageRow>
  /** ISO date -> shift code -> band. Takes precedence over `byDow` for that date. */
  dateOverrides: Record<string, CoverageRow>
}

/** `dateOverrides[iso]` wins over `byDow[weekday]`; an unlisted shift reads as no requirement. */
export function coverageBandFor(table: CoverageTable, shiftCode: string, iso: string, weekday: number): CoverageBand {
  return table.dateOverrides[iso]?.[shiftCode] ?? table.byDow[weekday]?.[shiftCode] ?? { min: 0, max: Infinity }
}

/**
 * Seeds a table that reads exactly like the old computed placeholder did —
 * one person per team as the floor, double that as the ceiling, every shift,
 * every day — so switching to a real authored table doesn't change what the
 * board shows the moment ticket 15 lands. From here it's the planner's to edit.
 */
export function defaultCoverageTable(shifts: ShiftDef[], teamCount: number): CoverageTable {
  const row: CoverageRow = Object.fromEntries(shifts.map((s) => [s.code, { min: teamCount, max: teamCount * 2 }]))
  const byDow: Record<number, CoverageRow> = {}
  for (let dow = 0; dow < 7; dow++) byDow[dow] = { ...row }
  return { byDow, dateOverrides: {} }
}

export const coverageAtom = atom<CoverageTable | null>(null)

export function useCoverageRules(
  initialTable: CoverageTable,
): [CoverageTable, (updater: (prev: CoverageTable) => CoverageTable) => void] {
  const [coverageState, setCoverageState] = useAtom(coverageAtom)

  useEffect(() => {
    setCoverageState((prev) => prev ?? initialTable)
  }, [])

  const table = coverageState ?? initialTable

  const setTable = useCallback(
    (updater: (prev: CoverageTable) => CoverageTable) =>
      setCoverageState((prev) => updater(prev ?? initialTable)),
    [initialTable, setCoverageState],
  )

  return [table, setTable]
}
