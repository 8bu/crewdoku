import type { Assignment, Schedule } from '@crewdoku/domain'
import { assignmentKey } from '@crewdoku/domain'
import type { ModelMeta } from './model'

export type SolutionColumns = Record<
  string,
  {
    Primal?: number
    primal?: number
  } | undefined
>

/**
 * Decodes solved HiGHS columns into a sparse Schedule of Assignments.
 *
 * Implements Decision 5:
 * - Solution decode stays SPARSE at this layer (unfilled cells omitted; ticket 06 overlays pins/OFF).
 * - Skips non-x_ columns (auxiliary variables).
 * - Keeps columns with Primal > 0.5.
 * - Splits name on the FIRST two underscores: `x_{empI}_{dateI}_{shiftToken}`.
 *   The shift token itself may contain escaped underscores, so we do not split further.
 * - Decodes via the same ModelMeta produced by buildModel.
 * - Emits Assignment { code, start, end from ShiftDef, pinned: false, ineligible: false }.
 */
export function mapSolution(
  columns: SolutionColumns,
  meta: ModelMeta,
): Schedule {
  const schedule: Schedule = new Map<string, Assignment>()

  for (const [name, col] of Object.entries(columns)) {
    if (!name.startsWith('x_')) continue

    const primal = col?.Primal ?? col?.primal ?? 0
    if (primal <= 0.5) continue

    const rest = name.slice(2)
    const firstUnderscore = rest.indexOf('_')
    if (firstUnderscore < 0) continue

    const secondUnderscore = rest.indexOf('_', firstUnderscore + 1)
    if (secondUnderscore < 0) continue

    const empI = Number(rest.slice(0, firstUnderscore))
    const dateI = Number(rest.slice(firstUnderscore + 1, secondUnderscore))
    const token = rest.slice(secondUnderscore + 1)

    const personId = meta.personById.get(empI)
    const date = meta.dateById.get(dateI)
    const shiftCode = meta.shiftTokenToCode.get(token) ?? token

    if (personId === undefined || date === undefined) continue

    const sDef = meta.shiftDefByCode.get(shiftCode)

    const assignment: Assignment = {
      code: shiftCode,
      start: sDef?.start ?? null,
      end: sDef?.end ?? null,
      pinned: false,
      ineligible: false,
    }

    schedule.set(assignmentKey(personId, date), assignment)
  }

  return schedule
}
