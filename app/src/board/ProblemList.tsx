import { Check, ChevronDown, ChevronRight, SlidersHorizontal, TriangleAlert } from '../ui/icons'
import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n/useT'
import type { Violation } from './violations'
import { BottomSheet } from '../ui/BottomSheet'
import { useIsNarrow } from '../ui/useIsNarrow'

type ProblemListProps = {
  violations: Violation[]
  open: boolean
  onToggle: () => void
  onSelect: (violation: Violation) => void
  /** Coverage bar / violation dots / fairness column visibility (ticket 15's
   * "one toggle for every diagnostic layer" — board-overhaul revamp, 8bu:
   * "the show issue toggle... looks very stupid" floating as its own
   * detached FAB. Folded into this same fixed cluster instead of a second
   * free-floating control, one border shared with the count control. */
  showIssues: boolean
  onToggleIssues: () => void
}

/**
 * The clickable problem list (ticket 07) and the diagnostics-layer toggle
 * (coverage bar / violation dots / fairness column), sharing one border. A
 * count badge surfaces a break two weeks off the visible page without opening
 * the list.
 *
 * Desktop: a cluster of two full-text chips fixed to the top-right corner,
 * always reachable whatever's scrolled.
 *
 * Narrow (below `md`): a fixed overlay overprints whatever header content sits
 * beneath it however small it shrinks (8bu: "it even overlap onto the Period
 * selector"), so the cluster is instead portaled into the Shell header's flex
 * row (a slot beside the period selector) as two icon-only buttons. In the
 * flow the period selector truncates to give the cluster its width, so the two
 * can never collide.
 *
 * The expanded list is a 360px dropdown on desktop; on a phone it becomes a
 * bottom sheet (BottomSheet portals to <body>, so nesting it in the header
 * portal is fine), since a 360px card has nowhere to sit on a 390px screen.
 */
export function ProblemList({ violations, open, onToggle, onSelect, showIssues, onToggleIssues }: ProblemListProps) {
  const t = useT()
  const isNarrow = useIsNarrow()
  const count = violations.length
  const flagged = count > 0
  // Shell renders the header slot only when narrow; grab it post-commit since
  // that ancestor commits in the same pass as this node (null on first render).
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setSlot(isNarrow ? document.getElementById('board-header-slot') : null)
  }, [isNarrow])

  const list =
    count === 0 ? (
      <p className="m-0 px-3 py-3.5 text-xs text-[var(--text-faint)]">{t('board.problems.empty')}</p>
    ) : (
      <ul className="m-0 flex list-none flex-col gap-1 p-0 md:gap-px md:p-1">
        {violations.map((violation) => (
          <li key={violation.id}>
            <button
              type="button"
              className="block min-h-11 w-full cursor-pointer rounded-md border-0 bg-transparent px-2 py-2 text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200 md:min-h-0 md:py-1.5 md:text-xs"
              onClick={() => {
                onSelect(violation)
                // On a phone the list is a sheet covering most of the board:
                // get out of the way so the cell it just highlighted is
                // actually visible. The desktop dropdown stays open, as before.
                if (isNarrow) onToggle()
              }}
            >
              {violation.message}
            </button>
          </li>
        ))}
      </ul>
    )

  const buttonRow = (
    <div
      className="flex items-stretch overflow-hidden rounded-lg border border-[var(--border-strong)] bg-base-100 shadow-[var(--shadow-pane)]"
      data-tour="diagnostics"
    >
      <button
        type="button"
        className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors duration-150 md:min-h-0 md:py-1.5 ${
          flagged ? 'text-[var(--viol)]' : 'text-[color:var(--text-dim)]'
        }`}
        aria-expanded={open}
        aria-label={isNarrow ? t('board.problems.aria') : undefined}
        data-flagged={flagged || undefined}
        onClick={onToggle}
      >
        {isNarrow ? (
          flagged ? (
            <>
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              {count}
            </>
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )
        ) : (
          <>
            <span
              className={`h-1.5 w-1.5 flex-none rounded-full ${flagged ? 'bg-[var(--viol)]' : 'bg-[var(--text-faint)]'}`}
              aria-hidden="true"
            />
            {count === 0 ? t('board.problems.none') : t(count === 1 ? 'board.problems.count_one' : 'board.problems.count_other', { count })}
          </>
        )}
      </button>
      <button
        type="button"
        className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 border-l border-[var(--border-strong)] px-2.5 text-xs whitespace-nowrap transition-colors duration-150 md:min-h-0 md:py-1.5 ${
          showIssues ? 'bg-primary/10 text-[var(--sel-active)]' : 'text-[color:var(--text-dim)]'
        }`}
        aria-pressed={showIssues}
        aria-label={isNarrow ? t('board.problems.coverageAndFairness') : undefined}
        onClick={onToggleIssues}
      >
        {isNarrow ? (
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        ) : (
          <>
            {showIssues ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {t('board.problems.coverageAndFairness')}
          </>
        )}
      </button>
    </div>
  )

  const expanded = open ? (
    isNarrow ? (
      <BottomSheet open onClose={onToggle} title={t('board.problems.aria')}>
        {list}
      </BottomSheet>
    ) : (
      <div
        className="max-h-[min(60vh,420px)] w-[360px] overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-base-100 shadow-[var(--shadow-pane)]"
        role="region"
        aria-label={t('board.problems.aria')}
      >
        {list}
      </div>
    )
  ) : null

  if (isNarrow) {
    return slot ? createPortal(
      <>
        {buttonRow}
        {expanded}
      </>,
      slot,
    ) : null
  }

  return (
    <div className="fixed top-2 right-4 z-[6] flex flex-col items-end gap-1.5">
      {buttonRow}
      {expanded}
    </div>
  )
}
