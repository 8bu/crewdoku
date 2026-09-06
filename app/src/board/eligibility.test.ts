import { describe, expect, it } from 'vitest'
import { isEligible } from './eligibility'
import type { Person } from '@crewdoku/domain'

function person(ineligible: Person['ineligible']): Person {
  return { id: 'p1', name: 'Test Person', teamId: 't1', ineligible }
}

describe('isEligible', () => {
  it('allows OFF regardless of ineligible list', () => {
    expect(isEligible(person(['NIGHT']), 'OFF')).toBe(true)
  })

  it('allows a code not on the ineligible list', () => {
    expect(isEligible(person(['NIGHT']), 'EARLY')).toBe(true)
  })

  it('flags a code on the ineligible list', () => {
    expect(isEligible(person(['NIGHT']), 'NIGHT')).toBe(false)
  })

  it('allows everything when the list is empty', () => {
    expect(isEligible(person([]), 'NIGHT')).toBe(true)
  })
})
