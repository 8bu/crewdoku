import { useMemo, useRef, useState } from 'react'
import { useRosterTeams } from '../../state/teams'
import { useRosterPeople } from '../../state/roster'
import { useRosterShifts } from '../../state/shifts'
import { DEFAULT_SHIFTS, type ShiftCode } from '@crewdoku/domain'
import { seedBoardData } from '../../board/periodSeed'
import type { Period } from '../../state/shell'
import {
  addTeam,
  countMembers,
  deleteTeam,
  renameTeam,
  toggleTeamAvoid,
  toggleTeamWant,
} from '../../board/roster/teamOps'

/**
 * Shared state/behaviour behind the Teams page (ticket 19, revamped per
 * 8bu's "UI looks poor" pass — was prototyped as 3 UI variants, master-detail
 * won). Kept apart from `Teams.tsx` so it's testable-shaped without a DOM.
 */
export function useTeamsController(period: Period) {
  const initial = useMemo(() => seedBoardData(period), [period])
  const [teams, setTeams] = useRosterTeams(initial.teams)
  const [people, setPeople] = useRosterPeople(initial.people)
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const [newName, setNewName] = useState('')
  // The team a Delete click is confirming, plus the trigger button's own
  // rect — drives a floating popover (position: fixed) instead of an inline
  // row, so opening it never reflows anything else on the page.
  const [pendingDelete, setPendingDelete] = useState<{ teamId: string; rect: { left: number; bottom: number } } | null>(
    null,
  )
  const [reassignToId, setReassignToId] = useState<string>('')
  const newNameInputRef = useRef<HTMLInputElement | null>(null)

  const activePeople = useMemo(() => people.filter((p) => !p.removed), [people])

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setTeams((prev) => addTeam(prev, name))
    setNewName('')
    newNameInputRef.current?.focus()
  }

  function startDelete(teamId: string, anchor: HTMLElement) {
    const others = teams.filter((t) => t.id !== teamId)
    if (others.length === 0) return
    setPendingDelete({ teamId, rect: anchor.getBoundingClientRect() })
    setReassignToId(others[0]!.id)
  }

  function cancelDelete() {
    setPendingDelete(null)
  }

  function confirmDelete() {
    if (!pendingDelete || !reassignToId) return
    const result = deleteTeam(teams, people, pendingDelete.teamId, reassignToId)
    setTeams(() => result.teams)
    setPeople(() => result.people)
    setPendingDelete(null)
  }

  /** Moves one person straight to another team — no roster trip needed (8bu's ask). */
  function moveToTeam(personId: string, teamId: string) {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, teamId } : p)))
  }

  function members(teamId: string) {
    return activePeople.filter((p) => p.teamId === teamId)
  }

  return {
    teams,
    shifts,
    people,
    activePeople,
    newName,
    setNewName,
    handleAdd,
    newNameInputRef,
    pendingDelete,
    reassignToId,
    setReassignToId,
    startDelete,
    cancelDelete,
    confirmDelete,
    moveToTeam,
    countMembers: (teamId: string) => countMembers(people, teamId),
    members,
    rename: (teamId: string, name: string) => setTeams((prev) => renameTeam(prev, teamId, name)),
    toggleWant: (teamId: string, code: Exclude<ShiftCode, 'OFF'>) =>
      setTeams((prev) => toggleTeamWant(prev, teamId, code)),
    toggleAvoid: (teamId: string, code: Exclude<ShiftCode, 'OFF'>) =>
      setTeams((prev) => toggleTeamAvoid(prev, teamId, code)),
  }
}

export type TeamsController = ReturnType<typeof useTeamsController>
