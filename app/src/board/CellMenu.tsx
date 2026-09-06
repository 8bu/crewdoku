import { useT } from '../i18n/useT'
import { OFF_CODE, type ShiftDef } from '@crewdoku/domain'
import type { CellMenuState } from './useBoardEditing'
import { swatchBg } from './shiftColors'

type CellMenuProps = {
  menu: CellMenuState
  shifts: ShiftDef[]
  /** shift code -> single-letter keyboard shortcut (ticket "kbd hints"), from
   * `useBoardEditing`'s `keyHintByCode`. A code with no entry has no
   * shortcut (a letter collision) and renders with no badge. */
  keyHints: Record<string, string>
  onChoose: (code: string) => void
  onReleasePin: () => void
}

function KeyHint({ letter }: { letter: string | undefined }) {
  if (!letter) return null
  return <kbd className="kbd kbd-xs flex-none font-[family-name:var(--font-mono)] uppercase">{letter}</kbd>
}

/**
 * Mouse-only path onto the same edit as a keystroke (ticket 05 follow-up):
 * a planner without a keyboard double-clicks a cell — or clicks it a second
 * time once it's already selected — and picks from here. Each option also
 * surfaces its single-letter shortcut so this menu doubles as how a planner
 * *discovers* the shorthand, not just a fallback for someone without one.
 */
export function CellMenu({ menu, shifts, keyHints, onChoose, onReleasePin }: CellMenuProps) {
  const { rect, pinned } = menu
  const t = useT()
  return (
    <div
      className="cd-cell-menu absolute z-[5] flex min-w-[132px] flex-col gap-px rounded-lg border border-[var(--border-strong)] bg-base-100 p-1 shadow-[var(--shadow-pane)]"
      style={{ left: rect.left, top: rect.top + rect.height }}
    >
      {shifts.map((shift) => (
        <button
          key={shift.code}
          type="button"
          className="cd-cell-menu__item flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1.5 text-left text-xs text-base-content transition-colors duration-150 hover:bg-base-200"
          onClick={() => onChoose(shift.code)}
        >
          <span
            className="cd-cell-menu__swatch h-2.5 w-2.5 flex-none rounded-xs"
            style={{ background: swatchBg(shift.color) }}
          />
          <span className="cd-cell-menu__label flex-1 font-semibold">{shift.code}</span>
          <span className="cd-cell-menu__time font-[family-name:var(--font-mono)] text-2xs text-[color:var(--text-faint)]">
            {shift.start}–{shift.end}
          </span>
          <KeyHint letter={keyHints[shift.code]} />
        </button>
      ))}
      <button
        type="button"
        className="cd-cell-menu__item flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1.5 text-left text-xs text-base-content transition-colors duration-150 hover:bg-base-200"
        onClick={() => onChoose(OFF_CODE)}
      >
        <span className="cd-cell-menu__swatch h-2.5 w-2.5 flex-none rounded-xs bg-[var(--sh-off-bd)]" />
        <span className="cd-cell-menu__label flex-1 font-semibold">{t('board.menu.dayOff')}</span>
        <KeyHint letter={keyHints[OFF_CODE]} />
      </button>
      {pinned && (
        <button
          type="button"
          className="cd-cell-menu__item cd-cell-menu__item--release mt-0.5 flex cursor-pointer items-center gap-1.5 rounded-md border-0 border-t border-t-[var(--border)] bg-transparent px-1.5 pt-1.5 pb-1.5 text-left text-xs text-[color:var(--text-dim)] transition-colors duration-150 hover:bg-base-200"
          onClick={onReleasePin}
        >
          {t('board.menu.releasePin')}
        </button>
      )}
    </div>
  )
}
