import { atom } from 'jotai'
import type { Period as DomainPeriod } from '@crewdoku/domain'

/**
 * Shell-level state — the period model. A manager can create additional periods
 * and switch between them. Periods scope ONLY the schedule; people, teams, the
 * shift catalog, coverage rules, and solve settings are workspace-global.
 * `setup` records whether a newly created period still owes a first-run schedule
 * import (`'import'`) or is ready to render as-is (`'ready'`).
 *
 * The period list is empty until `bootWorkspace` (state/workspaceStore.ts)
 * hydrates it from IndexedDB — a loaded workspace, or a starter with one period
 * on a fresh install.
 */
export type PeriodSetup = 'ready' | 'import'

/** The app's period extends the domain `Period` with the app-only `setup` field. */
export type Period = DomainPeriod & {
  setup: PeriodSetup
}

export const periodsAtom = atom<Period[]>([])

export const selectedPeriodIdAtom = atom<string>('')

export const selectedPeriodAtom = atom((get) => {
  const id = get(selectedPeriodIdAtom)
  return get(periodsAtom).find((p) => p.id === id) ?? null
})

/** A manager picks a start date and one of these common lengths, not a raw day count. */
export type PeriodDuration = 'week' | 'biweek' | 'month'

export const PERIOD_DURATIONS: { value: PeriodDuration; label: string; days: number }[] = [
  { value: 'week', label: '1 week', days: 7 },
  { value: 'biweek', label: '2 weeks', days: 14 },
  { value: 'month', label: '1 month', days: 28 },
]

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The inclusive last day a period of `duration` starting on `start` covers. */
export function periodEnd(start: string, duration: PeriodDuration): string {
  const days = PERIOD_DURATIONS.find((d) => d.value === duration)!.days
  return addDaysISO(start, days - 1)
}

export function createPeriod(label: string, start: string, duration: PeriodDuration, setup: PeriodSetup): Period {
  return {
    id: `period-${crypto.randomUUID()}`,
    label,
    start,
    end: periodEnd(start, duration),
    setup,
  }
}

/**
 * The first period sharing at least one day with `candidate`, or null. Two
 * periods sharing a day used to be legal but never rendered together; the
 * calendar joins every period into one timeline, so one day must belong to one
 * period. `ignoreId` lets an edit be checked against the other periods without
 * matching itself.
 */
export function findOverlap(
  periods: readonly Period[],
  candidate: { start: string; end: string },
  ignoreId?: string,
): Period | null {
  return periods.find((p) => p.id !== ignoreId && p.start <= candidate.end && p.end >= candidate.start) ?? null
}

/** Every period caught in at least one overlap, so the UI can name them all. */
export function findOverlappingPeriodIds(periods: readonly Period[]): ReadonlySet<string> {
  const overlapping = new Set<string>()
  periods.forEach((period, i) => {
    for (const other of periods.slice(i + 1)) {
      if (period.start <= other.end && other.start <= period.end) {
        overlapping.add(period.id)
        overlapping.add(other.id)
      }
    }
  })
  return overlapping
}

/**
 * Adds a period and switches the shell to it in one atomic write. Refuses a
 * range that overlaps an existing period — the callers validate first, this is
 * the guard of last resort.
 */
export const addPeriodAtom = atom(null, (get, set, period: Period) => {
  if (findOverlap(get(periodsAtom), period)) return
  set(periodsAtom, (prev) => [...prev, period])
  set(selectedPeriodIdAtom, period.id)
})
