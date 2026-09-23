import { describe, expect, it } from 'vitest'
import { paidHours } from '@crewdoku/domain'
import { generateShifts } from './shiftGenerator'

describe('generateShifts', () => {
  it('places 3 eight-hour shifts from midnight with min1 max3 coverage all week', () => {
    const result = generateShifts({
      windowStart: '0000',
      shiftCount: 3,
      shiftDurationMinutes: 480,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(3)

    expect(result.shifts[0]).toMatchObject({ code: 'EARLY', label: 'Early', start: '0000', end: '0800' })
    expect(result.shifts[1]).toMatchObject({ code: 'DAY', label: 'Day', start: '0800', end: '1600' })
    expect(result.shifts[2]).toMatchObject({ code: 'LATE', label: 'Late', start: '1600', end: '2400' })

    // Coverage requires min 1 and max 3 for each shift code across all 7 days (0..6)
    expect(result.coverage.dateOverrides).toEqual({})
    for (let dow = 0; dow < 7; dow++) {
      expect(result.coverage.byDow[dow]).toEqual({
        EARLY: { min: 1, max: 3 },
        DAY: { min: 1, max: 3 },
        LATE: { min: 1, max: 3 },
      })
    }
  })

  it('honors the shift duration literally, stepping by duration when there is no overlap', () => {
    const result = generateShifts({
      windowStart: '0400',
      shiftCount: 2,
      shiftDurationMinutes: 600,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(2)
    expect(result.shifts[0]).toMatchObject({ code: 'EARLY', label: 'Early', start: '0400', end: '1400' })
    expect(result.shifts[1]).toMatchObject({ code: 'LATE', label: 'Late', start: '1400', end: '2400' })
  })

  it('overlaps consecutive shifts by overlapMinutes (reduces the start step, duration fixed)', () => {
    const result = generateShifts({
      windowStart: '0000',
      shiftCount: 3,
      shiftDurationMinutes: 480,
      breakMinutes: 0,
      overlapMinutes: 30,
    })

    expect(result.shifts).toHaveLength(3)
    // step = 480 − 30 = 450; each shift stays 8h long, so they overlap 30m.
    expect(result.shifts[0]).toMatchObject({ code: 'EARLY', start: '0000', end: '0800' })
    expect(result.shifts[1]).toMatchObject({ code: 'DAY', start: '0730', end: '1530' })
    expect(result.shifts[2]).toMatchObject({ code: 'LATE', start: '1500', end: '2300' })
  })

  it('sets unpaidBreakMinutes so domain paidHours calculates clock span minus break', () => {
    const result = generateShifts({
      windowStart: '0800',
      shiftCount: 1,
      shiftDurationMinutes: 480,
      breakMinutes: 45,
      overlapMinutes: 0,
    })

    expect(result.shifts[0]?.unpaidBreakMinutes).toBe(45)
    // Clock duration: 8.0h, break: 45m (0.75h) -> paidHours: 7.25h
    const paid = paidHours(result.shifts, 'DAY')
    expect(paid).toBe(7.25)
  })

  it('marks a midnight-crossing generated shift with isNight: true', () => {
    const result = generateShifts({
      windowStart: '2200',
      shiftCount: 1,
      shiftDurationMinutes: 480,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(1)
    expect(result.shifts[0]).toMatchObject({ start: '2200', end: '0600', isNight: true })
  })

  it('generates S1..Sn codes for shiftCount > 4', () => {
    const result = generateShifts({
      windowStart: '0000',
      shiftCount: 5,
      shiftDurationMinutes: 480,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(5)
    expect(result.shifts.map((s) => s.code)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5'])
  })

  it('floors the step at 15 min so overlap ≥ duration never coincides or reverses starts', () => {
    const result = generateShifts({
      windowStart: '0000',
      shiftCount: 3,
      shiftDurationMinutes: 480,
      breakMinutes: 0,
      overlapMinutes: 600, // greater than the 480-min duration
    })

    // Starts stay strictly increasing, 15 min apart — never stacked or backwards.
    expect(result.shifts.map((s) => s.start)).toEqual(['0000', '0015', '0030'])
  })
})
