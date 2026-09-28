/**
 * @crewdoku/domain — rule checks, constraints, and soft goal definitions.
 *
 * Implements hard rule checks (H1, H2, H3, H5, H6, H7), eligibility flagging,
 * and soft goal definitions (S1–S6). Pure domain logic; depends only on
 * sibling domain modules (calendar, entities, schedule, tags).
 *
 * Semantics ported faithfully from prototype modules:
 * - proto/src/board/coverage.ts
 * - proto/src/board/violations.ts
 * - proto/src/board/shiftDuration.ts
 * - proto/src/board/eligibility.ts
 * - proto/src/state/solveSettings.ts
 */

import type { ISODate } from './calendar'
import { addDays, eachDate, weekdayOf, weekIndexOf } from './calendar'
import type {
  CoverageTable,
  HardRuleId,
  Person,
  ShiftCode,
  ShiftDef,
  SoftGoalId,
  SolveSettings,
  Team,
} from './entities'
import { coverageBandFor, OFF_CODE } from './entities'
import type { Schedule, ScheduleBoundary } from './schedule'
import { activePeople, assignmentKey, getAssignment } from './schedule'
import type { Tag } from './tags'
import { cellPreference, personTags, tagRuleApplies } from './tags'

const WEEKDAY_NAMES: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Formats an ISO date as e.g. "Mon 2026-08-17" for ASD-STE plain-text messages. */
export function formatIsoDate(iso: ISODate): string {
  const dow = weekdayOf(iso)
  const dayName = WEEKDAY_NAMES[dow] ?? 'Sun'
  return `${dayName} ${iso}`
}

/** Formats hour numbers cleanly: integer as "8h", decimal as "8.5h". Ported from proto/src/board/violations.ts:83-86. */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

/**
 * Returns start and end time in minutes from midnight. When a shift crosses
 * midnight (end <= start), end is shifted by +1440 minutes (+24h).
 * Ported from proto/src/board/shiftDuration.ts:13-19.
 */
export function shiftSpan(
  shifts: readonly ShiftDef[],
  code: ShiftCode,
): { start: number; end: number } | null {
  if (code === OFF_CODE) return null
  const def = shifts.find((s) => s.code === code)
  if (!def) return null
  const start = Number(def.start.slice(0, 2)) * 60 + Number(def.start.slice(2))
  const end = Number(def.end.slice(0, 2)) * 60 + Number(def.end.slice(2))
  return { start, end: end <= start ? end + 24 * 60 : end }
}

/**
 * Returns duration of a shift code in decimal hours.
 * Ported from proto/src/board/shiftDuration.ts:21-24.
 */
export function shiftDurationHours(shifts: readonly ShiftDef[], code: ShiftCode): number {
  const span = shiftSpan(shifts, code)
  return span ? (span.end - span.start) / 60 : 0
}

/**
 * Paid duration of a shift in decimal hours: clock span minus its unpaid
 * break. Clock span (shiftDurationHours) still drives the timeline and H3
 * rest; paid hours drive the H2 weekly cap, hour displays, and the solver.
 */
export function paidHours(shifts: readonly ShiftDef[], code: ShiftCode): number {
  const span = shiftSpan(shifts, code)
  if (!span) return 0
  const def = shifts.find((s) => s.code === code)
  const breakMin = def?.unpaidBreakMinutes ?? 0
  const paidMin = span.end - span.start - breakMin
  return paidMin > 0 ? paidMin / 60 : 0
}

/**
 * Hours between one day's shift ending and the next day's shift starting.
 * Returns null if either day is OFF or shift code unknown.
 * Ported from proto/src/board/violations.ts:68-73.
 */
export function restHoursBetween(
  shifts: readonly ShiftDef[],
  prevCode: ShiftCode,
  nextCode: ShiftCode,
): number | null {
  const prev = shiftSpan(shifts, prevCode)
  const next = shiftSpan(shifts, nextCode)
  if (!prev || !next) return null
  return (24 * 60 - prev.end + next.start) / 60
}

