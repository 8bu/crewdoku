import type { Period } from '../entities/types'
import type { Schedule } from '../schedule/schedule'
import { scoreSoft } from '../constraints/registry'
import type { SoftBreakdown } from '../constraints/registry'
import type { SolveContext } from '../constraints/context'

/**
 * The single recompute path for proposal `penalty` / `prevPenalty`. HiGHS drops
 * the LP objective constant from `ObjectiveValue`, so the UI must never trust
 * the raw solved objective — it recomputes the weighted soft breakdown here.
 *
 * Delegates to the registry's `scoreSoft` (one definition of weights/toggles).
 * `baseline` is what S3 (stability) diffs against; defaults to empty.
 */
export function scoreTerms(
  ctx: SolveContext,
  schedule: Schedule,
  period: Period,
  baseline?: Schedule,
): SoftBreakdown {
  return baseline
    ? scoreSoft(ctx, schedule, period, baseline)
    : scoreSoft(ctx, schedule, period)
}
