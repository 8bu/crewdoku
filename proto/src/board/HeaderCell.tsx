import { memo } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { BoardDate } from './mockBoard'
import type { CoverageStatus } from './coverage'

const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

type HeaderCellProps = {
  date: BoardDate
  /** Omitted on the manager coverage grid (`coverage/CoverageGrid.tsx`), which already breaks
   * coverage out as full rows — the header there is a plain date, no bar. */
  coverage?: CoverageStatus
  active?: boolean
  onBarClick?: (dateIso: string, target: HTMLElement) => void
}

function HeaderCellImpl({ date, coverage, active, onBarClick }: HeaderCellProps) {
  const monthStart = date.dayOfMonth === 1
  const top = date.isMonday ? `WK ${date.weekIndex + 1}` : WEEKDAY_SHORT[date.weekday]
  const bottom = monthStart ? `${date.monthShort} ${date.dayOfMonth}` : String(date.dayOfMonth)

  const handleClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onBarClick?.(date.iso, e.currentTarget)
  }

  return (
    <div
      // A Monday's stronger left rule reads as a week divider running down
      // the whole grid (ticket "calendar hierarchy" — period > week > day
      // was previously three cells with identical weight); a month's first
      // day gets the same border plus its own accent so a period spanning
      // a month boundary shows it at a glance, not just as text.
      className="cd-header-cell sticky top-0 z-[2] flex h-[var(--row-h)] flex-col items-center justify-center gap-1 border-b border-[var(--border-strong)] border-l border-l-[var(--grid-line)] bg-base-100 text-2xs text-[color:var(--text-dim)] data-[monday]:border-l-2 data-[monday]:border-l-[var(--border-strong)] data-[month-start]:border-l-2 data-[month-start]:border-l-primary/50"
      data-weekend={date.isWeekend || undefined}
      data-holiday={date.holidayName ? '' : undefined}
      data-holiday-name={date.holidayName ?? undefined}
      data-monday={date.isMonday || undefined}
      data-month-start={monthStart || undefined}
      data-date-iso={date.iso}
    >
      <span
        className={`cd-header-cell__top cd-text-trim font-semibold ${date.isMonday ? 'text-primary' : 'text-base-content'}`}
      >
        {top}
      </span>
      <span
        className={`cd-header-cell__bottom cd-text-trim ${monthStart ? 'font-semibold text-primary' : 'text-[color:var(--text-faint)]'}`}
      >
        {bottom}
      </span>
      {coverage && (
        <button
          type="button"
          className="cd-cov-bar absolute right-0 bottom-0 left-0 h-1 cursor-pointer border-0 bg-[var(--ok)] p-0 transition-[height,filter,background-color] duration-150 ease-out hover:brightness-110 data-[active]:h-1.5 data-[coverage=short]:bg-error data-[coverage=over]:bg-warning"
          data-coverage={coverage}
          data-active={active || undefined}
          aria-label={`Coverage for ${top} ${bottom}: ${coverage}`}
          onClick={handleClick}
        />
      )}
    </div>
  )
}

export const HeaderCell = memo(HeaderCellImpl)
