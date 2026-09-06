import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import type { Team } from '../board/mockBoard'

/**
 * The workspace-global team list — shared between the board, Teams surface,
 * and all periods the same way `state/roster.ts` shares people.
 * Lazy-seeds once on whichever route mounts first, then a manager's
 * create/rename/delete updates it globally.
 */
export const teamsAtom = atom<Team[] | null>(null)

export function useRosterTeams(
  initialTeams: Team[],
): [Team[], (updater: (prev: Team[]) => Team[]) => void] {
  const [teamsState, setTeamsState] = useAtom(teamsAtom)

  // Deps stay narrow on purpose — see `state/roster.ts`'s identical pattern.
  useEffect(() => {
    setTeamsState((prev) => prev ?? initialTeams)
  }, [])

  const teams = teamsState ?? initialTeams

  const setTeams = useCallback(
    (updater: (prev: Team[]) => Team[]) =>
      setTeamsState((prev) => updater(prev ?? initialTeams)),
    [initialTeams, setTeamsState],
  )

  return [teams, setTeams]
}
