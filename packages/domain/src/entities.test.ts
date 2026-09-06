import { describe, expect, it } from 'vitest'
import {
  coverageBandFor,
  DEFAULT_SOLVE_SETTINGS,
  HARD_RULE_IDS,
  SOFT_GOAL_IDS,
  UNCONSTRAINED_BAND,
  type CoverageTable,
} from './entities'

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

describe('solve settings defaults', () => {
  it('enables every hard rule and soft goal, in the canonical order', () => {
    expect(HARD_RULE_IDS).toEqual(['H1', 'H2', 'H3', 'H5'])
    for (const id of HARD_RULE_IDS) expect(DEFAULT_SOLVE_SETTINGS.hardRules.enabled[id]).toBe(true)
    expect(DEFAULT_SOLVE_SETTINGS.softGoalOrder).toEqual(SOFT_GOAL_IDS)
    for (const id of SOFT_GOAL_IDS) expect(DEFAULT_SOLVE_SETTINGS.softGoalEnabled[id]).toBe(true)
  })

  it('carries the prototype defaults for the numeric knobs', () => {
    expect(DEFAULT_SOLVE_SETTINGS.hardRules.maxHoursPerWeek).toBe(40)
    expect(DEFAULT_SOLVE_SETTINGS.hardRules.minRestHours).toBe(11)
  })
})
