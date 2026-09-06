import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import type { CoverageTable } from '@crewdoku/domain'

/**
 * Coverage state. The table shape, its lookup (`coverageBandFor`), and the
 * seed (`defaultCoverageTable`) now live in `@crewdoku/domain`; this module
 * keeps only the workspace-global atom and the hook that reads it. Ticket 02
 * replaces this memory atom with persistence-backed state.
 */
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
