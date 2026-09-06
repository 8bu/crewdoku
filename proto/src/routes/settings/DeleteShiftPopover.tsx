import { useEffect } from 'react'
import { Select } from '../../ui/Select'

const POPOVER_WIDTH = 220

/**
 * Same floating-popover pattern as `teams/DeleteTeamPopover.tsx` (8bu's
 * call there: a confirm never reflows the page) — a shift delete forces the
 * same reassignment-first move `teamOps.deleteTeam` uses, so nothing is ever
 * left pointing at a code that no longer exists (ticket 15, Q1).
 */
export function DeleteShiftPopover({
  rect,
  shiftCode,
  otherShifts,
  reassignToCode,
  onReassignChange,
  onConfirm,
  onCancel,
}: {
  rect: { left: number; bottom: number }
  shiftCode: string
  otherShifts: { code: string; label: string }[]
  reassignToCode: string
  onReassignChange: (code: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function closeIfOutside(e: MouseEvent) {
      if ((e.target as HTMLElement | null)?.closest('.cd-settings-delete-shift-popover')) return
      onCancel()
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onCancel])

  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)

  return (
    <div
      className="cd-settings-delete-shift-popover fixed z-20 flex w-[220px] flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg"
      style={{ left, top: rect.bottom + 6 }}
    >
      <p className="text-sm font-semibold text-base-content">Delete "{shiftCode}"</p>
      <p className="text-xs text-base-content/60">
        Every reference — eligibility, wants/avoids, coverage — moves to:
      </p>
      <Select
        className="w-full"
        value={reassignToCode}
        onChange={onReassignChange}
        options={otherShifts.map((s) => ({ value: s.code, label: `${s.code} — ${s.label}` }))}
      />
      <div className="mt-0.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer border-none bg-transparent p-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-error"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="cursor-pointer border-none bg-transparent p-0 text-2xs font-semibold uppercase tracking-wide text-error transition-colors duration-150 hover:text-error/70"
        >
          Move & delete
        </button>
      </div>
    </div>
  )
}
