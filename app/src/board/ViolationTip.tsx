import { X } from '../ui/icons'
import { useT } from '../i18n/useT'
import { useIsNarrow } from '../ui/useIsNarrow'

export type ViolationTipState = {
  left: number
  top: number
  message: string
  visible: boolean
  /** True for a header-anchored tip (e.g. the holiday dot) — flips the tip
   * below its target instead of above, since the header sits at the very
   * top of the board and "above" would run off-screen. Purely positional;
   * colour is `kind`'s job. */
  below?: boolean
  /** Which rule this tip is reporting, so severity reads correctly: a real
   * rule break is red, a holiday note is amber, and a proposal's "was: X"
   * hint — informational, not a problem — is the same violet already
   * marking changed cells, never red/black. Defaults to 'violation'. */
  kind?: 'violation' | 'proposal' | 'holiday'
  /** Wider measure for a per-person list containing several period-wide messages. */
  wide?: boolean
  /** Align the tip's right edge to the target; used by the pinned-right fairness column. */
  alignEnd?: boolean
}

/**
 * The tip's own semantic background/foreground pairs, mirrored from
 * `.cd-violation-tip[data-kind]` in styles.css for the mobile strip (which
 * cannot wear that class: its absolute-pill transform would fight a
 * full-width fixed bar). Same tokens, same 5:1 pairings.
 */
const TONE: Record<'violation' | 'proposal' | 'holiday', string> = {
  violation: 'bg-[var(--viol)] text-[color:var(--color-error-content)]',
  proposal: 'bg-[var(--prop)] text-[color:var(--color-primary-content)]',
  holiday: 'bg-[var(--holiday-tip-bg)] text-[var(--holiday-tip-fg)]',
}

/**
 * One shared floating pill for every rule-break tooltip on the board (ticket
 * 07 follow-up) — never unmounts, so `BoardGrid` can just move it, and the
 * CSS transition makes it read as flying from cell to cell instead of
 * popping in fresh at each hover.
 *
 * Touch has no hover, so on a phone the pointer-operated anchor geometry
 * (`left`/`top`/`below`/`alignEnd`, all of which only mean something to the
 * absolutely-positioned pill) is ignored and the same message renders as a
 * dismissible strip above the bottom nav and above the Generate FAB. A strip
 * rather than a bottom sheet on purpose: it must not block the board, since
 * tapping the same cell again is how the shift picker opens.
 */
export function ViolationTip({
  left,
  top,
  message,
  visible,
  below,
  wide,
  alignEnd,
  kind = 'violation',
  onDismiss,
}: ViolationTipState & { onDismiss?: () => void }) {
  const isNarrow = useIsNarrow()
  const t = useT()

  if (isNarrow) {
    if (!visible || !message) return null
    return (
      <div
        className={`fixed inset-x-0 z-[8] flex items-center gap-2 border-t border-[var(--border-strong)] px-3 py-1.5 text-xs leading-normal shadow-[var(--shadow-pane)] ${TONE[kind]}`}
        style={{ bottom: 'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom) + 4.25rem)' }}
        role="status"
      >
        <span className="min-w-0 flex-1 whitespace-pre-line">{message}</span>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md opacity-80"
          aria-label={t('chrome.close')}
          onClick={onDismiss}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="cd-violation-tip pointer-events-none absolute top-0 left-0 z-[7] max-w-[260px] rounded-md px-2 py-1.5 text-2xs leading-normal opacity-0 shadow-[var(--shadow-pane)] transition-[left,top,opacity] duration-[120ms] ease-in-out data-[visible=true]:opacity-100 data-[wide=true]:max-w-[480px] data-[wide=true]:text-xs"
      data-visible={visible}
      data-below={below || undefined}
      data-wide={wide || undefined}
      data-align-end={alignEnd || undefined}
      data-kind={kind}
      style={{ left, top }}
    >
      {message}
    </div>
  )
}
