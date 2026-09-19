import { useT } from '../i18n/useT'
import { memo } from 'react'
import type { CoverageViewCell } from './coverageData'

/**
 * One pivot cell (ticket 21): headcount over the authored band, coloured by
 * status. Names moved to the click popover — the old 120px scrolling name
 * stacks made the period impossible to take in at one look, which is this
 * view's whole job.
 */

type CoverageCellProps = {
  cell: CoverageViewCell
  active: boolean
  onOpen: (cell: CoverageViewCell, target: HTMLElement) => void
}

/** Status tint decided in JS: a weekend tint and a status tint on the same
 * element would fight as competing `bg-*` utilities. Status wins. */
function tone(cell: CoverageViewCell): string {
  if (cell.status === 'short') return 'bg-error/10 text-[color:var(--viol)]'
  if (cell.status === 'over') return 'bg-warning/15 text-[color:var(--over)]'
  if (cell.date.isWeekend || cell.date.holidayName) return 'bg-[var(--weekend-tint)]'
  return 'bg-base-100'
}

function bandLabel(cell: CoverageViewCell): string {
  return cell.max === Infinity ? `${cell.min}+` : `${cell.min}–${cell.max}`
}

function CoverageCellImpl({ cell, active, onOpen }: CoverageCellProps) {
  const t = useT()
  return (
    /* `--cov-row-h` is 52px on a phone (48px desktop), so the cell is a real
       tap target either way; `min-h-11` pins the 44px floor the token happens
       to clear, and `md:min-h-0` keeps the desktop track's own sizing intact.
       `touch-manipulation` drops the double-tap-zoom wait on a tap (pinch
       still zooms); v4 already gates `hover:` behind `(hover: hover)`. */
    <button
      type="button"
      className={`flex h-[var(--cov-row-h)] min-h-11 cursor-pointer touch-manipulation flex-col items-center justify-center gap-0.5 border-b border-l border-b-[var(--border)] border-l-[var(--grid-line)] p-0 transition-colors duration-150 hover:brightness-95 md:min-h-0 data-[active]:outline-2 data-[active]:-outline-offset-2 data-[active]:outline-[var(--sel)] ${tone(cell)}`}
      data-active={active || undefined}
      data-status={cell.status ?? undefined}
      aria-label={
        cell.status
          ? t('rtc.coverage.cell.ariaWithStatus', {
              shift: cell.shift.code,
              date: cell.date.iso,
              count: cell.count,
              status: t(`rtc.coverage.status.${cell.status}`),
            })
          : t('rtc.coverage.cell.aria', {
              shift: cell.shift.code,
              date: cell.date.iso,
              count: cell.count,
            })
      }
      onClick={(e) => onOpen(cell, e.currentTarget)}
    >
      <span className="cd-text-trim text-sm font-semibold tabular-nums">{cell.count}</span>
      {cell.status !== null && (
        <span className="cd-text-trim text-2xs tabular-nums opacity-60">{bandLabel(cell)}</span>
      )}
    </button>
  )
}

export const CoverageCell = memo(CoverageCellImpl)
