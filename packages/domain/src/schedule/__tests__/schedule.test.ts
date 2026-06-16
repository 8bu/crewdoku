import { describe, it, expect } from 'vitest'
import {
  keyOf,
  makeSchedule,
  getAssignment,
  setAssignment,
  removeEmployee,
} from '../schedule'

describe('schedule single source of truth', () => {
  it('keyOf composes employeeId|date', () => {
    expect(keyOf('emp1', '2026-06-15')).toBe('emp1|2026-06-15')
  })
  it('set/get round-trip; null = explicit day off is stored', () => {
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'emp1', date: '2026-06-15', shiftId: 'sh1' })
    setAssignment(s, { employeeId: 'emp1', date: '2026-06-16', shiftId: null })
    expect(getAssignment(s, 'emp1', '2026-06-15')?.shiftId).toBe('sh1')
    expect(getAssignment(s, 'emp1', '2026-06-16')?.shiftId).toBeNull()
  })
  it('removeEmployee deletes only that employee, leaving others intact', () => {
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'a', date: '2026-06-15', shiftId: 'x' })
    setAssignment(s, { employeeId: 'b', date: '2026-06-15', shiftId: 'y' })
    removeEmployee(s, 'a')
    expect(getAssignment(s, 'a', '2026-06-15')).toBeUndefined()
    expect(getAssignment(s, 'b', '2026-06-15')?.shiftId).toBe('y')
  })
})
