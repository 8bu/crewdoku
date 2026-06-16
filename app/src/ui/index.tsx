/* Crewdoku UI kit — shared primitives, ported to TS from the legacy
   src/components/ui/index.jsx. Aesthetic unchanged: rounded-[2px], IBM Plex,
   neutral chrome, geometric Unicode glyphs (no emoji). Consumes tokens.css
   custom properties only — no hardcoded colors. */
import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent,
} from 'react'

export const cx = (...a: Array<string | false | null | undefined>): string =>
  a.filter(Boolean).join(' ')

/* ---------- tiny atoms ---------- */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ml-auto pl-3 font-mono text-2xs text-faint">{children}</kbd>
}
export function KeyHint({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-2xs text-faint border border-bd px-1 leading-4 rounded-[2px]">
      {children}
    </span>
  )
}

export type Tone = 'ok' | 'warn' | 'crit' | 'prop' | 'sel' | 'neutral'

export const TONES: Record<Tone, CSSProperties & { borderColor: string }> = {
  ok: { color: 'var(--st-ok)', background: 'var(--st-ok-bg)', borderColor: 'var(--st-ok)' },
  warn: { color: 'var(--st-warn)', background: 'var(--st-warn-bg)', borderColor: 'var(--st-warn)' },
  crit: { color: 'var(--st-crit)', background: 'var(--st-crit-bg)', borderColor: 'var(--st-crit)' },
  prop: { color: 'var(--st-prop)', background: 'var(--st-prop-bg)', borderColor: 'var(--st-prop)' },
  sel: { color: 'var(--sel)', background: 'var(--sel-bg)', borderColor: 'var(--sel)' },
  neutral: {
    color: 'var(--text-dim)',
    background: 'var(--surface-2)',
    borderColor: 'var(--border-strong)',
  },
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 px-1.5 h-[15px] text-2xs font-medium border rounded-[2px] whitespace-nowrap leading-none',
        className,
      )}
      style={{
        ...TONES[tone],
        borderColor: 'color-mix(in oklab, ' + TONES[tone].borderColor + ' 45%, transparent)',
      }}
    >
      {children}
    </span>
  )
}

export function Dot({ tone = 'neutral', blink }: { tone?: Tone; blink?: boolean }) {
  return (
    <span
      className={cx('inline-block w-1.5 h-1.5 shrink-0', blink && 'sf-blink')}
      style={{ background: TONES[tone].color }}
    />
  )
}

/* ---------- buttons + controls ---------- */
export type BtnVariant = 'default' | 'primary' | 'ghost' | 'danger'

export function Btn({
  variant = 'default',
  pressed,
  disabled,
  onClick,
  children,
  kbd,
  title,
  ariaLabel,
  className,
  size,
  style,
  type = 'button',
}: {
  variant?: BtnVariant
  pressed?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
  kbd?: string
  title?: string
  ariaLabel?: string
  className?: string
  size?: 'lg'
  style?: CSSProperties
  type?: 'button' | 'submit'
}) {
  const base =
    'inline-flex items-center gap-1.5 px-2 text-xs font-medium border rounded-[2px] select-none whitespace-nowrap leading-none'
  const v: Record<BtnVariant, string> = {
    default: cx('bg-raised border-bds text-ink', !disabled && 'hover:bg-surface-2 active:bg-surface-2'),
    primary: 'text-[var(--text-inv)] border-transparent ' + (disabled ? '' : 'hover:opacity-90'),
    ghost: cx('border-transparent text-dim', !disabled && 'hover:bg-surface-2 hover:text-ink'),
    danger: cx('border-transparent text-[var(--st-crit)]', !disabled && 'hover:bg-[var(--st-crit-bg)]'),
  }
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={pressed}
      className={cx(
        base,
        v[variant],
        pressed && '!bg-[var(--sel-bg)] !border-[var(--sel)] !text-[var(--sel)]',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
      style={{
        height: size === 'lg' ? '30px' : 'var(--ctl-h)',
        background: variant === 'primary' ? 'var(--ink-solid)' : undefined,
        ...style,
      }}
    >
      {children}
      {kbd && <KeyHint>{kbd}</KeyHint>}
    </button>
  )
}

export interface SegOption {
  v: string
  label: ReactNode
  kbd?: string
}

export function Seg({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: string
  options: SegOption[]
  onChange: (v: string) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      className={cx('inline-flex border border-bds rounded-[2px] overflow-hidden', className)}
      role="tablist"
      aria-label={ariaLabel}
      style={{ height: 'var(--ctl-h)' }}
    >
      {options.map((o, i) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={cx(
            'px-2 text-xs font-medium flex items-center gap-1.5',
            i > 0 && 'border-l border-bds',
            value === o.v
              ? 'bg-surface text-ink font-semibold'
              : 'bg-raised text-dim hover:text-ink',
          )}
        >
          {o.label}
          {o.kbd && <KeyHint>{o.kbd}</KeyHint>}
        </button>
      ))}
    </div>
  )
}

