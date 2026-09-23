import { describe, expect, it } from 'vitest'
import { DEFAULT_SOLVE_SETTINGS } from '@crewdoku/domain'
import type { SolveSettings } from '@crewdoku/domain'
import { rankWeights } from './weights'

describe('rankWeights', () => {
  it('honors custom softGoalOrder when all are enabled', () => {
    const settings: SolveSettings = {
      ...DEFAULT_SOLVE_SETTINGS,
      softGoalOrder: ['S2', 'S1', 'S5', 'S3', 'S4'],
    }
    const weights = rankWeights(settings)
    expect(weights).toEqual({
      S2: 10000,
      S1: 1000,
      S5: 100,
      S3: 10,
      S4: 1,
    })
  })

  it('assigns 0 to disabled goals and shifts enabled goals up', () => {
    const settings: SolveSettings = {
      ...DEFAULT_SOLVE_SETTINGS,
      softGoalOrder: ['S1', 'S2', 'S3', 'S4', 'S5'],
      softGoalEnabled: {
        S1: true,
        S2: false,
        S3: true,
        S4: false,
        S5: true,
      },
    }
    const weights = rankWeights(settings)
    // 3 enabled: n=3 -> 100, 10, 1
    expect(weights).toEqual({
      S1: 100,
      S2: 0,
      S3: 10,
      S4: 0,
      S5: 1,
    })
  })
})
