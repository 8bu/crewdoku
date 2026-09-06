import { describe, expect, it } from 'vitest'
import { nextShiftColor, swatchBg, swatchBgMuted, SHIFT_COLORS } from './shiftColors'

describe('nextShiftColor', () => {
  it('picks a colour none of the existing shifts already use', () => {
    const color = nextShiftColor(['amber', 'teal'])
    expect(['amber', 'teal']).not.toContain(color)
  })

  it('ignores shifts with no colour set', () => {
    const color = nextShiftColor([undefined, undefined])
    expect(SHIFT_COLORS.map((c) => c.id)).toContain(color)
  })

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

describe('swatchBg / swatchBgMuted', () => {
  it('reads the matching CSS custom property for a known colour', () => {
    expect(swatchBg('amber')).toBe('var(--sh-amber-bg, var(--sh-slate-bg))')
    expect(swatchBgMuted('amber')).toBe('var(--sh-amber-bg-muted, var(--sh-slate-bg-muted))')
  })

  it('falls back to the default colour when unset', () => {
    expect(swatchBg(undefined)).toBe('var(--sh-slate-bg, var(--sh-slate-bg))')
  })
})
