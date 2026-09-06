import { describe, expect, it } from 'vitest'
import { clampCoord, moveSelection, normalizeRange, rangeCells, rangeSize } from './selection'

const bounds = { maxRow: 4, maxCol: 4 }

describe('clampCoord', () => {
  it('clamps below zero and above the max', () => {
    expect(clampCoord({ row: -3, col: 9 }, bounds)).toEqual({ row: 0, col: 4 })
  })
})

describe('normalizeRange', () => {
  it('orders min/max regardless of drag direction', () => {
    const range = { anchor: { row: 3, col: 1 }, focus: { row: 0, col: 2 } }
    expect(normalizeRange(range)).toEqual({ min: { row: 0, col: 1 }, max: { row: 3, col: 2 } })
  })
})

describe('moveSelection', () => {
  const single = { anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } }

  it('collapses to the moved cell when not extending', () => {
    const next = moveSelection(single, 'right', bounds, false)
    expect(next).toEqual({ anchor: { row: 1, col: 2 }, focus: { row: 1, col: 2 } })
  })

  it('extends focus only, keeping the anchor, when extending', () => {
    const next = moveSelection(single, 'down', bounds, true)
    expect(next).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 2, col: 1 } })
  })

  it('will not walk off the board', () => {
    const topLeft = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }
    expect(moveSelection(topLeft, 'up', bounds, false)).toEqual(topLeft)
    expect(moveSelection(topLeft, 'left', bounds, false)).toEqual(topLeft)
  })
})

describe('rangeCells / rangeSize', () => {
  it('enumerates every cell in a 2x3 range row-major', () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 1, col: 2 } }
    expect(rangeCells(range)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ])
    expect(rangeSize(range)).toBe(6)
  })

  it('a single-cell range has size 1', () => {
    const range = { anchor: { row: 2, col: 2 }, focus: { row: 2, col: 2 } }
    expect(rangeSize(range)).toBe(1)
  })
})
