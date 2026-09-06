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

export function createPeriod(label: string, start: string, duration: PeriodDuration, setup: PeriodSetup): Period {
  const days = PERIOD_DURATIONS.find((d) => d.value === duration)!.days
  return {
    id: `period-${crypto.randomUUID()}`,
    label,
    start,
    end: addDaysISO(start, days - 1),
    setup,
  }
}

/** Adds a period and switches the shell to it in one atomic write. */
export const addPeriodAtom = atom(null, (_get, set, period: Period) => {
  set(periodsAtom, (prev) => [...prev, period])
  set(selectedPeriodIdAtom, period.id)
})
