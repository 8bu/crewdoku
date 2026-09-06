/**
 * Pure selection math for the board grid. Row/col are indices into the
 * currently *visible* person list and the date list — not ids — so a
 * collapsed team simply shrinks the row space. Kept framework-free so it can
 * run outside React (ticket 03: selection lives outside React, driven by a
 * ref layer / event delegation, not component props).
 */

export type Coord = { row: number; col: number }
export type SelectionRange = { anchor: Coord; focus: Coord }
export type Bounds = { maxRow: number; maxCol: number }
export type ArrowDir = 'up' | 'down' | 'left' | 'right'

export function clampCoord(coord: Coord, bounds: Bounds): Coord {
  return {
    row: Math.min(Math.max(coord.row, 0), bounds.maxRow),
    col: Math.min(Math.max(coord.col, 0), bounds.maxCol),
  }
}

export function isSameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col
}

/** Top-left / bottom-right of a range, regardless of which corner is the anchor. */
export function normalizeRange(range: SelectionRange): { min: Coord; max: Coord } {
  return {
    min: { row: Math.min(range.anchor.row, range.focus.row), col: Math.min(range.anchor.col, range.focus.col) },
    max: { row: Math.max(range.anchor.row, range.focus.row), col: Math.max(range.anchor.col, range.focus.col) },
  }
}

export function moveCoord(coord: Coord, dir: ArrowDir, bounds: Bounds): Coord {
  const delta: Coord =
    dir === 'up' ? { row: -1, col: 0 } : dir === 'down' ? { row: 1, col: 0 } : dir === 'left' ? { row: 0, col: -1 } : { row: 0, col: 1 }
  return clampCoord({ row: coord.row + delta.row, col: coord.col + delta.col }, bounds)
}

/** Arrow-key move: with `extend`, only the focus corner moves; otherwise the range collapses to a single cell. */
export function moveSelection(range: SelectionRange, dir: ArrowDir, bounds: Bounds, extend: boolean): SelectionRange {
  const nextFocus = moveCoord(range.focus, dir, bounds)
  return extend ? { anchor: range.anchor, focus: nextFocus } : { anchor: nextFocus, focus: nextFocus }
}

/** Every cell covered by a range, row-major. Bounded by the board size so it can never run away. */
export function rangeCells(range: SelectionRange): Coord[] {
  const { min, max } = normalizeRange(range)
  const cells: Coord[] = []
  for (let row = min.row; row <= max.row; row++) {
    for (let col = min.col; col <= max.col; col++) {
      cells.push({ row, col })
    }
  }
  return cells
}

export function rangeSize(range: SelectionRange): number {
  const { min, max } = normalizeRange(range)
  return (max.row - min.row + 1) * (max.col - min.col + 1)
}
