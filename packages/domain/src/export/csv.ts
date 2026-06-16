import { dow, eachDate } from '../calendar/calendar'
import type { SolveContext } from '../constraints/context'
import { getAssignment } from '../schedule/schedule'
import type { Schedule } from '../schedule/schedule'
import type { ID, Period } from '../entities/types'

/** Short day-of-week names, indexed by `dow()` (0=Mon..6=Sun). */
const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/**
 * RFC4180 field quoting: every field is wrapped in double quotes with any
 * internal `"` doubled. Quoting unconditionally keeps embedded commas,
 * quotes, and newlines safe with no per-field branching.
 */
function quote(field: string): string {
  return `"${field.replace(/"/g, '""')}"`
}

function csvRow(fields: string[]): string {
  return fields.map(quote).join(',')
}

/** Format an hour-of-day (may exceed 24 for cross-midnight) as `HH:00`. */
function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  return `${h.toString().padStart(2, '0')}:00`
}

/**
 * Team grid CSV: rows = employees, columns = period dates, each cell is the
 * shift code worked that date (empty for unscheduled OR explicit day-off).
 * UTF-8, every field quoted.
 */
export function exportTeamCSV(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): string {
  const dates = eachDate(period)
  const header = csvRow(['', ...dates])
  const rows = ctx.employees.map((emp) => {
    const cells = dates.map((date) => {
      const a = getAssignment(schedule, emp.id, date)
      if (!a || a.shiftId === null) return ''
      const shift = ctx.shiftById.get(a.shiftId)
      return shift ? shift.code : ''
    })
    return csvRow([emp.name, ...cells])
  })
  return [header, ...rows].join('\n')
}

/**
 * Member list CSV for a single employee: one row per SCHEDULED date (non-null
 * shift), columns [date, dow, shiftCode, start, end, hours], ordered
 * chronologically over the period. Explicit day-off and unscheduled dates are
 * excluded. UTF-8, every field quoted.
 */
export function exportMemberCSV(
  ctx: SolveContext,
  schedule: Schedule,
  employeeId: ID,
  period: Period,
): string {
  const header = csvRow(['date', 'dow', 'shiftCode', 'start', 'end', 'hours'])
  const rows: string[] = []
  for (const date of eachDate(period)) {
    const a = getAssignment(schedule, employeeId, date)
    if (!a || a.shiftId === null) continue
    const shift = ctx.shiftById.get(a.shiftId)
    if (!shift) continue
    rows.push(
      csvRow([
        date,
        DOW_SHORT[dow(date)] ?? '',
        shift.code,
        formatHour(shift.startHour),
        formatHour(shift.endHour),
        String(shift.endHour - shift.startHour),
      ]),
    )
  }
  return [header, ...rows].join('\n')
}
