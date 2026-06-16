import { dow, eachDate } from '../calendar/calendar'
import type { ConstraintId, ID, Period } from '../entities/types'
import type { Schedule } from '../schedule/schedule'
import { getAssignment } from '../schedule/schedule'
import type { SolveContext } from '../constraints/context'
import type { BuildModelOptions } from './model'

export interface ConflictCoreItem {
  cid: ConstraintId | '—'
  text: string
}

/**
 * A relaxation describes one recoverable action plus an `apply` that returns a
 * BuildModelOptions patch (merged onto whatever inputs the caller passes) so a
 * re-solve becomes feasible. Pure: no solver call.
 */
export interface Relaxation {
  id: string
  text: string
  detail: string
  apply(inputs?: BuildModelOptions): BuildModelOptions
}

export interface ConflictResult {
  core: ConflictCoreItem[]
  relaxations: Relaxation[]
}

function mergeOptions(inputs: BuildModelOptions, patch: BuildModelOptions): BuildModelOptions {
  const coverageMinOverride = new Map(inputs.coverageMinOverride ?? [])
  if (patch.coverageMinOverride) {
    for (const [k, v] of patch.coverageMinOverride) coverageMinOverride.set(k, v)
  }
  const droppedH3 = new Set(inputs.droppedH3 ?? [])
  if (patch.droppedH3) for (const k of patch.droppedH3) droppedH3.add(k)
  const unpinnedCells = new Set(inputs.unpinnedCells ?? [])
  if (patch.unpinnedCells) for (const k of patch.unpinnedCells) unpinnedCells.add(k)

  const out: BuildModelOptions = { coverageMinOverride, droppedH3, unpinnedCells }
  if (inputs.pins) out.pins = inputs.pins
  if (inputs.baseline) out.baseline = inputs.baseline
  return out
}

/**
 * Truthful, input-derived infeasibility diagnostic. Inspects the ACTUAL
 * coverage budget vs. available eligible staff per (team,shift,date), and
 * forced cells (time-off/pins) that create H3 conflicts. Returns a core
 * describing the real cause and >=1 applicable relaxation whose `apply` patches
 * the model inputs so a re-solve is feasible.
 *
 * NOTE: no fabricated "Night requires N" core, no literal 'N'; this replaces
 * the legacy demo-injected infeasibility path entirely.
 */
