import { describe, expect, it } from 'vitest'
import { activeRoster, addPerson, removePerson, toggleShiftEligibility } from './rosterOps'
import type { Person } from '@crewdoku/domain'

function person(overrides: Partial<Person> = {}): Person {
  return { id: 'p1', name: 'Alex', teamId: 't1', ineligible: [], ...overrides }
}

describe('addPerson', () => {
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
