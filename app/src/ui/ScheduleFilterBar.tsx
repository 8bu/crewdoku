import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ShiftDef, Team } from '@crewdoku/domain'
import { ChevronDown, Filter, X } from './icons'
import { useT } from '../i18n/useT'
import { BottomSheet } from './BottomSheet'
import { Input } from './Input'
import { useIsNarrow } from './useIsNarrow'
import { swatchBg } from '../board/shiftColors'
import { hasActiveFilters, useScheduleFilters, type ScheduleFilters } from '../state/scheduleFilters'
import { shiftsAtom } from '../state/shifts'
import { teamsAtom } from '../state/teams'

const EMPTY_TEAMS: Team[] = []
const EMPTY_SHIFTS: ShiftDef[] = []
/** Long enough to swallow a burst of typing, short enough that the board reacts while the planner is still watching it. */
const SEARCH_DEBOUNCE_MS = 250

/**
 * Where the header has room for the controls themselves. Not `useIsNarrow`'s
 * inverse: the rail takes 224px on desktop and the board's fixed diagnostics
 * cluster owns another ~250–340px of the top-right, so at 1000px the column
 * `md` hands back cannot hold the period trigger, the view switch and every
 * control at once — the worst locale's own labels alone are ~480px of bar. A
 * wider viewport is the only honest test, and the same single Filters trigger
 * is what appears below it. Stops there: above it the inline row always fits
 * inside the lane Shell reserves beside the cluster.
 */
const WIDE_QUERY = '(min-width: 1400px)'
const WIDE_POPOVER_WIDTH = 280

