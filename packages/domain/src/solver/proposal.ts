import { eachDate, isWeekend } from '../calendar/calendar'
import type { Assignment, ID, ISODate, Period, SoftId } from '../entities/types'
import type { Schedule } from '../schedule/schedule'
import { getAssignment, makeSchedule, setAssignment } from '../schedule/schedule'
import type { SolveContext } from '../constraints/context'
import { scoreTerms } from './score'

export interface ProposalChange {
  employeeId: ID
  date: ISODate
  from: ID | null
  to: ID | null
  note: string
}

export interface BreakdownRow {
  id: SoftId
  name: string
  now: number
  prev: number
}

export interface Proposal {
  id: string
  changes: ProposalChange[]
  fairness: number
  prevFairness: number
  penalty: number
  prevPenalty: number
  breakdown: BreakdownRow[]
}

const SOFT_NAMES: Record<SoftId, string> = {
  S1: 'Night-shift fairness',
  S2: 'Preference satisfaction',
  S3: 'Minimal changes',
  S4: 'Weekend rotation',
  S5: 'Sequence consistency',
}

let proposalCounter = 0

/**
 * Monotonic 0-100 fairness score from per-employee night + weekend spreads.
 * Ported from legacy `fairnessScore` (client.js:40), isNight-gated: an org with
 * no night shift uses the weekend spread only.
 */
function fairnessScore(ctx: SolveContext, schedule: Schedule, period: Period): number {
  const hasNight = ctx.shifts.some((s) => s.isNight)
  const dates = eachDate(period)
  const nights: number[] = []
  const weekend: number[] = []
  for (const emp of ctx.employees) {
    let n = 0
    let w = 0
    for (const date of dates) {
      const a = getAssignment(schedule, emp.id, date)
      const sid = a ? a.shiftId : null
      if (sid != null) {
        if (hasNight && ctx.shiftById.get(sid)?.isNight) n++
        if (isWeekend(date)) w++
      }
    }
    nights.push(n)
    weekend.push(w)
  }
  const nspread = hasNight && nights.length ? Math.max(...nights) - Math.min(...nights) : 0
  const wspread = weekend.length ? Math.max(...weekend) - Math.min(...weekend) : 0
  const spread = nspread + wspread
  return Math.max(0, Math.min(100, 100 - spread * 8))
}

/**
 * Diff a solved assignment set against the current schedule and emit a
 * Proposal in the preserved contract shape
 * `{id,changes[],fairness,prevFairness,penalty,prevPenalty,breakdown[]}`.
 *
 * Because `mapSolution` OMITS unfilled cells, the diff is taken over the UNION
 * of current-period cells and solved cells: a current shift absent from the
 * solve surfaces as a removal (from:X -> to:null); a fill of a previously empty
 * cell surfaces as an addition (from:null -> to:Y). A cell that was already
 * empty and stays empty produces no change. No-op solve -> empty changes[].
 *
 * `penalty`/`prevPenalty` are ALWAYS recomputed via `scoreTerms` (HiGHS drops
 * the LP objective constant; the raw ObjectiveValue is never trusted).
 */
export function buildProposal(
  ctx: SolveContext,
  currentSchedule: Schedule,
  solvedAssignments: Assignment[],
  period: Period,
): Proposal {
  const dates = eachDate(period)
  const periodDates = new Set(dates)

  // Map solved cells by composite key for fast lookup (within period only).
  const solvedByKey = new Map<string, ID | null>()
  for (const a of solvedAssignments) {
    if (!periodDates.has(a.date)) continue
    solvedByKey.set(`${a.employeeId}|${a.date}`, a.shiftId)
  }

  // The solve result is authoritative over the period: a period cell IS what
  // the solver set, or null if it set nothing (mapSolution OMITS empty cells).
  // So `to = solvedByKey.get(key) ?? null`. A current shift the solver left
  // unset therefore surfaces as a removal (from:X -> to:null); a cell that was
  // already empty and the solver leaves empty produces no change.
  const cellTo = (employeeId: ID, date: ISODate): ID | null => {
    const key = `${employeeId}|${date}`
    return solvedByKey.has(key) ? solvedByKey.get(key)! : null
  }

  // Build the "next" schedule from the solve result over the period.
  const next = makeSchedule()
  for (const emp of ctx.employees) {
    for (const date of dates) {
      const to = cellTo(emp.id, date)
      if (to != null) setAssignment(next, { employeeId: emp.id, date, shiftId: to })
    }
  }

  // Changes = every period cell where from !== to.
  const changes: ProposalChange[] = []
  for (const emp of ctx.employees) {
    for (const date of dates) {
      const cur = getAssignment(currentSchedule, emp.id, date)
      const from = cur ? cur.shiftId : null
      const to = cellTo(emp.id, date)
      if (from === to) continue
      changes.push({ employeeId: emp.id, date, from, to, note: 'Improves the overall schedule.' })
    }
  }

  const nowScore = scoreTerms(ctx, next, period, currentSchedule)
  const prevScore = scoreTerms(ctx, currentSchedule, period, currentSchedule)

  const softIds: SoftId[] = ['S1', 'S2', 'S3', 'S4', 'S5']
  const breakdown: BreakdownRow[] = softIds.map((id) => ({
    id,
    name: SOFT_NAMES[id],
    now: nowScore[id],
    prev: prevScore[id],
  }))

  return {
    id: 'P-' + ++proposalCounter,
    changes,
    fairness: fairnessScore(ctx, next, period),
    prevFairness: fairnessScore(ctx, currentSchedule, period),
    penalty: nowScore.total,
    prevPenalty: prevScore.total,
    breakdown,
  }
}
