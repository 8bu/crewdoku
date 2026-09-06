import type { ConflictCoreItem, RelaxationOption } from '../../engine/types'

export type InfeasiblePanelProps = {
  conflictCore: ConflictCoreItem[]
  relaxations: RelaxationOption[]
  onRelax: (option: RelaxationOption) => void
  onDismiss: () => void
}

/**
 * The infeasible screen (ticket 13) — a solve that can't meet coverage,
 * explained in plain sentences, never a silently invented schedule (the
 * map's Principle 4). Docked over the board the same way ticket 12's Ledger
 * is — a flex sibling of `.cd-board-scroll`, board fully visible and
 * unlocked underneath, no navigation away, no dimming. `BoardGrid` unmounts
 * `GenerateControls` while this is up, the same swap it already does for
 * the proposal panel.
 *
 * Dismiss is the only way out (8bu's call, grilled directly): nothing was
 * ever written to the board for an infeasible solve, so "cancel" and
 * "dismiss" are the same action here — closing this panel reverts the
 * planner to exactly the pre-Generate board, same as ticket 11's solving-
 * phase Cancel. A relaxation button rebuilds the rules and re-solves; a
 * feasible result lands in the normal proposal-review flow, never applied
 * straight to the board.
 */
export function InfeasiblePanel({ conflictCore, relaxations, onRelax, onDismiss }: InfeasiblePanelProps) {
  return (
    <div
      className="relative flex h-full w-[var(--proposal-panel-w)] flex-none flex-col overflow-y-auto border-l-2 border-error bg-base-100 shadow-[var(--shadow-pane)]"
      role="dialog"
      aria-label="Solve came back infeasible"
    >
      <div className="sticky top-0 z-1 flex items-start justify-between gap-3 border-b border-base-300 bg-base-100 px-4 py-3.5">
        <div>
          <div className="text-base font-semibold text-base-content">Can&apos;t solve this yet</div>
          <div className="mt-0.5 text-xs text-[color:var(--text-faint)]">Nothing on the board changed.</div>
        </div>
        <div className="flex flex-none gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul className="m-0 flex list-none flex-col gap-1.5 border-b border-base-300 px-4 py-3.5 text-sm text-base-content">
          {conflictCore.map((item) => (
            <li key={item.id}>{item.message}</li>
          ))}
        </ul>

        {relaxations.length > 0 && (
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <div className="text-2xs text-[color:var(--text-faint)]">Try one of these, then solve again:</div>
            {relaxations.map((option) => (
              <button
                key={option.id}
                type="button"
                className="btn btn-outline btn-sm justify-start text-left font-normal"
                onClick={() => onRelax(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
