import type { Period, SoftId } from '../entities/types'
import type { Schedule } from '../schedule/schedule'
import { makeSchedule } from '../schedule/schedule'
import type { SolveContext } from './context'
import {
  checkH1,
  checkH2,
  checkH3,
  checkH4,
  checkH5,
  checkH6,
} from './hard'
import type { HardViolation } from './hard'
import { scoreS1, scoreS2, scoreS3, scoreS4, scoreS5 } from './soft'

/**
 * Runs each hard checker only if Rules.enabled[Hn] is true, then concatenates.
 * Single definition (the pure check fns), gated by the registry.
 */
export function runHardChecks(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
): HardViolation[] {
  const { enabled } = ctx.rules
  const out: HardViolation[] = []
  if (enabled.H1) out.push(...checkH1(ctx, schedule, period))
  if (enabled.H2) out.push(...checkH2(ctx, schedule, period))
  if (enabled.H3) out.push(...checkH3(ctx, schedule, period))
  if (enabled.H4) out.push(...checkH4(ctx, schedule, period))
  if (enabled.H5) out.push(...checkH5(ctx, schedule, period))
  if (enabled.H6) out.push(...checkH6(ctx, schedule, period))
  return out
}

export interface SoftBreakdown {
  S1: number
  S2: number
  S3: number
  S4: number
  S5: number
  total: number
}

/**
 * Weighted soft total. Each term = enabled[Sx] ? weights[Sx] * rawScorer : 0.
 * Scorers return raw unweighted counts; the registry applies weights/toggles.
 * `baseline` is the schedule S3 (stability) diffs against (e.g. the current
 * applied schedule before a solve); defaults to empty.
 */
export function scoreSoft(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
  baseline: Schedule = makeSchedule(),
): SoftBreakdown {
  const { enabled, weights } = ctx.rules
  const term = (id: SoftId, raw: number): number =>
    enabled[id] ? weights[id] * raw : 0

  const S1 = term('S1', scoreS1(ctx, schedule, period))
  const S2 = term('S2', scoreS2(ctx, schedule, period))
  const S3 = term('S3', scoreS3(ctx, schedule, period, baseline))
  const S4 = term('S4', scoreS4(ctx, schedule, period))
  const S5 = term('S5', scoreS5(ctx, schedule, period))
  return { S1, S2, S3, S4, S5, total: S1 + S2 + S3 + S4 + S5 }
}
