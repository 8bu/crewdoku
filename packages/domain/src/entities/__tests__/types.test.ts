import { describe, it, expectTypeOf } from 'vitest'
import type { Shift, Assignment, ID } from '../types'

describe('entity shapes', () => {
  it('Shift carries isNight and hours, not a literal code dependency', () => {
    expectTypeOf<Shift>().toHaveProperty('isNight').toEqualTypeOf<boolean>()
    expectTypeOf<Shift>().toHaveProperty('startHour').toEqualTypeOf<number>()
  })
  it('Assignment.shiftId is nullable (explicit day off)', () => {
    expectTypeOf<Assignment['shiftId']>().toEqualTypeOf<ID | null>()
  })
})
