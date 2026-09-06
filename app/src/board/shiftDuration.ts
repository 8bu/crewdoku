/**
 * Shift-time math shared by `violations.ts` (rest hours) and `fairness.ts`
 * (hours totals) — both used to read `mockBoard.SHIFT_TIMES` directly; now
 * that the catalog is editable (ticket 15) they both need it looked up live.
 */
import type { ShiftDef } from '@crewdoku/domain'

function clockToMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2))
}

/** Start/end in minutes-from-start-of-day, end pushed past 1440 when the shift crosses midnight. */
export function shiftSpan(shifts: ShiftDef[], code: string): { start: number; end: number } | null {
  const def = shifts.find((s) => s.code === code)
  if (!def) return null
  const start = clockToMinutes(def.start)
  const end = clockToMinutes(def.end)
  return { start, end: end <= start ? end + 24 * 60 : end }
}

export function shiftDurationHours(shifts: ShiftDef[], code: string): number {
  const span = shiftSpan(shifts, code)
  return span ? (span.end - span.start) / 60 : 0
}
