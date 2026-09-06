import { shiftLabel, type FairnessMovement, type PersonChangeGroup, type ProposalChange } from './proposal'
import type { FairnessTotals } from '../fairness'

export type ProposalPanelProps = {
  changes: ProposalChange[]
  groups: PersonChangeGroup[]
  fairnessBefore: FairnessTotals
  fairnessAfter: FairnessTotals
  movement: Map<string, FairnessMovement>
  dateLabel: (iso: string) => string
  onApply: () => void
  onDiscard: () => void
  /** Selects the cell, unfolding its team first if needed, and scrolls it into view. */
  onJumpTo: (personId: string, dateIso: string) => void
}

function deltaText(before: number, after: number): string | null {
  const d = after - before
  if (d === 0) return null
  return d > 0 ? `+${d}` : `${d}`
}

/**
 * The proposal overlay (ticket 12) — 8bu's pick from three prototype
 * variants (`prototype/12-proposal-overlay` holds the other two). Docked
 * right of the board the same way `PersonPanel` is (a flex sibling, not a
 * floating overlay) so it never covers the grid it's explaining: every
 * change, one row each, grouped by person in roster order. Apply and
 * Discard are pinned in the header — reachable without scrolling past 300 rows.
 */
export function ProposalPanel({
  changes,
  groups,
  fairnessBefore,
  fairnessAfter,
  movement,
  dateLabel,
  onApply,
  onDiscard,
  onJumpTo,
}: ProposalPanelProps) {
  const peopleCount = groups.length
  return (
    <div
      className="relative flex h-full w-[var(--proposal-panel-w)] flex-none flex-col overflow-y-auto border-l-2 border-[var(--prop)] bg-base-100 shadow-[var(--shadow-pane)]"
      role="dialog"
      aria-label="Proposal changes"
    >
      <div className="sticky top-0 z-1 flex items-start justify-between gap-3 border-b border-base-300 bg-base-100 px-4 py-3.5">
        <div>
          <div className="text-base font-semibold text-base-content">Proposal ready</div>
          <div className="mt-0.5 text-xs text-[color:var(--text-faint)]">
            {changes.length} change{changes.length === 1 ? '' : 's'} across {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscard}>
            Discard
          </button>
          <button
            type="button"
            className="btn btn-sm border-[var(--prop)] bg-[var(--prop)] text-[color:var(--text-inv)] hover:border-[var(--prop)] hover:bg-[var(--prop)] hover:opacity-90"
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="p-4 text-sm text-[color:var(--text-faint)]">The solve came back identical to what&apos;s on the board.</p>
        ) : (
          groups.map(({ person, changes: personChanges }) => {
            const m = movement.get(person.id)
            const hoursDelta = m ? deltaText(m.hours.before, m.hours.after) : null
            const nightsDelta = m ? deltaText(m.nights.before, m.nights.after) : null
            const weekendsDelta = m ? deltaText(m.weekends.before, m.weekends.after) : null
            return (
              <section key={person.id} className="border-b border-base-300 px-4 py-2.5">
                <header className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-base-content">{person.name}</span>
                  <span className="font-mono text-2xs text-[color:var(--text-faint)]">{personChanges.length}</span>
                </header>
                {(hoursDelta || nightsDelta || weekendsDelta) && (
                  <p className="mt-0.5 flex gap-2 text-2xs font-semibold text-[color:var(--prop)]">
                    {hoursDelta && <span>{hoursDelta}h</span>}
                    {nightsDelta && <span>{nightsDelta} nights</span>}
                    {weekendsDelta && <span>{weekendsDelta} weekends</span>}
                  </p>
                )}
                <ul className="mt-1.5 flex list-none flex-col gap-px p-0">
                  {personChanges.map((change) => (
                    <li key={change.dateIso}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-base-content transition-colors duration-150 hover:bg-base-200"
                        onClick={() => onJumpTo(change.personId, change.dateIso)}
                      >
                        <span className="w-[84px] flex-none text-[color:var(--text-dim)]">{dateLabel(change.dateIso)}</span>
                        <span className="flex-1 font-mono text-2xs text-[color:var(--text-faint)] line-through">
                          {shiftLabel(change.from)}
                        </span>
                        <span className="flex-none text-[color:var(--text-faint)]" aria-hidden="true">
                          →
                        </span>
                        <span
                          className="flex-1 font-mono text-2xs font-semibold text-[color:var(--prop)]"
                          data-shift={change.to.code}
                        >
                          {shiftLabel(change.to)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>

      <footer className="border-t border-base-300 px-4 py-2.5 text-2xs text-[color:var(--text-faint)]">
        Period total: {fairnessBefore.maxHours}h most-loaded now → {fairnessAfter.maxHours}h if applied.
      </footer>
    </div>
  )
}
