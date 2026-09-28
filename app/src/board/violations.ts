/**
 * Rule-break detection for the board (ticket 07, extended ticket 15 with
 * real H2/H5 checks). Pure and framework-free, like `eligibility.ts` and
 * `editHistory.ts` — scans the *current* view of every assignment (base
 * schedule plus overrides) and returns every break in plain words.
 *
 * H1 (coverage) lives in `coverage.ts`, H4 (one shift/day) can't be broken
 * by construction — this module covers H2 (max hours/week), H3 (rest), H5
 * (time off/unavailability), eligibility, and the tag rules H6 (strict tag
 * avoids) and H7 (a tag's own coverage band), each toggle-gated by `enabled`
 * the same way Settings' Advanced door controls them. H3 also looks across
 * the period's edges, via the caller-supplied `boundary`.
 *
 * The tag kinds mirror `checkTagRules`/`checkTagCoverage` in the domain's
 * `constraints.ts`: which cells count as broken must agree with the checker,
 * or the board and the checker disagree about one schedule. Precedence comes
 * from `cellPreference` there and here — "any avoid beats any want" is never
 * re-implemented.
 */

import {
  addDays,
  assignmentKey,
  cellPreference,
  coverageBandFor,
  EMPTY_BOUNDARY,
  paidHours,
  personTags,
  tagRuleApplies,
  weekdayOf,
  weekIndexOf,
  type Assignment,
  type CoverageTable,
  type Person,
  type ScheduleBoundary,
  type ShiftDef,
  type Tag,
  type Team,
} from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'
import { shiftSpan } from './shiftDuration'
import type { HardRuleId } from '@crewdoku/domain'

export type ViolationKind =
  | 'ineligible'
  | 'rest'
  | 'hours'
  | 'unavailable'
  /** H6: a hand-edit landed on a cell a strict tag rule forbids. */
  | 'tagAvoid'
  /** H7: a tag's own coverage band (short or over) for one shift on one day. */
  | 'tagCoverage'

export type Violation = {
  id: string
  kind: ViolationKind
  /**
   * The person the break belongs to. `null` for a workspace-level break — H7
   * tag coverage is about a tag's headcount, not one guilty person — which
   * anchors to its date column instead of a cell.
   */
  personId: string | null
  /** The cell this violation is anchored to — where the list jumps to. */
  dateIso: string
  /** English fallback, shown by the board's tips and mobile issue lists. */
  message: string
  /**
   * Structured cause for locale-aware rendering; the tag kinds' sentences are
   * built from these in `ProblemList` (same contract the engine's conflict
   * core uses). Older kinds carry none and render `message` as-is.
   */
  params?: Record<string, string | number>
}

export type BoardViolationPlacement = {
  /** Messages already represented by a red dot on a rendered person/date cell. */
  cellMessages: Map<string, string[]>
  /**
   * Remainder only: violations with no rendered cell that can own their detail.
   * Keyed by person id, or `null` for the workspace-level breaks (H7 tag
   * coverage) that no single person's lane can hold — the problem list is
   * their detail surface.
   */
  otherByPerson: Map<string | null, Violation[]>
}

/**
 * Gives each violation exactly one detail surface. If its person/date cell is
 * present on the board, that cell's red dot owns the message. Only violations
 * without a rendered anchor flow into the pinned "Other violations" column.
 */
