import type { ISODate, Period } from '../entities/types'

const MS_PER_DAY = 86_400_000

function toUTC(date: ISODate): number {
  const parts = date.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return Date.UTC(y, m - 1, d)
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear().toString().padStart(4, '0')
  const m = (dt.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = dt.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Day of week, 0=Mon .. 6=Sun. */
export function dow(date: ISODate): number {
  const jsDay = new Date(toUTC(date)).getUTCDay() // 0=Sun..6=Sat
  return (jsDay + 6) % 7
}

export function isWeekend(date: ISODate): boolean {
  const d = dow(date)
  return d === 5 || d === 6 // Sat or Sun
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * MS_PER_DAY)
}

/** All ISO dates in the period, inclusive of startDate, length = weeks*7. */
export function eachDate(period: Period): ISODate[] {
  const total = period.weeks * 7
  const out: ISODate[] = []
  for (let i = 0; i < total; i++) {
    out.push(addDays(period.startDate, i))
  }
  return out
}

/** ISO-week bucket key = the Monday of that date's week (Mon-anchored). */
export function isoWeekKey(date: ISODate): ISODate {
  return addDays(date, -dow(date))
}
