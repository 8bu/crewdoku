import { atom } from 'jotai'
import { peopleAtom } from './roster'
import { scheduleByPeriodAtom } from './schedule'
import { overridesByPeriodAtom } from './boardOverrides'
import { dirtyByPeriodAtom } from './settingsDirty'
import { autoGenerateOnMountAtom, onboardedPeriodsAtom } from './onboarding'
import { addDaysISO, periodsAtom, selectedPeriodIdAtom } from './shell'
import { assignmentKey, type Assignment } from '@crewdoku/domain'

/**
 * Period-level operations — periods own only their schedule. People, teams,
 * shift catalog, coverage rules, and solve settings are workspace-global.
 * Period operations manage period lifecycle (update and delete) and reconcile
 * per-period schedule / overrides without touching workspace-level entities.
 */

/**
 * Edits a period in place — label, start, and end (dates were create-time
 * only until this grew out of rename). A blank label keeps the existing one
 * (so a date edit never hinges on a half-typed label field); an inverted
 * range is ignored outright. When the dates actually change and the
 * period already carries a schedule, the assignment matrix is reconciled to
 * the new range: in-range entries survive, dates that left the range are
 * dropped, and newly covered dates fill with OFF — the board renders a
 * complete person × date matrix, never a sparse map. Hand-edit overrides
 * outside the new range are pruned the same way.
 */
export const updatePeriodAtom = atom(
  null,
  (get, set, payload: { id: string; label: string; start: string; end: string }) => {
    const { id, start, end } = payload
    const current = get(periodsAtom).find((p) => p.id === id)
    if (!current || !start || !end || start > end) return
    const label = payload.label.trim() || current.label

    set(periodsAtom, (prev) => prev.map((p) => (p.id === id ? { ...p, label, start, end } : p)))
    if (start === current.start && end === current.end) return

    const isos: string[] = []
    for (let iso = start; iso <= end; iso = addDaysISO(iso, 1)) isos.push(iso)

    const schedule = get(scheduleByPeriodAtom)[id]
    if (schedule) {
      const next = new Map<string, Assignment>()
      const people = get(peopleAtom) ?? []
      for (const person of people) {
        for (const iso of isos) {
          const key = assignmentKey(person.id, iso)
          next.set(
            key,
            schedule.assignments.get(key) ?? { code: 'OFF', start: null, end: null, pinned: false, ineligible: false },
          )
        }
      }
      set(scheduleByPeriodAtom, (prev) => ({ ...prev, [id]: { ...schedule, assignments: next } }))
    }

    const overrides = get(overridesByPeriodAtom)[id]
    if (overrides && overrides.size > 0) {
      const inRange = new Set(isos)
      set(overridesByPeriodAtom, (prev) => ({
        ...prev,
        [id]: new Map([...overrides].filter(([key]) => inRange.has(key.slice(key.indexOf('|') + 1)))),
      }))
    }
  },
)

/**
 * Deletes a period and every per-period record it seeded (schedule, overrides,
 * dirty flag, and onboarding gate sets). Refuses to delete the last period —
 * the shell always needs somewhere to point `selectedPeriodIdAtom` — and if the
 * deleted period was the selected one, falls back to whichever remaining period
 * starts latest, so the manager lands somewhere recent rather than an arbitrary
 * array order. Workspace-global entities (people, teams, shifts, coverage,
 * solve settings) are left untouched.
 */
export const deletePeriodAtom = atom(null, (get, set, periodId: string) => {
  const periods = get(periodsAtom)
  if (periods.length <= 1) return

  const remaining = periods.filter((p) => p.id !== periodId)
  set(periodsAtom, remaining)

  const dropKey = <T>(record: Record<string, T>): Record<string, T> => {
    if (!(periodId in record)) return record
    const { [periodId]: _dropped, ...rest } = record
    return rest
  }
  set(scheduleByPeriodAtom, dropKey)
  set(overridesByPeriodAtom, dropKey)
  set(dirtyByPeriodAtom, dropKey)

  const dropFromSet = (prev: ReadonlySet<string>): ReadonlySet<string> => {
    if (!prev.has(periodId)) return prev
    const next = new Set(prev)
    next.delete(periodId)
    return next
  }
  set(autoGenerateOnMountAtom, dropFromSet)
  set(onboardedPeriodsAtom, dropFromSet)

  if (get(selectedPeriodIdAtom) === periodId && remaining[0]) {
    const latest = remaining.reduce((best, p) => (p.start > best.start ? p : best), remaining[0])
    set(selectedPeriodIdAtom, latest.id)
  }
})
