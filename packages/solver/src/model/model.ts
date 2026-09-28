import type {
  CellPreference,
  CoverageTable,
  ISODate,
  Person,
  Schedule,
  ScheduleBoundary,
  ShiftCode,
  ShiftDef,
  SolveSettings,
  Tag,
  Team,
} from '@crewdoku/domain'
import {
  assignmentKey,
  cellPreference,
  coverageBandFor,
  eachDate,
  getAssignment,
  isWeekend,
  OFF_CODE,
  restHoursBetween,
  paidHours,
  personTags,
  weekdayOf,
  weekIndexOf,
} from '@crewdoku/domain'
import { rankWeights } from './weights'

export interface ModelInput {
  people: readonly Person[]
  shifts: readonly ShiftDef[]
  coverage: CoverageTable
  settings: SolveSettings
  period: { start: ISODate; end: ISODate }
  current: Schedule
  baseline?: Schedule
  teams?: readonly Team[]
  /**
   * The tag catalog: preferences shared across teams (religion, language…).
   * Absent means no tagging, and every rule below behaves exactly as it did
   * before tags existed.
   */
  tags?: readonly Tag[]
  /**
   * Per-tag coverage bands, keyed by `Tag.id` (H7). A tag with no entry has no
   * requirement — the same "unlisted shift = unconstrained" rule as H1.
   */
  tagCoverage?: Readonly<Record<string, CoverageTable>>
  /**
   * The shifts people work on the days just outside the period, taken from the
   * neighbouring periods' schedules (`period.start - 1` and `period.end + 1`).
   * H3 rest checks across these edges: the first period day is forced off any
   * shift that leaves too little rest after `before`, the last day off any
   * shift that leaves too little rest before `after`. A missing person or OFF
   * means no shift there, so no constraint; absent boundary = today's model.
   */
  boundary?: ScheduleBoundary
}

export interface ModelMeta {
  varNames: string[]
  auxVars: string[]
  personIndex: Map<string, number>
  personById: Map<number, string>
  dates: ISODate[]
  dateIndex: Map<ISODate, number>
  dateById: Map<number, ISODate>
  weekBucketOf: Map<number, number>
  shiftCodes: ShiftCode[]
  shiftTokenToCode: Map<string, ShiftCode>
  codeToShiftToken: Map<ShiftCode, string>
  pinnedCells: Map<string, ShiftCode>
  shifts: readonly ShiftDef[]
  shiftDefByCode: Map<ShiftCode, ShiftDef>
  objConst: number
  varCount: number
  rowCount: number
}

interface Row {
  name: string
  body: string
  op: '<=' | '>=' | '='
  rhs: number
}

/**
 * Escapes shiftCode into an identifier safe for CPLEX LP syntax.
 * Any char outside [A-Za-z0-9] is converted to `c{charCode}`.
 */
function lpSafe(code: string): string {
  let out = ''
  for (const ch of code) {
    out += /[A-Za-z0-9]/.test(ch) ? ch : `c${ch.charCodeAt(0)}`
  }
  return out
}

/**
 * Builds the HiGHS CPLEX LP string and accompanying metadata from ModelInput.
 *
 * Implements the 6 binding orchestrator decisions:
 * 1. Eligibility: no row; variables omitted for (person, shift) if shift in person.ineligible.
 *    H6 (strict tag avoids) omits them the same way, and H7 lays a per-tag
 *    coverage band beside H1's.
 * 2. Pins sacred BY CONSTRUCTION (constants, not variables):
 *    - Pinned cell emits NO variables for that (person, date).
 *    - H1: Pinned assignments subtract from min and max RHS; clamped at 0 if pins exceed.
 *    - H2: Pinned hours subtract from week cap; clamped at 0.
 *    - H3: Both pinned -> drop row; One pinned + one free -> if incompatible, force free var = 0.
 *    - H5: Pin on timeOff/recurringOff wins -> drop H5 row for that cell.
 *    - H7: Same pinned subtraction as H1, over the tag's holders.
 *    - Pinned OFF cells: force person's vars = 0 (omitted).
 * 3. Rank->weights: 10^(n-1-rank) over enabled soft goals.
 * 4. Sign convention: minimize penalties everywhere.
 * 5. Determinism: iterate in input order; LP byte-identical for identical input.
 * 6. Preferences: one `cellPreference` per cell feeds S2 (base) and S6 (tags),
 *    with "any avoid beats any want" resolved by the domain helper, never here.
 */
