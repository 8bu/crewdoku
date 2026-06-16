/* Crewdoku MILP model builder (pure, multi-week, id-based).
 *
 * buildModel(ctx, period, opts?) -> { lp, meta }
 *   - lp:   CPLEX LP-format string for HiGHS
 *   - meta: bidirectional id<->dense-int maps + var/aux names + objConst
 *
 * Pure: no DOM, no worker thread, no WASM. Unit-testable in Node.
 *
 * STABLE LP NAMING CONTRACT (asserted by tests + consumed by mapSolution):
 *   vars  x_{empI}_{dateI}_{shiftId}        (only for eligible shifts -> H6 baked in)
 *   rows  h4_{empI}_{dateI}                 (<=1 shift/day)
 *         h1_{teamId}_{shiftId}_{dateI}     (team-scoped coverage band)
 *         h2_{empI}_{weekBucketIdx}         (per ISO-week hours cap)
 *         h3_{empI}_{fromDateI}_{toDateI}_{fromShift}_{toShift}
 *         h5_pin_{empI}_{dateI} / h5_off_{empI}_{dateI}
 *
 * Hard constraints: H1 coverage band, H2 per ISO-week hours cap, H3 min-rest
 * pairwise across consecutive calendar dates (incl. week boundary), H4 one
 * shift/day, H5 time-off/recurring fixed-to-0 + pins fixed-to-1, H6 baked into
 * the variable set.
 * Soft objective (minimise): S2 prefs (EXACT), S3 change distance (EXACT),
 * S1 night fairness (APPROX min-max), S4 weekend imbalance (APPROX min-max),
 * S5 transitions (APPROX, omittable). Gated by rules.enabled, scaled by
 * rules.weights.
 */
import { dow, eachDate, isoWeekKey, isWeekend } from '../calendar/calendar'
import type { ID, ISODate, Period, SoftId } from '../entities/types'
import type { Schedule } from '../schedule/schedule'
import { getAssignment } from '../schedule/schedule'
import type { SolveContext } from '../constraints/context'

export interface BuildModelOptions {
  /** Cells fixed to their current value (in-week pins): `${employeeId}|${date}`. */
  pins?: Set<string>
  /** Cells exempted from pin-fixing (relaxation rx-unpin). */
  unpinnedCells?: Set<string>
  /** H3 ordered pairs to drop, keyed `${empId}|${fromDate}|${fromShift}|${toShift}`. */
  droppedH3?: Set<string>
  /** Coverage min overrides keyed `${teamId}|${shiftId}|${date}` -> new min. */
  coverageMinOverride?: Map<string, number>
  /**
   * Baseline schedule the model's S3 change-distance objective is measured
   * against. Defaults to `currentSchedule` (no change = no S3 penalty).
   */
  baseline?: Schedule
}

export interface ModelMeta {
  varNames: string[]
  auxVars: string[]
  empIndex: Map<ID, number>
  empById: Map<number, ID>
  dateIndex: Map<ISODate, number>
  dateById: Map<number, ISODate>
  /** denseInt(via dateIndex) of each date's ISO-week bucket. */
  weekBucketOf: Map<number, number>
  shiftIds: ID[]
  /** Reverse map: the LP-safe token used in `x_*` var names -> real shiftId. */
  shiftTokenToId: Map<string, ID>
  objConst: number
  varCount: number
  rowCount: number
  period: Period
}

/**
 * Map an arbitrary entity ID (e.g. a nanoid like `JZ4MUb-DCFwya4XVlDph-`) to a
 * token safe to embed in a CPLEX LP-format name. The LP grammar treats `-`/`+`
 * as operators and forbids most punctuation in identifiers, so any char outside
 * `[A-Za-z0-9]` is escaped to `_cNN_` (its char code). Already-safe IDs (e.g.
 * `E`, `N`, `L`) pass through unchanged, preserving the stable naming contract.
 */
function lpSafe(id: string): string {
  let out = ''
  for (const ch of id) {
    out += /[A-Za-z0-9]/.test(ch) ? ch : `c${ch.charCodeAt(0)}`
  }
  return out
}

interface Row {
  name: string
  body: string
  op: '<=' | '>=' | '='
  rhs: number
}

function pinKey(employeeId: ID, date: ISODate): string {
  return `${employeeId}|${date}`
}

