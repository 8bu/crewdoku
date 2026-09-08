import { describe, expect, it } from 'vitest'
import { paidHours } from '@crewdoku/domain'
import { generateShifts } from './shiftGenerator'

describe('generateShifts', () => {
  it('generates 3 shifts for a 24h window (0000 to 0000) with coverage min1 max3 all week', () => {
    const result = generateShifts({
      windowStart: '0000',
      windowEnd: '0000',
      shiftCount: 3,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(3)

    expect(result.shifts[0]).toMatchObject({
      code: 'EARLY',
      label: 'Early',
      start: '0000',
      end: '0800',
    })
    expect(result.shifts[1]).toMatchObject({
      code: 'DAY',
      label: 'Day',
      start: '0800',
      end: '1600',
    })
    expect(result.shifts[2]).toMatchObject({
      code: 'LATE',
      label: 'Late',
      start: '1600',
      end: '2400',
    })

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

  it('generates 2 shifts for a 20h window (0400 to 2400)', () => {
    const result = generateShifts({
      windowStart: '0400',
      windowEnd: '2400',
      shiftCount: 2,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(2)
    expect(result.shifts[0]).toMatchObject({
      code: 'EARLY',
      label: 'Early',
      start: '0400',
      end: '1400',
    })
    expect(result.shifts[1]).toMatchObject({
      code: 'LATE',
      label: 'Late',
      start: '1400',
      end: '2400',
    })
  })

  it('extends adjacent shifts by overlapMinutes', () => {
    const result = generateShifts({
      windowStart: '0000',
      windowEnd: '0000',
      shiftCount: 3,
      breakMinutes: 0,
      overlapMinutes: 30,
    })

    expect(result.shifts).toHaveLength(3)
    // Shift 0 starts at 00:00, base ends at 08:00 + 30m = 08:30
    expect(result.shifts[0]).toMatchObject({
      code: 'EARLY',
      start: '0000',
      end: '0830',
    })
    // Shift 1 starts at 08:00 (overlaps shift 0 by 30m), base ends at 16:00 + 30m = 16:30
    expect(result.shifts[1]).toMatchObject({
      code: 'DAY',
      start: '0800',
      end: '1630',
    })
    // Shift 2 starts at 16:00 (overlaps shift 1 by 30m), base ends at 24:00 + 30m = 00:30 next day
    expect(result.shifts[2]).toMatchObject({
      code: 'LATE',
      start: '1600',
      end: '0030',
      isNight: true,
    })
  })

  it('sets unpaidBreakMinutes so domain paidHours calculates clock span minus break', () => {
    const result = generateShifts({
      windowStart: '0800',
      windowEnd: '1600',
      shiftCount: 1,
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
      windowEnd: '0600',
      shiftCount: 1,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(1)
    expect(result.shifts[0]).toMatchObject({
      start: '2200',
      end: '0600',
      isNight: true,
    })
  })

  it('generates S1..Sn codes for shiftCount > 4', () => {
    const result = generateShifts({
      windowStart: '0000',
      windowEnd: '0000',
      shiftCount: 5,
      breakMinutes: 0,
      overlapMinutes: 0,
    })

    expect(result.shifts).toHaveLength(5)
    expect(result.shifts.map((s) => s.code)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5'])
    expect(result.shifts.map((s) => s.label)).toEqual(['Shift 1', 'Shift 2', 'Shift 3', 'Shift 4', 'Shift 5'])
  })
})
