/**
 * Pure ISO calendar math, UTC only. Every date in the domain is a
 * `YYYY-MM-DD` string; no timezone ever applies. Semantics match the
 * prototype's proven helpers (`shell.ts` `addDaysISO`, `mockBoard.ts`
 * `periodLengthDays`/`weekdayOf`): date-only arithmetic on the UTC clock.
 */

/** A calendar date as `YYYY-MM-DD`. The domain's only date representation. */
export type ISODate = string

function toUTC(iso: ISODate): Date {
  return new Date(`${iso}T00:00:00Z`)
}

/** `iso` shifted by `days` (negative allowed). */
export function addDays(iso: ISODate, days: number): ISODate {
  const d = toUTC(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Weekday of `iso`: 0 Sun .. 6 Sat. */
export function weekdayOf(iso: ISODate): number {
  return toUTC(iso).getUTCDay()
}

/** Saturday or Sunday. */
export function isWeekend(iso: ISODate): boolean {
  const dow = weekdayOf(iso)
  return dow === 0 || dow === 6
}

/** Inclusive day count of the range `start..end`. `start > end` is a caller bug. */
export function periodLengthDays(start: ISODate, end: ISODate): number {
  const ms = toUTC(end).getTime() - toUTC(start).getTime()
  return Math.round(ms / 86_400_000) + 1
}

/** Every date of the inclusive range `start..end`, in order. Empty when `start > end`. */
export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  const dates: ISODate[] = []
  for (let iso = start; iso <= end; iso = addDays(iso, 1)) dates.push(iso)
  return dates
}

/**
 * Zero-based week index of `iso` counted from the period's start date —
 * days 0–6 are week 0, days 7–13 week 1, and so on. This is the week the
 * weekly-hours rule (H2) sums over; it follows the period, not the
 * calendar's Monday.
 */
export function weekIndexOf(periodStart: ISODate, iso: ISODate): number {
  return Math.floor((periodLengthDays(periodStart, iso) - 1) / 7)
}
