import { describe, expect, it } from 'vitest'
import type { Assignment, Schedule } from './schedule'
import { assignmentKey, OFF_ASSIGNMENT } from './schedule'
import { diffSchedules } from './diff'

describe('diffSchedules', () => {
  it('returns empty array when schedules are identical (no-change)', () => {
    const s1: Schedule = new Map()
    const s2: Schedule = new Map()

    const a1: Assignment = {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: false,
      ineligible: false,
    }

    s1.set(assignmentKey('p1', '2026-08-17'), a1)
    s2.set(assignmentKey('p1', '2026-08-17'), { ...a1 })

    expect(diffSchedules(s1, s2)).toEqual([])
  })

  it('detects a code change (start/end change alongside code)', () => {
    const s1: Schedule = new Map()
    const s2: Schedule = new Map()

    const before: Assignment = {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: false,
      ineligible: false,
    }
    const after: Assignment = {
      code: 'LATE',
      start: '1400',
      end: '2200',
      pinned: false,
      ineligible: false,
    }

    s1.set(assignmentKey('p1', '2026-08-17'), before)
    s2.set(assignmentKey('p1', '2026-08-17'), after)

    const diff = diffSchedules(s1, s2)
    expect(diff).toEqual([
      {
        personId: 'p1',
        iso: '2026-08-17',
        before,
        after,
      },
    ])
  })

  it('detects a pin flip only (pinned changes from false to true)', () => {
    const s1: Schedule = new Map()
    const s2: Schedule = new Map()

    const before: Assignment = {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: false,
      ineligible: false,
    }
    const after: Assignment = {
      ...before,
      pinned: true,
    }

    s1.set(assignmentKey('p1', '2026-08-17'), before)
    s2.set(assignmentKey('p1', '2026-08-17'), after)

    const diff = diffSchedules(s1, s2)
    expect(diff).toEqual([
      {
        personId: 'p1',
        iso: '2026-08-17',
        before,
        after,
      },
    ])
  })

  it('detects an ineligible flag flip only', () => {
    const s1: Schedule = new Map()
    const s2: Schedule = new Map()

    const before: Assignment = {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: true,
      ineligible: false,
    }
    const after: Assignment = {
      ...before,
      ineligible: true,
    }

    s1.set(assignmentKey('p1', '2026-08-17'), before)
    s2.set(assignmentKey('p1', '2026-08-17'), after)

    const diff = diffSchedules(s1, s2)
    expect(diff).toEqual([
      {
        personId: 'p1',
        iso: '2026-08-17',
        before,
        after,
      },
    ])
  })

  it('handles cell present in one map only (missing cell reads as OFF_ASSIGNMENT)', () => {
    const s1: Schedule = new Map()
    const s2: Schedule = new Map()

    const assigned: Assignment = {
      code: 'NIGHT',
      start: '2200',
      end: '0600',
      pinned: false,
      ineligible: false,
    }

    // Cell present only in s1
    s1.set(assignmentKey('p1', '2026-08-18'), assigned)
    // Cell present only in s2
    s2.set(assignmentKey('p2', '2026-08-17'), assigned)

    const diff = diffSchedules(s1, s2)

    // Sorted by iso then personId:
    // 1. 2026-08-17, p2: before is OFF_ASSIGNMENT, after is assigned
    // 2. 2026-08-18, p1: before is assigned, after is OFF_ASSIGNMENT
    expect(diff).toEqual([
      {
        personId: 'p2',
        iso: '2026-08-17',
        before: OFF_ASSIGNMENT,
        after: assigned,
      },
      {
        personId: 'p1',
        iso: '2026-08-18',
        before: assigned,
        after: OFF_ASSIGNMENT,
      },
    ])
  })

  it('sorts changes deterministically: iso ascending, then personId ascending', () => {
    const s1: Schedule = new Map()
    const s2: Schedule = new Map()

    const early: Assignment = {
      code: 'EARLY',
      start: '0600',
      end: '1400',
      pinned: false,
      ineligible: false,
    }

    s2.set(assignmentKey('pB', '2026-08-18'), early)
    s2.set(assignmentKey('pA', '2026-08-18'), early)
    s2.set(assignmentKey('pC', '2026-08-17'), early)

    const diff = diffSchedules(s1, s2)

    expect(diff.map((d) => `${d.iso}|${d.personId}`)).toEqual([
      '2026-08-17|pC',
      '2026-08-18|pA',
      '2026-08-18|pB',
    ])
  })
})
