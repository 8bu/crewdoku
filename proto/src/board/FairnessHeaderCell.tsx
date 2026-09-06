import { memo } from 'react'
import { WarningTriangleIcon } from './icons'

/**
 * Sticky in both directions at once — top like every date header, right like
 * the fairness column itself — the same corner idea as `.cd-board__corner`,
 * mirrored onto the opposite edge (ticket 08).
 *
 * A bare column glyph (ticket "load column semantics", narrowed again by
 * 8bu's dedupe call): the column below is a strict remainder lane — it only
 * ever marks violations that have no board cell to carry their red dot, so
 * a cell-anchored break is told exactly once, on its cell. See
 * `partitionViolationsForBoard` for the split.
 */
function FairnessHeaderCellImpl() {
  return (
    // cd-fair-header kept: pinned-corner sticky/scroll-shadow CSS in styles.css targets it
    // from outside this component; the label styling below moved to Tailwind directly
    // rather than sharing HeaderCell's .cd-header-cell__top (still live there).
    <div
      className="cd-fair-header flex items-center justify-center text-[var(--text-dim)]"
    >
      <WarningTriangleIcon className="h-4 w-4 shrink-0" />
    </div>
  )
}

export const FairnessHeaderCell = memo(FairnessHeaderCellImpl)