export function partitionViolationsForBoard(
  violations: Violation[],
  visiblePersonIds: ReadonlySet<string>,
  visibleDateIsos: ReadonlySet<string>,
): BoardViolationPlacement {
  const cellMessages = new Map<string, string[]>()
  const otherByPerson = new Map<string | null, Violation[]>()

  for (const violation of violations) {
    if (
      violation.personId !== null &&
      visiblePersonIds.has(violation.personId) &&
      visibleDateIsos.has(violation.dateIso)
    ) {
      const key = assignmentKey(violation.personId, violation.dateIso)
      const messages = cellMessages.get(key)
      if (messages) messages.push(violation.message)
      else cellMessages.set(key, [violation.message])
      continue
    }

    const others = otherByPerson.get(violation.personId)
    if (others) others.push(violation)
    else otherByPerson.set(violation.personId, [violation])
  }

  return { cellMessages, otherByPerson }
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Hours between one day's shift ending and the next day's shift starting. `null` if either day is off. */
function restHours(shifts: ShiftDef[], prevCode: string, nextCode: string): number | null {
  const prev = shiftSpan(shifts, prevCode)
  const next = shiftSpan(shifts, nextCode)
  if (!prev || !next) return null
  return (24 * 60 - prev.end + next.start) / 60
}

function dateLabel(date: BoardDate): string {
  return `${WEEKDAY_SHORT[date.weekday]} ${date.monthShort} ${date.dayOfMonth}`
}

/** `dateLabel` for a day just outside the period, which has no `BoardDate` — same shape, off the ISO. */
function outsideDateLabel(iso: string): string {
  const month = Number(iso.slice(5, 7))
  return `${WEEKDAY_SHORT[weekdayOf(iso)]} ${MONTH_SHORT[month - 1]} ${Number(iso.slice(8, 10))}`
}

function shiftLabel(code: string): string {
  return code === 'OFF' ? 'off' : code.charAt(0) + code.slice(1).toLowerCase()
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

function isUnavailable(person: Person, date: BoardDate): boolean {
  if (person.timeOff?.includes(date.iso)) return true
  if (person.recurringOff?.includes(date.weekday)) return true
  return false
}

/** The workspace data the tag rules read; everything absent means no tags. */
export type ViolationSources = {
  /** The tag catalog `Person.tagIds` resolve against. */
  tags?: readonly Tag[]
  /** The team catalog, for the team half of a cell's preference. */
  teams?: readonly Team[]
  /** Per-tag coverage tables (H7), keyed by `Tag.id`; a tag without an entry has no requirement. */
  tagCoverage?: Readonly<Record<string, CoverageTable>>
}

const NO_TAGS: readonly Tag[] = []

/**
 * The first held tag, in workspace order, whose strict avoid matches the cell —
 * the same predicate `cellPreference` just used, run again only to name the
 * culprit in the sentence.
 */
function strictAvoidTag(heldTags: readonly Tag[], shiftCode: string, iso: string): Tag | null {
  for (const tag of heldTags) {
    for (const rule of tag.rules) {
      if (rule.kind === 'avoid' && rule.strict === true && tagRuleApplies(rule, shiftCode, iso)) return tag
    }
  }
  return null
}

export function detectViolations(
  people: Person[],
  dates: BoardDate[],
  getAssignment: (personId: string, dateIso: string) => Assignment,
  shifts: ShiftDef[],
  enabled: Record<HardRuleId, boolean>,
  maxHoursPerWeek: number,
  minRestHours: number,
  boundary: ScheduleBoundary = EMPTY_BOUNDARY,
  sources: ViolationSources = {},
): Violation[] {
  const violations: Violation[] = []
  const periodStart = dates[0]
  if (!periodStart) return violations

  const tags = sources.tags ?? NO_TAGS
  const teamById = new Map((sources.teams ?? []).map((team) => [team.id, team]))

  for (const person of people) {
    // Resolved once per person, not per cell. H6 off means strict avoids fold
    // into ordinary soft avoids, so the whole check is skipped — and so are
    // removed people, exactly as `checkTagRules` reads `activePeople`.
    const heldTags = enabled.H6 && !person.removed && tags.length > 0 ? personTags(person, tags) : []
    let prevDate: BoardDate | null = null
    let prev: Assignment | null = null
    let weekIndex = -1
    let weekHours = 0
    let weekAnchor: BoardDate | null = null

    for (const date of dates) {
      const assignment = getAssignment(person.id, date.iso)

      if (assignment.ineligible) {
        violations.push({
          id: `ineligible|${assignmentKey(person.id, date.iso)}`,
          kind: 'ineligible',
          personId: person.id,
          dateIso: date.iso,
          message: `${person.name} is not eligible for ${shiftLabel(assignment.code)} on ${dateLabel(date)}`,
        })
      }

      if (heldTags.length > 0 && assignment.code !== 'OFF') {
        // Precedence comes from `cellPreference` alone; the culprit tag is
        // resolved separately, just to name it. Being off all day satisfies a
        // whole-day avoid, so an OFF cell never counts.
        const pref = cellPreference(person, teamById.get(person.teamId), heldTags, assignment.code, date.iso, true)
        if (pref.strictAvoid) {
          const blamed = strictAvoidTag(heldTags, assignment.code, date.iso)
          if (blamed) {
            violations.push({
              id: `tagAvoid|${assignmentKey(person.id, date.iso)}`,
              kind: 'tagAvoid',
              personId: person.id,
              dateIso: date.iso,
              message: `${person.name} is scheduled for ${shiftLabel(assignment.code)} on ${dateLabel(date)}, but the tag ${blamed.name} strictly avoids that shift`,
              params: {
                person: person.name,
                tag: blamed.name,
                shift: shiftLabel(assignment.code),
                date: dateLabel(date),
              },
            })
          }
        }
      }

      if (enabled.H5 && assignment.code !== 'OFF' && isUnavailable(person, date)) {
        violations.push({
          id: `unavailable|${assignmentKey(person.id, date.iso)}`,
          kind: 'unavailable',
          personId: person.id,
          dateIso: date.iso,
          message: `${person.name} is scheduled for ${shiftLabel(assignment.code)} on ${dateLabel(date)} but isn't available that day`,
        })
      }

      if (enabled.H3) {
        // H3 crosses period edges (weekly hours don't): the first day's rest is
        // measured from the day before the period, the last day's to the day
        // after. Those days belong to the neighbouring period, so the caller's
        // `boundary` is the only source of their shift code.
        if (prevDate && prev) {
          const gap = restHours(shifts, prev.code, assignment.code)
          if (gap !== null && gap < minRestHours) {
            violations.push({
              id: `rest|${assignmentKey(person.id, date.iso)}`,
              kind: 'rest',
              personId: person.id,
              dateIso: date.iso,
              message: `${person.name} has only ${formatHours(gap)} rest between ${dateLabel(prevDate)} ${shiftLabel(prev.code)} and ${dateLabel(date)} ${shiftLabel(assignment.code)}`,
            })
          }
        } else if (!prevDate) {
          const beforeCode = boundary.before[person.id]
          if (beforeCode !== undefined) {
            const gap = restHours(shifts, beforeCode, assignment.code)
            if (gap !== null && gap < minRestHours) {
              violations.push({
                id: `rest-before|${assignmentKey(person.id, date.iso)}`,
                kind: 'rest',
                personId: person.id,
                dateIso: date.iso,
                message: `${person.name} has only ${formatHours(gap)} rest between ${outsideDateLabel(addDays(date.iso, -1))} ${shiftLabel(beforeCode)} and ${dateLabel(date)} ${shiftLabel(assignment.code)}`,
              })
            }
          }
        }
      }

      if (enabled.H2) {
        const wIdx = weekIndexOf(periodStart.iso, date.iso)
        if (wIdx !== weekIndex) {
          if (weekAnchor && weekHours > maxHoursPerWeek) {
            violations.push({
              id: `hours|${assignmentKey(person.id, weekAnchor.iso)}|${weekIndex}`,
              kind: 'hours',
              personId: person.id,
              dateIso: weekAnchor.iso,
              message: `${person.name} is scheduled ${formatHours(weekHours)} the week of ${dateLabel(weekAnchor)}, over the ${maxHoursPerWeek}h cap`,
            })
          }
          weekIndex = wIdx
          weekHours = 0
          weekAnchor = null
        }
        if (assignment.code !== 'OFF') {
          weekHours += paidHours(shifts, assignment.code)
          weekAnchor = weekAnchor ?? date
        }
      }

      prevDate = date
      prev = assignment
    }

    if (enabled.H3 && prevDate && prev) {
      const afterCode = boundary.after[person.id]
      if (afterCode !== undefined) {
        const gap = restHours(shifts, prev.code, afterCode)
        if (gap !== null && gap < minRestHours) {
          violations.push({
            id: `rest-after|${assignmentKey(person.id, prevDate.iso)}`,
            kind: 'rest',
            personId: person.id,
            dateIso: prevDate.iso,
            message: `${person.name} has only ${formatHours(gap)} rest between ${dateLabel(prevDate)} ${shiftLabel(prev.code)} and ${outsideDateLabel(addDays(prevDate.iso, 1))} ${shiftLabel(afterCode)}`,
          })
        }
      }
    }

    if (enabled.H2 && weekAnchor && weekHours > maxHoursPerWeek) {
      violations.push({
        id: `hours|${assignmentKey(person.id, weekAnchor.iso)}|${weekIndex}`,
        kind: 'hours',
        personId: person.id,
        dateIso: weekAnchor.iso,
        message: `${person.name} is scheduled ${formatHours(weekHours)} the week of ${dateLabel(weekAnchor)}, over the ${maxHoursPerWeek}h cap`,
      })
    }
  }

  // H7 tag coverage is workspace-level — one band per tag, not per person — so
  // it runs after the per-person sweep. Holders are active (not removed)
  // people, exactly like the tag counts the solver and the checker use.
  if (enabled.H7 && sources.tagCoverage) {
    const tagCoverage = sources.tagCoverage
    const holdersByTag = new Map<string, Set<string>>()
    for (const tag of tags) holdersByTag.set(tag.id, new Set())
    for (const person of people) {
      if (person.removed) continue
      for (const tagId of person.tagIds ?? []) holdersByTag.get(tagId)?.add(person.id)
    }

    for (const tag of tags) {
      const table = tagCoverage[tag.id]
      if (!table) continue
      const holders = holdersByTag.get(tag.id) ?? new Set<string>()

      for (const date of dates) {
        for (const shift of shifts) {
          const band = coverageBandFor(table, shift.code, date.iso, date.weekday)
          if (band.min <= 0 && band.max === Infinity) continue

          let count = 0
          for (const personId of holders) {
            if (getAssignment(personId, date.iso).code === shift.code) count++
          }
          if (count >= band.min && count <= band.max) continue

          const short = count < band.min
          const limit = short ? band.min : band.max
          const noun = count === 1 ? 'person' : 'people'
          violations.push({
            id: `tagCoverage|${tag.id}|${shift.code}|${date.iso}|${short ? 'min' : 'max'}`,
            kind: 'tagCoverage',
            personId: null,
            dateIso: date.iso,
            message: `${tag.name}: ${shiftLabel(shift.code)} on ${dateLabel(date)} has ${count} ${noun} holding this tag, but it ${short ? `needs at least ${limit}` : `allows at most ${limit}`}`,
            params: {
              tag: tag.name,
              shift: shiftLabel(shift.code),
              date: dateLabel(date),
              band: short ? 'min' : 'max',
              limit,
              count,
            },
          })
        }
      }
    }
  }

  // Workspace-level breaks have no person id to sort by; their tag/date/shift
  // order from the loop above is stable and already meaningful.
  return violations.sort(
    (a, b) => a.dateIso.localeCompare(b.dateIso) || (a.personId ?? '').localeCompare(b.personId ?? ''),
  )
}
