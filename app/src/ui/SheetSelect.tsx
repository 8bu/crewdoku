import { useState, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Check, ChevronDown } from './icons'

export type SheetSelectOption = { value: string; label: string; icon?: ReactNode }

/**
 * The touch presentation of `Select`. A trigger-anchored dropdown is a corner
 * target: on a phone the menu opens under the thumb and its rows are the
 * desktop ones. So the same option *shape* becomes a compact chip, and the
 * chip opens a `BottomSheet` where every option is a full-width row at the
 * 44px touch floor — chosen by the thumb that just tapped the chip.
 *
 * Callers branch on `useIsNarrow()` and render this instead of `Select`; the
 * chip is never used above `md`, so its geometry is touch-first. `w-full` +
 * `min-h-11` is the contract with a host grid: a chip fills its own cell and
 * never overflows it.
 */
export function SheetSelect({
  value,
  onChange,
  options,
  title,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: SheetSelectOption[]
  title: ReactNode
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`flex min-h-11 w-full items-center gap-2 rounded-md border border-base-300 bg-base-100 px-3 text-sm text-base-content transition-colors hover:bg-base-200 ${className}`}
      >
        {selected?.icon}
        <span className="min-w-0 truncate">{selected?.label}</span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-base-content/50" aria-hidden />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} ariaLabel={ariaLabel}>
        <div className="flex flex-col gap-0.5">
          {options.map((opt) => {
            const current = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors ${
                  current ? 'bg-primary/10 font-medium text-primary' : 'text-base-content/80 hover:bg-base-200'
                }`}
              >
                {opt.icon}
                {opt.label}
                {current && <Check className="ml-auto h-4 w-4 shrink-0" aria-hidden />}
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </>
  )
}
