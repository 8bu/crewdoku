import { useT } from '../i18n/useT'
import { memo } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { BoardDate } from './mockBoard'
import type { CoverageStatus } from './coverage'

const WEEKDAY_KEYS = [
  'board.header.weekday.sun',
  'board.header.weekday.mon',
  'board.header.weekday.tue',
  'board.header.weekday.wed',
  'board.header.weekday.thu',
  'board.header.weekday.fri',
  'board.header.weekday.sat',
] as const

type HeaderCellProps = {
  date: BoardDate
  /** Omitted on the manager coverage grid (`coverage/CoverageGrid.tsx`), which already breaks
   * coverage out as full rows — the header there is a plain date, no bar. */
  coverage?: CoverageStatus
  active?: boolean
  onBarClick?: (dateIso: string, target: HTMLElement) => void
}

function HeaderCellImpl({ date, coverage, active, onBarClick }: HeaderCellProps) {
  const t = useT()
  const monthStart = date.dayOfMonth === 1
  const top = date.isMonday ? t('board.header.week', { week: date.weekIndex + 1 }) : t(WEEKDAY_KEYS[date.weekday] ?? '')
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
        // One button, two geometries: a 4px visual bar on desktop (unchanged)
        // and a 24px-tall touch lane on a phone, where 4px is not a target.
        // The painted bar is a child span on mobile so the button itself can
        // stay transparent and taller without drawing a slab over the date.
        <button
          type="button"
          className="cd-cov-bar group absolute right-0 bottom-0 left-0 h-6 cursor-pointer border-0 bg-transparent p-0 md:h-1 md:bg-[var(--ok)] md:transition-[height,filter,background-color] md:duration-150 md:ease-out md:hover:brightness-110 md:data-[active]:h-1.5 md:data-[coverage=short]:bg-error md:data-[coverage=over]:bg-warning"
          data-coverage={coverage}
          data-active={active || undefined}
          aria-label={t('board.header.coverageAria', { date: `${top} ${bottom}`, coverage })}
          onClick={handleClick}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-[var(--ok)] transition-[height,filter,background-color] duration-150 ease-out group-hover:brightness-110 group-data-[active]:h-1.5 group-data-[coverage=short]:bg-error group-data-[coverage=over]:bg-warning md:hidden"
          />
        </button>
      )}
    </div>
  )
}

export const HeaderCell = memo(HeaderCellImpl)
