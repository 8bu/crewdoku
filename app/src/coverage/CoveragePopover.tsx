import { useT } from '../i18n/useT'
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import type { Assignment, Person } from '@crewdoku/domain'
import { eligibleFreePeople } from '../board/coverage'
import { coverageDrillAtom } from '../state/coverageDrill'
import { BottomSheet } from '../ui/BottomSheet'
import { useIsNarrow } from '../ui/useIsNarrow'
import type { CoverageViewCell } from './coverageData'

/**
 * The cell drill (ticket 21, 8bu: "popovers"): who is on this shift this
 * day, right here — and one button to the board, which stays the only place
 * that edits. A short cell's jump lands in ticket 06's drill-down with the
 * eligible fixers already lit (via `coverageDrillAtom`).
 *
 * Desktop: `position: fixed` from the clicked cell's viewport rect, clamped to
 * the window — the same floating-popover move as `CellMenu`/`DeleteTeamPopover`,
 * never a layout reflow. A phone gets the same body in a bottom sheet instead
 * (`useIsNarrow`, ui/BottomSheet): the anchor is a cell inside a grid that pans
 * horizontally, so a fixed 260px box would open half off-screen and its
 * `btn-xs` action would sit under the touch-target floor — the sheet is full
 * width, safe-area aware, and gives that action a 44px row.
 */

const POPOVER_W = 260

type CoveragePopoverProps = {
  cell: CoverageViewCell
  rect: { left: number; top: number; width: number; height: number }
  /** Full roster (not the lens scope) — the eligible-free count must match the board's. */
  allPeople: Person[]
  getAssignment: (personId: string, dateIso: string) => Assignment
  onClose: () => void
}

const STATUS_CLS: Record<string, string> = {
  short: 'text-[color:var(--viol)]',
  over: 'text-[color:var(--over)]',
  ok: 'text-[color:var(--ok)]',
}

export function CoveragePopover({ cell, rect, allPeople, getAssignment, onClose }: CoveragePopoverProps) {
  const t = useT()
  const navigate = useNavigate()
  const setDrill = useSetAtom(coverageDrillAtom)
  const freeCount = useMemo(
    () => (cell.status === 'short' ? eligibleFreePeople(allPeople, cell.date.iso, cell.shift.code, getAssignment).length : 0),
    [cell, allPeople, getAssignment],
  )

  const isNarrow = useIsNarrow()

  useEffect(() => {
    // The sheet dismisses itself (backdrop, Escape, close button) and portals
    // outside this component, so a window-level "click outside" would close it
    // on every tap of its own chrome. Desktop popover only.
    if (isNarrow) return
    const closeIfOutside = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.cd-covview-popover')) return
      onClose()
    }
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, isNarrow])

  const statusLabel = cell.status ? t(`rtc.coverage.status.${cell.status}`) : null

  const showOnBoard = () => {
    setDrill({ dateIso: cell.date.iso, shift: cell.status === 'short' ? cell.shift.code : null })
    onClose()
    navigate('/board')
  }

  const body = (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">
          {cell.shift.code} · {cell.date.iso}
        </span>
        {cell.status && <span className={`text-2xs font-semibold uppercase ${STATUS_CLS[cell.status]}`}>{statusLabel}</span>}
      </div>
      <div className="mb-1.5 text-2xs text-[color:var(--text-dim)]">
        {t('rtc.coverage.popover.onDuty', { count: cell.count })}
        {cell.status !== null && ` · ${t('rtc.coverage.popover.needs', { range: cell.max === Infinity ? `${cell.min}+` : `${cell.min}–${cell.max}` })}`}
        {cell.status === 'short' && ` · ${t('rtc.coverage.popover.eligibleFree', { count: freeCount })}`}
      </div>
      {cell.people.length > 0 ? (
        // The desktop popover caps the roster list and scrolls it inside its
        // own 260px box; the sheet already scrolls its body, so the cap would
        // only nest a second scrollbar inside it on a phone.
        <ul className={`m-0 mb-1.5 list-none overflow-y-auto p-0 ${isNarrow ? '' : 'max-h-44'}`}>
          {cell.people.map((p) => (
            <li key={p.id} className="cd-text-trim py-1 text-xs">
              {p.name}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-1.5 py-1 text-xs text-[color:var(--text-faint)]">{t('rtc.coverage.popover.noOne')}</div>
      )}
      <button type="button" className="btn btn-primary btn-xs min-h-11 w-full md:min-h-0" onClick={showOnBoard}>
        {cell.status === 'short' ? t('rtc.coverage.popover.showFixers', { count: freeCount }) : t('rtc.coverage.popover.showOnBoard')}
      </button>
    </>
  )

  if (isNarrow) {
    return (
      <BottomSheet
        open
        onClose={onClose}
        title={t('rtc.coverage.title')}
        // Deliberately the status-free label: under a team lens `status` is
        // null, so the "with status" variant would have to invent one.
        ariaLabel={t('rtc.coverage.cell.aria', { shift: cell.shift.code, date: cell.date.iso, count: cell.count })}
      >
        {body}
      </BottomSheet>
    )
  }

  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - POPOVER_W / 2, window.innerWidth - POPOVER_W - 8))
  const openUp = rect.top > window.innerHeight * 0.6

  return (
    <div
      className="cd-covview-popover fixed z-30 rounded-lg border border-[var(--border-strong)] bg-base-100 p-2 shadow-[var(--shadow-pane)]"
      style={{ left, width: POPOVER_W, ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + rect.height + 4 }) }}
    >
      {body}
    </div>
  )
}