/** Rule identifier for violations: hard rules H1..H5 or eligibility capability flag. */
export type ViolationRuleId = HardRuleId | 'eligibility'

/**
 * A violation or flag record representing a broken constraint or capability mismatch.
 * `personId` is null for workspace-level H1 coverage violations.
 */
export type Violation = {
  id: string
  ruleId: ViolationRuleId
  personId: string | null
  iso: ISODate
  shiftCode: ShiftCode | null
  message: string
  count?: number
  min?: number
  max?: number
  actualHours?: number
  maxHours?: number
  restHours?: number
  minRestHours?: number
}

/** Helper to extract the cell key (${personId}|${iso}) if this violation anchors to a person's cell. */
export function violationCellKey(violation: Violation): string | null {
  return violation.personId ? assignmentKey(violation.personId, violation.iso) : null
}

/**
 * Index a list of violations by cell key (${personId}|${iso}).
 * H1 coverage violations (personId == null) are omitted.
 */
export function violationsByCell(violations: readonly Violation[]): Map<string, Violation[]> {
  const map = new Map<string, Violation[]>()
  for (const v of violations) {
    const key = violationCellKey(v)
    if (!key) continue
    const existing = map.get(key)
    if (existing) {
      existing.push(v)
    } else {
      map.set(key, [v])
    }
  }
  return map
}

/**
 * Input slice required to validate constraints over a schedule period.
 */
export type WorkspaceSlice = {
  people: readonly Person[]
  shifts: readonly ShiftDef[]
  coverage: CoverageTable
  settings: SolveSettings
  period: { start: ISODate; end: ISODate }
  schedule: Schedule
  /**
   * The team catalog, used to resolve the base preference (S2) a person runs
   * on. Absent means every person reads their own `wants`/`avoids` — the same
   * result `basePreference` gives when no team is found.
   */
  teams?: readonly Team[]
  /** The tag catalog, in workspace order (tags.ts). Absent means no tags. */
  tags?: readonly Tag[]
  /**
   * Per-tag coverage band tables (H7), keyed by `Tag.id`; a tag without an
   * entry has no requirement. Absent means no tag coverage at all.
   */
  tagCoverage?: Readonly<Record<string, CoverageTable>>
  /**
   * The shifts people work on the days just outside the period, from the
   * neighbouring periods' schedules. H3 rest is the only rule that looks
   * across the edge; missing person or OFF means no shift there, so no
   * constraint. Absent boundary means the period is checked on its own.
   */
  boundary?: ScheduleBoundary
}

/**
 * H1 Coverage Check.
 *
 * For each date and each shift in the period, counts assigned people and checks
 * against coverageBandFor(table, shiftCode, date, weekday). Reports under-min
 * and over-max violations with shift code, date, and counts.
 *
 * Semantics: proto/src/board/coverage.ts:56-68 and proto/src/board/coverage.ts:35-39.
 */
export function checkH1Coverage(slice: WorkspaceSlice): Violation[] {
  if (!slice.settings.hardRules.enabled.H1) return []

  const violations: Violation[] = []
  const dates = eachDate(slice.period.start, slice.period.end)

  for (const iso of dates) {
    const dow = weekdayOf(iso)
    const counts: Record<string, number> = Object.fromEntries(slice.shifts.map((s) => [s.code, 0]))

    for (const person of slice.people) {
      const assignment = getAssignment(slice.schedule, person.id, iso)
      if (assignment.code in counts) {
        const current = counts[assignment.code]
        if (current !== undefined) {
          counts[assignment.code] = current + 1
        }
      }
    }

    for (const s of slice.shifts) {
      const band = coverageBandFor(slice.coverage, s.code, iso, dow)
      const count = counts[s.code] ?? 0

      if (count < band.min) {
        const personNoun = count === 1 ? 'person' : 'people'
        violations.push({
          id: `H1|${iso}|${s.code}|short`,
          ruleId: 'H1',
          personId: null,
          iso,
          shiftCode: s.code,
          count,
          min: band.min,
          max: band.max,
          message: `${s.code} on ${formatIsoDate(iso)} has ${count} ${personNoun}; it needs at least ${band.min}.`,
        })
      } else if (count > band.max) {
        const personNoun = count === 1 ? 'person' : 'people'
        violations.push({
          id: `H1|${iso}|${s.code}|over`,
          ruleId: 'H1',
          personId: null,
          iso,
          shiftCode: s.code,
          count,
          min: band.min,
          max: band.max,
          message: `${s.code} on ${formatIsoDate(iso)} has ${count} ${personNoun}; it needs at most ${band.max}.`,
        })
      }
    }
  }

  return violations
}

