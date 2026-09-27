import { Link, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { useT } from '../i18n/useT'
import { useScheduleFilters, writeScheduleFilters } from '../state/scheduleFilters'

/** The two schedule views, in the order the switch draws them. */
const VIEWS = [
  { path: '/board', labelKey: 'view.board' },
  { path: '/calendar', labelKey: 'view.calendar' },
] as const

/**
 * Board | Calendar — the segmented switch both schedule pages carry, so either
 * view is one click from the other without going through the rail. A join of
 * two `btn-xs` buttons, the same segmented control the Leave calendar's view
 * picker uses.
 *
 * Links, not buttons: each half *is* a page, which keeps middle-click, "open
 * in new tab" and the browser's own link semantics working. Both destinations
 * carry the shared filter params (`q/team/shift/leave`), so flipping views
 * keeps the narrow-down the planner just set up; any other query string is
 * dropped, since the filters are the only cross-page state these two routes
 * share.
 */
export function ViewSwitch() {
  const t = useT()
  const { pathname } = useLocation()
  const [filters] = useScheduleFilters()

  const search = useMemo(() => {
    const params = new URLSearchParams()
    writeScheduleFilters(params, filters)
    return params.toString()
  }, [filters])

  return (
    <div role="group" aria-label={t('view.label')} className="join shrink-0">
      {VIEWS.map(({ path, labelKey }) => {
        const active = pathname === path
        return (
          <Link
            key={path}
            to={search ? `${path}?${search}` : path}
            aria-current={active ? 'page' : undefined}
            className={`btn btn-xs join-item px-2.5 no-underline ${
              active ? 'btn-primary' : 'btn-ghost text-base-content/60'
            }`}
          >
            {t(labelKey)}
          </Link>
        )
      })}
    </div>
  )
}
