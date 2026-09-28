import { useState, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Check, ChevronDown } from './icons'
import { useT } from '../i18n/useT'

export type SheetSelectOption = { value: string; label: string; icon?: ReactNode }

/**
 * The touch presentation of `Select`. A trigger-anchored dropdown is a corner
 * target: on a phone the menu opens under the thumb and its rows are the
 * desktop ones. So the options open in a `BottomSheet` where every option is a
 * full-width row at the 44px touch floor — chosen by the thumb that just
 * tapped the trigger.
 *
 * Callers branch on `useIsNarrow()` and render this instead of `Select`. The
 * trigger has two shapes, as `Select`'s does:
 * - default: a labelled chip, `w-full` + `min-h-11`, which fills its own cell
 *   in a host grid (the More sheet's settings rows) and never overflows it;
 * - `display`: the same compact, borderless trigger `Select` draws for that
 *   prop, grown to a 44px target — so a control that is an icon on desktop
 *   stays an icon on a phone instead of turning into a different widget.
 *
 * A `value` no option matches reads as `placeholder` (the same default
 * `Select` falls back to), so an empty picker — a team not chosen yet — says
 * what it is instead of showing a blank trigger next to its button.
 */
export function SheetSelect({
  value,
  onChange,
  options,
  title,
  ariaLabel,
  className = '',
  display,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: SheetSelectOption[]
  title: ReactNode
  ariaLabel: string
  className?: string
  /** Compact trigger content (e.g. an icon alone); the label moves into the accessible name. */
  display?: ReactNode
  /** Shown when no option carries `value`; `Select`'s own default. */
  placeholder?: string
}) {
  const t = useT()
  const effectivePlaceholder = placeholder ?? t('chrome.select.placeholder')
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <button
        type="button"
        aria-label={display !== undefined && selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={
          display !== undefined
            ? `inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 transition-colors active:bg-base-300/50 ${className}`
            : `flex min-h-11 w-full items-center gap-2 rounded-md border border-base-300 bg-base-100 px-3 text-sm text-base-content transition-colors hover:bg-base-200 ${className}`
        }
      >
        {display ?? (
          <>
            {selected?.icon}
            <span className="min-w-0 truncate">{selected?.label ?? effectivePlaceholder}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-base-content/50" aria-hidden />
          </>
        )}
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
