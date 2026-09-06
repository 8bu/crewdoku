import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import type { Person } from '../board/mockBoard'

/**
 * The workspace-global roster — shared between the board, Roster surface,
 * and all periods so an edit anywhere shows up everywhere immediately.
 * Lazy-seeds once from whatever `initialPeople` its first caller hands it
 * (the mock roster on bootstrap, or an imported roster).
 */
export const peopleAtom = atom<Person[] | null>(null)

export function useRosterPeople(
  initialPeople: Person[],
): [Person[], (updater: (prev: Person[]) => Person[]) => void] {
  const [peopleState, setPeopleState] = useAtom(peopleAtom)

  // Deps stay narrow on purpose: `initialPeople` is a fresh array identity
  // every render from the caller's own `useMemo`, so it's read but not
  // listed — seeding runs only once on initial mount when unseeded.
  useEffect(() => {
    setPeopleState((prev) => prev ?? initialPeople)
  }, [])

  const people = peopleState ?? initialPeople

  const setPeople = useCallback(
    (updater: (prev: Person[]) => Person[]) =>
      setPeopleState((prev) => updater(prev ?? initialPeople)),
    [initialPeople, setPeopleState],
  )

  return [people, setPeople]
}
