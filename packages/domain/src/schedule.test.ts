import { describe, expect, it } from 'vitest'
import { makePerson } from './factories'
import {
  activePeople,
  assignmentKey,
  emptySchedule,
  getAssignment,
  OFF_ASSIGNMENT,
  splitAssignmentKey,
} from './schedule'

describe('assignmentKey', () => {
  it('round-trips through splitAssignmentKey', () => {
    const key = assignmentKey('person-abc', '2026-08-17')
    expect(key).toBe('person-abc|2026-08-17')
    expect(splitAssignmentKey(key)).toEqual({ personId: 'person-abc', iso: '2026-08-17' })
  })
})

describe('getAssignment', () => {
  it('falls back to the frozen OFF cell for a missing key', () => {
    const schedule = new Map()
    expect(getAssignment(schedule, 'nobody', '2026-08-17')).toBe(OFF_ASSIGNMENT)
    expect(Object.isFrozen(OFF_ASSIGNMENT)).toBe(true)
  })
})

describe('emptySchedule', () => {
  it('builds a complete person-by-date OFF matrix, never sparse', () => {
    const people = [makePerson({ name: 'A' }), makePerson({ name: 'B' })]
    const schedule = emptySchedule(people, '2026-08-17', '2026-08-23')
    expect(schedule.size).toBe(2 * 7)
    const first = people[0]
    expect(first).toBeDefined()
    if (first) expect(getAssignment(schedule, first.id, '2026-08-20')).toBe(OFF_ASSIGNMENT)
  })
})

describe('activePeople', () => {
  it('excludes soft-removed people and keeps everyone else', () => {
    const staying = makePerson({ name: 'Stays' })
    const removed = makePerson({ name: 'Gone', removed: true })
    expect(activePeople([staying, removed])).toEqual([staying])
  })
})
