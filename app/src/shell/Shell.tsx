import { Outlet, useLocation } from 'react-router-dom'
import { NavRail } from './NavRail'
import { PeriodSelector } from './PeriodSelector'

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

export function Shell() {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full bg-base-200 text-base-content">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {PERIOD_ROUTES.includes(pathname) && (
          <header className="flex h-12 shrink-0 items-center gap-4 border-b border-base-300 bg-base-100 px-4">
            <PeriodSelector />
          </header>
        )}
        <main className="min-h-0 flex-1 overflow-auto bg-base-100">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
