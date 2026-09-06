/**
 * Curated shift-colour palette ("shift colour configurable" ticket) — a
 * manager assigns one of these to each shift explicitly, stored as
 * `ShiftDef.color`. Colour used to be derived from a shift's *position* in
 * the catalog array (`shiftSlotIndex`/`swatchBgForSlot`, 4 fixed slots): a
 * reorder or a 5th+ shift silently reassigned or collided colours onto the
 * wrong shift. Identity-based storage fixes both.
 *
 * A closed set of hand-tuned swatches, not a free colour picker: each id
 * maps to a pre-tuned muted-wash + full-swatch pair (`styles.css`,
 * `--sh-<id>-bg` / `--sh-<id>-bg-muted`) in the same family ticket 02
 * established for the original four. An arbitrary user colour would need
 * that muted wash and its text contrast computed on the fly — the same
 * `contrast-color()` WCAG-ratio quirk that made `--viol` pick black text on
 * a red background makes that a real accessibility risk, not just a taste
 * call (8bu's call: curated palette over free-form).
 */
export type ShiftColorId = 'amber' | 'orange' | 'lime' | 'teal' | 'sky' | 'navy' | 'rose' | 'slate'

export const SHIFT_COLORS: { id: ShiftColorId; label: string }[] = [
  { id: 'amber', label: 'Amber' },
  { id: 'orange', label: 'Orange' },
  { id: 'lime', label: 'Lime' },
  { id: 'teal', label: 'Teal' },
  { id: 'sky', label: 'Sky' },
  { id: 'navy', label: 'Navy' },
  { id: 'rose', label: 'Rose' },
  { id: 'slate', label: 'Slate' },
]

/** Falls back to when a shift predates this field (old test fixtures, anything hand-built without a `color`) — never an error, just a neutral default a planner can change. */
const DEFAULT_COLOR: ShiftColorId = 'slate'

/** Full-strength swatch — the small dot in the cell menu, coverage panel, and Settings' shift table. No text is ever drawn on top of it, so it needs no contrast pairing. */
export function swatchBg(colorId: string | undefined): string {
  return `var(--sh-${colorId ?? DEFAULT_COLOR}-bg, var(--sh-${DEFAULT_COLOR}-bg))`
}

/** Muted wash — the board cell's own fill. Paired with `contrast-color()` in CSS for the code/time text drawn on top of it. */
export function swatchBgMuted(colorId: string | undefined): string {
  return `var(--sh-${colorId ?? DEFAULT_COLOR}-bg-muted, var(--sh-${DEFAULT_COLOR}-bg-muted))`
}

/** Picks whichever curated colour is used by the fewest existing shifts (ties broken by palette order) — so a new shift never defaults onto an already-crowded hue, whether that means an entirely unused colour or, once every colour has been used at least once, the least-used one. */
export function nextShiftColor(existingColors: (string | undefined)[]): ShiftColorId {
  const counts = new Map<ShiftColorId, number>(SHIFT_COLORS.map((c) => [c.id, 0]))
  for (const c of existingColors) {
    if (c && counts.has(c as ShiftColorId)) counts.set(c as ShiftColorId, counts.get(c as ShiftColorId)! + 1)
  }
  let best = SHIFT_COLORS[0]!.id
  let bestCount = Infinity
  for (const { id } of SHIFT_COLORS) {
    const count = counts.get(id)!
    if (count < bestCount) {
      bestCount = count
      best = id
    }
  }
  return best
}
