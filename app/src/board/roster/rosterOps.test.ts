import { describe, expect, it } from 'vitest'
import { addPerson, removePerson } from './rosterOps'
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

