import { Plus, Minus } from './icons'
import { useEffect, useState } from 'react'

/**
 * A small integer spinner: one control that is complete by mouse OR by
 * keyboard, so filling a grid of them never forces a click-then-type
 * handoff.
 *
 *   - Mouse: click the −/+ buttons. They never take focus (`tabIndex -1` +
 *     `preventDefault` on mousedown), so a keyboard user never lands on them.
 *   - Keyboard: `Tab` to the field, then `↑`/`↓` to nudge, or type digits
 *     directly (multi-digit supported); `Enter`/blur commits.
 *
 * `emptyValue` is what a cleared field commits — `0` for a floor, `Infinity`
 * for a ceiling. When `emptyValue` is `Infinity` the control is a ceiling:
 * stepping below `min` (or clearing) means "no cap", shown as `∞`. The number
 * is a bare input (the bordered shell is the control) so it never double-boxes
 * with the app's `.cd-field`.
 */
export function Stepper({
  value,
  emptyValue,
  min = 0,
  ariaLabel,
  placeholder,
  className = '',
  onCommit,
}: {
  value: number
  emptyValue: number
  min?: number
  ariaLabel: string
  placeholder?: string
  className?: string
  onCommit: (n: number) => void
}) {
  const fmt = (n: number) => (Number.isFinite(n) ? String(n) : '')
  const [draft, setDraft] = useState(fmt(value))

  // Resync when the committed value changes from outside (mode switch, a bulk
  // "every day" write, an override seed). Does not fire mid-typing, since an
  // uncommitted draft leaves `value` untouched.
  useEffect(() => setDraft(fmt(value)), [value])

  /** Live value: an in-progress digit draft, else the committed value. */
  function current(): number {
    const raw = draft.trim()
    if (raw === '') return emptyValue
    if (/^\d+$/.test(raw)) return Number(raw)
    return value
  }
  function commit() {
    const raw = draft.trim()
    if (raw !== '' && !/^\d+$/.test(raw)) return setDraft(fmt(value))
    const parsed = raw === '' ? emptyValue : Number(raw)
    if (parsed !== value) onCommit(parsed)
    else setDraft(fmt(value))
  }
  function bump(delta: number) {
    const base = current()
    let next: number
    if (base === Infinity) next = delta > 0 ? Infinity : min
    else {
      const raw = base + delta
      next = emptyValue === Infinity && raw < min ? Infinity : Math.max(min, raw)
    }
    setDraft(fmt(next))
    if (next !== value) onCommit(next)
  }

  return (
    <div className={`inline-flex select-none items-center rounded-md border border-base-300 bg-base-100 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${className}`}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => bump(-1)}
        className="flex min-h-11 cursor-pointer items-center px-3 py-0.5 leading-none text-base-content/50 hover:text-base-content md:min-h-0 md:px-1.5"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'ArrowUp') {
            e.preventDefault()
            bump(1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            bump(-1)
          }
        }}
        className="w-6 border-0 bg-transparent p-0 text-center font-mono text-sm tabular-nums focus:outline-none focus:ring-0"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => bump(1)}
        className="flex min-h-11 cursor-pointer items-center px-3 py-0.5 leading-none text-base-content/50 hover:text-base-content md:min-h-0 md:px-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
