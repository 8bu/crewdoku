import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { NavRail } from './NavRail'
import { PeriodSelector } from './PeriodSelector'
import { useIsNarrow } from '../ui/useIsNarrow'

/**
 * Routes whose content is period-scoped (the schedule and its views) — only
 * they get the period header bar. The workspace pages — Roster, Teams,
 * Settings — read global state (ticket 24) and carry their own header rows,
 * so the shell renders no header there at all: an empty pinned strip would
 * just cost 48px and imply a scoping that no longer exists. Export left this
 * list when it became a wizard whose first step picks its own period — a
 * pinned global period there would contradict the wizard's local choice.
 */
const PERIOD_ROUTES = ['/board', '/coverage']

/**
 * The app frame: the rail beside the content on desktop, and — below `md` —
 * the content alone above `BottomNav`'s fixed tab bar. The rail is hidden
 * rather than unmounted (`hidden md:flex`): it is the desktop chrome, and
 * everything it carries is either reached through the More sheet or purely
 * decorative, so CSS alone can retire it without a JS fork here.
 *
 * The height is `dvh` on mobile so the fixed bar lands on the real bottom edge
 * as the address bar collapses, and the period strip stays the only thing
 * above the content. `main` is the scroller and reserves the bar's height plus
 * the home-indicator inset, so nothing scrolls under the bar.
 */
export function Shell() {
  const { pathname } = useLocation()
  const isNarrow = useIsNarrow()
  return (
    <div className="flex h-dvh bg-base-200 text-base-content md:h-full">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {PERIOD_ROUTES.includes(pathname) && (
          <header className="flex h-12 min-w-0 shrink-0 items-center gap-4 border-b border-base-300 bg-base-100 px-4">
            <PeriodSelector />
            {/* Narrow-only slot: ProblemList portals its cluster here so it
                sits in the header flow beside the period selector instead of
                floating over it. Absent on desktop (byte-identical header). */}
            {isNarrow && <div id="board-header-slot" className="ml-auto flex shrink-0 items-center" />}
          </header>
        )}
        <main className="min-h-0 flex-1 overflow-auto bg-base-100 pb-[calc(var(--mobile-nav-h)_+_env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