/**
 * H2 Weekly Hours Check.
 *
 * Sums paid shift hours per person per period-relative week (using
 * weekIndexOf). Flags weeks exceeding maxHoursPerWeek. Cross-midnight shifts
 * and unpaid breaks are handled using paidHours.
 *
 * Anchors violation to the first scheduled working date of the offending week.
 * Semantics: proto/src/board/violations.ts:148-181.
 */
export function checkH2WeeklyHours(slice: WorkspaceSlice): Violation[] {
  if (!slice.settings.hardRules.enabled.H2) return []

  const violations: Violation[] = []
  const dates = eachDate(slice.period.start, slice.period.end)
  const maxHours = slice.settings.hardRules.maxHoursPerWeek

  for (const person of slice.people) {
    let currentWeekIndex = -1
    let weekHours = 0
    let weekAnchorIso: ISODate | null = null

    for (const iso of dates) {
      const weekIdx = weekIndexOf(slice.period.start, iso)
      const assignment = getAssignment(slice.schedule, person.id, iso)

      if (weekIdx !== currentWeekIndex) {
        if (weekAnchorIso && weekHours > maxHours) {
          violations.push({
            id: `H2|${assignmentKey(person.id, weekAnchorIso)}|${currentWeekIndex}`,
            ruleId: 'H2',
            personId: person.id,
            iso: weekAnchorIso,
            shiftCode: null,
            actualHours: weekHours,
            maxHours,
            message: `${person.name} is scheduled ${formatHours(weekHours)} in the week of ${formatIsoDate(weekAnchorIso)}, over the ${maxHours}h cap.`,
          })
        }
        currentWeekIndex = weekIdx
        weekHours = 0
        weekAnchorIso = null
      }

      if (assignment.code !== OFF_CODE) {
        weekHours += paidHours(slice.shifts, assignment.code)
        weekAnchorIso = weekAnchorIso ?? iso
      }
    }

    if (weekAnchorIso && weekHours > maxHours) {
      violations.push({
        id: `H2|${assignmentKey(person.id, weekAnchorIso)}|${currentWeekIndex}`,
        ruleId: 'H2',
        personId: person.id,
        iso: weekAnchorIso,
        shiftCode: null,
        actualHours: weekHours,
        maxHours,
        message: `${person.name} is scheduled ${formatHours(weekHours)} in the week of ${formatIsoDate(weekAnchorIso)}, over the ${maxHours}h cap.`,
      })
    }
  }

  return violations
}

/**
 * H3 Rest Check.
 *
 * For consecutive working calendar days per person, verifies that rest hours
 * between previous shift end and next shift start >= minRestHours.
 *
 * Flags the second cell (date.iso), matching proto/src/board/violations.ts:135-146.
 *
 * When `slice.boundary` is given, the day before the period starts and the day
 * after it ends join the chain: the first day is checked against the
 * neighbouring period's shift on `period.start - 1`, and the last day against
 * the shift on `period.end + 1`. Both edges anchor their violation on the
 * period's own day, so the planner still sees a problem on a real cell.
 */
