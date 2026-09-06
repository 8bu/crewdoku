import { memo } from 'react'
import type { Violation } from './violations'
import { WarningTriangleIcon } from './icons'

type FairnessCellProps = {
  personId: string
  /** Remainder only (8bu: "if that error's alr in the row's cell red tiny dot,
   * do not put it in the list again"): violations with no rendered board cell
   * to own their red dot — see `partitionViolationsForBoard`. Violations that
   * are already marked on a cell never reach this prop. */
  violations: Violation[]
}

/**
 * Pinned right of the grid (ticket 08's column, repurposed twice since): a
 * per-person overflow lane for rule breaks that have no board cell to live
 * on. A break that IS on a cell is told by that cell's red dot and hover,
 * exactly once — this cell deliberately renders nothing for those, not even
 * an "all clear" mark, so the icon's presence always means "there is detail
 * here you cannot reach through any cell". Every current rule kind anchors
 * to a cell, so this stays empty today by construction.
 *
 * Carries `data-person-id` (ticket 09) so a selected person's row highlight
 * — written straight to the DOM via that attribute, same as everywhere else
 * on the board — reaches this cell too, not just the name and day cells.
 */
function FairnessCellImpl({ personId, violations }: FairnessCellProps) {
  return (
    <div
      // cd-fair-cell kept: pinned-column sticky/scroll-shadow/selected-person-glow CSS in
      // styles.css targets this class from outside this component.
      className="cd-fair-cell flex items-center justify-center"
      data-person-id={personId}
    >
      {violations.length > 0 && <WarningTriangleIcon className="h-6 w-6 shrink-0 text-[var(--viol)]" />}
    </div>
  )
}

export const FairnessCell = memo(FairnessCellImpl)
