import { useEffect } from 'react'
import { SHIFT_COLORS, swatchBg, type ShiftColorId } from '../../board/shiftColors'
import { useT } from '../../i18n/useT'
import { BottomSheet } from '../../ui/BottomSheet'
import { useIsNarrow } from '../../ui/useIsNarrow'

const POPOVER_WIDTH = 176

/**
 * Same floating-popover pattern as `DeleteShiftPopover`/`teams/DeleteTeamPopover`
 * (8bu's call there: a picker never reflows the page) — a grid of the
 * curated swatches (`board/shiftColors.ts`), the closed set a manager picks
 * a shift's colour from (8bu's call: curated over free-form, ticket "shift
 * colour configurable").
 *
 * Below `md` the same grid is a bottom sheet: a 176px patch pinned under a
 * 12px swatch puts the picker under the thumb's own shadow, and the sheet's
 * backdrop plus close button are honest dismissal affordances where a
 * desktop-style outside-tap is not. Swatches grow to a fingertip there.
 */
export function ShiftColorPopover({
  rect,
  selected,
  shiftCode,
  onSelect,
  onClose,
}: {
  rect: { left: number; bottom: number }
  selected: string | undefined
  /** Names the picker in the mobile sheet's title; the desktop popover anchors itself instead. */
  shiftCode?: string
  onSelect: (color: ShiftColorId) => void
  onClose: () => void
}) {
  const t = useT()
  const isNarrow = useIsNarrow()

  // The sheet owns its own dismissal (backdrop, close button, Escape), so the
  // window-level outside-click listener only ever runs for the desktop popover.
  useEffect(() => {
    if (isNarrow) return
    function closeIfOutside(e: MouseEvent) {
      if ((e.target as HTMLElement | null)?.closest('.cd-settings-shift-color-popover')) return
      onClose()
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isNarrow, onClose])

  function swatches(sizeClass: string) {
    return SHIFT_COLORS.map((c) => (
      <button
        key={c.id}
        title={t(`settings.color.${c.id}`)}
        aria-label={t(`settings.color.${c.id}`)}
        aria-pressed={c.id === selected}
        onClick={() => {
          onSelect(c.id)
          onClose()
        }}
        className={`${sizeClass} cursor-pointer rounded-md border-2 transition-colors duration-150 ${
          c.id === selected ? 'border-base-content' : 'border-transparent hover:border-base-300'
        }`}
        style={{ background: swatchBg(c.id) }}
      />
    ))
  }

  if (isNarrow) {
    return (
      <BottomSheet
        open
        onClose={onClose}
        title={shiftCode ? t('settings.shifts.colorTitle', { code: shiftCode }) : undefined}
      >
        <div className="grid grid-cols-4 gap-2">{swatches('h-12 w-full')}</div>
      </BottomSheet>
    )
  }

  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)

  return (
    <div
      className="cd-settings-shift-color-popover fixed z-20 grid w-[176px] grid-cols-4 gap-1.5 rounded-lg border border-base-300 bg-base-100 p-2.5 shadow-lg"
      style={{ left, top: rect.bottom + 6 }}
    >
      {swatches('h-7 w-7')}
    </div>
  )
}