export function checkH3Rest(slice: WorkspaceSlice): Violation[] {
  if (!slice.settings.hardRules.enabled.H3) return []

  const violations: Violation[] = []
  const dates = eachDate(slice.period.start, slice.period.end)
  const minRest = slice.settings.hardRules.minRestHours

  for (const person of slice.people) {
    // Seed the chain with the neighbour's shift on the day before the period;
    // the loop below then flags the period's first day exactly like any other.
    const beforeCode = slice.boundary?.before[person.id]
    let prevIso: ISODate | null = beforeCode === undefined ? null : addDays(slice.period.start, -1)
    let prevCode: ShiftCode | null = beforeCode ?? null

    for (const iso of dates) {
      const assignment = getAssignment(slice.schedule, person.id, iso)

      if (prevIso !== null && prevCode !== null && prevCode !== OFF_CODE && assignment.code !== OFF_CODE) {
        const gap = restHoursBetween(slice.shifts, prevCode, assignment.code)
        if (gap !== null && gap < minRest) {
          violations.push({
            id: `H3|${assignmentKey(person.id, iso)}`,
            ruleId: 'H3',
            personId: person.id,
            iso,
            shiftCode: assignment.code,
            restHours: gap,
            minRestHours: minRest,
            message: `${person.name} has only ${formatHours(gap)} rest between ${formatIsoDate(prevIso)} ${prevCode} and ${formatIsoDate(iso)} ${assignment.code}; minimum is ${minRest}h.`,
          })
        }
      }

      prevIso = iso
      prevCode = assignment.code
    }

    // The day after the period, from the neighbouring schedule. Here the
    // in-period day is the earlier one, so the violation anchors on it.
    const afterCode = slice.boundary?.after[person.id]
    if (afterCode !== undefined) {
      const lastIso = slice.period.end
      const lastCode = getAssignment(slice.schedule, person.id, lastIso).code
      const gap = restHoursBetween(slice.shifts, lastCode, afterCode)
      if (gap !== null && gap < minRest) {
        const afterIso = addDays(lastIso, 1)
        violations.push({
          id: `H3|${assignmentKey(person.id, lastIso)}|after`,
          ruleId: 'H3',
          personId: person.id,
          iso: lastIso,
          shiftCode: lastCode,
          restHours: gap,
          minRestHours: minRest,
          message: `${person.name} has only ${formatHours(gap)} rest between ${formatIsoDate(lastIso)} ${lastCode} and ${formatIsoDate(afterIso)} ${afterCode}; minimum is ${minRest}h.`,
        })
      }
    }
  }

  return violations
}

/**
 * H5 Time Off & Unavailability Check.
 *
 * Flags any non-OFF assignment scheduled on a person's approved timeOff date
 * or recurringOff weekday.
 *
 * Semantics: proto/src/board/violations.ts:88-92,125-133.
 */
export function checkH5TimeOff(slice: WorkspaceSlice): Violation[] {
  if (!slice.settings.hardRules.enabled.H5) return []

  const violations: Violation[] = []
  const dates = eachDate(slice.period.start, slice.period.end)

  for (const person of slice.people) {
    for (const iso of dates) {
      const assignment = getAssignment(slice.schedule, person.id, iso)
      if (assignment.code === OFF_CODE) continue

      const dow = weekdayOf(iso)
      const isUnavailable =
        (person.timeOff !== undefined && person.timeOff.includes(iso)) ||
        (person.recurringOff !== undefined && person.recurringOff.includes(dow))

      if (isUnavailable) {
        violations.push({
          id: `H5|${assignmentKey(person.id, iso)}`,
          ruleId: 'H5',
          personId: person.id,
          iso,
          shiftCode: assignment.code,
          message: `${person.name} is scheduled for ${assignment.code} on ${formatIsoDate(iso)} but is not available on this day.`,
        })
      }
    }
  }

  return violations
}

/**
 * Eligibility Capability Flag Check (Not a solver hard rule).
 *
 * Flags any non-OFF assignment where the person is not certified for that shift code
 * (code in person.ineligible) or the assignment is marked as ineligible.
 *
 * Semantics: proto/src/board/violations.ts:115-123 and proto/src/board/eligibility.ts:8-11.
 */