function subscribeWide(onChange: () => void): () => void {
  const mql = window.matchMedia(WIDE_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getWideSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches
}

function getWideServerSnapshot(): boolean {
  return false
}

function useWideHeader(): boolean {
  return useSyncExternalStore(subscribeWide, getWideSnapshot, getWideServerSnapshot)
}

/**
 * How many filters the bar applies: search, each selected team, each selected
 * shift, and hidden leave each count as one — what the collapsed trigger's
 * badge shows. `hasActiveFilters` answers the same question as a boolean, so
 * the two rules stay in step by construction.
 */
function activeFilterCount(filters: ScheduleFilters): number {
  return (
    (filters.query.trim() === '' ? 0 : 1) +
    filters.teamIds.length +
    filters.shiftCodes.length +
    (filters.showLeave ? 0 : 1)
  )
}

/**
 * One checkbox row — shared by the desktop dropdowns and the narrow sheet so a
 * team reads the same either way. A real `<input type="checkbox">` under a
 * `<label>`: the whole row is the tap target, and the browser owns the
 * checked/unchecked semantics for keyboard and screen readers.
 */
function FilterRow({
  checked,
  label,
  swatch,
  onToggle,
}: {
  checked: boolean
  label: string
  /** Left-hand colour dot (a shift's `swatchBg`) — omitted for teams. */
  swatch?: string
  onToggle: () => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-base-200 md:min-h-0 md:py-1.5">
      <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={checked} onChange={onToggle} />
      {swatch && <span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-xs" style={{ background: swatch }} />}
      <span className="min-w-0 truncate">{label}</span>
    </label>
  )
}

/**
 * A dropdown for a multi-select filter: a compact trigger carrying the
 * selection count, and a checked list hanging under it. Same floating-panel
 * mechanics as `ShiftColorPopover` (anchored by the trigger's own rect, closed
 * by an outside mousedown or Escape) — but the trigger lives inside this
 * component, so both it and the panel sit in one wrapper: clicking the trigger
 * is a normal toggle rather than an outside click that the panel then has to
 * survive. The same component carries the whole bar when the header is too
 * narrow for the controls.
 */
function FilterMenu({
  label,
  count,
  width,
  children,
}: {
  label: string
  count: number
  width: number
  children: ReactNode
}) {
  const [rect, setRect] = useState<{ left: number; bottom: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!rect) return
    function closeIfOutside(event: MouseEvent) {
      if ((event.target as HTMLElement | null)?.closest('.cd-filter-menu')) return
      setRect(null)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setRect(null)
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [rect])

  const left = rect ? Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) : 0

  return (
    <div className="cd-filter-menu relative flex shrink-0 items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={rect !== null}
        className={`btn btn-xs min-h-11 gap-1 md:min-h-0 ${count > 0 ? 'btn-ghost text-base-content' : 'btn-ghost text-base-content/60'}`}
        onClick={() => {
          if (rect) {
            setRect(null)
            return
          }
          const box = triggerRef.current?.getBoundingClientRect()
          if (box) setRect({ left: box.left, bottom: box.bottom })
        }}
      >
        {label}
        {count > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-2xs tabular-nums text-[var(--sel-active)]">{count}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-base-content/40" aria-hidden="true" />
      </button>
      {rect && (
        <div
          className="fixed z-30 flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1.5 shadow-lg"
          style={{ left, top: rect.bottom + 6, width }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * The shared schedule filters (search, team, shift, show-leave) — the same
 * four on the board and the calendar, in the URL so a view switch or a reload
 * keeps them. Every control writes straight through `useScheduleFilters`; no
 * state lives here except the search field's own draft, so both pages always
 * read one source of truth.
 *
 * Three shapes from one set of controls: an inline row where the header has
 * room for it, one Filters trigger (badge = how many filters apply) opening a
 * popover where it does not, and the same trigger opening a bottom sheet on a
 * phone — where the controls stack at touch size instead of fitting in a row.
 */
export function ScheduleFilterBar() {
  const t = useT()
  const isNarrow = useIsNarrow()
  const wide = useWideHeader()
  const [filters, setFilters] = useScheduleFilters()
  const teams = useAtomValue(teamsAtom) ?? EMPTY_TEAMS
  const shifts = useAtomValue(shiftsAtom) ?? EMPTY_SHIFTS
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState(filters.query)

  // The URL is the source of truth; the draft just keeps typing responsive
  // while the debounce below waits for a pause.
  useEffect(() => setDraft(filters.query), [filters.query])
  useEffect(() => {
    if (draft === filters.query) return
    const timer = window.setTimeout(() => setFilters({ query: draft }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, filters.query, setFilters])

  const toggleTeam = useCallback(
    (teamId: string) =>
      setFilters({
        teamIds: filters.teamIds.includes(teamId)
          ? filters.teamIds.filter((entry) => entry !== teamId)
          : [...filters.teamIds, teamId],
      }),
    [filters.teamIds, setFilters],
  )
  const toggleShift = useCallback(
    (code: string) =>
      setFilters({
        shiftCodes: filters.shiftCodes.includes(code)
          ? filters.shiftCodes.filter((entry) => entry !== code)
          : [...filters.shiftCodes, code],
      }),
    [filters.shiftCodes, setFilters],
  )
  const clear = useCallback(() => {
    setDraft('')
    setFilters({ query: '', teamIds: [], shiftCodes: [], showLeave: true })
  }, [setFilters])

  const count = activeFilterCount(filters)
  const clearable = hasActiveFilters(filters)

  const empty = <p className="m-0 px-2 py-1.5 text-xs text-[color:var(--text-faint)]">{t('filters.empty')}</p>

  const teamRows = teams.length === 0
    ? empty
    : teams.map((team) => (
        <FilterRow
          key={team.id}
          checked={filters.teamIds.includes(team.id)}
          label={team.name}
          onToggle={() => toggleTeam(team.id)}
        />
      ))

  const shiftRows = shifts.length === 0
    ? empty
    : shifts.map((shift) => (
        <FilterRow
          key={shift.code}
          checked={filters.shiftCodes.includes(shift.code)}
          label={shift.code}
          swatch={swatchBg(shift.color)}
          onToggle={() => toggleShift(shift.code)}
        />
      ))

  // Leave is the one filter whose "on" state is the default, so it is a plain
  // checkbox rather than a pressed/unpressed toggle — no colour has to mean
  // "this filter is running", which a checkbox says on its own.
  const leaveRow = (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-xs md:min-h-0 md:py-1">
      <input
        type="checkbox"
        className="checkbox checkbox-primary checkbox-sm"
        checked={filters.showLeave}
        onChange={() => setFilters({ showLeave: !filters.showLeave })}
      />
      <span>{t('filters.leave')}</span>
    </label>
  )

  const clearIconButton = clearable && (
    <button
      type="button"
      aria-label={t('filters.clear')}
      title={t('filters.clear')}
      className="btn btn-xs btn-ghost min-h-11 shrink-0 md:min-h-0"
      onClick={clear}
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )

  const clearRow = clearable && (
    <button type="button" className="btn btn-ghost btn-sm w-full gap-1.5" onClick={clear}>
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      {t('filters.clear')}
    </button>
  )

  if (isNarrow) {
    return (
      <>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-label={count > 0 ? t('filters.buttonActive', { count }) : t('filters.button')}
          className={`btn btn-xs min-h-11 shrink-0 gap-1 ${count > 0 ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setSheetOpen(true)}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          {count > 0 && (
            <span aria-hidden="true" className="text-2xs tabular-nums">
              {count}
            </span>
          )}
        </button>
        {sheetOpen && (
          <BottomSheet open onClose={() => setSheetOpen(false)} title={t('filters.title')}>
            <div className="flex flex-col gap-4">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('filters.search')}
                aria-label={t('filters.search')}
                className="w-full"
              />
              <section className="flex flex-col gap-0.5">
                <h3 className="m-0 px-2 text-2xs font-semibold tracking-wide text-[color:var(--text-dim)] uppercase">
                  {t('filters.teams')}
                </h3>
                {teamRows}
              </section>
              <section className="flex flex-col gap-0.5">
                <h3 className="m-0 px-2 text-2xs font-semibold tracking-wide text-[color:var(--text-dim)] uppercase">
                  {t('filters.shifts')}
                </h3>
                {shiftRows}
              </section>
              {leaveRow}
              {clearRow}
            </div>
          </BottomSheet>
        )}
      </>
    )
  }

  if (!wide) {
    return (
      <FilterMenu label={t('filters.button')} count={count} width={WIDE_POPOVER_WIDTH}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          className="my-1 w-full"
        />
        <h3 className="m-0 px-2 pt-1 text-2xs font-semibold tracking-wide text-[color:var(--text-dim)] uppercase">
          {t('filters.teams')}
        </h3>
        {teamRows}
        <h3 className="m-0 px-2 pt-2 text-2xs font-semibold tracking-wide text-[color:var(--text-dim)] uppercase">
          {t('filters.shifts')}
        </h3>
        {shiftRows}
        {leaveRow}
        {clearRow}
      </FilterMenu>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t('filters.search')}
        aria-label={t('filters.search')}
        className="w-28 shrink md:w-36"
      />
      <FilterMenu label={t('filters.teams')} count={filters.teamIds.length} width={200}>
        {teamRows}
      </FilterMenu>
      <FilterMenu label={t('filters.shifts')} count={filters.shiftCodes.length} width={180}>
        {shiftRows}
      </FilterMenu>
      {leaveRow}
      {clearIconButton}
    </div>
  )
}