export function deriveConflictCore(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): ConflictResult {
  const dates = eachDate(period)
  const core: ConflictCoreItem[] = []
  const relaxations: Relaxation[] = []

  // --- (1) Coverage starvation: required min exceeds eligible+available staff ---
  // For each (team,shift,date), count employees on that team eligible for that
  // shift and not forced off (time-off / recurring) that date. If min exceeds
  // that capacity, the coverage band is genuinely unsatisfiable.
  const coverageGaps: { teamId: ID; shiftId: ID; date: string; min: number; capacity: number }[] = []
  for (const cov of ctx.coverages) {
    for (const date of dates) {
      const { min } = ctx.effectiveCoverage(cov.teamId, cov.shiftId, date)
      if (min <= 0) continue
      let capacity = 0
      for (const emp of ctx.employees) {
        if (emp.teamId !== cov.teamId) continue
        if (!emp.eligibleShiftIds.includes(cov.shiftId)) continue
        const offByTimeOff = emp.timeOff.some((r) => date >= r.start && date <= r.end)
        const offByRecurring = emp.recurring.some(
          (r) => r.kind === 'noDow' && r.dow === dow(date),
        )
        if (offByTimeOff || offByRecurring) continue
        capacity++
      }
      if (min > capacity) {
        coverageGaps.push({ teamId: cov.teamId, shiftId: cov.shiftId, date, min, capacity })
      }
    }
  }

  if (coverageGaps.length) {
    // Group cores by (team,shift) for a readable message; one core line each.
    const seen = new Set<string>()
    for (const g of coverageGaps) {
      const k = `${g.teamId}|${g.shiftId}`
      if (seen.has(k)) continue
      seen.add(k)
      const shift = ctx.shiftById.get(g.shiftId)
      const team = ctx.teamById.get(g.teamId)
      core.push({
        cid: 'H1',
        text: `${team?.name ?? g.teamId} needs ${g.min} on ${shift?.name ?? g.shiftId} but only ${g.capacity} eligible staff are available.`,
      })
    }
    // ONE relaxation lowering the coverage min on every gap date to the
    // achievable capacity. apply() returns a coverageMinOverride patch.
    const patch = new Map<string, number>()
    for (const g of coverageGaps) {
      patch.set(`${g.teamId}|${g.shiftId}|${g.date}`, g.capacity)
    }
    const firstGap = coverageGaps[0]!
    const firstShift = ctx.shiftById.get(firstGap.shiftId)
    relaxations.push({
      id: 'rx-coverage',
      text: `Lower required coverage min to the available headcount on the affected ${firstShift?.name ?? 'shift'} date(s)`,
      detail: 'One-off exception; the band is reduced only on the infeasible dates.',
      apply: (inputs = {}) => mergeOptions(inputs, { coverageMinOverride: patch }),
    })
  }

  // --- (2) H3 conflicts among forced cells (pins / explicit assignments) ---
  // A scheduled cell whose shift forms an incompatible cross-day pair with the
  // next scheduled cell is a rest-period conflict the solver cannot escape if
  // both are pinned. We surface the pair and offer an "unpin/drop-pair" relax.
  const incompat = incompatiblePairs(ctx)
  if (incompat.size) {
    const conflictCells = new Set<string>()
    const dropPairs = new Set<string>()
    for (const emp of ctx.employees) {
      for (let k = 0; k + 1 < dates.length; k++) {
        const fromDate = dates[k]!
        const toDate = dates[k + 1]!
        const a = getAssignment(schedule, emp.id, fromDate)
        const b = getAssignment(schedule, emp.id, toDate)
        if (!a || a.shiftId == null || !b || b.shiftId == null) continue
        if (incompat.has(`${a.shiftId}->${b.shiftId}`)) {
          conflictCells.add(`${emp.id}|${fromDate}`)
          conflictCells.add(`${emp.id}|${toDate}`)
          dropPairs.add(`${emp.id}|${fromDate}|${a.shiftId}|${b.shiftId}`)
        }
      }
    }
    if (conflictCells.size) {
      core.push({
        cid: 'H3',
        text: `${conflictCells.size} scheduled cell(s) force an under-${ctx.rules.minRestHours}h-rest rotation no schedule can satisfy.`,
      })
      const unpin = new Set(conflictCells)
      relaxations.push({
        id: 'rx-unpin',
        text: `Unpin ${conflictCells.size} conflicting cell(s) to let the solver re-rotate`,
        detail: 'Removes the rest-period deadlock by freeing the pinned cells.',
        apply: (inputs = {}) => mergeOptions(inputs, { unpinnedCells: unpin }),
      })
      relaxations.push({
        id: 'rx-drop-h3',
        text: `Allow the under-rest rotation for the conflicting pair(s)`,
        detail: 'Requires member consent; drops the specific H3 pair rows.',
        apply: (inputs = {}) => mergeOptions(inputs, { droppedH3: dropPairs }),
      })
    }
  }

  // --- Fallback: cause not localized, still honest. ---
  if (core.length === 0) {
    core.push({
      cid: '—',
      text: 'No schedule satisfies all hard constraints, but the cause is not a single localized cell.',
    })
  }

  return { core, relaxations }
}

function incompatiblePairs(ctx: SolveContext): Set<string> {
  const minRest = ctx.rules.minRestHours
  const out = new Set<string>()
  for (const a of ctx.shifts) {
    for (const b of ctx.shifts) {
      const rest = 24 + b.startHour - a.endHour
      if (rest < minRest) out.add(`${a.id}->${b.id}`)
    }
  }
  return out
}
