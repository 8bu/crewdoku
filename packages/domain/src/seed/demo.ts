import { eachDate, dow } from '../calendar/calendar'
import {
  makeCoverage,
  makeEmployee,
  makeOrg,
  makeRules,
  makeShift,
  makeTeam,
} from '../entities/factories'
import type { Assignment, Coverage, Employee, ISODate } from '../entities/types'
import type { AppStateDTO } from '../ports/ports'

/**
 * buildDemo() constructs a small but realistic, FEASIBLE multi-week org and a
 * concrete assignment schedule that passes runHardChecks with zero violations.
 * It lives in domain seed/ (outside the entity core) per design §4 — pure, no
 * React/DOM/WASM. The returned value is an AppStateDTO (assignments as a plain
 * Assignment[], NOT a Schedule Map) so the app store can save() it directly.
 *
 * Design of the feasible baseline (kept deliberately simple & predictable):
 *  - 2-week period anchored on a Monday.
 *  - Each team staffs exactly one DAY shift + one NIGHT shift.
 *  - Employees are split into a day pool and a night pool per team. Each pool
 *    member works their single eligible shift Mon..Fri and takes Sat/Sun off
 *    (one of which is seeded as an explicit day off, shiftId:null).
 *  - Coverage byDow is set to EXACTLY the assigned weekday headcount (Mon..Fri)
 *    and {0,0} on weekends, so H1 is satisfied as equality.
 *  - Shift hours keep weekly load <= 48 (H2) and inter-day rest >= 11h (H3):
 *    day 08:00–16:00 (8h, ends 16:00), night 22:00–30:00 (8h, ends 06:00 next
 *    day). Day->Day rest = 16h, Night->Night rest = 16h; pools never cross, so
 *    no Night-after-Day or Day-after-Night pairs occur.
 */
export function buildDemo(): AppStateDTO {
  const period = { startDate: '2026-06-15' as ISODate, weeks: 2 }
  const dates = eachDate(period)
  // Weekday (Mon..Fri) dates only — coverage and assignments live here.
  const weekdays = dates.filter((d) => dow(d) <= 4)

  const rules = makeRules()
  const org = makeOrg({ name: 'Crewdoku Demo Co.' })

  // --- Shifts (company-wide defs). One night shift across the org. ---
  const dayShift = makeShift({
    code: 'D',
    name: 'Day',
    startHour: 8,
    endHour: 16,
    isNight: false,
  })
  const eveShift = makeShift({
    code: 'E',
    name: 'Evening',
    startHour: 14,
    endHour: 22,
    isNight: false,
  })
  const nightShift = makeShift({
    code: 'N',
    name: 'Night',
    startHour: 22,
    endHour: 30, // crosses midnight -> ends 06:00 next day
    isNight: true,
  })
  const shifts = [dayShift, eveShift, nightShift]

  // --- Teams: each staffs a day-ish shift + the shared night shift. ---
  const support = makeTeam({ name: 'Support', shiftIds: [dayShift.id, nightShift.id] })
  const ops = makeTeam({ name: 'Operations', shiftIds: [eveShift.id, nightShift.id] })
  const teams = [support, ops]

  const employees: Employee[] = []
  const coverages: Coverage[] = []
  const assignments: Assignment[] = []

  // Helper: assign a pool of employees to one shift Mon..Fri, weekends off
  // (with one explicit day-off cell), and emit matching coverage.
  let dayOffSeeded = false
  function staffPool(
    teamId: string,
    shiftId: string,
    headcount: number,
    namePrefix: string,
  ): void {
    const pool: Employee[] = []
    for (let i = 0; i < headcount; i++) {
      const emp = makeEmployee({
        name: `${namePrefix} ${i + 1}`,
        teamId,
        eligibleShiftIds: [shiftId],
      })
      pool.push(emp)
      employees.push(emp)
      for (const date of weekdays) {
        assignments.push({ employeeId: emp.id, date, shiftId })
      }
    }
    // Seed exactly one explicit day-off (shiftId:null) on the first Saturday of
    // the first pooled employee, so the storage null-round-trip test is met.
    if (!dayOffSeeded && pool.length > 0) {
      const firstSat = dates.find((d) => dow(d) === 5)
      if (firstSat) {
        assignments.push({ employeeId: pool[0]!.id, date: firstSat, shiftId: null })
        dayOffSeeded = true
      }
    }
    // Coverage matches the assigned weekday headcount exactly (equality band on
    // Mon..Fri), 0 on weekends.
    const byDow = Array.from({ length: 7 }, (_, d) =>
      d <= 4 ? { min: headcount, max: headcount } : { min: 0, max: 0 },
    )
    coverages.push(makeCoverage({ teamId, shiftId, byDow }))
  }

  // Support: 4 day + 3 night = 7
  staffPool(support.id, dayShift.id, 4, 'Sam')
  staffPool(support.id, nightShift.id, 3, 'Nina')
  // Operations: 4 evening + 3 night = 7
  staffPool(ops.id, eveShift.id, 4, 'Eli')
  staffPool(ops.id, nightShift.id, 3, 'Noah')

  return {
    org,
    teams,
    shifts,
    employees,
    coverages,
    rules,
    assignments,
    period,
  }
}
