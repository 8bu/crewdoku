import { describe, expect, it } from 'vitest'
import { periodLengthDays } from '@crewdoku/domain'
import { emptyBoardData } from './mockBoard'

describe('periodLengthDays', () => {
  it('counts a single day as length 1', () => {
    expect(periodLengthDays('2026-08-17', '2026-08-17')).toBe(1)
  })

  it('is inclusive of both endpoints', () => {
    expect(periodLengthDays('2026-08-17', '2026-08-23')).toBe(7)
  })

  it('spans a month boundary correctly', () => {
    // The bootstrap demo period's own real range — 6 full weeks.
    expect(periodLengthDays('2026-08-17', '2026-09-27')).toBe(42)
  })
})

describe('emptyBoardData', () => {
  it('has real calendar dates but no teams, people, or assignments', () => {
    const data = emptyBoardData('2026-09-28', 14)
    expect(data.teams).toEqual([])
    expect(data.people).toEqual([])
    expect(data.assignments.size).toBe(0)
    expect(data.dates).toHaveLength(14)
    expect(data.dates[0]!.iso).toBe('2026-09-28')
    expect(data.dates.at(-1)!.iso).toBe('2026-10-11')
  })
})
