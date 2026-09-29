import { describe, expect, it } from 'vitest'
import { coverageBandFor, UNCONSTRAINED_BAND, type CoverageTable } from './entities'

const table: CoverageTable = {
  byDow: {
    1: { EARLY: { min: 2, max: 4 } }, // Mondays
  },
  dateOverrides: {
    '2026-08-24': { EARLY: { min: 5, max: 5 } }, // a Monday with an override
  },
}

describe('coverageBandFor', () => {
  it('reads the weekday default', () => {
    expect(coverageBandFor(table, 'EARLY', '2026-08-17', 1)).toEqual({ min: 2, max: 4 })
  })

  it('lets a date override win over the weekday default', () => {
    expect(coverageBandFor(table, 'EARLY', '2026-08-24', 1)).toEqual({ min: 5, max: 5 })
  })

  it('reads an unlisted shift or weekday as no requirement', () => {
    expect(coverageBandFor(table, 'NIGHT', '2026-08-17', 1)).toBe(UNCONSTRAINED_BAND)
    expect(coverageBandFor(table, 'EARLY', '2026-08-18', 2)).toBe(UNCONSTRAINED_BAND)
  })
})
