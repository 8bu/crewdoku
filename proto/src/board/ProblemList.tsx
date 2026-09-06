import type { Violation } from './violations'

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
 * The clickable problem list (ticket 07). Fixed to the viewport corner —
 * always reachable, whatever's scrolled or folded — with a count badge so a
 * break two weeks off the visible page still shows up without opening it.
 *
 * One horizontal row, not stacked (board-overhaul revamp, 8bu: "the overlay
 * overlap onto board header is stupid") — the Shell's own toolbar `<header>`
 * is exactly 48px (`h-12`) and the board's own sticky date-header starts
 * right below it at that same 48px line. A single ~29px-tall row pinned at
 * `top-2` sits entirely inside the Shell header's band with room to spare;
 * the two-row stack this replaced was tall enough to spill past 48px and
 * cover the board's own header cells underneath.
 */
export function ProblemList({ violations, open, onToggle, onSelect, showIssues, onToggleIssues }: ProblemListProps) {
  const count = violations.length
  const flagged = count > 0
  return (
    <div className="fixed top-2 right-4 z-[6] flex flex-col items-end gap-1.5">
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--border-strong)] bg-base-100 shadow-[var(--shadow-pane)]">
        <button
          type="button"
          className={`inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
            flagged ? 'text-[var(--viol)]' : 'text-[color:var(--text-dim)]'
          }`}
          aria-expanded={open}
          data-flagged={flagged || undefined}
          onClick={onToggle}
        >
          <span
            className={`h-1.5 w-1.5 flex-none rounded-full ${flagged ? 'bg-[var(--viol)]' : 'bg-[var(--text-faint)]'}`}
            aria-hidden="true"
          />
          {count === 0 ? 'No problems' : `${count} problem${count === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          className={`inline-flex cursor-pointer items-center gap-1.5 border-l border-[var(--border-strong)] px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors duration-150 ${
            showIssues ? 'bg-primary/10 text-[var(--sel-active)]' : 'text-[color:var(--text-dim)]'
          }`}
          aria-pressed={showIssues}
          onClick={onToggleIssues}
        >
          <span aria-hidden="true">{showIssues ? '▾' : '▸'}</span>
          Coverage &amp; fairness
        </button>
      </div>
      {open && (
        <div
          className="max-h-[min(60vh,420px)] w-[360px] overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-base-100 shadow-[var(--shadow-pane)]"
          role="region"
          aria-label="Rule breaks"
        >
          {count === 0 ? (
            <p className="m-0 px-3 py-3.5 text-xs text-[var(--text-faint)]">Nothing broken right now.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-px p-1">
              {violations.map((violation) => (
                <li key={violation.id}>
                  <button
                    type="button"
                    className="block w-full cursor-pointer rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs text-base-content transition-colors duration-150 hover:bg-base-200"
                    onClick={() => onSelect(violation)}
                  >
                    {violation.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
