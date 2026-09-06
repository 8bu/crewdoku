/**
 * Pure team edits (wayfinder ticket 19) — kept apart from `Teams.tsx` so
 * create/rename/delete/preference logic is testable without a DOM. Mirrors
 * `rosterOps.ts`'s shape for people.
 */
import type { Person, ShiftCode, Team } from '@crewdoku/domain'

function nextTeamId(teams: Team[]): string {
  const max = teams.reduce((highest, t) => {
    const n = Number(t.id.slice(1))
    return Number.isFinite(n) && n > highest ? n : highest
  }, 0)
  return `t${max + 1}`
}

/** A new team starts with no default preference — same as "no preference set". */
export function addTeam(teams: Team[], name: string): Team[] {
  return [...teams, { id: nextTeamId(teams), name, wants: [], avoids: [] }]
}

export function renameTeam(teams: Team[], teamId: string, name: string): Team[] {
  return teams.map((t) => (t.id === teamId ? { ...t, name } : t))
}

/** Wanting a code clears avoiding it, and vice versa — same rule PersonPanel uses per person. */
export function toggleTeamWant(teams: Team[], teamId: string, code: Exclude<ShiftCode, 'OFF'>): Team[] {
  return teams.map((t) => {
    if (t.id !== teamId) return t
    const wants = t.wants.includes(code) ? t.wants.filter((c) => c !== code) : [...t.wants, code]
    const avoids = t.avoids.filter((c) => c !== code)
    return { ...t, wants, avoids }
  })
}

export function toggleTeamAvoid(teams: Team[], teamId: string, code: Exclude<ShiftCode, 'OFF'>): Team[] {
  return teams.map((t) => {
    if (t.id !== teamId) return t
    const avoids = t.avoids.includes(code) ? t.avoids.filter((c) => c !== code) : [...t.avoids, code]
    const wants = t.wants.filter((c) => c !== code)
    return { ...t, avoids, wants }
  })
}

export function countMembers(people: Person[], teamId: string): number {
  return people.filter((p) => p.teamId === teamId && !p.removed).length
}

/**
 * Deletes a team, moving every one of its people to `reassignToId` first
 * (8bu's call: force a reassignment at delete time, not a block-until-empty
 * or an orphaned `teamId`). Deleting the last team is the caller's job to
 * refuse — there is nowhere left to reassign anyone to.
 */
export function deleteTeam(
  teams: Team[],
  people: Person[],
  teamId: string,
  reassignToId: string,
): { teams: Team[]; people: Person[] } {
  return {
    teams: teams.filter((t) => t.id !== teamId),
    people: people.map((p) => (p.teamId === teamId ? { ...p, teamId: reassignToId } : p)),
  }
}
