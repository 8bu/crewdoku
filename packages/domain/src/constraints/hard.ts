import { dow, eachDate, isoWeekKey } from '../calendar/calendar'
import type { ID, ISODate, Period } from '../entities/types'
import { assignmentsFor, getAssignment } from '../schedule/schedule'
import type { Schedule } from '../schedule/schedule'
import type { SolveContext } from './context'

export interface H1Violation {
  rule: 'H1'
  kind: 'under' | 'over'
  teamId: ID
  shiftId: ID
  date: ISODate
  count: number
  min: number
  max: number
}
export interface H2Violation {
  rule: 'H2'
  employeeId: ID
  weekKey: ISODate
  hours: number
  cap: number
}
export interface H3Violation {
  rule: 'H3'
  employeeId: ID
  fromDate: ISODate
  toDate: ISODate
  rest: number
}
export interface H4Violation {
  rule: 'H4'
  employeeId: ID
  date: ISODate
}
export interface H5Violation {
  rule: 'H5'
  employeeId: ID
  date: ISODate
}
export interface H6Violation {
  rule: 'H6'
  employeeId: ID
  date: ISODate
  shiftId: ID
}

/** Whole-day index relative to an arbitrary epoch (the period start). */
function dayIndex(start: ISODate, date: ISODate): number {
  // addDays uses UTC arithmetic; derive delta by counting via Date.UTC math.
  const a = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  )
  const b = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
  return Math.round((b - a) / 86_400_000)
}

/**
 * H1: per (team, shift, date) coverage band. Counts ONLY that team's own
 * employees assigned to that shift on that date. dateOverrides precede byDow
 * (resolved by ctx.effectiveCoverage).
 */
export function checkH1(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): H1Violation[] {
  const out: H1Violation[] = []
  const dates = eachDate(period)
  for (const cov of ctx.coverages) {
    for (const date of dates) {
      const { min, max } = ctx.effectiveCoverage(cov.teamId, cov.shiftId, date)
      let count = 0
      for (const emp of ctx.employees) {
        if (emp.teamId !== cov.teamId) continue
        const a = getAssignment(schedule, emp.id, date)
        if (a && a.shiftId === cov.shiftId) count++
      }
      if (count < min) {
        out.push({ rule: 'H1', kind: 'under', teamId: cov.teamId, shiftId: cov.shiftId, date, count, min, max })
      } else if (count > max) {
        out.push({ rule: 'H1', kind: 'over', teamId: cov.teamId, shiftId: cov.shiftId, date, count, min, max })
      }
    }
  }
  return out
}

/**
 * H2: per (employee, ISO-week bucket) hours cap. Buckets are Mon-anchored ISO
 * weeks; partial leading/trailing weeks use the FULL cap (no pro-rating). Cap =
 * employee.contract.maxHoursPerWeek ?? rules.maxHoursPerWeek.
 */
export function checkH2(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): H2Violation[] {
  const out: H2Violation[] = []
  const periodDates = new Set(eachDate(period))
  for (const emp of ctx.employees) {
    const cap = emp.contract.maxHoursPerWeek ?? ctx.rules.maxHoursPerWeek
    const hoursByWeek = new Map<ISODate, number>()
    for (const a of assignmentsFor(schedule, emp.id)) {
      if (!periodDates.has(a.date)) continue
      if (a.shiftId == null) continue
      const wk = isoWeekKey(a.date)
      hoursByWeek.set(wk, (hoursByWeek.get(wk) ?? 0) + ctx.shiftHours(a.shiftId))
    }
    for (const [weekKey, hours] of hoursByWeek) {
      if (hours > cap) {
        out.push({ rule: 'H2', employeeId: emp.id, weekKey, hours, cap })
      }
    }
  }
  return out
}

/**
 * H3: rest between consecutive CALENDAR-day shifts across the whole period,
 * including Sun->Mon. endHour may exceed 24 (cross-midnight); rest math mirrors
 * the legacy formula generalized to N days:
 *   rest = (toDayIdx*24 + toShift.startHour) - (fromDayIdx*24 + fromShift.endHour)
 */
export function checkH3(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): H3Violation[] {
  const out: H3Violation[] = []
  const periodDates = new Set(eachDate(period))
  const minRest = ctx.rules.minRestHours
  for (const emp of ctx.employees) {
    const worked = assignmentsFor(schedule, emp.id)
      .filter((a) => a.shiftId != null && periodDates.has(a.date))
      .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    for (let k = 0; k + 1 < worked.length; k++) {
      const from = worked[k]!
      const to = worked[k + 1]!
      const fromIdx = dayIndex(period.startDate, from.date)
      const toIdx = dayIndex(period.startDate, to.date)
      if (toIdx - fromIdx !== 1) continue // only consecutive calendar dates
      const fromShift = ctx.shiftById.get(from.shiftId!)
      const toShift = ctx.shiftById.get(to.shiftId!)
      if (!fromShift || !toShift) continue
      const rest =
        (toIdx * 24 + toShift.startHour) - (fromIdx * 24 + fromShift.endHour)
      if (rest < minRest) {
        out.push({ rule: 'H3', employeeId: emp.id, fromDate: from.date, toDate: to.date, rest })
      }
    }
  }
  return out
}

/**
 * H4: one shift per day. The Map key (`${employeeId}|${date}`) makes two
 * assignments on the same day structurally impossible, so the checker always
 * returns []. Kept for parity; the solver model still emits the <=1 row.
 */
export function checkH4(
  _ctx: SolveContext,
  _schedule: Schedule,
  _period: Period,
): H4Violation[] {
  return []
}

function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end
}

/**
 * H5: time-off ranges + recurring noDow unavailability respected. A non-null
 * shift on an unavailable date is a violation. A null (explicit day off) is fine.
 */
export function checkH5(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): H5Violation[] {
  const out: H5Violation[] = []
  const periodDates = new Set(eachDate(period))
  for (const emp of ctx.employees) {
    for (const a of assignmentsFor(schedule, emp.id)) {
      if (a.shiftId == null) continue
      if (!periodDates.has(a.date)) continue
      const offByTimeOff = emp.timeOff.some((r) => inRange(a.date, r.start, r.end))
      const offByRecurring = emp.recurring.some(
        (r) => r.kind === 'noDow' && r.dow === dow(a.date),
      )
      if (offByTimeOff || offByRecurring) {
        out.push({ rule: 'H5', employeeId: emp.id, date: a.date })
      }
    }
  }
  return out
}

/** H6: only eligible shifts assigned. */
export function checkH6(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): H6Violation[] {
  const out: H6Violation[] = []
  const periodDates = new Set(eachDate(period))
  for (const emp of ctx.employees) {
    for (const a of assignmentsFor(schedule, emp.id)) {
      if (a.shiftId == null) continue
      if (!periodDates.has(a.date)) continue
      if (!emp.eligibleShiftIds.includes(a.shiftId)) {
        out.push({ rule: 'H6', employeeId: emp.id, date: a.date, shiftId: a.shiftId })
      }
    }
  }
  return out
}

export type HardViolation =
  | H1Violation
  | H2Violation
  | H3Violation
  | H4Violation
  | H5Violation
  | H6Violation
