import { describe, it, expect } from 'vitest'
import { makeSchedule, setAssignment } from '../schedule'
import { toScheduleDTO, fromScheduleDTO } from '../dto'

describe('schedule DTO round-trip', () => {
  it('Map -> JSON-safe array -> Map is deep-equal incl null shiftId', () => {
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'a', date: '2026-06-15', shiftId: 'x' })
    setAssignment(s, { employeeId: 'a', date: '2026-06-16', shiftId: null })
    const dto = toScheduleDTO(s)
    expect(Array.isArray(dto)).toBe(true)
    const json = JSON.parse(JSON.stringify(dto)) // survives serialization, no {} degradation
    const back = fromScheduleDTO(json)
    expect([...back.assignments.keys()].sort()).toEqual([...s.assignments.keys()].sort())
    expect(back.assignments.get('a|2026-06-16')?.shiftId).toBeNull()
  })
})
