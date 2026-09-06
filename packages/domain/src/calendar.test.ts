import { describe, expect, it } from 'vitest'
import { addDays, eachDate, isWeekend, periodLengthDays, weekdayOf, weekIndexOf } from './calendar'

describe('addDays', () => {
  it('crosses month, year, and leap boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // 2028 is a leap year
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01') // 2026 is not
  })

  it('goes backwards', () => {
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('weekdayOf', () => {
  it('matches known dates, 0 Sun .. 6 Sat', () => {
    expect(weekdayOf('2026-08-17')).toBe(1) // the proto seed period starts on a Monday
    expect(weekdayOf('2026-08-16')).toBe(0)
    expect(weekdayOf('2026-08-22')).toBe(6)
  })
})

describe('isWeekend', () => {
  it('is true only for Saturday and Sunday', () => {
    expect(isWeekend('2026-08-22')).toBe(true)
    expect(isWeekend('2026-08-23')).toBe(true)
    expect(isWeekend('2026-08-24')).toBe(false)
  })
})

describe('periodLengthDays', () => {
  it('counts inclusively', () => {
    expect(periodLengthDays('2026-08-17', '2026-08-17')).toBe(1)
    expect(periodLengthDays('2026-08-17', '2026-08-23')).toBe(7)
    expect(periodLengthDays('2026-08-17', '2026-09-27')).toBe(42) // the proto seed period
  })
})

describe('eachDate', () => {
  it('yields the inclusive ordered range', () => {
    expect(eachDate('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ])
  })

  it('yields one date for a one-day range and none for an inverted one', () => {
    expect(eachDate('2026-08-17', '2026-08-17')).toEqual(['2026-08-17'])
    expect(eachDate('2026-08-18', '2026-08-17')).toEqual([])
  })
})

describe('weekIndexOf', () => {
  it('buckets days 0-6 into week 0, 7-13 into week 1, from the period start', () => {
    expect(weekIndexOf('2026-08-17', '2026-08-17')).toBe(0)
    expect(weekIndexOf('2026-08-17', '2026-08-23')).toBe(0)
    expect(weekIndexOf('2026-08-17', '2026-08-24')).toBe(1)
    expect(weekIndexOf('2026-08-17', '2026-09-27')).toBe(5) // day 41 -> week 5 of a 6-week period
  })
})
