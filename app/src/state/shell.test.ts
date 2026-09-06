import { describe, expect, it } from 'vitest'
import { createPeriod } from './shell'

describe('createPeriod', () => {
  it('carries the given setup and never a mock-seed flag', () => {
    const period = createPeriod('October', '2026-09-28', 'week', 'ready')
    expect(period.setup).toBe('ready')
    expect('seedMock' in period).toBe(false)
  })

  it('resolves a 1-week length to a 7-day inclusive range', () => {
    const period = createPeriod('October', '2026-09-28', 'week', 'ready')
    expect(period.start).toBe('2026-09-28')
    expect(period.end).toBe('2026-10-04')
  })

  it('resolves a 2-week length to a 14-day inclusive range', () => {
    const period = createPeriod('October', '2026-09-28', 'biweek', 'import')
    expect(period.end).toBe('2026-10-11')
  })

  it('resolves a 1-month length to a 28-day inclusive range', () => {
    const period = createPeriod('October', '2026-09-28', 'month', 'ready')
    expect(period.end).toBe('2026-10-25')
  })

  it('gives every period a unique id', () => {
    const a = createPeriod('A', '2026-09-28', 'week', 'ready')
    const b = createPeriod('B', '2026-09-28', 'week', 'ready')
    expect(a.id).not.toBe(b.id)
  })
})
