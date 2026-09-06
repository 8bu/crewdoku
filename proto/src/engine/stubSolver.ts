/**
 * FAKE DATA — wayfinder ticket 10. The real engine is being rewritten
 * separately; the prototype needs *something* behind the solver port so the
 * rest of the UI can be built and demoed against it. This is the one place
 * a schedule is invented rather than solved for, and it never ships in the
 * real product: a deterministic rotation, not a search, with no notion of
 * optimality.
 */
import { assignmentKey, type Assignment, type ShiftCode, type ShiftDef } from '../board/mockBoard'
import { isEligible } from '../board/eligibility'
import { shiftDurationHours, shiftSpan } from '../board/shiftDuration'
import { coverageBandFor, type CoverageTable } from '../state/coverageRules'
import type {
  ConflictCoreItem,
  RelaxationOption,
  ScheduleMap,
  SolveRequest,
  SolveResult,
  SolverPort,
} from './types'

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeAssignment(shifts: ShiftDef[], code: ShiftCode): Assignment {
  const def = shifts.find((s) => s.code === code)
  return { code, start: def?.start ?? null, end: def?.end ?? null, pinned: false, ineligible: false }
}

function isUnavailable(
  person: { timeOff?: string[]; recurringOff?: number[] },
  dateIso: string,
  weekday: number,
): boolean {
  if (person.timeOff?.includes(dateIso)) return true
  if (person.recurringOff?.includes(weekday)) return true
  return false
}

/** Same math as `violations.ts`'s H3 check: hours between yesterday's shift ending and today's starting. */
function restHoursBetween(shifts: ShiftDef[], prevCode: string, nextCode: string): number | null {
  const prev = shiftSpan(shifts, prevCode)
  const next = shiftSpan(shifts, nextCode)
  if (!prev || !next) return null
  return (24 * 60 - prev.end + next.start) / 60
}

/** Rolling per-person state the greedy fill below carries from day to day. */
type PersonFillState = { prevCode: string; weekIndex: number; weekHours: number }

/**
 * Fills day by day, respecting every hard rule the stub can check greedily
 * — so a fresh Generate lands clean instead of drowning the board in red:
 * - coverage max is a cap; nobody joins a full shift (max 0 = a closed
 *   day, e.g. an office-week weekend);
 * - H3: a shift leaving less rest than `minRestHours` against yesterday's
 *   is never assigned (same math as `violations.ts`);
 * - H2: nobody is pushed past `maxHoursPerWeek` in a `weekIndex` bucket.
 * Each day runs two passes. Pass 1 fills every shift up to its authored
 * min, walking the roster from a day-rotated starting point so the duty
 * spreads; a min it cannot fill stays short and becomes the infeasible
 * report's shortfall. Pass 2 hands everyone still free their rotation
 * candidate (offset by `rotationOffset` and the day, so the roster doesn't
 * move in lockstep), thinning weekends to roughly half the working slots —
 * pass 2 only, so thinning can never starve an authored min. Pinned cells,
 * holidays, time off, and recurring days off are carried through untouched.
 */
function fillSchedule(request: SolveRequest): ScheduleMap {
  const { org, period, schedule, rules } = request
  const rotatingCodes = org.shifts.map((s) => s.code)
  const next: ScheduleMap = new Map(schedule)
  const fillState = new Map<string, PersonFillState>()

  const stateOf = (personId: string, weekIndex: number): PersonFillState => {
    let state = fillState.get(personId)
    if (!state) {
      state = { prevCode: 'OFF', weekIndex, weekHours: 0 }
      fillState.set(personId, state)
    }
    if (state.weekIndex !== weekIndex) {
      state.weekIndex = weekIndex
      state.weekHours = 0
    }
    return state
  }

  period.dates.forEach((date, dayIndex) => {
    const counts: Record<string, number> = Object.fromEntries(rotatingCodes.map((c) => [c, 0]))
    const bandFor = (code: string) => coverageBandFor(rules.coverage, code, date.iso, date.weekday)

    const canTake = (
      person: (typeof org.people)[number],
      state: PersonFillState,
      candidate: ShiftCode,
      reserveHours: number,
    ): boolean => {
      if (!isEligible(person, candidate)) return false
      if (rules.enabled.H3) {
        const rest = restHoursBetween(org.shifts, state.prevCode, candidate)
        if (rest !== null && rest < rules.minRestHours) return false
      }
      if (
        rules.enabled.H2 &&
        state.weekHours + shiftDurationHours(org.shifts, candidate) + reserveHours > rules.maxHoursPerWeek
      ) {
        return false
      }
      return true
    }

    // Pass 2 below leaves one shift of weekly headroom per person, so a
    // greedy early week can never burn the hours the back of the week's
    // authored mins still need. The week's last day spends the reserve.
    const lastDayOfWeek = period.dates[dayIndex + 1]?.weekIndex !== date.weekIndex

    // Pins, holidays, and unavailability settle first; everyone else is free.
    const free: (typeof org.people)[number][] = []
    for (const person of org.people) {
      const key = assignmentKey(person.id, date.iso)
      const state = stateOf(person.id, date.weekIndex)
      const existing = schedule.get(key)
      if (existing?.pinned) {
        next.set(key, existing)
        if (existing.code in counts) counts[existing.code]!++
        state.prevCode = existing.code
        state.weekHours += shiftDurationHours(org.shifts, existing.code)
        continue
      }
      if (date.holidayName || isUnavailable(person, date.iso, date.weekday)) {
        next.set(key, makeAssignment(org.shifts, 'OFF'))
        state.prevCode = 'OFF'
        continue
      }
      free.push(person)
    }

    const assigned = new Map<string, ShiftCode>()

    // Pass 1: satisfy every authored min.
    for (const shift of org.shifts) {
      for (let k = 0; k < free.length && counts[shift.code]! < bandFor(shift.code).min; k++) {
        const person = free[(k + dayIndex) % free.length]!
        if (assigned.has(person.id)) continue
        const state = stateOf(person.id, date.weekIndex)
        if (!canTake(person, state, shift.code, 0)) continue
        assigned.set(person.id, shift.code)
        counts[shift.code]!++
      }
    }

    // Pass 2: rotation for everyone still free, capped at max, thinned on weekends.
    for (const person of free) {
      if (assigned.has(person.id)) continue
      const state = stateOf(person.id, date.weekIndex)
      let code: ShiftCode = 'OFF'
      for (let step = 0; step < rotatingCodes.length; step++) {
        const candidate = rotatingCodes[(dayIndex + person.rotationOffset + step) % rotatingCodes.length]!
        if (counts[candidate]! >= bandFor(candidate).max) continue
        if (!canTake(person, state, candidate, lastDayOfWeek ? 0 : shiftDurationHours(org.shifts, candidate))) continue
        code = candidate
        break
      }
      // Thins weekends to roughly half the working slots. Keyed off the
      // person's id, not `rotationOffset` — see `mockBoard.ts`'s identical
      // note on why a mod-2 check has to use an independent number.
      if (code !== 'OFF' && date.isWeekend && (dayIndex + Number(person.id.slice(1))) % 2 === 0) {
        code = 'OFF'
      }
      if (code !== 'OFF') {
        assigned.set(person.id, code)
        counts[code]!++
      }
    }

    // Settle the day: write every free person's cell and roll their state.
    for (const person of free) {
      const code = assigned.get(person.id) ?? 'OFF'
      const state = stateOf(person.id, date.weekIndex)
      if (code !== 'OFF') state.weekHours += shiftDurationHours(org.shifts, code)
      state.prevCode = code
      next.set(assignmentKey(person.id, date.iso), makeAssignment(org.shifts, code))
    }
  })

  return next
}

