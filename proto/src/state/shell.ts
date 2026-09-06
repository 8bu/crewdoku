import { atom } from 'jotai'

/**
 * Shell-level state — the period model (wayfinder ticket 17): a manager can
 * create additional periods and switch to any of them, not just the one
 * bootstrap demo period. `seedMock` is true only for that original period
 * (`p1`) — it alone seeds from mock data.
 *
 * Periods scope ONLY the schedule. People, teams, shift catalog, coverage rules,
 * and solve settings are workspace-global. `setup` records whether a newly
 * created period owes a first-run schedule import (`'import'`), or is ready
 * to render as-is (`'ready'`).
 */
export type PeriodSetup = 'ready' | 'import'

export type Period = {
  id: string
  label: string
  start: string // ISO date, UTC
  end: string // ISO date, UTC, inclusive
  seedMock: boolean
  setup: PeriodSetup
}

/**
 * `/?fresh` boots an empty workspace — the only way to reach the first-run
 * wizard (ticket 14) in a running app, since the default boot seeds the
 * demo period with mock data. This is also what a real install would look
 * like: no people, no schedule, wizard first.
 */
function freshBoot(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('fresh')
}

export const periodsAtom = atom<Period[]>([
  { id: 'p1', label: 'Period 1', start: '2026-08-17', end: '2026-09-27', seedMock: !freshBoot(), setup: 'ready' },
])

export const selectedPeriodIdAtom = atom<string>('p1')

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

export function createPeriod(label: string, start: string, duration: PeriodDuration, setup: PeriodSetup): Period {
  const days = PERIOD_DURATIONS.find((d) => d.value === duration)!.days
  return {
    id: `period-${crypto.randomUUID()}`,
    label,
    start,
    end: addDaysISO(start, days - 1),
    seedMock: false,
    setup,
  }
}

/** Adds a period and switches the shell to it in one atomic write. */
export const addPeriodAtom = atom(null, (_get, set, period: Period) => {
  set(periodsAtom, (prev) => [...prev, period])
  set(selectedPeriodIdAtom, period.id)
})
