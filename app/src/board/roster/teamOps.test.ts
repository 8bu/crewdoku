import { describe, expect, it } from 'vitest'
import {
  addTeam,
  addTeamsFromNames,
  countMembers,
  deleteTeam,
  parseTeamNames,
  parseTeamNameRows,
  toggleTeamAvoid,
  toggleTeamWant,
} from './teamOps'
import type { Person, Team } from '@crewdoku/domain'

const teams: Team[] = [
  { id: 't1', name: 'Opening', wants: [], avoids: [] },
  { id: 't2', name: 'Closing', wants: [], avoids: [] },
]

function person(overrides: Partial<Person> = {}): Person {
  return { id: 'p1', name: 'Alex', teamId: 't1', ineligible: [], ...overrides }
}

describe('addTeam', () => {
  it('ids never collide, even after a gap', () => {
    const next = addTeam([{ id: 't1', name: 'A', wants: [], avoids: [] }, { id: 't5', name: 'B', wants: [], avoids: [] }], 'C')
    expect(next.at(-1)!.id).toBe('t6')
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
})

describe('parseTeamNames', () => {
  it('trims each line and drops blank lines', () => {
    expect(parseTeamNames('Front desk\n\n Kitchen ')).toEqual(['Front desk', 'Kitchen'])
  })
})

describe('parseTeamNameRows', () => {
  it('ignores extra columns', () => {
    expect(parseTeamNameRows([['Frontline', 'ignored'], ['Kitchen', 'x']])).toEqual(['Frontline', 'Kitchen'])
  })

  it('drops blank or whitespace-only first cells', () => {
    expect(parseTeamNameRows([['  '], ['Kitchen'], ['']])).toEqual(['Kitchen'])
  })
})

describe('addTeamsFromNames', () => {
  it('creates one team per unique name, order preserved, with fresh ids', () => {
    const next = addTeamsFromNames(teams, ['Kitchen', 'Bar'])
    expect(next.map((t) => t.name)).toEqual(['Opening', 'Closing', 'Kitchen', 'Bar'])
    expect(new Set(next.map((t) => t.id)).size).toBe(next.length)
  })

  it('skips a name already present, case-insensitively', () => {
    const existing = addTeam(teams, 'Kitchen')
    const next = addTeamsFromNames(existing, ['KITCHEN', 'Bar'])
    expect(next.map((t) => t.name)).toEqual(['Opening', 'Closing', 'Kitchen', 'Bar'])
  })

  it('de-duplicates repeats within the batch', () => {
    const next = addTeamsFromNames(teams, ['Bar', 'bar'])
    expect(next.map((t) => t.name)).toEqual(['Opening', 'Closing', 'Bar'])
  })

  it('skips blank or whitespace-only names', () => {
    const next = addTeamsFromNames(teams, ['', '   ', 'Bar'])
    expect(next.map((t) => t.name)).toEqual(['Opening', 'Closing', 'Bar'])
  })
})