export function buildModel(input: ModelInput): { lp: string; meta: ModelMeta } {
  const { people, shifts, coverage, settings, period, current, boundary } = input
  const dates = eachDate(period.start, period.end)

  // 1. Dense index maps
  const personIndex = new Map<string, number>()
  const personById = new Map<number, string>()
  people.forEach((p, i) => {
    personIndex.set(p.id, i)
    personById.set(i, p.id)
  })

  const dateIndex = new Map<ISODate, number>()
  const dateById = new Map<number, ISODate>()
  dates.forEach((d, i) => {
    dateIndex.set(d, i)
    dateById.set(i, d)
  })

  const weekBucketOf = new Map<number, number>()
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]
    if (d !== undefined) {
      weekBucketOf.set(i, weekIndexOf(period.start, d))
    }
  }

  // 2. Shift tokens
  const shiftCodes = shifts.map((s) => s.code)
  const shiftIndex = new Map<ShiftCode, number>()
  shifts.forEach((s, i) => shiftIndex.set(s.code, i))
  const codeToShiftToken = new Map<ShiftCode, string>()
  const shiftTokenToCode = new Map<string, ShiftCode>()
  for (const code of shiftCodes) {
    let tok = lpSafe(code)
    let n = 1
    while (shiftTokenToCode.has(tok)) {
      tok = `${lpSafe(code)}d${n}`
      n++
    }
    codeToShiftToken.set(code, tok)
    shiftTokenToCode.set(tok, code)
  }

  const tok = (code: ShiftCode): string => codeToShiftToken.get(code) ?? lpSafe(code)

  const shiftDefByCode = new Map<ShiftCode, ShiftDef>()
  for (const s of shifts) {
    shiftDefByCode.set(s.code, s)
  }

  // 3. Pinned cells map: key `${personId}|${iso}` -> ShiftCode
  const pinnedCells = new Map<string, ShiftCode>()
  for (const p of people) {
    for (const d of dates) {
      const a = getAssignment(current, p.id, d)
      if (a.pinned) {
        pinnedCells.set(assignmentKey(p.id, d), a.code)
      }
    }
  }

  // Tags are optional: with none, everything below resolves exactly as it did
  // before tagging existed.
  const tags = input.tags ?? []
  const tagCoverage = input.tagCoverage ?? {}
  const h6 = settings.hardRules.enabled.H6

  const teamMap = new Map<string, Team>()
  for (const team of input.teams ?? []) {
    teamMap.set(team.id, team)
  }

  const heldTagsByPerson = new Map<string, readonly Tag[]>()
  if (tags.length > 0) {
    for (const p of people) {
      heldTagsByPerson.set(p.id, personTags(p, tags))
    }
  }

  // Cell preferences (team, personal and tag) drive H6 (variable omission) and
  // S2/S6 (pricing), so resolve each (person, date, shift) once — `cellPreference`
  // owns the "any avoid beats any want" precedence, never this file.
  const prefCache = new Map<number, CellPreference>()
  const prefAt = (
    person: Person,
    empI: number,
    dateI: number,
    code: ShiftCode,
    iso: ISODate,
  ): CellPreference => {
    const key =
      (empI * dates.length + dateI) * shifts.length + (shiftIndex.get(code) ?? 0)
    const cached = prefCache.get(key)
    if (cached !== undefined) return cached
    const pref = cellPreference(
      person,
      teamMap.get(person.teamId),
      heldTagsByPerson.get(person.id) ?? [],
      code,
      iso,
      h6,
    )
    prefCache.set(key, pref)
    return pref
  }

  // 4. Variables: x_{empI}_{dateI}_{shiftToken}
  // Decision 1 & 2:
  // - OMIT vars if cell is pinned (constant, not variable).
  // - OMIT vars if shift in person.ineligible.
  // - OMIT vars if H6 is on and a strict tag avoid forbids the cell.
  const varNames: string[] = []
  const hasVar = new Set<string>()

  const varOf = (empI: number, dateI: number, code: ShiftCode): string =>
    `x_${empI}_${dateI}_${tok(code)}`
  const has = (empI: number, dateI: number, code: ShiftCode): boolean =>
    hasVar.has(varOf(empI, dateI, code))

  for (let empI = 0; empI < people.length; empI++) {
    const p = people[empI]
    if (!p) continue
    for (let dateI = 0; dateI < dates.length; dateI++) {
      const d = dates[dateI]
      if (!d) continue
      const isPinned = pinnedCells.has(assignmentKey(p.id, d))
      if (isPinned) {
        // Pinned cell: no variables emitted
        continue
      }
      for (const shift of shifts) {
        if (p.ineligible.includes(shift.code)) {
          // Ineligible: no variable emitted
          continue
        }
        if (h6 && prefAt(p, empI, dateI, shift.code, d).strictAvoid) {
          // H6: a strict tag avoid forbids the cell outright, exactly like an
          // ineligible pair. Pinned cells were skipped above and stand as the
          // planner left them; the checker flags those.
          continue
        }
        const v = varOf(empI, dateI, shift.code)
        varNames.push(v)
        hasVar.add(v)
      }
    }
  }

  const rows: Row[] = []
  const auxVars: string[] = []
  const objTerms: string[] = []
  let objConst = 0

  // ===== H4: at most one shift per person per day =====
  // Structural constraint in model: sum(vars) <= 1
  for (let empI = 0; empI < people.length; empI++) {
    for (let dateI = 0; dateI < dates.length; dateI++) {
      const terms: string[] = []
      for (const shift of shifts) {
        if (has(empI, dateI, shift.code)) {
          terms.push(`+ ${varOf(empI, dateI, shift.code)}`)
        }
      }
      if (terms.length > 0) {
        rows.push({
          name: `h4_${empI}_${dateI}`,
          body: terms.join(' '),
          op: '<=',
          rhs: 1,
        })
      }
    }
  }

  // ===== H1: coverage band per (shift, date) =====
  if (settings.hardRules.enabled.H1) {
    for (const shift of shifts) {
      const sTok = tok(shift.code)
      for (let dateI = 0; dateI < dates.length; dateI++) {
        const d = dates[dateI]
        if (!d) continue
        const dow = weekdayOf(d)
        const band = coverageBandFor(coverage, shift.code, d, dow)

        // Count pinned assignments for this shift on this date
        let pinnedCount = 0
        for (const p of people) {
          const pin = pinnedCells.get(assignmentKey(p.id, d))
          if (pin === shift.code) {
            pinnedCount++
          }
        }

        const freeTerms: string[] = []
        for (let empI = 0; empI < people.length; empI++) {
          if (has(empI, dateI, shift.code)) {
            freeTerms.push(`+ ${varOf(empI, dateI, shift.code)}`)
          }
        }

        const body = freeTerms.length > 0 ? freeTerms.join(' ') : '0'

        // Min coverage row: sum >= max(0, min - pinnedCount)
        if (band.min > 0 || freeTerms.length > 0) {
          const effMin = Math.max(0, band.min - pinnedCount)
          rows.push({
            name: `h1_${sTok}_${dateI}`,
            body,
            op: '>=',
            rhs: effMin,
          })
        }

        // Max coverage row: sum <= max(0, max - pinnedCount)
        if (band.max < Infinity) {
          const effMax = Math.max(0, band.max - pinnedCount)
          rows.push({
            name: `h1cap_${sTok}_${dateI}`,
            body,
            op: '<=',
            rhs: effMax,
          })
        }
      }
    }
  }

  // ===== H2: weekly hours cap per person per week =====
  if (settings.hardRules.enabled.H2) {
    const maxCap = settings.hardRules.maxHoursPerWeek
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue

      // Group dates by week bucket
      const byWeek = new Map<number, { terms: string[]; pinnedHours: number }>()
      for (let dateI = 0; dateI < dates.length; dateI++) {
        const d = dates[dateI]
        if (!d) continue
        const week = weekBucketOf.get(dateI) ?? 0
        let entry = byWeek.get(week)
        if (!entry) {
          entry = { terms: [], pinnedHours: 0 }
          byWeek.set(week, entry)
        }

        const pinnedCode = pinnedCells.get(assignmentKey(p.id, d))
        if (pinnedCode && pinnedCode !== OFF_CODE) {
          entry.pinnedHours += paidHours(shifts, pinnedCode)
        }

        for (const shift of shifts) {
          if (has(empI, dateI, shift.code)) {
            const h = paidHours(shifts, shift.code)
            entry.terms.push(`+ ${h} ${varOf(empI, dateI, shift.code)}`)
          }
        }
      }

      for (const [week, entry] of byWeek) {
        if (entry.terms.length > 0) {
          const effCap = Math.max(0, maxCap - entry.pinnedHours)
          rows.push({
            name: `h2_${empI}_${week}`,
            body: entry.terms.join(' '),
            op: '<=',
            rhs: effCap,
          })
        }
      }
    }
  }

  // ===== H3: pairwise min rest between consecutive days =====
  // Precompute incompatible ordered pairs (a, b) using domain restHoursBetween
  const minRest = settings.hardRules.minRestHours
  const incompatiblePairs: Array<{ from: ShiftCode; to: ShiftCode }> = []
  if (settings.hardRules.enabled.H3) {
    for (const a of shifts) {
      for (const b of shifts) {
        const rest = restHoursBetween(shifts, a.code, b.code)
        if (rest !== null && rest < minRest) {
          incompatiblePairs.push({ from: a.code, to: b.code })
        }
      }
    }
  }

  if (settings.hardRules.enabled.H3 && incompatiblePairs.length > 0) {
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue

      for (let dateI = 0; dateI + 1 < dates.length; dateI++) {
        const fromI = dateI
        const toI = dateI + 1
        const fromDate = dates[fromI]
        const toDate = dates[toI]
        if (!fromDate || !toDate) continue

        const pinFrom = pinnedCells.get(assignmentKey(p.id, fromDate))
        const pinTo = pinnedCells.get(assignmentKey(p.id, toDate))

        for (const pair of incompatiblePairs) {
          const tokA = tok(pair.from)
          const tokB = tok(pair.to)
          const hasFrom = has(empI, fromI, pair.from)
          const hasTo = has(empI, toI, pair.to)

          // Decision 2:
          // - Both pinned: drop the row (planner's pins accepted, checker will flag).
          // - One pinned + one free: if free side incompatible with pinned constant, force free var = 0.
          // - Neither pinned: xFrom + xTo <= 1.
          if (pinFrom !== undefined && pinTo !== undefined) {
            // Both pinned: drop row
            continue
          }

          if (pinFrom !== undefined) {
            // fromDate is pinned constant. If pinFrom === pair.from, then free var pair.to on toDate cannot be worked!
            if (pinFrom === pair.from && hasTo) {
              rows.push({
                name: `h3_${empI}_${fromI}_${toI}_${tokA}_${tokB}`,
                body: `+ ${varOf(empI, toI, pair.to)}`,
                op: '=',
                rhs: 0,
              })
            }
            continue
          }

          if (pinTo !== undefined) {
            // toDate is pinned constant. If pinTo === pair.to, then free var pair.from on fromDate cannot be worked!
            if (pinTo === pair.to && hasFrom) {
              rows.push({
                name: `h3_${empI}_${fromI}_${toI}_${tokA}_${tokB}`,
                body: `+ ${varOf(empI, fromI, pair.from)}`,
                op: '=',
                rhs: 0,
              })
            }
            continue
          }

          // Both free
          if (hasFrom && hasTo) {
            rows.push({
              name: `h3_${empI}_${fromI}_${toI}_${tokA}_${tokB}`,
              body: `+ ${varOf(empI, fromI, pair.from)} + ${varOf(empI, toI, pair.to)}`,
              op: '<=',
              rhs: 1,
            })
          }
        }
      }
    }

    // Rest across the period edges. The neighbouring shift (`boundary.before`
    // on the day before the first period day, `boundary.after` on the day after
    // the last) is a constant here, so an incompatible in-period cell is forced
    // off exactly as it would be beside a pinned day. A pinned in-period cell
    // emits no variables: the planner's hand-edit stands and the checker flags
    // it. No boundary at all leaves the model byte-identical to before.
    if (boundary !== undefined && dates.length > 0) {
      const lastI = dates.length - 1

      for (let empI = 0; empI < people.length; empI++) {
        const p = people[empI]
        if (!p) continue

        const beforeCode = boundary.before[p.id]
        if (beforeCode !== undefined && !pinnedCells.has(assignmentKey(p.id, period.start))) {
          for (const pair of incompatiblePairs) {
            if (pair.from === beforeCode && has(empI, 0, pair.to)) {
              rows.push({
                name: `h3_before_${empI}_${tok(pair.to)}`,
                body: `+ ${varOf(empI, 0, pair.to)}`,
                op: '=',
                rhs: 0,
              })
            }
          }
        }

        const afterCode = boundary.after[p.id]
        if (afterCode !== undefined && !pinnedCells.has(assignmentKey(p.id, period.end))) {
          for (const pair of incompatiblePairs) {
            if (pair.to === afterCode && has(empI, lastI, pair.from)) {
              rows.push({
                name: `h3_after_${empI}_${tok(pair.from)}`,
                body: `+ ${varOf(empI, lastI, pair.from)}`,
                op: '=',
                rhs: 0,
              })
            }
          }
        }
      }
    }
  }

  // ===== H5: timeOff and recurringOff =====
  if (settings.hardRules.enabled.H5) {
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue

      for (let dateI = 0; dateI < dates.length; dateI++) {
        const d = dates[dateI]
        if (!d) continue

        // Decision 2: a pin on a timeOff date wins (drop H5 row for that cell)
        if (pinnedCells.has(assignmentKey(p.id, d))) {
          continue
        }

        const dow = weekdayOf(d)
        const isTimeOff = p.timeOff?.includes(d) ?? false
        const isRecurringOff = p.recurringOff?.includes(dow) ?? false

        if (isTimeOff || isRecurringOff) {
          const terms: string[] = []
          for (const shift of shifts) {
            if (has(empI, dateI, shift.code)) {
              terms.push(`+ ${varOf(empI, dateI, shift.code)}`)
            }
          }
          if (terms.length > 0) {
            rows.push({
              name: `h5_off_${empI}_${dateI}`,
              body: terms.join(' '),
              op: '=',
              rhs: 0,
            })
          }
        }
      }
    }
  }

  // ===== H7: per-tag coverage band =====
  // The H1 shape, counted over only the people who hold the tag: a tag behaves
  // as a headcount table of its own. A tag with no table has no requirement.
  if (settings.hardRules.enabled.H7 && tags.length > 0) {
    // Sanitized, deduplicated tag tokens for row names (same scheme as shifts).
    const tagTokenById = new Map<string, string>()
    const usedTagTokens = new Set<string>()
    for (const tag of tags) {
      if (tagCoverage[tag.id] === undefined) continue
      const base = lpSafe(tag.id)
      let token = base
      let n = 1
      while (usedTagTokens.has(token)) {
        token = `${base}d${n}`
        n++
      }
      usedTagTokens.add(token)
      tagTokenById.set(tag.id, token)
    }

    for (const tag of tags) {
      const table = tagCoverage[tag.id]
      const tagToken = tagTokenById.get(tag.id)
      if (table === undefined || tagToken === undefined) continue

      const holderEmpI: number[] = []
      for (let empI = 0; empI < people.length; empI++) {
        const p = people[empI]
        if (!p) continue
        const held = heldTagsByPerson.get(p.id) ?? []
        if (held.some((t) => t.id === tag.id)) holderEmpI.push(empI)
      }

      for (const shift of shifts) {
        const sTok = tok(shift.code)
        for (let dateI = 0; dateI < dates.length; dateI++) {
          const d = dates[dateI]
          if (!d) continue
          const dow = weekdayOf(d)
          const band = coverageBandFor(table, shift.code, d, dow)

          // Pins are constants, subtracted exactly like H1's.
          let pinnedCount = 0
          for (const empI of holderEmpI) {
            const p = people[empI]
            if (!p) continue
            if (pinnedCells.get(assignmentKey(p.id, d)) === shift.code) {
              pinnedCount++
            }
          }

          const freeTerms: string[] = []
          for (const empI of holderEmpI) {
            if (has(empI, dateI, shift.code)) {
              freeTerms.push(`+ ${varOf(empI, dateI, shift.code)}`)
            }
          }

          const body = freeTerms.length > 0 ? freeTerms.join(' ') : '0'

          if (band.min > 0 || freeTerms.length > 0) {
            rows.push({
              name: `h7_${tagToken}_${sTok}_${dateI}`,
              body,
              op: '>=',
              rhs: Math.max(0, band.min - pinnedCount),
            })
          }

          if (band.max < Infinity) {
            rows.push({
              name: `h7cap_${tagToken}_${sTok}_${dateI}`,
              body,
              op: '<=',
              rhs: Math.max(0, band.max - pinnedCount),
            })
          }
        }
      }
    }
  }

  // ===== Objective (Minimize penalties) =====
  const weights = rankWeights(settings)

  // S3: Stability (penalize changes from baseline/current)
  const w3 = weights.S3
  const baseline = input.baseline ?? input.current
  if (w3 > 0) {
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue
      for (let dateI = 0; dateI < dates.length; dateI++) {
        const d = dates[dateI]
        if (!d) continue
        if (pinnedCells.has(assignmentKey(p.id, d))) {
          // Cell is pinned constant, no variables to penalize
          continue
        }
        const baseAssignment = getAssignment(baseline, p.id, d)
        const baseCode = baseAssignment.code
        if (baseCode !== OFF_CODE && has(empI, dateI, baseCode)) {
          // Reward keeping baseCode: objConst += w3, - w3 * x_base
          objConst += w3
          objTerms.push(`- ${w3} ${varOf(empI, dateI, baseCode)}`)
        } else {
          // Base was OFF (or base shift is ineligible): penalize any shift worked
          for (const shift of shifts) {
            if (has(empI, dateI, shift.code)) {
              objTerms.push(`+ ${w3} ${varOf(empI, dateI, shift.code)}`)
            }
          }
        }
      }
    }
  }

  // S2: Preference match (team/personal) and S6: Group preferences (tags).
  // Both read the same resolved cell preference, so an avoid from any source
  // (team, personal, tag) cancels every want for that cell — the precedence
  // lives in `cellPreference`, and tagging stacks on top of S2 rather than
  // replacing it. With no tags, S2 prices exactly what it priced before.
  const w2 = weights.S2
  const w6 = weights.S6
  if (w2 > 0 || w6 > 0) {
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue

      for (let dateI = 0; dateI < dates.length; dateI++) {
        const d = dates[dateI]
        if (!d) continue
        if (pinnedCells.has(assignmentKey(p.id, d))) {
          continue
        }

        for (const shift of shifts) {
          if (!has(empI, dateI, shift.code)) continue
          const pref = prefAt(p, empI, dateI, shift.code, d)
          const v = varOf(empI, dateI, shift.code)

          if (w2 > 0) {
            // Avoid: penalize assigning the shift (+w2).
            if (pref.baseAvoid) objTerms.push(`+ ${w2} ${v}`)
            // Want: reward it (-w2, with the constant booked like S3's).
            if (pref.baseWant) {
              objConst += w2
              objTerms.push(`- ${w2} ${v}`)
            }
          }

          if (w6 > 0) {
            if (pref.tagAvoid) objTerms.push(`+ ${w6} ${v}`)
            if (pref.tagWant) {
              objConst += w6
              objTerms.push(`- ${w6} ${v}`)
            }
          }
        }
      }
    }
  }

  // S1: Night shift fairness (minimax over per-person night shifts)
  const w1 = weights.S1
  const hasNight = shifts.some((s) => s.isNight)
  if (w1 > 0 && hasNight) {
    auxVars.push('nmax', 'nmin')
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue

      let pinnedNights = 0
      const nightTerms: string[] = []
      for (let dateI = 0; dateI < dates.length; dateI++) {
        const d = dates[dateI]
        if (!d) continue
        const pin = pinnedCells.get(assignmentKey(p.id, d))
        if (pin) {
          const sDef = shifts.find((s) => s.code === pin)
          if (sDef?.isNight) pinnedNights++
        }
        for (const shift of shifts) {
          if (shift.isNight && has(empI, dateI, shift.code)) {
            nightTerms.push(varOf(empI, dateI, shift.code))
          }
        }
      }

      // nmax >= sum(vars) + pinnedNights  =>  nmax - sum(vars) >= pinnedNights
      // nmin <= sum(vars) + pinnedNights  =>  nmin - sum(vars) <= pinnedNights
      const minus = nightTerms.length > 0 ? nightTerms.map((v) => `- ${v}`).join(' ') : ''
      rows.push({
        name: `s1_nmax_${empI}`,
        body: `+ nmax${minus ? ' ' + minus : ''}`,
        op: '>=',
        rhs: pinnedNights,
      })
      rows.push({
        name: `s1_nmin_${empI}`,
        body: `+ nmin${minus ? ' ' + minus : ''}`,
        op: '<=',
        rhs: pinnedNights,
      })
    }
    objTerms.push(`+ ${w1} nmax`)
    objTerms.push(`- ${w1} nmin`)
  }

  // S4: Weekend shift fairness (minimax over per-person weekend shifts)
  const w4 = weights.S4
  const weekendDates: number[] = []
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]
    if (d && isWeekend(d)) weekendDates.push(i)
  }

  if (w4 > 0 && weekendDates.length > 0) {
    auxVars.push('wmax', 'wmin')
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue

      let pinnedWeekends = 0
      const terms: string[] = []
      for (const dateI of weekendDates) {
        const d = dates[dateI]
        if (!d) continue
        const pin = pinnedCells.get(assignmentKey(p.id, d))
        if (pin && pin !== OFF_CODE) {
          pinnedWeekends++
        }
        for (const shift of shifts) {
          if (has(empI, dateI, shift.code)) {
            terms.push(varOf(empI, dateI, shift.code))
          }
        }
      }

      const minus = terms.length > 0 ? terms.map((v) => `- ${v}`).join(' ') : ''
      rows.push({
        name: `s4_wmax_${empI}`,
        body: `+ wmax${minus ? ' ' + minus : ''}`,
        op: '>=',
        rhs: pinnedWeekends,
      })
      rows.push({
        name: `s4_wmin_${empI}`,
        body: `+ wmin${minus ? ' ' + minus : ''}`,
        op: '<=',
        rhs: pinnedWeekends,
      })
    }
    objTerms.push(`+ ${w4} wmax`)
    objTerms.push(`- ${w4} wmin`)
  }

  // S5: Sequence smoothness (penalize bad transitions)
  const w5 = weights.S5
  if (w5 > 0 && incompatiblePairs.length > 0) {
    const tList: string[] = []
    for (let empI = 0; empI < people.length; empI++) {
      const p = people[empI]
      if (!p) continue

      for (let dateI = 0; dateI + 1 < dates.length; dateI++) {
        const fromI = dateI
        const toI = dateI + 1
        const fromDate = dates[fromI]
        const toDate = dates[toI]
        if (!fromDate || !toDate) continue

        const pinFrom = pinnedCells.get(assignmentKey(p.id, fromDate))
        const pinTo = pinnedCells.get(assignmentKey(p.id, toDate))

        for (const pair of incompatiblePairs) {
          const tokA = tok(pair.from)
          const tokB = tok(pair.to)
          const hasFrom = has(empI, fromI, pair.from)
          const hasTo = has(empI, toI, pair.to)

          // If both pinned, constant penalty or ignore
          if (pinFrom !== undefined && pinTo !== undefined) {
            if (pinFrom === pair.from && pinTo === pair.to) {
              objConst += w5
            }
            continue
          }

          if (pinFrom !== undefined) {
            if (pinFrom === pair.from && hasTo) {
              // Free var on toDate creates the bad transition
              objTerms.push(`+ ${w5} ${varOf(empI, toI, pair.to)}`)
            }
            continue
          }

          if (pinTo !== undefined) {
            if (pinTo === pair.to && hasFrom) {
              // Free var on fromDate creates the bad transition
              objTerms.push(`+ ${w5} ${varOf(empI, fromI, pair.from)}`)
            }
            continue
          }

          // Both free: aux var t >= xFrom + xTo - 1
          // t - xFrom - xTo >= -1
          if (hasFrom && hasTo) {
            const tn = `t_${empI}_${fromI}_${toI}_${tokA}_${tokB}`
            tList.push(tn)
            rows.push({
              name: `s5_${empI}_${fromI}_${toI}_${tokA}_${tokB}`,
              body: `+ ${tn} - ${varOf(empI, fromI, pair.from)} - ${varOf(empI, toI, pair.to)}`,
              op: '>=',
              rhs: -1,
            })
          }
        }
      }
    }
    auxVars.push(...tList)
    for (const tn of tList) {
      objTerms.push(`+ ${w5} ${tn}`)
    }
  }

  const lp = assembleLP(objTerms, rows, varNames, auxVars)

  const meta: ModelMeta = {
    varNames,
    auxVars,
    personIndex,
    personById,
    dates,
    dateIndex,
    dateById,
    weekBucketOf,
    shiftCodes,
    shiftTokenToCode,
    codeToShiftToken,
    pinnedCells,
    shifts,
    shiftDefByCode,
    objConst,
    varCount: varNames.length + auxVars.length,
    rowCount: rows.length,
  }

  return { lp, meta }
}

function assembleLP(
  objTerms: string[],
  rows: Row[],
  varNames: string[],
  auxVars: string[],
): string {
  const lines: string[] = []
  lines.push('Minimize')
  lines.push(' obj: ' + (objTerms.length > 0 ? objTerms.join(' ') : '0'))
  lines.push('Subject To')
  for (const r of rows) {
    lines.push(` ${r.name}: ${r.body} ${r.op} ${r.rhs}`)
  }
  if (auxVars.length > 0) {
    lines.push('Bounds')
    for (const a of auxVars) {
      lines.push(` ${a} >= 0`)
    }
  }
  if (varNames.length > 0) {
    lines.push('Binary')
    let line = ''
    for (const v of varNames) {
      if ((line + ' ' + v).length > 240) {
        lines.push(' ' + line.trim())
        line = ''
      }
      line += ' ' + v
    }
    if (line.trim().length > 0) {
      lines.push(' ' + line.trim())
    }
  }
  lines.push('End')
  return lines.join('\n')
}