/**
 * Ordered incompatible shift pairs (a then b on consecutive calendar days)
 * whose implied rest `24 + b.startHour - a.endHour` is below minRestHours.
 * Mirrors the legacy `incompatiblePairs`, keyed by shift ID.
 */
function incompatiblePairs(ctx: SolveContext): { from: ID; to: ID }[] {
  const minRest = ctx.rules.minRestHours
  const out: { from: ID; to: ID }[] = []
  for (const a of ctx.shifts) {
    for (const b of ctx.shifts) {
      const rest = 24 + b.startHour - a.endHour
      if (rest < minRest) out.push({ from: a.id, to: b.id })
    }
  }
  return out
}

export function buildModel(
  ctx: SolveContext,
  period: Period,
  currentSchedule?: Schedule,
  opts: BuildModelOptions = {},
): { lp: string; meta: ModelMeta } {
  const { enabled, weights } = ctx.rules
  const dates = eachDate(period)

  // --- dense index maps (employees in ctx order; dates in period order) ---
  const empIndex = new Map<ID, number>()
  const empById = new Map<number, ID>()
  ctx.employees.forEach((e, i) => {
    empIndex.set(e.id, i)
    empById.set(i, e.id)
  })
  const dateIndex = new Map<ISODate, number>()
  const dateById = new Map<number, ISODate>()
  dates.forEach((d, i) => {
    dateIndex.set(d, i)
    dateById.set(i, d)
  })

  // ISO-week buckets: assign each bucket a stable dense index in first-seen order.
  const weekBucketIdx = new Map<ISODate, number>()
  const weekBucketOf = new Map<number, number>()
  for (const d of dates) {
    const wk = isoWeekKey(d)
    if (!weekBucketIdx.has(wk)) weekBucketIdx.set(wk, weekBucketIdx.size)
    weekBucketOf.set(dateIndex.get(d)!, weekBucketIdx.get(wk)!)
  }

  const shiftIds = ctx.shifts.map((s) => s.id)

  // LP-safe token per shiftId, embedded in `x_*` var names so nanoid IDs (which
  // contain `-`) don't corrupt the CPLEX LP grammar. The reverse map travels in
  // meta so mapSolution can decode columns back to the real shiftId. Uniqueness
  // is guaranteed: if two ids escape to the same token, a numeric suffix is added.
  const shiftToken = new Map<ID, string>()
  const shiftTokenToId = new Map<string, ID>()
  for (const sid of shiftIds) {
    let tok = lpSafe(sid)
    let n = 1
    while (shiftTokenToId.has(tok)) tok = `${lpSafe(sid)}d${n++}`
    shiftToken.set(sid, tok)
    shiftTokenToId.set(tok, sid)
  }
  const tok = (shiftId: ID): string => shiftToken.get(shiftId) ?? lpSafe(shiftId)

  // --- variable set: x_{empI}_{dateI}_{shiftToken} only for ELIGIBLE shifts (H6) ---
  const varNames: string[] = []
  // hasVar lets H1/objective skip vars that were never emitted.
  const hasVar = new Set<string>()
  const emitVar = (empI: number, dateI: number, shiftId: ID): void => {
    const name = `x_${empI}_${dateI}_${tok(shiftId)}`
    varNames.push(name)
    hasVar.add(name)
  }
  for (const emp of ctx.employees) {
    const empI = empIndex.get(emp.id)!
    for (const date of dates) {
      const dateI = dateIndex.get(date)!
      for (const shiftId of emp.eligibleShiftIds) {
        if (!ctx.shiftById.has(shiftId)) continue
        emitVar(empI, dateI, shiftId)
      }
    }
  }
  const varOf = (empI: number, dateI: number, shiftId: ID): string => `x_${empI}_${dateI}_${tok(shiftId)}`
  const has = (empI: number, dateI: number, shiftId: ID): boolean => hasVar.has(varOf(empI, dateI, shiftId))

  const rows: Row[] = []
  const auxVars: string[] = []
  const objTerms: string[] = []
  let objConst = 0

  const baseline = opts.baseline ?? currentSchedule

  /* ===== H4: one shift per day (<=1) ===== */
  if (enabled.H4) {
    for (const emp of ctx.employees) {
      const empI = empIndex.get(emp.id)!
      for (const date of dates) {
        const dateI = dateIndex.get(date)!
        const terms = emp.eligibleShiftIds
          .filter((sid) => ctx.shiftById.has(sid))
          .map((sid) => `+ ${varOf(empI, dateI, sid)}`)
        if (terms.length === 0) continue
        rows.push({ name: `h4_${empI}_${dateI}`, body: terms.join(' '), op: '<=', rhs: 1 })
      }
    }
  }

  /* ===== H1: per (team, shift, date) coverage band, team-scoped vars ===== */
  if (enabled.H1) {
    for (const cov of ctx.coverages) {
      for (const date of dates) {
        const dateI = dateIndex.get(date)!
        const { min, max } = ctx.effectiveCoverage(cov.teamId, cov.shiftId, date)
        const effMin =
          opts.coverageMinOverride?.get(`${cov.teamId}|${cov.shiftId}|${date}`) ?? min
        const terms: string[] = []
        for (const emp of ctx.employees) {
          if (emp.teamId !== cov.teamId) continue
          const empI = empIndex.get(emp.id)!
          if (!has(empI, dateI, cov.shiftId)) continue // ineligible -> no var
          terms.push(`+ ${varOf(empI, dateI, cov.shiftId)}`)
        }
        const body = terms.length ? terms.join(' ') : '0'
        // Row name is the stable contract: h1_{teamId}_{shiftToken}_{dateI}
        // (IDs are LP-safe-tokenised so nanoid `-` chars don't break the grammar).
        rows.push({ name: `h1_${lpSafe(cov.teamId)}_${tok(cov.shiftId)}_${dateI}`, body, op: '>=', rhs: effMin })
        rows.push({ name: `h1cap_${lpSafe(cov.teamId)}_${tok(cov.shiftId)}_${dateI}`, body, op: '<=', rhs: max })
      }
    }
  }

  /* ===== H2: per (employee, ISO-week bucket) hours cap ===== */
  if (enabled.H2) {
    for (const emp of ctx.employees) {
      const empI = empIndex.get(emp.id)!
      const cap = emp.contract.maxHoursPerWeek ?? ctx.rules.maxHoursPerWeek
      // bucket -> term strings
      const byBucket = new Map<number, string[]>()
      for (const date of dates) {
        const dateI = dateIndex.get(date)!
        const bucket = weekBucketOf.get(dateI)!
        for (const sid of emp.eligibleShiftIds) {
          if (!has(empI, dateI, sid)) continue
          const h = ctx.shiftHours(sid)
          if (!byBucket.has(bucket)) byBucket.set(bucket, [])
          byBucket.get(bucket)!.push(`+ ${h} ${varOf(empI, dateI, sid)}`)
        }
      }
      for (const [bucket, terms] of byBucket) {
        if (terms.length === 0) continue
        rows.push({ name: `h2_${empI}_${bucket}`, body: terms.join(' '), op: '<=', rhs: cap })
      }
    }
  }

  /* ===== H3: incompatible cross-day pairs on consecutive calendar dates ===== */
  if (enabled.H3) {
    const incompat = incompatiblePairs(ctx)
    if (incompat.length) {
      for (const emp of ctx.employees) {
        const empI = empIndex.get(emp.id)!
        for (let k = 0; k + 1 < dates.length; k++) {
          const fromDate = dates[k]!
          const toDate = dates[k + 1]!
          const fromI = dateIndex.get(fromDate)!
          const toI = dateIndex.get(toDate)!
          for (const p of incompat) {
            if (!has(empI, fromI, p.from) || !has(empI, toI, p.to)) continue
            const dropKey = `${emp.id}|${fromDate}|${p.from}|${p.to}`
            if (opts.droppedH3?.has(dropKey)) continue
            rows.push({
              name: `h3_${empI}_${fromI}_${toI}_${tok(p.from)}_${tok(p.to)}`,
              body: `+ ${varOf(empI, fromI, p.from)} + ${varOf(empI, toI, p.to)}`,
              op: '<=',
              rhs: 1,
            })
          }
        }
      }
    }
  }

  /* ===== H5: time-off / recurring fixed to 0; pins fixed ===== */
  if (enabled.H5) {
    for (const emp of ctx.employees) {
      const empI = empIndex.get(emp.id)!
      for (const date of dates) {
        const dateI = dateIndex.get(date)!
        const offByTimeOff = emp.timeOff.some((r) => date >= r.start && date <= r.end)
        const offByRecurring = emp.recurring.some(
          (r) => r.kind === 'noDow' && r.dow === dow(date),
        )
        if (offByTimeOff || offByRecurring) {
          const terms = emp.eligibleShiftIds
            .filter((sid) => has(empI, dateI, sid))
            .map((sid) => `+ ${varOf(empI, dateI, sid)}`)
          if (terms.length) {
            rows.push({ name: `h5_off_${empI}_${dateI}`, body: terms.join(' '), op: '=', rhs: 0 })
          }
        }
      }
    }
    // Pins: fix the cell to its current value (1 for a shift, all-0 for empty).
    if (opts.pins && currentSchedule) {
      for (const key of opts.pins) {
        if (opts.unpinnedCells?.has(key)) continue
        const sep = key.indexOf('|')
        const empId = key.slice(0, sep)
        const date = key.slice(sep + 1)
        const empI = empIndex.get(empId)
        const dateI = dateIndex.get(date)
        if (empI === undefined || dateI === undefined) continue
        const a = getAssignment(currentSchedule, empId, date)
        const pinned = a ? a.shiftId : null
        if (pinned != null && has(empI, dateI, pinned)) {
          rows.push({ name: `h5_pin_${empI}_${dateI}`, body: `+ ${varOf(empI, dateI, pinned)}`, op: '=', rhs: 1 })
        } else {
          const emp = ctx.employeeById.get(empId)
          const terms = (emp?.eligibleShiftIds ?? [])
            .filter((sid) => has(empI, dateI, sid))
            .map((sid) => `+ ${varOf(empI, dateI, sid)}`)
          if (terms.length) {
            rows.push({ name: `h5_pin_${empI}_${dateI}`, body: terms.join(' '), op: '=', rhs: 0 })
          }
        }
      }
    }
  }

  /* ===== Objective ===== */
  const w = (id: SoftId): number => (enabled[id] ? weights[id] : 0)

  /* S3 — change distance vs baseline (EXACT). */
  const w3 = w('S3')
  if (w3 > 0 && baseline) {
    for (const emp of ctx.employees) {
      const empI = empIndex.get(emp.id)!
      for (const date of dates) {
        const dateI = dateIndex.get(date)!
        const base = getAssignment(baseline, emp.id, date)
        const baseShift = base ? base.shiftId : null
        if (baseShift != null && has(empI, dateI, baseShift)) {
          // w3 * (1 - x_base) = +w3 const - w3 x_base
          objConst += w3
          objTerms.push(`- ${w3} ${varOf(empI, dateI, baseShift)}`)
        } else {
          // previously empty (or base shift now ineligible): penalise any fill
          for (const sid of emp.eligibleShiftIds) {
            if (has(empI, dateI, sid)) objTerms.push(`+ ${w3} ${varOf(empI, dateI, sid)}`)
          }
        }
      }
    }
  }

  /* S2 — preference violations (EXACT), keyed by Shift.isNight / weekend / preferred. */
  const w2 = w('S2')
  if (w2 > 0) {
    for (const emp of ctx.employees) {
      const empI = empIndex.get(emp.id)!
      for (const date of dates) {
        const dateI = dateIndex.get(date)!
        const weekend = isWeekend(date)
        for (const sid of emp.eligibleShiftIds) {
          if (!has(empI, dateI, sid)) continue
          const shift = ctx.shiftById.get(sid)
          const isNight = !!shift?.isNight
          let violates = false
          if (emp.prefs.night === 'avoid' && isNight) violates = true
          else if (emp.prefs.night === 'prefer' && !isNight) violates = true
          if (emp.prefs.weekend === 'avoid' && weekend) violates = true
          const pref = emp.prefs.preferredShiftId
          if (pref !== undefined && sid !== pref) violates = true
          if (violates) objTerms.push(`+ ${w2} ${varOf(empI, dateI, sid)}`)
        }
      }
    }
  }

  /* S1 — night fairness (APPROX: min-max spread of per-emp night counts). */
  const w1 = w('S1')
  const hasNight = ctx.shifts.some((s) => s.isNight)
  if (w1 > 0 && hasNight) {
    auxVars.push('nmax', 'nmin')
    for (const emp of ctx.employees) {
      const empI = empIndex.get(emp.id)!
      const nightTerms: string[] = []
      for (const date of dates) {
        const dateI = dateIndex.get(date)!
        for (const sid of emp.eligibleShiftIds) {
          if (!has(empI, dateI, sid)) continue
          if (ctx.shiftById.get(sid)?.isNight) nightTerms.push(varOf(empI, dateI, sid))
        }
      }
      if (nightTerms.length === 0) continue
      const minus = nightTerms.map((v) => `- ${v}`).join(' ')
      rows.push({ name: `s1_nmax_${empI}`, body: `+ nmax ${minus}`, op: '>=', rhs: 0 })
      rows.push({ name: `s1_nmin_${empI}`, body: `+ nmin ${minus}`, op: '<=', rhs: 0 })
    }
    objTerms.push(`+ ${w1} nmax`)
    objTerms.push(`- ${w1} nmin`)
  }

  /* S4 — weekend imbalance (APPROX: min-max spread of per-emp weekend-shift counts). */
  const w4 = w('S4')
  if (w4 > 0) {
    const weekendDates = dates.filter((d) => isWeekend(d))
    if (weekendDates.length) {
      auxVars.push('wmax', 'wmin')
      for (const emp of ctx.employees) {
        const empI = empIndex.get(emp.id)!
        const terms: string[] = []
        for (const date of weekendDates) {
          const dateI = dateIndex.get(date)!
          for (const sid of emp.eligibleShiftIds) {
            if (has(empI, dateI, sid)) terms.push(`- ${varOf(empI, dateI, sid)}`)
          }
        }
        if (terms.length === 0) continue
        rows.push({ name: `s4_wmax_${empI}`, body: `+ wmax ${terms.join(' ')}`, op: '>=', rhs: 0 })
        rows.push({ name: `s4_wmin_${empI}`, body: `+ wmin ${terms.join(' ')}`, op: '<=', rhs: 0 })
      }
      objTerms.push(`+ ${w4} wmax`)
      objTerms.push(`- ${w4} wmin`)
    }
  }

  /* S5 — transitions (APPROX, omittable; uses the incompat set as a soft penalty). */
  const w5 = w('S5')
  if (w5 > 0 && enabled.S5) {
    const incompat = incompatiblePairs(ctx)
    const tList: string[] = []
    for (const emp of ctx.employees) {
      const empI = empIndex.get(emp.id)!
      for (let k = 0; k + 1 < dates.length; k++) {
        const fromI = dateIndex.get(dates[k]!)!
        const toI = dateIndex.get(dates[k + 1]!)!
        for (const p of incompat) {
          if (!has(empI, fromI, p.from) || !has(empI, toI, p.to)) continue
          const tn = `t_${empI}_${fromI}_${toI}_${tok(p.from)}_${tok(p.to)}`
          tList.push(tn)
          rows.push({
            name: `s5_${empI}_${fromI}_${toI}_${tok(p.from)}_${tok(p.to)}`,
            body: `+ ${tn} - ${varOf(empI, fromI, p.from)} - ${varOf(empI, toI, p.to)}`,
            op: '>=',
            rhs: -1,
          })
        }
      }
    }
    auxVars.push(...tList)
    for (const tn of tList) objTerms.push(`+ ${w5} ${tn}`)
  }

  const lp = assembleLP(objTerms, rows, varNames, auxVars)

  const meta: ModelMeta = {
    varNames,
    auxVars,
    empIndex,
    empById,
    dateIndex,
    dateById,
    weekBucketOf,
    shiftIds,
    shiftTokenToId,
    objConst,
    varCount: varNames.length + auxVars.length,
    rowCount: rows.length,
    period,
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
  lines.push(' obj: ' + (objTerms.length ? objTerms.join(' ') : '0'))
  lines.push('Subject To')
  for (const r of rows) lines.push(` ${r.name}: ${r.body} ${r.op} ${r.rhs}`)
  lines.push('Bounds')
  for (const a of auxVars) lines.push(` ${a} >= 0`)
  lines.push('Binary')
  let line = ''
  for (const v of varNames) {
    if ((line + ' ' + v).length > 240) {
      lines.push(' ' + line.trim())
      line = ''
    }
    line += ' ' + v
  }
  if (line.trim()) lines.push(' ' + line.trim())
  lines.push('End')
  return lines.join('\n')
}
