import { useT } from '../i18n/useT'
import { memo } from 'react'
import type { Assignment } from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'

type DayCellProps = {
  personId: string
  assignment: Assignment
  date: BoardDate
  /** Any rule break anchored to this cell — ineligible code, no rest, or a future rule (ticket 07). */
  violated?: boolean
  /** This cell is part of a pending proposal (ticket 12) — the value shown is the *new* one. */
  proposed?: boolean
  /** Which curated swatch (`board/shiftColors.ts`) this shift renders in — identity-based, not positional, so a rename or reorder keeps its hue. `undefined` for OFF or an uncoloured shift. */
  shiftColor?: string
}

/**
 * Deliberately unaware of selection (ticket 03 / ticket 05): the board
 * drives selection and typing from outside React via data-person-id /
 * data-date-iso, so this component never re-renders for a selection change.
 */
function DayCellImpl({ personId, assignment, date, violated, proposed, shiftColor }: DayCellProps) {
  const code = assignment.code
  const t = useT()
  return (
    <div
      className="cd-cell"
      data-person-id={personId}
      data-date-iso={date.iso}
      data-shift={code}
      data-shift-color={shiftColor ?? undefined}
      data-weekend={date.isWeekend || undefined}
      data-holiday={date.holidayName ? '' : undefined}
      data-monday={date.isMonday || undefined}
      data-pinned={assignment.pinned || undefined}
      data-violation={violated || undefined}
      data-proposal-changed={proposed || undefined}
      title={assignment.pinned ? t('board.cell.pinnedTitle') : undefined}
    >
      <span className="cd-cell__code cd-text-trim">{code === 'OFF' ? '—' : code}</span>
      <span className="cd-cell__time cd-text-trim">
        {assignment.start ? `${assignment.start} ${assignment.end}` : ' '}
      </span>
    </div>
  )
}

export const DayCell = memo(DayCellImpl)
