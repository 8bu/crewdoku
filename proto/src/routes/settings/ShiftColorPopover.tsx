import { useEffect } from 'react'
import { SHIFT_COLORS, swatchBg, type ShiftColorId } from '../../board/shiftColors'

const POPOVER_WIDTH = 176

/**
 * Same floating-popover pattern as `DeleteShiftPopover`/`teams/DeleteTeamPopover`
 * (8bu's call there: a picker never reflows the page) — a grid of the
 * curated swatches (`board/shiftColors.ts`), the closed set a manager picks
 * a shift's colour from (8bu's call: curated over free-form, ticket "shift
 * colour configurable").
 */
export function ShiftColorPopover({
  rect,
  selected,
  onSelect,
  onClose,
}: {
  rect: { left: number; bottom: number }
  selected: ShiftColorId | undefined
  onSelect: (color: ShiftColorId) => void
  onClose: () => void
}) {
  useEffect(() => {
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
  }, [onClose])

  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)

  return (
    <div
      className="cd-settings-shift-color-popover fixed z-20 grid w-[176px] grid-cols-4 gap-1.5 rounded-lg border border-base-300 bg-base-100 p-2.5 shadow-lg"
      style={{ left, top: rect.bottom + 6 }}
    >
      {SHIFT_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.label}
          aria-label={c.label}
          aria-pressed={c.id === selected}
          onClick={() => {
            onSelect(c.id)
            onClose()
          }}
          className={`h-7 w-7 cursor-pointer rounded-md border-2 transition-colors duration-150 ${
            c.id === selected ? 'border-base-content' : 'border-transparent hover:border-base-300'
          }`}
          style={{ background: swatchBg(c.id) }}
        />
      ))}
    </div>
  )
}
