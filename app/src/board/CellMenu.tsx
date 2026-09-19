import { useT } from '../i18n/useT'
import { OFF_CODE, type ShiftDef } from '@crewdoku/domain'
import type { CellMenuState } from './useBoardEditing'
import { swatchBg } from './shiftColors'
import { BottomSheet } from '../ui/BottomSheet'
import { useIsNarrow } from '../ui/useIsNarrow'

type CellMenuProps = {
  menu: CellMenuState
  shifts: ShiftDef[]
  /** shift code -> single-letter keyboard shortcut (ticket "kbd hints"), from
   * `useBoardEditing`'s `keyHintByCode`. A code with no entry has no
   * shortcut (a letter collision) and renders with no badge. */
  keyHints: Record<string, string>
  onChoose: (code: string) => void
  onReleasePin: () => void
  /** Mobile only: the BottomSheet's own dismissal (backdrop, Escape, its
   * close button). The desktop popover closes through the board's
   * outside-mousedown listener instead. */
  onClose: () => void
}

/**
 * Mouse-only path onto the same edit as a keystroke (ticket 05 follow-up):
 * a planner without a keyboard double-clicks a cell — or clicks it a second
 * time once it's already selected — and picks from here. Each option also
 * surfaces its single-letter shortcut so this menu doubles as how a planner
 * *discovers* the shorthand, not just a fallback for someone without one.
 *
 * On a phone the same list renders as a bottom sheet: an absolutely-
 * positioned popover anchored to a 76px cell would either run off the right
 * edge or cover the column it's editing, and a full-width row is the honest
 * touch target for it. The keyboard hints are dropped there — there is no
 * hardware keyboard to hint at, and quoting one would be noise.
 */
export function CellMenu({ menu, shifts, keyHints, onChoose, onReleasePin, onClose }: CellMenuProps) {
  const { rect, pinned } = menu
  const isNarrow = useIsNarrow()
  const t = useT()

  const options = [
    ...shifts.map((shift) => ({ code: shift.code, color: shift.color, label: shift.code, time: `${shift.start}–${shift.end}`, hint: keyHints[shift.code] })),
    { code: OFF_CODE, color: undefined, label: t('board.menu.dayOff'), time: undefined, hint: keyHints[OFF_CODE] },
  ]

  const itemClass =
    'cd-cell-menu__item flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-3 py-2 text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200 md:min-h-0 md:gap-1.5 md:px-1.5 md:py-1.5 md:text-xs'

  const list = (
    <>
      {options.map((option) => (
        <button key={option.code} type="button" className={itemClass} onClick={() => onChoose(option.code)}>
          <span
            className={`cd-cell-menu__swatch h-2.5 w-2.5 flex-none rounded-xs ${option.color ? '' : 'bg-[var(--sh-off-bd)]'}`}
            style={option.color ? { background: swatchBg(option.color) } : undefined}
          />
          <span className="cd-cell-menu__label flex-1 font-semibold">{option.label}</span>
          {option.time && (
            <span className="cd-cell-menu__time font-[family-name:var(--font-mono)] text-2xs text-[color:var(--text-faint)]">
              {option.time}
            </span>
          )}
          {!isNarrow && option.hint && (
            <kbd className="kbd kbd-xs flex-none font-[family-name:var(--font-mono)] uppercase">{option.hint}</kbd>
          )}
        </button>
      ))}
      {pinned && (
        <button
          type="button"
          className={`${itemClass} cd-cell-menu__item--release mt-0.5 border-t border-t-[var(--border)] text-[color:var(--text-dim)]`}
          onClick={onReleasePin}
        >
          {t('board.menu.releasePin')}
        </button>
      )}
    </>
  )

  if (isNarrow) {
    return (
      <BottomSheet open onClose={onClose} title={t('board.menu.title')} ariaLabel={t('board.menu.title')}>
        <div className="cd-cell-menu flex flex-col gap-1">{list}</div>
      </BottomSheet>
    )
  }

  return (
    <div
      className="cd-cell-menu absolute z-[5] flex min-w-[132px] flex-col gap-px rounded-lg border border-[var(--border-strong)] bg-base-100 p-1 shadow-[var(--shadow-pane)]"
      style={{ left: rect.left, top: rect.top + rect.height }}
    >
      {list}
    </div>
  )
}
