import { describe, expect, it } from 'vitest'
import {
  activeRoster,
  addPerson,
  removePerson,
  setPersonName,
  setPersonTeam,
  toggleShiftEligibility,
} from './rosterOps'
import { UNASSIGNED_TEAM_ID, type Person } from '../mockBoard'

function person(overrides: Partial<Person> = {}): Person {
  return { id: 'p1', name: 'Alex', teamId: 't1', rotationOffset: 0, ineligible: [], ...overrides }
}

describe('addPerson', () => {
  it('appends a new person eligible for everything, unassigned', () => {
    const people = addPerson([])
    expect(people).toHaveLength(1)
    expect(people[0]).toMatchObject({ name: '', teamId: UNASSIGNED_TEAM_ID, ineligible: [] })
  })

  it('ids never collide, even after a gap', () => {
    const people = addPerson([person({ id: 'p1' }), person({ id: 'p3' })])
    expect(people.at(-1)!.id).toBe('p4')
  })
})

describe('removePerson', () => {
  it('flags removed instead of deleting', () => {
    const people = removePerson([person()], 'p1')
    expect(people).toHaveLength(1)
    expect(people[0]!.removed).toBe(true)
  })

  it('leaves every other field untouched', () => {
    const people = removePerson([person({ name: 'Bao', teamId: 't2' })], 'p1')
    expect(people[0]).toMatchObject({ name: 'Bao', teamId: 't2' })
  })
})

describe('setPersonName / setPersonTeam', () => {
  it('renames only the matching person', () => {
    const people = setPersonName([person({ id: 'p1' }), person({ id: 'p2', name: 'Bao' })], 'p1', 'Alex Adler')
    expect(people[0]!.name).toBe('Alex Adler')
    expect(people[1]!.name).toBe('Bao')
  })

  it('reassigns team', () => {
    const people = setPersonTeam([person()], 'p1', 't2')
    expect(people[0]!.teamId).toBe('t2')
  })
})

describe('toggleShiftEligibility', () => {
  it('adds a code to ineligible on first toggle', () => {
    const people = toggleShiftEligibility([person()], 'p1', 'NIGHT')
    expect(people[0]!.ineligible).toEqual(['NIGHT'])
  })

  it('removes it again on a second toggle', () => {
    const once = toggleShiftEligibility([person()], 'p1', 'NIGHT')
    const twice = toggleShiftEligibility(once, 'p1', 'NIGHT')
    expect(twice[0]!.ineligible).toEqual([])
  })
})

describe('activeRoster', () => {
  it('excludes removed people', () => {
    const people = [person({ id: 'p1' }), person({ id: 'p2', removed: true })]
    expect(activeRoster(people).map((p) => p.id)).toEqual(['p1'])
  })
})