/** Per-day, per-shift headcount against the real coverage table, in plain words. Skipped entirely when H1 is off. */
function findShortfalls(schedule: ScheduleMap, request: SolveRequest): ConflictCoreItem[] {
  const { org, period, rules } = request
  if (!rules.enabled.H1) return []
  const shortfalls: ConflictCoreItem[] = []

  for (const date of period.dates) {
    // A holiday sends everyone home on purpose (`fillSchedule` above) — it's
    // not a shortfall, it's the point. Coverage was never meant to apply to
    // a day nobody is supposed to be working.
    if (date.holidayName) continue
    const counts: Record<string, number> = Object.fromEntries(org.shifts.map((s) => [s.code, 0]))
    for (const person of org.people) {
      const assignment = schedule.get(assignmentKey(person.id, date.iso))
      if (assignment && assignment.code in counts) counts[assignment.code]!++
    }
    for (const shift of org.shifts) {
      const band = coverageBandFor(rules.coverage, shift.code, date.iso, date.weekday)
      const count = counts[shift.code]!
      if (count < band.min) {
        shortfalls.push({
          id: `${date.iso}|${shift.code}`,
          message: `${shift.code} on ${date.iso} needs ${band.min} people but only ${count} are scheduled.`,
        })
      }
    }
  }

  return shortfalls
}

function shiftCoverageTable(table: CoverageTable, delta: (band: { min: number; max: number }) => { min: number; max: number }): CoverageTable {
  const shiftRow = (row: Record<string, { min: number; max: number }>) =>
    Object.fromEntries(Object.entries(row).map(([code, band]) => [code, delta(band)]))
  return {
    byDow: Object.fromEntries(Object.entries(table.byDow).map(([dow, row]) => [dow, shiftRow(row)])),
    dateOverrides: Object.fromEntries(Object.entries(table.dateOverrides).map(([iso, row]) => [iso, shiftRow(row)])),
  }
}

function buildRelaxations(): RelaxationOption[] {
  return [
    {
      id: 'lower-min',
      label: 'Lower every shift’s minimum coverage by 1',
      relax: (r) => ({ ...r, coverage: shiftCoverageTable(r.coverage, (b) => ({ ...b, min: Math.max(0, b.min - 1) })) }),
    },
    {
      id: 'raise-max',
      label: 'Raise every shift’s maximum coverage by 1',
      relax: (r) => ({ ...r, coverage: shiftCoverageTable(r.coverage, (b) => ({ ...b, max: b.max + 1 })) }),
    },
  ]
}

const FORCED_FAILURE_CORE: ConflictCoreItem[] = [
  { id: 'forced', message: 'This solve was told to fail on demand, to design the infeasible screen against.' },
]

export const stubSolve: SolverPort = async (request) => {
  await wait(request.options?.delayMs ?? 1200)

  if (request.options?.forceInfeasible) {
    const result: SolveResult = {
      status: 'infeasible',
      conflictCore: FORCED_FAILURE_CORE,
      relaxations: buildRelaxations(),
    }
    return result
  }

  const schedule = fillSchedule(request)
  const shortfalls = findShortfalls(schedule, request)
  if (shortfalls.length > 0) {
    return { status: 'infeasible', conflictCore: shortfalls, relaxations: buildRelaxations() }
  }

  return { status: 'solved', schedule }
}
