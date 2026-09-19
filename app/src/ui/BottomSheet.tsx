import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from './icons'
import { useT } from '../i18n/useT'

/**
 * The mobile presentation for what is a docked side panel or a floating
 * popover on desktop: a bottom-anchored sheet over a dimmed backdrop. Callers
 * branch on `useIsNarrow()` and render this instead of their desktop surface —
 * the sheet is never used above `md`, so its geometry is touch-first.
 *
 * Anchored to `document.body` via a portal so it escapes the board's flex/
 * scroll ancestors and always covers the viewport. `max-h-[85dvh]` + an inner
 * scroller keeps a long body (a person's whole month, a proposal's change
 * list) reachable without pushing the sheet off-screen; `dvh` (not `vh`) and
 * `env(safe-area-inset-bottom)` keep it stable under the iOS address bar and
 * clear of the home indicator. The slide-up is the one piece of motion this
 * mobile pass adds, and `.cd-sheet`'s keyframes are disabled under
 * `prefers-reduced-motion` in styles.css.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  ariaLabel,
  className = '',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  ariaLabel?: string
  className?: string
}) {
  const t = useT()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="cd-sheet-root fixed inset-0 z-[60] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      <button
        type="button"
        aria-label={t('chrome.close')}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className={`cd-sheet relative flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-base-300 bg-base-100 shadow-[var(--shadow-pane)] ${className}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-base-content/20" />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">{title}</div>
          <button
            type="button"
            aria-label={t('chrome.close')}
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-base-content/60 hover:bg-base-200 hover:text-base-content"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
