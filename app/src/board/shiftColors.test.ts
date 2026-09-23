import { describe, expect, it } from 'vitest'
import { nextShiftColor } from './shiftColors'

describe('nextShiftColor', () => {
  it('never redundantly repeats a used colour while an unused one remains, even with many undefined entries mixed in', () => {
    const color = nextShiftColor(['amber', 'teal', undefined, undefined, undefined, undefined, undefined, undefined])
    expect(color).not.toBe('amber')
    expect(color).not.toBe('teal')
  })

  it('picks the least-used colour, by actual frequency, once every curated colour has been used at least once', () => {
    // amber used twice, every other curated colour used exactly once.
    const existing = ['amber', 'orange', 'lime', 'teal', 'sky', 'navy', 'rose', 'slate', 'amber']
    expect(nextShiftColor(existing)).toBe('orange') // first count-1 colour in palette order; never the count-2 amber
  })

  it('breaks ties by palette order among colours tied for the minimum count', () => {
    const existing = ['navy', 'navy', 'rose', 'rose', 'slate', 'slate'] // amber..sky all still at count 0
    expect(nextShiftColor(existing)).toBe('amber')
  })
})
