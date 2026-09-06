import { useT } from '../i18n/useT'
import { useEffect, useRef, useState } from 'react'

export type SelectOption = { value: string; label: string }

/**
 * A real dropdown, not a native `<select>` — the OS renders `<option>` lists
 * itself with zero styling hooks (see 8bu, live: a bare-native period picker
 * "what the fuck is this?"). Same daisyUI `select` trigger look as before,
 * but the open panel is our own `menu`, so it actually matches the rest of
 * the app instead of falling back to the browser's own popup chrome.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  size = 'sm',
  variant = 'outline',
  className = '',
  panelClassName = '',
  id,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  size?: 'xs' | 'sm' | 'md'
  variant?: 'outline' | 'ghost'
  className?: string
  panelClassName?: string
  id?: string
  ariaLabel?: string
}) {
  const t = useT()
  const effectivePlaceholder = placeholder ?? t('chrome.select.placeholder')
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  function toggleOpen() {
    if (!open) {
      // Flip the panel above the trigger when there isn't roughly enough
      // room below for it — a plain `top-full` panel silently runs off the
      // bottom of the viewport for any trigger low on the page (e.g. inside
      // DeleteTeamPopover, itself anchored near the clicked button).
      const rect = ref.current?.getBoundingClientRect()
      const estimatedPanelHeight = Math.min(options.length * 34 + 8, 256)
      setOpenUp(!!rect && window.innerHeight - rect.bottom < estimatedPanelHeight && rect.top > estimatedPanelHeight)
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectSizeCls = size === 'xs' ? 'select-xs' : size === 'md' ? 'select-md' : 'select-sm'
  const ghostSizeCls = size === 'xs' ? 'px-1.5 py-1 text-xs' : size === 'md' ? 'px-3 py-2 text-sm' : 'px-1.5 py-1 text-sm'
  const triggerCls =
    variant === 'ghost'
      ? `border border-transparent bg-transparent outline-none hover:border-base-300 focus:border-base-content/40 ${ghostSizeCls}`
      : `select select-bordered ${selectSizeCls}`

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        className={`inline-flex w-full cursor-pointer items-center justify-between gap-2 text-left ${triggerCls}`}
      >
        <span className="truncate">{selected?.label ?? effectivePlaceholder}</span>
        <span className="shrink-0 text-2xs text-base-content/40">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className={`menu absolute left-0 z-20 max-h-64 w-max min-w-full flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} ${panelClassName}`}
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={o.value === value ? 'active font-medium' : ''}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