export function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      className={cx(
        'inline-flex items-center gap-1.5 text-xs select-none',
        disabled ? 'opacity-40' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex items-center justify-center w-3.5 h-3.5 border rounded-[2px] text-2xs leading-none',
          checked
            ? 'bg-[var(--ink-solid)] text-[var(--text-inv)] border-transparent'
            : 'bg-surface border-bds',
        )}
      >
        {checked ? '✓' : ''}
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}

/* ---------- containers ---------- */
export function Panel({
  title,
  actions,
  children,
  className,
  pad = true,
  tone,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  pad?: boolean
  tone?: Tone
}) {
  return (
    <section
      className={cx('border bg-surface rounded-[2px] flex flex-col min-w-0', className)}
      style={{ borderColor: tone ? TONES[tone].borderColor : 'var(--border)' }}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 px-2 h-7 border-b border-bd bg-raised shrink-0">
          <h3 className="text-2xs font-semibold uppercase tracking-wider text-dim truncate">
            {title}
          </h3>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cx('min-h-0 flex-1', pad && 'p-2.5')}>{children}</div>
    </section>
  )
}

export function Banner({
  level = 'warn',
  title,
  children,
  actions,
}: {
  level?: Tone
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div
      className="border rounded-[2px] px-2.5 py-2 flex gap-2 items-start text-xs"
      style={{
        background: TONES[level].background,
        borderColor: 'color-mix(in oklab, ' + TONES[level].borderColor + ' 50%, transparent)',
      }}
    >
      <span aria-hidden="true" className="font-semibold mt-px" style={{ color: TONES[level].color }}>
        {level === 'crit' ? '✕' : level === 'ok' ? '✓' : '⚠'}
      </span>
      <div className="flex-1 leading-snug">
        {title && (
          <p className="font-semibold" style={{ color: TONES[level].color }}>
            {title}
          </p>
        )}
        <div className="text-ink">{children}</div>
      </div>
      {actions}
    </div>
  )
}

export function EmptyState({
  glyph = '◇',
  title,
  body,
  children,
  className,
}: {
  glyph?: string
  title: ReactNode
  body?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center gap-2 p-8', className)}>
      <div
        aria-hidden="true"
        className="w-9 h-9 border-2 border-bds text-dim flex items-center justify-center text-lg font-mono rounded-[2px]"
      >
        {glyph}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {body && <p className="text-xs text-dim max-w-72 leading-relaxed">{body}</p>}
      {children && <div className="mt-1 flex gap-2">{children}</div>}
    </div>
  )
}

/* ---------- overlays ---------- */
export function useDismiss(
  ref: { current: HTMLElement | null },
  onClose: () => void,
): void {
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/* Focus trap + restore for modal dialogs (ported from legacy useFocusTrap). */
export function useFocusTrap(ref: { current: HTMLElement | null }): void {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const node = ref.current
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusables = (): HTMLElement[] =>
      node
        ? ([...node.querySelectorAll(FOCUSABLE)] as HTMLElement[]).filter(
            (el) => el.offsetParent !== null || el === node,
          )
        : []

    const first = node?.querySelector(FOCUSABLE) as HTMLElement | null
    if (first) first.focus()
    else if (node) {
      node.setAttribute('tabindex', '-1')
      node.focus()
    }

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return
      const els = focusables()
      if (els.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = els[0]!
      const lastEl = els[els.length - 1]!
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      } else if (!node.contains(document.activeElement)) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

let _modalSeq = 0
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 420,
  closeLabel = 'Close',
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  /** Chrome string — pass a translated label from the i18n layer. */
  closeLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useRef('sf-modal-title-' + ++_modalSeq).current
  useDismiss(ref, onClose)
  useFocusTrap(ref)
  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center"
      style={{ background: 'oklch(0.2 0.01 255 / 0.35)' }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface border border-bds shadow-[var(--shadow)] rounded-[2px] flex flex-col max-h-[80vh]"
        style={{ width }}
      >
        <header className="flex items-center justify-between px-3 h-8 border-b border-bd bg-raised shrink-0">
          <h3 id={titleId} className="text-xs font-semibold">
            {title}
          </h3>
          <Btn variant="ghost" onClick={onClose} title={closeLabel} ariaLabel={closeLabel}>
            <span aria-hidden="true">✕</span>
          </Btn>
        </header>
        <div className="p-3 overflow-auto">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 px-3 py-2 border-t border-bd bg-raised">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/* ---------- chrome ---------- */
export function StatusBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div
      role="status"
      className="h-6 flex items-center gap-3 px-2 border-t border-bd bg-raised text-2xs text-dim shrink-0 font-mono"
    >
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">{right}</div>
    </div>
  )
}

export type { CSSProperties, KeyboardEvent }
