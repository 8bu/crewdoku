import { describe, expect, it } from 'vitest'
import { emptyBoardData } from './mockBoard'

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
