import { describe, expect, it } from 'vitest'
import { addTeam, countMembers, deleteTeam, renameTeam, toggleTeamAvoid, toggleTeamWant } from './teamOps'
import type { Person, Team } from '../mockBoard'

const teams: Team[] = [
  { id: 't1', name: 'Opening', wants: [], avoids: [] },
  { id: 't2', name: 'Closing', wants: [], avoids: [] },
]

function person(overrides: Partial<Person> = {}): Person {
  return { id: 'p1', name: 'Alex', teamId: 't1', rotationOffset: 0, ineligible: [], ...overrides }
}

describe('addTeam', () => {
  it('appends a new team with no default preference', () => {
    const next = addTeam(teams, 'Kitchen')
    expect(next).toHaveLength(3)
    expect(next[2]).toMatchObject({ name: 'Kitchen', wants: [], avoids: [] })
  })

  it('ids never collide, even after a gap', () => {
    const next = addTeam([{ id: 't1', name: 'A', wants: [], avoids: [] }, { id: 't5', name: 'B', wants: [], avoids: [] }], 'C')
    expect(next.at(-1)!.id).toBe('t6')
  })
})

describe('renameTeam', () => {
  it('renames only the matching team', () => {
    const next = renameTeam(teams, 't1', 'Front Desk')
    expect(next[0]!.name).toBe('Front Desk')
    expect(next[1]!.name).toBe('Closing')
  })
})

describe('toggleTeamWant / toggleTeamAvoid', () => {
  it('wanting a code clears avoiding it', () => {
    const avoided = toggleTeamAvoid(teams, 't1', 'NIGHT')
    const wanted = toggleTeamWant(avoided, 't1', 'NIGHT')
    expect(wanted[0]!.wants).toEqual(['NIGHT'])
    expect(wanted[0]!.avoids).toEqual([])
  })

  it('avoiding a code clears wanting it', () => {
    const wanted = toggleTeamWant(teams, 't1', 'NIGHT')
    const avoided = toggleTeamAvoid(wanted, 't1', 'NIGHT')
    expect(avoided[0]!.avoids).toEqual(['NIGHT'])
    expect(avoided[0]!.wants).toEqual([])
  })

  it('toggles off on a second press', () => {
    const once = toggleTeamWant(teams, 't1', 'NIGHT')
    const twice = toggleTeamWant(once, 't1', 'NIGHT')
    expect(twice[0]!.wants).toEqual([])
  })
})

describe('countMembers', () => {
  it('counts active people on the team, excluding removed', () => {
    const people = [person({ id: 'p1', teamId: 't1' }), person({ id: 'p2', teamId: 't1', removed: true }), person({ id: 'p3', teamId: 't2' })]
    expect(countMembers(people, 't1')).toBe(1)
  })
})

describe('deleteTeam', () => {
  it('removes the team and reassigns its people', () => {
    const people = [person({ id: 'p1', teamId: 't1' }), person({ id: 'p2', teamId: 't2' })]
    const result = deleteTeam(teams, people, 't1', 't2')
    expect(result.teams.map((t) => t.id)).toEqual(['t2'])
    expect(result.people[0]!.teamId).toBe('t2')
    expect(result.people[1]!.teamId).toBe('t2')
  })

  it('leaves people on other teams untouched', () => {
    const people = [person({ id: 'p1', teamId: 't2' })]
    const result = deleteTeam(teams, people, 't1', 't2')
    expect(result.people[0]).toEqual(people[0])
  })
})