export function checkEligibility(slice: WorkspaceSlice): Violation[] {
  const violations: Violation[] = []
  const dates = eachDate(slice.period.start, slice.period.end)

  for (const person of slice.people) {
    for (const iso of dates) {
      const assignment = getAssignment(slice.schedule, person.id, iso)
      if (assignment.code === OFF_CODE) continue

      const isIneligible = person.ineligible.includes(assignment.code) || assignment.ineligible

      if (isIneligible) {
        violations.push({
          id: `eligibility|${assignmentKey(person.id, iso)}`,
          ruleId: 'eligibility',
          personId: person.id,
          iso,
          shiftCode: assignment.code,
          message: `${person.name} is not eligible for ${assignment.code} on ${formatIsoDate(iso)}.`,
        })
      }
    }
  }

  return violations
}

/**
 * H6 Strict Tag Avoids.
 *
 * A tag may carry a strict avoid ("this group never works Night"). For each
 * active person and each worked cell, the cell preference is resolved through
 * `cellPreference` — the only place where "any avoid beats any want" lives —
 * and a strict avoid forbids the cell. The message names the first tag, in
 * workspace tag order, whose strict rule matched.
 *
 * While H6 is off, strict avoids fold into ordinary soft tag avoids (S6), so
 * this check reports nothing.
 */
export function checkTagRules(slice: WorkspaceSlice): Violation[] {
  if (!slice.settings.hardRules.enabled.H6) return []

  const tags = slice.tags ?? []
  if (tags.length === 0) return []

  const teamById = new Map((slice.teams ?? []).map((team) => [team.id, team]))
  const violations: Violation[] = []
  const dates = eachDate(slice.period.start, slice.period.end)

  for (const person of activePeople(slice.people)) {
    const held = personTags(person, tags)
    if (held.length === 0) continue
    const team = teamById.get(person.teamId)

    for (const iso of dates) {
      const assignment = getAssignment(slice.schedule, person.id, iso)
      if (assignment.code === OFF_CODE) continue
      if (!cellPreference(person, team, held, assignment.code, iso, true).strictAvoid) continue

      const blamed = held.find((tag) =>
        tag.rules.some(
          (rule) =>
            rule.kind === 'avoid' && rule.strict === true && tagRuleApplies(rule, assignment.code, iso),
        ),
      )
      if (!blamed) continue

      violations.push({
        id: `H6|${person.id}|${iso}`,
        ruleId: 'H6',
        personId: person.id,
        iso,
        shiftCode: assignment.code,
        message: `${person.name} is scheduled for ${assignment.code} on ${formatIsoDate(iso)}, but the tag ${blamed.name} strictly avoids that shift.`,
      })
    }
  }

  return violations
}

/**
 * H7 Tag Coverage.
 *
 * A tag may carry its own coverage table ("at least two of this group per
 * shift"). For each tag with a table, each date and shift counts the active
 * people holding that tag and checks `coverageBandFor` exactly like H1.
 * Violations are workspace-level (`personId: null`) and name the tag.
 */
export function checkTagCoverage(slice: WorkspaceSlice): Violation[] {
  if (!slice.settings.hardRules.enabled.H7) return []

  const tables = slice.tagCoverage
  if (!tables) return []
  const tagged = (slice.tags ?? []).filter((tag) => tables[tag.id] !== undefined)
  if (tagged.length === 0) return []

  const people = activePeople(slice.people)
  const violations: Violation[] = []
  const dates = eachDate(slice.period.start, slice.period.end)

  for (const tag of tagged) {
    const table = tables[tag.id]
    if (!table) continue
    const holders = people.filter((person) => person.tagIds?.includes(tag.id) === true)

    for (const iso of dates) {
      const dow = weekdayOf(iso)
      const counts: Record<string, number> = Object.fromEntries(slice.shifts.map((s) => [s.code, 0]))

      for (const person of holders) {
        const assignment = getAssignment(slice.schedule, person.id, iso)
        if (assignment.code in counts) {
          counts[assignment.code] = (counts[assignment.code] ?? 0) + 1
        }
      }

      for (const s of slice.shifts) {
        const band = coverageBandFor(table, s.code, iso, dow)
        const count = counts[s.code] ?? 0

        if (count < band.min) {
          const personNoun = count === 1 ? 'person' : 'people'
          violations.push({
            id: `H7|${tag.id}|${iso}|${s.code}|short`,
            ruleId: 'H7',
            personId: null,
            iso,
            shiftCode: s.code,
            count,
            min: band.min,
            max: band.max,
            message: `${tag.name}: ${s.code} on ${formatIsoDate(iso)} has ${count} ${personNoun} holding this tag; it needs at least ${band.min}.`,
          })
        } else if (count > band.max) {
          const personNoun = count === 1 ? 'person' : 'people'
          violations.push({
            id: `H7|${tag.id}|${iso}|${s.code}|over`,
            ruleId: 'H7',
            personId: null,
            iso,
            shiftCode: s.code,
            count,
            min: band.min,
            max: band.max,
            message: `${tag.name}: ${s.code} on ${formatIsoDate(iso)} has ${count} ${personNoun} holding this tag; it needs at most ${band.max}.`,
          })
        }
      }
    }
  }

  return violations
}

