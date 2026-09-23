import { describe, expect, it } from 'vitest'
import type { ShiftDef } from '@crewdoku/domain'
import {
  durationMinutes,
  moveShift,
  resizeHead,
  resizeTail,
  setDurationOne,
  snapMinutes,
} from './shiftEditing'

const THREE_SHIFTS: ShiftDef[] = [
  {
    code: 'S1',
    label: 'Morning',
    start: '0000',
    end: '0300',
    color: 'emerald',
    unpaidBreakMinutes: 15,
  },
  {
    code: 'S2',
    label: 'Afternoon',
    start: '0300',
    end: '0600',
    color: 'sky',
    unpaidBreakMinutes: 30,
  },
  {
    code: 'S3',
    label: 'Evening',
    start: '0600',
    end: '0900',
    color: 'violet',
  },
]

describe('snapMinutes', () => {
  it('rounds to nearest 5 minutes by default', () => {
    expect(snapMinutes(0)).toBe(0)
    expect(snapMinutes(2)).toBe(0)
    expect(snapMinutes(3)).toBe(5)
    expect(snapMinutes(7)).toBe(5)
    expect(snapMinutes(8)).toBe(10)
    expect(snapMinutes(12)).toBe(10)
    expect(snapMinutes(13)).toBe(15)
    expect(snapMinutes(1438)).toBe(1440)
  })

  it('supports custom step', () => {
    expect(snapMinutes(12, 15)).toBe(15)
    expect(snapMinutes(7, 15)).toBe(0)
    expect(snapMinutes(23, 10)).toBe(20)
  })

  it('clamps to [0, 1440]', () => {
    expect(snapMinutes(-25)).toBe(0)
    expect(snapMinutes(1500)).toBe(1440)
  })
})

describe('durationMinutes', () => {
  it('computes clock duration for normal same-day shifts', () => {
    const shift: ShiftDef = { code: 'D', label: 'Day', start: '0800', end: '1600' }
    expect(durationMinutes(shift)).toBe(480)
  })

  it('computes clock duration for midnight-wrapping shifts', () => {
    const shift: ShiftDef = { code: 'N', label: 'Night', start: '2200', end: '0600', isNight: true }
    expect(durationMinutes(shift)).toBe(480)
  })

  it('computes clock duration for 2400 end-of-day shifts', () => {
    const fullDay: ShiftDef = { code: 'ALL', label: 'All day', start: '0000', end: '2400' }
    expect(durationMinutes(fullDay)).toBe(1440)

    const halfDay: ShiftDef = { code: 'PM', label: 'PM', start: '1200', end: '2400' }
    expect(durationMinutes(halfDay)).toBe(720)
  })

  it('computes 24h duration when start equals end', () => {
    const shift: ShiftDef = { code: 'WRAP', label: '24h', start: '2000', end: '2000' }
    expect(durationMinutes(shift)).toBe(1440)
  })
})

describe('setDurationOne', () => {
  it('sets duration for a single shift by index without altering others', () => {
    const res = setDurationOne(THREE_SHIFTS, 1, 300)
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('0300')

    expect(res[1]?.start).toBe('0300')
    expect(res[1]?.end).toBe('0800')
    expect(res[1]?.isNight).toBeUndefined()

    expect(res[2]?.start).toBe('0600')
    expect(res[2]?.end).toBe('0900')
  })

  it('enforces 15-minute floor for single shift', () => {
    const res = setDurationOne(THREE_SHIFTS, 0, 5)
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('0015')
  })

  it('returns unchanged copy for invalid index', () => {
    const res = setDurationOne(THREE_SHIFTS, 99, 300)
    expect(res).toEqual(THREE_SHIFTS)
    expect(res).not.toBe(THREE_SHIFTS)
  })
})

describe('resizeHead', () => {
  it('resizes head leftwards, creating overlap without disturbing neighbors', () => {
    const res = resizeHead(THREE_SHIFTS, 1, 120) // '0200'
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('0300')

    expect(res[1]?.start).toBe('0200')
    expect(res[1]?.end).toBe('0600')

    expect(res[2]?.start).toBe('0600')
    expect(res[2]?.end).toBe('0900')
  })

  it('resizes head rightwards, creating gap without disturbing neighbors', () => {
    const res = resizeHead(THREE_SHIFTS, 1, 240) // '0400'
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('0300')

    expect(res[1]?.start).toBe('0400')
    expect(res[1]?.end).toBe('0600')

    expect(res[2]?.start).toBe('0600')
    expect(res[2]?.end).toBe('0900')
  })

  it('enforces 15-minute floor by clamping start to end - 15', () => {
    const res = resizeHead(THREE_SHIFTS, 1, 355) // target 05:55, end is 06:00 (360)
    expect(res[1]?.start).toBe('0545')
    expect(res[1]?.end).toBe('0600')
  })

  it('recomputes isNight when resized shift crosses midnight', () => {
    const nightShift: ShiftDef[] = [
      { code: 'N', label: 'Night', start: '2200', end: '0600', isNight: true },
    ]
    const res = resizeHead(nightShift, 0, 1200) // '2000'
    expect(res[0]?.start).toBe('2000')
    expect(res[0]?.end).toBe('0600')
    expect(res[0]?.isNight).toBe(true)
  })
})

