import type { ShiftDef } from '@crewdoku/domain'
import type { DayCoverage } from './coverage'
import type { OverlayRect } from './useBoardEditing'
import { swatchBg } from './shiftColors'
import { useT } from '../i18n/useT'

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
}

/**
 * Floating breakdown for one date header's coverage bar (ticket 06) — one
 * shared node the board repositions, the same move as `CellMenu` and
 * `ViolationTip`. A short shift is clickable: it dims the grid and lights
 * every person who could fill it (`BoardGrid`'s drill-down). An over-staffed
 * shift is shown, not drilled — nothing to light for "too many people".
 */
const STATUS_COLOR: Record<'short' | 'over' | 'ok', string> = {
  short: 'var(--viol)',
  over: 'var(--over)',
  ok: 'var(--ok)',
}

export function CoveragePanel({ panel, shifts, onShiftClick }: CoveragePanelProps) {
  const t = useT()
  const { day, label, rect, drillShift, freeCount } = panel

  return (
    // cd-cov-panel kept: click-outside detection elsewhere does closest('.cd-cov-panel').
    <div
      className="cd-cov-panel absolute z-[5] w-[240px] border border-[var(--border-strong)] bg-base-100 p-2 shadow-[var(--shadow-pane)]"
      style={{ left: rect.left, top: rect.top + rect.height }}
    >
      <div className="mb-1.5 text-xs font-semibold text-[var(--text-dim)]">{label}</div>
      <ul className="m-0 flex list-none flex-col gap-px p-0">
        {shifts.map((shift) => {
          const s = day.shifts.find((row) => row.shift === shift.code)!
          const active = drillShift === shift.code
          const clickable = s.status === 'short'
          return (
            <li key={shift.code}>
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 border-0 bg-transparent px-1.5 py-1 text-left text-xs text-base-content ${
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
    </div>
  )
}