/**
 * Evaluates all enabled hard rules and eligibility checks across one period's schedule.
 * Returns violations sorted by date then person id (with null personId coming first).
 *
 * Semantics: proto/src/board/violations.ts:94-185.
 */
export function checkSchedule(slice: WorkspaceSlice): Violation[] {
  const violations = [
    ...checkH1Coverage(slice),
    ...checkH2WeeklyHours(slice),
    ...checkH3Rest(slice),
    ...checkH5TimeOff(slice),
    ...checkEligibility(slice),
    ...checkTagRules(slice),
    ...checkTagCoverage(slice),
  ]

  return violations.sort(
    (a, b) =>
      a.iso.localeCompare(b.iso) || (a.personId ?? '').localeCompare(b.personId ?? ''),
  )
}
/**
 * H4: One shift per person per day.
 *
 * Structural constraint: The Schedule map is keyed by `${personId}|${iso}`,
 * so by construction a person can have at most one Assignment per date.
 * There is no slot or representation for a second shift on the same day.
 * Therefore, H4 can never be violated and requires no runtime check.
 */
export const H4_STRUCTURAL_NOTE: string =
  'H4 (one shift per person per day) is structural: Schedule is keyed by personId|iso, making multi-shift assignments unrepresentable.'

/**
 * Soft Goal Definitions for S1–S6 (Ticket 05 contract, no scoring math).
 * Each record defines the direction of optimization and precisely what metric is measured.
 */
export type SoftGoalDefinition = {
  id: SoftGoalId
  direction: 'minimize' | 'maximize'
  summary: string
}

export const SOFT_GOAL_S1: SoftGoalDefinition = {
  id: 'S1',
  direction: 'minimize',
  summary: 'Spread of night-shift counts across active people',
}

export const SOFT_GOAL_S2: SoftGoalDefinition = {
  id: 'S2',
  direction: 'maximize',
  summary:
    'Preference match honoring wants and avoids, resolving via team defaults when useTeamPreference is true',
}

export const SOFT_GOAL_S3: SoftGoalDefinition = {
  id: 'S3',
  direction: 'minimize',
  summary: 'Cell changes versus previous schedule',
}

export const SOFT_GOAL_S4: SoftGoalDefinition = {
  id: 'S4',
  direction: 'minimize',
  summary: 'Spread of weekend-shift counts across active people',
}

export const SOFT_GOAL_S5: SoftGoalDefinition = {
  id: 'S5',
  direction: 'minimize',
  summary: 'Penalized shift-to-shift transitions across consecutive days',
}

export const SOFT_GOAL_S6: SoftGoalDefinition = {
  id: 'S6',
  direction: 'maximize',
  summary:
    'Group preferences honoring the tag rules of the tags a person holds, stacked on the team or personal preference (S2), with any avoid beating any want',
}

export const SOFT_GOAL_DEFINITIONS: Record<SoftGoalId, SoftGoalDefinition> = {
  S1: SOFT_GOAL_S1,
  S2: SOFT_GOAL_S2,
  S3: SOFT_GOAL_S3,
  S4: SOFT_GOAL_S4,
  S5: SOFT_GOAL_S5,
  S6: SOFT_GOAL_S6,
}
