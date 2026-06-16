import { describe, it, expect } from 'vitest'
import { createStore } from '../store'
import { keyOf } from '@crewdoku/domain'

describe('app store', () => {
  it('starts empty and loadDemo seeds domain state', () => {
    const s = createStore()
    expect(s.getState().employees.length).toBe(0)
    s.getState().loadDemo()
    expect(s.getState().employees.length).toBeGreaterThan(0)
    expect(s.getState().shifts.some((sh) => sh.isNight)).toBe(true)
    expect(s.getState().schedule.assignments.size).toBeGreaterThan(0)
  })

  it('removeEmployee dispatches to domain and keeps others intact (AC-5)', () => {
    const s = createStore()
    s.getState().loadDemo()
    const before = s.getState().employees.length
    const victim = s.getState().employees[1]!
    const survivor = s.getState().employees[0]!
    // capture a survivor assignment to prove it stays correctly attributed
    const survivorDate = s.getState().period.startDate
    const survivorBefore = s.getState().schedule.assignments.get(
      keyOf(survivor.id, survivorDate),
    )?.shiftId

    s.getState().removeEmployee(victim.id)

    expect(s.getState().employees.length).toBe(before - 1)
    expect(s.getState().employees.find((e) => e.id === victim.id)).toBeUndefined()
    // victim's assignments are gone
    expect(
      [...s.getState().schedule.assignments.values()].some(
        (a) => a.employeeId === victim.id,
      ),
    ).toBe(false)
    // survivor's assignment is untouched and still attributed to the survivor
    expect(
      s.getState().schedule.assignments.get(keyOf(survivor.id, survivorDate))?.shiftId,
    ).toBe(survivorBefore)
  })

  it('setAssignment writes through to the domain schedule', () => {
    const s = createStore()
    s.getState().loadDemo()
    const emp = s.getState().employees[0]!
    const date = s.getState().period.startDate
    const shiftId = emp.eligibleShiftIds[0]!
    s.getState().setAssignment({ employeeId: emp.id, date, shiftId })
    expect(s.getState().schedule.assignments.get(keyOf(emp.id, date))?.shiftId).toBe(
      shiftId,
    )
  })

  it('exposes a DTO bridge that round-trips through the domain', () => {
    const s = createStore()
    s.getState().loadDemo()
    const dto = s.getState().toDTO()
    expect(Array.isArray(dto.assignments)).toBe(true)
    const s2 = createStore()
    s2.getState().hydrateFromDTO(dto)
    expect(s2.getState().employees.length).toBe(s.getState().employees.length)
    expect(s2.getState().schedule.assignments.size).toBe(
      s.getState().schedule.assignments.size,
    )
  })
})
