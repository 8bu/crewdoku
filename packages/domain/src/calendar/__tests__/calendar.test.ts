import { describe, it, expect } from 'vitest'
import { dow, isWeekend, addDays, eachDate, isoWeekKey } from '../calendar'

describe('calendar', () => {
  it('dow is 0=Mon..6=Sun', () => {
    expect(dow('2026-06-15')).toBe(0) // Mon
    expect(dow('2026-06-21')).toBe(6) // Sun
  })
  it('isWeekend true Sat/Sun', () => {
    expect(isWeekend('2026-06-20')).toBe(true) // Sat
    expect(isWeekend('2026-06-18')).toBe(false) // Thu
  })
  it('addDays crosses month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })
  it('eachDate iterates inclusive start over weeks*7 days', () => {
    const dates = eachDate({ startDate: '2026-06-15', weeks: 2 })
    expect(dates.length).toBe(14)
    expect(dates[0]).toBe('2026-06-15')
    expect(dates[13]).toBe('2026-06-28')
  })
  it('isoWeekKey buckets Mon-anchored; Sun shares the Mon bucket', () => {
    expect(isoWeekKey('2026-06-15')).toBe(isoWeekKey('2026-06-21')) // Mon..Sun same week
    expect(isoWeekKey('2026-06-22')).not.toBe(isoWeekKey('2026-06-21')) // next Mon differs
  })
})
