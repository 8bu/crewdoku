import { lazy, Suspense } from 'react'
import { useT } from '../i18n/useT'
import { usePageView } from '../analytics'
import { ScheduleFilterBar } from '../ui/ScheduleFilterBar'
import { ViewSwitch } from '../ui/ViewSwitch'
import { useIsNarrow } from '../ui/useIsNarrow'

// FullCalendar is heavy and only this page needs it — keep it out of the main
// bundle until a manager actually opens the calendar. The chrome above it (the
// title, the switch, the filters) stays in the first paint either way.
const ScheduleCalendar = lazy(() =>
  import('./calendar/ScheduleCalendar').then((m) => ({ default: m.ScheduleCalendar })),
)

/**
 * Every period's schedule on one calendar: the same shifts the board shows, laid
 * out by date so a manager can read a day at a glance and move a person between
 * days — leave is booked and edited here too. The page is the chrome; the
 * calendar itself is `calendar/ScheduleCalendar`.
 *
 * It carries the same Board | Calendar switch and filter bar as the board, so the
 * two views of one schedule stay one click and one query string apart. On a
 * phone the switch gives way to `BottomNav`, whose Board and Calendar tabs do
 * the same job.
 */
export function Calendar() {
  usePageView('/calendar')
  const t = useT()
  const isNarrow = useIsNarrow()
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-base-300 bg-base-100 px-4">
        <h1 className="m-0 shrink-0 text-sm font-semibold tracking-tight">{t('cal.title')}</h1>
        <div className="ml-auto flex min-w-0 shrink items-center gap-3 md:ml-0">
          {!isNarrow && <ViewSwitch />}
          <ScheduleFilterBar />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <ScheduleCalendar />
        </Suspense>
      </div>
    </section>
  )
}
