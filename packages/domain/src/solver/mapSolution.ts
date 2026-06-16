import type { Assignment } from '../entities/types'
import type { Solution } from '../ports/ports'
import type { ModelMeta } from './model'

/**
 * Decode a solved HiGHS column set into Assignments, attributing each set
 * `x_{empI}_{dateI}_{shiftId}` column to the correct employeeId + date via the
 * SAME `meta` that `buildModel` produced (never re-derives ordering). This
 * shared-meta round-trip is the structural fix for the legacy mis-attribution
 * bug.
 *
 * OMITS unfilled cells: emits an Assignment ONLY for columns the solver set
 * above 0.5; it never synthesizes `{shiftId:null}` day-off rows for empty cells
 * (matches legacy `decodeColumns`, avoids flooding the proposal). The "explicit
 * day off vs not-yet-scheduled" distinction is resolved in `buildProposal` by
 * diffing against the current schedule.
 *
 * Note var names embed an LP-safe TOKEN for the shift (not the raw nanoid,
 * which may contain `-`), so the name is split on its FIRST two underscores and
 * everything after is the token, decoded back to the real shiftId via
 * `meta.shiftTokenToId`. The token may itself contain `_` (from escaping), so
 * we never split further.
 */
export function mapSolution(solution: Solution, meta: ModelMeta): Assignment[] {
  const out: Assignment[] = []
  for (const [name, col] of Object.entries(solution.columns)) {
    if (!name.startsWith('x_')) continue // skip aux vars (nmax/nmin/wmax/t_...)
    const v = col?.Primal ?? col?.primal ?? 0
    if (v <= 0.5) continue
    // name = "x_{empI}_{dateI}_{shiftId}"
    const rest = name.slice(2) // drop "x_"
    const firstUnderscore = rest.indexOf('_')
    if (firstUnderscore < 0) continue
    const secondUnderscore = rest.indexOf('_', firstUnderscore + 1)
    if (secondUnderscore < 0) continue
    const empI = Number(rest.slice(0, firstUnderscore))
    const dateI = Number(rest.slice(firstUnderscore + 1, secondUnderscore))
    const token = rest.slice(secondUnderscore + 1)
    // Decode the LP-safe token back to the real shiftId (falls back to the raw
    // token for already-safe ids, which tokenise to themselves).
    const shiftId = meta.shiftTokenToId.get(token) ?? token
    const employeeId = meta.empById.get(empI)
    const date = meta.dateById.get(dateI)
    if (employeeId === undefined || date === undefined) continue
    out.push({ employeeId, date, shiftId })
  }
  return out
}
