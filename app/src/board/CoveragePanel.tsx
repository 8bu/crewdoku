import type { ShiftDef } from '@crewdoku/domain'
import type { DayCoverage } from './coverage'
import type { OverlayRect } from './useBoardEditing'
import { swatchBg } from './shiftColors'
import { useT } from '../i18n/useT'
import { BottomSheet } from '../ui/BottomSheet'
import { useIsNarrow } from '../ui/useIsNarrow'

export type CoveragePanelState = {
  day: DayCoverage
  label: string
  rect: OverlayRect
  drillShift: string | null
  freeCount: number
}

type CoveragePanelProps = {
  panel: CoveragePanelState
  shifts: ShiftDef[]
  onShiftClick: (shift: string) => void
  /** Mobile only: the BottomSheet's own dismissal. On desktop the board's
   * click-outside listener closes the floating panel, same as the cell menu. */
  onClose: () => void
}

/**
 * Floating breakdown for one date header's coverage bar (ticket 06) — one
 * shared node the board repositions, the same move as `CellMenu` and
 * `ViolationTip`. A short shift is clickable: it dims the grid and lights
 * every person who could fill it (`BoardGrid`'s drill-down). An over-staffed
 * shift is shown, not drilled — nothing to light for "too many people".
 *
 * On a phone it renders as a bottom sheet instead: a 240px card anchored to a
 * header cell has nowhere to go on a 390px screen, and the drill-down it
 * starts (dim the grid, light the eligible cells) reads better once the sheet
 * is dismissed anyway. Same rows, same drill, touch-sized targets.
 */
const STATUS_COLOR: Record<'short' | 'over' | 'ok', string> = {
  short: 'var(--viol)',
  over: 'var(--over)',
  ok: 'var(--ok)',
}

export function CoveragePanel({ panel, shifts, onShiftClick, onClose }: CoveragePanelProps) {
  const t = useT()
  const isNarrow = useIsNarrow()
  const { day, label, rect, drillShift, freeCount } = panel

  const rows = (
    <ul className="m-0 flex list-none flex-col gap-px p-0">
      {shifts.map((shift) => {
        const s = day.shifts.find((row) => row.shift === shift.code)!
        const active = drillShift === shift.code
        const clickable = s.status === 'short'
        return (
          <li key={shift.code}>
            <button
              type="button"
              className={`flex min-h-11 w-full items-center gap-2 border-0 bg-transparent px-2 py-2 text-left text-sm text-base-content md:min-h-0 md:gap-1.5 md:px-1.5 md:py-1 md:text-xs ${
                clickable ? 'cursor-pointer hover:bg-base-200' : 'cursor-default'
              } ${active ? 'bg-[var(--sel-bg)]' : ''}`}
              data-status={s.status}
              data-active={active || undefined}
              disabled={!clickable}
              onClick={() => clickable && onShiftClick(shift.code)}
            >
              <span
                className="h-2 w-2 flex-none rounded-sm"
                style={{ background: swatchBg(shift.color) }}
              />
              <span className="w-11 truncate font-semibold">{shift.code}</span>
              <span className="flex-1 font-mono text-2xs text-[var(--text-faint)]">
                {shift.start}–{shift.end}
              </span>
              <span className="font-mono font-semibold" style={{ color: STATUS_COLOR[s.status] }}>
                {s.count}/{s.status === 'over' ? s.max : s.min}
              </span>
            </button>
            {active && (
              <div className="py-1.5 pr-1.5 pl-5 text-2xs text-[var(--text-faint)]">
                {freeCount === 0
                  ? t('panels.coverage.noneEligible')
                  : t(
                      freeCount === 1
                        ? 'panels.coverage.eligibleFree_one'
                        : 'panels.coverage.eligibleFree_other',
                      { n: freeCount }
                    )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )

  if (isNarrow) {
    return (
      <BottomSheet open onClose={onClose} title={label}>
        {rows}
      </BottomSheet>
    )
  }

  return (
    // cd-cov-panel kept: click-outside detection elsewhere does closest('.cd-cov-panel').
    <div
      className="cd-cov-panel absolute z-[5] w-[240px] border border-[var(--border-strong)] bg-base-100 p-2 shadow-[var(--shadow-pane)]"
      style={{ left: rect.left, top: rect.top + rect.height }}
    >
      <div className="mb-1.5 text-xs font-semibold text-[var(--text-dim)]">{label}</div>
      {rows}
    </div>
  )
}
