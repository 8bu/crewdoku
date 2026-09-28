import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { NavRail } from './NavRail'
import { PeriodSelector } from './PeriodSelector'
import { useIsNarrow } from '../ui/useIsNarrow'
import { ViewSwitch } from '../ui/ViewSwitch'
import { ScheduleFilterBar } from '../ui/ScheduleFilterBar'
import { WhatsNewDialog } from '../whatsNew/WhatsNewDialog'

/**
 * Routes whose content is period-scoped (the schedule and its views) — only
 * they get the period header bar. The workspace pages — Roster, Teams,
 * Settings — read global state (ticket 24) and carry their own header rows,
 * so the shell renders no header there at all: an empty pinned strip would
 * just cost 48px and imply a scoping that no longer exists. Export left this
 * list when it became a wizard whose first step picks its own period — a
 * pinned global period there would contradict the wizard's local choice.
 *
 * `/calendar` is deliberately not here: its own header owns free prev/next
 * navigation across every period, so a period-scoped strip would be wrong
 * there. The Board | Calendar switch and the shared filter bar both read the
 * URL themselves, so the calendar renders them in its own header row.
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
 *
 * The board's header also carries the view switch and the shared filters on
 * desktop. Below `md` the row is the period trigger, the filter button and
 * ProblemList's portaled cluster only: Board and Calendar are side by side in
 * `BottomNav` there, which is the phone's own way to switch views, so the
 * switch would just be a second copy fighting the period label for 360px.
 * The period trigger is the one item allowed to give way, and styles.css drops
 * its date range below `md` rather than let the row overflow.
 */
export function Shell() {
  const { pathname } = useLocation()
  const isNarrow = useIsNarrow()
  const isBoard = pathname === '/board'
  return (
    <div className="flex h-dvh bg-base-200 text-base-content md:h-full">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {PERIOD_ROUTES.includes(pathname) && (
          // `md:pr-[22rem]` reserves the lane the desktop diagnostics cluster
          // floats in (ProblemList: `fixed top-2 right-4`, ~250–340px wide), so
          // the filter bar can never slide under it. Only the board sets it:
          // `/coverage` has no cluster, and below `md` the cluster is in the
          // header flow instead (the slot below), so no lane is needed there.
          <header
            className={`flex h-12 min-w-0 shrink-0 items-center gap-4 border-b border-base-300 bg-base-100 px-4 ${
              isBoard ? 'cd-app-header--board md:pr-[22rem]' : ''
            }`}
          >
            <div className="cd-app-header__period min-w-0">
              <PeriodSelector />
            </div>
            {isBoard && !isNarrow && (
              <div className="flex min-w-0 shrink items-center gap-3">
                <ViewSwitch />
                <ScheduleFilterBar />
              </div>
            )}
            {/* Narrow-only: the filter button, then the slot ProblemList
                portals its cluster into, so both sit in the header flow at the
                right edge instead of floating over the period trigger. Absent
                on desktop (byte-identical header). */}
            {isNarrow && (
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {isBoard && <ScheduleFilterBar />}
                <div id="board-header-slot" className="flex items-center" />
              </div>
            )}
          </header>
        )}
        <main data-tour="surface" className="min-h-0 flex-1 overflow-auto bg-base-100 pb-[calc(var(--mobile-nav-h)_+_env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      {/* One panel for the whole app: both version labels (rail footer, More
          sheet) raise it through `whatsNewOpenAtom`, and a phone cannot end up
          with two dialogs open at once. */}
      <WhatsNewDialog />
    </div>
  )
}
