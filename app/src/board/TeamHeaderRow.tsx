import { ChevronDown, ChevronRight } from '../ui/icons'
import { memo } from 'react'
import type { Team } from '@crewdoku/domain'

type TeamHeaderRowProps = {
  team: Team
  count: number
  collapsed: boolean
  onToggle: () => void
}

function TeamHeaderRowImpl({ team, count, collapsed, onToggle }: TeamHeaderRowProps) {
  return (
    <div
      className="cd-team-row col-span-full flex h-11 cursor-pointer items-center border-t border-b border-[var(--border)] bg-base-200 text-xs font-semibold select-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--sel)] md:h-7"
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      {/* Sticky left, same as `.cd-board__name` (board-overhaul revamp, 8bu:
          "this team label doesn't sticky... since the Name column is pinned
          to the left" — the row itself is one col-span-full grid item with
          no per-column boundary, so without its own `sticky left-0` the
          label scrolls out from under the pinned Name column, leaving a
          blank divider strip). Own background so it reads cleanly over
          whatever's scrolled underneath, same tier (z-[3]) as `.cd-board__name`/`.cd-fair-cell`
          — pinned-column content always outranks a per-cell state marker (proposal-changed,
          coverage-dim-lit; max z-index:1) regardless of DOM order. */}
      <span className="cd-team-row__label sticky left-0 z-[3] flex h-full items-center gap-2 bg-base-200 px-[var(--cell-pad-x)]">
        <span className="cd-team-row__chevron flex w-[1em] items-center text-[color:var(--text-dim)]">{collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
        <span className="cd-team-row__name">{team.name}</span>
        <span className="cd-team-row__count font-normal text-[color:var(--text-faint)]">{count}</span>
      </span>
    </div>
  )
}

export const TeamHeaderRow = memo(TeamHeaderRowImpl)
