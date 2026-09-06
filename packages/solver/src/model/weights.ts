import type { SoftGoalId, SolveSettings } from '@crewdoku/domain'

/**
 * Computes single-objective weights for enabled soft goals based on user priority order.
 *
 * Decision 3 (orchestrator):
 * Over ENABLED soft goals in softGoalOrder, weight = 10^(n - 1 - rankIndex) where
 * n = number of enabled goals (first rank gets the biggest power).
 * Disabled goals receive weight 0 (and emit no aux rows).
 *
 * Example:
 * - All 5 enabled: [10000, 1000, 100, 10, 1] in softGoalOrder sequence.
 * - If e.g. 1 disabled, n = 4: [1000, 100, 10, 1] for enabled goals, 0 for disabled.
 */
export function rankWeights(settings: SolveSettings): Record<SoftGoalId, number> {
  const result: Record<SoftGoalId, number> = {
    S1: 0,
    S2: 0,
    S3: 0,
    S4: 0,
    S5: 0,
  }

  const enabledInOrder = settings.softGoalOrder.filter(
    (id) => settings.softGoalEnabled[id] ?? false,
  )

  const n = enabledInOrder.length
  for (let rankIndex = 0; rankIndex < n; rankIndex++) {
    const id = enabledInOrder[rankIndex]
    if (id !== undefined) {
      result[id] = 10 ** (n - 1 - rankIndex)
    }
  }

  return result
}
