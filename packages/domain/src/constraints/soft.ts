import { eachDate, isWeekend } from '../calendar/calendar'
import type { ID, ISODate, Period } from '../entities/types'
import { getAssignment } from '../schedule/schedule'
import type { Schedule } from '../schedule/schedule'
import type { SolveContext } from './context'

/**
 * Soft scorers return RAW, UNWEIGHTED counts/spreads. The registry applies
 * Rules.weights[Sx] and Rules.enabled[Sx]. Each scorer aggregates over the
 * whole period (not per week).
 */

function spread(values: number[]): number {
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

/** S1: min-max spread of per-employee night-shift counts, keyed by Shift.isNight. */
export function scoreS1(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): number {
  const hasNight = ctx.shifts.some((s) => s.isNight)
  if (!hasNight) return 0
  const dates = eachDate(period)
  const counts: number[] = []
  for (const emp of ctx.employees) {
    let n = 0
    for (const date of dates) {
      const a = getAssignment(schedule, emp.id, date)
      if (a && a.shiftId != null && ctx.shiftById.get(a.shiftId)?.isNight) n++
    }
    counts.push(n)
  }
  return spread(counts)
}

/**
 * S2: preference-violation count.
 * - night === 'avoid' and a night shift is worked → +1
 * - night === 'prefer' and a non-night shift is worked → +1
 * - weekend === 'avoid' and any shift on a weekend date → +1
 * - preferredShiftId set and a different (non-null) shift worked → +1
 */
export function scoreS2(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): number {
  const dates = eachDate(period)
  let violations = 0
  for (const emp of ctx.employees) {
    for (const date of dates) {
      const a = getAssignment(schedule, emp.id, date)
      if (!a || a.shiftId == null) continue
      const shift = ctx.shiftById.get(a.shiftId)
      const isNight = !!shift?.isNight
      if (emp.prefs.night === 'avoid' && isNight) violations++
      else if (emp.prefs.night === 'prefer' && !isNight) violations++
      if (emp.prefs.weekend === 'avoid' && isWeekend(date)) violations++
      const pref = emp.prefs.preferredShiftId
      if (pref !== undefined && a.shiftId !== pref) violations++
    }
  }
  return violations
}

/** S3: cells in `schedule` differing from `baseline` over the period. */
export function scoreS3(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
  baseline: Schedule,
): number {
  const dates = eachDate(period)
  let changed = 0
  for (const emp of ctx.employees) {
    for (const date of dates) {
      const cur = cellShift(schedule, emp.id, date)
      const base = cellShift(baseline, emp.id, date)
      if (cur !== base) changed++
    }
  }
  return changed
}

/** Normalized cell value: the assigned shiftId, or null for day-off/absent. */
function cellShift(s: Schedule, employeeId: ID, date: ISODate): ID | null {
  const a = getAssignment(s, employeeId, date)
  return a ? a.shiftId : null
}

/** S4: min-max spread of per-employee weekend-shift counts. */
export function scoreS4(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): number {
  const dates = eachDate(period)
  const counts: number[] = []
  for (const emp of ctx.employees) {
    let c = 0
    for (const date of dates) {
      if (!isWeekend(date)) continue
      const a = getAssignment(schedule, emp.id, date)
      if (a && a.shiftId != null) c++
    }
    counts.push(c)
  }
  return spread(counts)
}

/**
 * Incompatible ordered shift pairs (a→b on consecutive days) where the implied
 * rest `24 + b.startHour - a.endHour` is below minRestHours. Mirrors the legacy
 * `incompatiblePairs`. Curated/omittable soft penalty (S5).
 */
function incompatiblePairKeys(ctx: SolveContext): Set<string> {
  const minRest = ctx.rules.minRestHours
  const out = new Set<string>()
  for (const a of ctx.shifts) {
    for (const b of ctx.shifts) {
      const rest = 24 + b.startHour - a.endHour
      if (rest < minRest) out.add(`${a.id}->${b.id}`)
    }
  }
  return out
}

/** S5: count of incompatible consecutive-day shift transitions over the period. */
export function scoreS5(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): number {
  const incompat = incompatiblePairKeys(ctx)
  if (incompat.size === 0) return 0
  const dates = eachDate(period)
  let count = 0
  for (const emp of ctx.employees) {
    for (let d = 0; d + 1 < dates.length; d++) {
      const a = getAssignment(schedule, emp.id, dates[d]!)
      const b = getAssignment(schedule, emp.id, dates[d + 1]!)
      if (!a || a.shiftId == null || !b || b.shiftId == null) continue
      if (incompat.has(`${a.shiftId}->${b.shiftId}`)) count++
    }
  }
  return count
}