describe('resizeTail', () => {
  it('resizes tail rightwards, creating overlap without disturbing neighbors', () => {
    const res = resizeTail(THREE_SHIFTS, 0, 240) // '0400'
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('0400')

    expect(res[1]?.start).toBe('0300')
    expect(res[1]?.end).toBe('0600')

    expect(res[2]?.start).toBe('0600')
    expect(res[2]?.end).toBe('0900')
  })

  it('resizes tail leftwards, creating gap without disturbing neighbors', () => {
    const res = resizeTail(THREE_SHIFTS, 0, 120) // '0200'
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('0200')

    expect(res[1]?.start).toBe('0300')
    expect(res[1]?.end).toBe('0600')
  })

  it('enforces 15-minute floor by clamping end to start + 15', () => {
    const res = resizeTail(THREE_SHIFTS, 0, 5)
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('0015')
  })

  it('encodes 24:00 end as 2400', () => {
    const res = resizeTail(THREE_SHIFTS, 0, 1440)
    expect(res[0]?.start).toBe('0000')
    expect(res[0]?.end).toBe('2400')
  })

  it('recomputes isNight when tail resize crosses midnight', () => {
    const res = resizeTail(THREE_SHIFTS, 2, 60) // starts at 0600, end set to 0100 (60)
    expect(res[2]?.start).toBe('0600')
    expect(res[2]?.end).toBe('0100')
    expect(res[2]?.isNight).toBe(true)
  })
})

describe('moveShift', () => {
  it('rolls the whole ring right by delta, contiguous tiling stays contiguous', () => {
    // S1 [0000..0300], S2 [0300..0600], S3 [0600..0900]; roll +60 -> every shift +60.
    const res = moveShift(THREE_SHIFTS, 0, 60)
    expect(res[0]?.start).toBe('0100')
    expect(res[0]?.end).toBe('0400')
    expect(res[1]?.start).toBe('0400')
    expect(res[1]?.end).toBe('0700')
    expect(res[2]?.start).toBe('0700')
    expect(res[2]?.end).toBe('1000')
  })

  it('rotates rigidly regardless of which shift is grabbed', () => {
    // Grabbing S1 or S3 with the same delta yields the identical ring rotation.
    const viaFirst = moveShift(THREE_SHIFTS, 0, 120)
    const viaLast = moveShift(THREE_SHIFTS, 2, 120)
    expect(viaFirst).toEqual(viaLast)
    expect(viaFirst[0]?.start).toBe('0200')
    expect(viaFirst[1]?.start).toBe('0500')
    expect(viaFirst[2]?.start).toBe('0800')
  })

  it('rolls a no-slack full-day tiling past midnight (the reported case)', () => {
    // D [00:00..08:00], M [08:00..16:00], N [16:00..24:00]; drag +2h -> N rolls off the
    // right edge and wraps onto the left, exactly the diagram:
    //   [NN][DDDDDDDD][MMMMMMMM][NNNNNN]
    const ring: ShiftDef[] = [
      { ...THREE_SHIFTS[0]!, code: 'D', start: '0000', end: '0800' },
      { ...THREE_SHIFTS[1]!, code: 'M', start: '0800', end: '1600' },
      { ...THREE_SHIFTS[2]!, code: 'N', start: '1600', end: '2400' },
    ]
    const res = moveShift(ring, 0, 120)
    expect(res[0]?.start).toBe('0200')
    expect(res[0]?.end).toBe('1000')
    expect(res[1]?.start).toBe('1000')
    expect(res[1]?.end).toBe('1800')
    expect(res[2]?.start).toBe('1800')
    expect(res[2]?.end).toBe('0200')
    expect(res[2]?.isNight).toBe(true)
  })

  it('wraps the leading shift past 00:00 when rolling left', () => {
    // Roll THREE_SHIFTS left by 60 -> every shift -60; S1 rolls before midnight.
    const res = moveShift(THREE_SHIFTS, 1, -60)
    expect(res[0]?.start).toBe('2300')
    expect(res[0]?.end).toBe('0200')
    expect(res[0]?.isNight).toBe(true)
    expect(res[1]?.start).toBe('0200')
    expect(res[1]?.end).toBe('0500')
    expect(res[2]?.start).toBe('0500')
    expect(res[2]?.end).toBe('0800')
  })

  it('snaps delta to 5-minute increments across the whole ring', () => {
    const res = moveShift(THREE_SHIFTS, 0, 32) // snaps to +30
    expect(res[0]?.start).toBe('0030')
    expect(res[1]?.start).toBe('0330')
  })

  it('returns unchanged shifts when delta snaps to 0 or index is invalid', () => {
    expect(moveShift(THREE_SHIFTS, 0, 0)).toEqual(THREE_SHIFTS)
    expect(moveShift(THREE_SHIFTS, 0, 2)).toEqual(THREE_SHIFTS) // snaps to 0
    expect(moveShift(THREE_SHIFTS, -1, 50)).toEqual(THREE_SHIFTS)
  })
})
