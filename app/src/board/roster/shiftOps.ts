/**
 * Pure shift-catalog edits (wayfinder ticket 15) — kept apart from
 * `Settings.tsx` so add/rename/delete/cascade logic is testable without a
 * DOM. Mirrors `teamOps.ts`'s shape.
 *
 * 8bu's call, grilled directly: a code is a real key, not a label — renaming
 * or deleting one rewrites every place that names it (teams' wants/avoids,
 * people's ineligible/wants/avoids, the coverage table) rather than leaving
 * stale references behind. The board's own assignments are a reference too
 * (`rewriteAssignmentCode` below) — `routes/Settings.tsx` applies it to the
 * shared schedule and hand-edit overrides (`state/schedule.ts`,
 * `state/boardOverrides.ts`) alongside everything this file returns.
 */
import type { Assignment, CoverageTable, Person, ShiftDef, Team } from '@crewdoku/domain'
import { nextShiftColor, type ShiftColorId } from '../shiftColors'

export function isCodeTaken(shifts: ShiftDef[], code: string, excludeIndex = -1): boolean {
  const normalized = code.trim().toUpperCase()
  return shifts.some((s, i) => i !== excludeIndex && s.code.toUpperCase() === normalized)
}

/** A new shift starts adjacent in the rotation, mid-morning, so it never collides with the defaults by default. Its colour is auto-assigned to whichever curated swatch isn't already taken (`nextShiftColor`), so back-to-back new rows don't default to the same hue. */
export function addShift(shifts: ShiftDef[], code: string, label: string): ShiftDef[] {
  return [
    ...shifts,
    {
      code: code.trim().toUpperCase(),
      label: label.trim() || code.trim().toUpperCase(),
      start: '0800',
      end: '1600',
      color: nextShiftColor(shifts.map((s) => s.color)),
    },
  ]
}

/** A manager's explicit re-colour (ticket "shift colour configurable") — swaps the swatch only, no cascade needed since colour isn't referenced anywhere else (unlike a code rename). */
export function setShiftColor(shifts: ShiftDef[], code: string, color: ShiftColorId): ShiftDef[] {
  return shifts.map((s) => (s.code === code ? { ...s, color } : s))
}

export function setShiftLabel(shifts: ShiftDef[], code: string, label: string): ShiftDef[] {
  return shifts.map((s) => (s.code === code ? { ...s, label } : s))
}

export function setShiftTimes(shifts: ShiftDef[], code: string, start: string, end: string): ShiftDef[] {
  return shifts.map((s) => (s.code === code ? { ...s, start, end } : s))
}

export function setShiftBreak(shifts: ShiftDef[], code: string, minutes: number): ShiftDef[] {
  const clamped = Math.max(0, Math.round(minutes) || 0)
  return shifts.map((s) => (s.code === code ? { ...s, unpaidBreakMinutes: clamped } : s))
}

function renameCodeInList(list: string[], from: string, to: string): string[] {
  if (!list.includes(from)) return list
  return list.map((c) => (c === from ? to : c))
}

/**
 * Renames a shift's code and rewrites every reference to it — the catalog
 * row itself, every team's `wants`/`avoids`, every person's
 * `ineligible`/`wants`/`avoids`, and the coverage table's rows. Caller
 * validates uniqueness first (`isCodeTaken`); this trusts `newCode` is free.
 */
export function renameShiftCode(
  shifts: ShiftDef[],
  teams: Team[],
  people: Person[],
  coverage: CoverageTable,
  oldCode: string,
  newCode: string,
): { shifts: ShiftDef[]; teams: Team[]; people: Person[]; coverage: CoverageTable } {
  const code = newCode.trim().toUpperCase()
  if (code === oldCode) return { shifts, teams, people, coverage }

  return {
    shifts: shifts.map((s) => (s.code === oldCode ? { ...s, code } : s)),
    teams: teams.map((t) => ({
      ...t,
      wants: renameCodeInList(t.wants, oldCode, code),
      avoids: renameCodeInList(t.avoids, oldCode, code),
    })),
    people: people.map((p) => ({
      ...p,
      ineligible: renameCodeInList(p.ineligible, oldCode, code),
      wants: p.wants ? renameCodeInList(p.wants, oldCode, code) : p.wants,
      avoids: p.avoids ? renameCodeInList(p.avoids, oldCode, code) : p.avoids,
    })),
    coverage: renameCoverageCode(coverage, oldCode, code),
  }
}

function renameCoverageCode(coverage: CoverageTable, oldCode: string, newCode: string): CoverageTable {
  const renameRow = (row: Record<string, { min: number; max: number }>) => {
    if (!(oldCode in row)) return row
    const { [oldCode]: band, ...rest } = row
    return { ...rest, [newCode]: band! }
  }
  return {
    byDow: Object.fromEntries(Object.entries(coverage.byDow).map(([dow, row]) => [dow, renameRow(row)])),
    dateOverrides: Object.fromEntries(Object.entries(coverage.dateOverrides).map(([iso, row]) => [iso, renameRow(row)])),
  }
}

function removeCodeFromCoverage(coverage: CoverageTable, code: string): CoverageTable {
  const dropRow = (row: Record<string, { min: number; max: number }>) => {
    const { [code]: _dropped, ...rest } = row
    return rest
  }
  return {
    byDow: Object.fromEntries(Object.entries(coverage.byDow).map(([dow, row]) => [dow, dropRow(row)])),
    dateOverrides: Object.fromEntries(Object.entries(coverage.dateOverrides).map(([iso, row]) => [iso, dropRow(row)])),
  }
}

/**
 * Rewrites every board cell on `oldCode` to `newCode` (ticket 15: the
 * shared board schedule — `state/schedule.ts`/`state/boardOverrides.ts` —
 * is itself a reference to a shift code, same as a person's `wants` or a
 * coverage row; a rename/delete that skipped it would leave a cell showing
 * a code that no longer exists in the catalog). Times come from `shifts`'
 * definition of `newCode`, not copied from the old assignment.
 */
export function rewriteAssignmentCode(
  assignments: Map<string, Assignment>,
  shifts: ShiftDef[],
  oldCode: string,
  newCode: string,
): Map<string, Assignment> {
  if (oldCode === newCode) return assignments
  const def = shifts.find((s) => s.code === newCode)
  let changed = false
  const next = new Map(assignments)
  for (const [key, assignment] of assignments) {
    if (assignment.code !== oldCode) continue
    next.set(key, { ...assignment, code: newCode, start: def?.start ?? null, end: def?.end ?? null })
    changed = true
  }
  return changed ? next : assignments
}

/**
 * Deletes a shift, reassigning every reference to `reassignToCode` first —
 * same "force a reassignment, never leave a dangling reference" call 8bu
 * made for team delete (`teamOps.deleteTeam`). Refusing to delete the last
 * shift is the caller's job, same division `teamOps` uses for the last team.
 */
export function deleteShift(
  shifts: ShiftDef[],
  teams: Team[],
  people: Person[],
  coverage: CoverageTable,
  code: string,
  reassignToCode: string,
): { shifts: ShiftDef[]; teams: Team[]; people: Person[]; coverage: CoverageTable } {
  return {
    shifts: shifts.filter((s) => s.code !== code),
    teams: teams.map((t) => ({
      ...t,
      wants: renameCodeInList(t.wants, code, reassignToCode),
      avoids: renameCodeInList(t.avoids, code, reassignToCode),
    })),
    people: people.map((p) => ({
      ...p,
      ineligible: renameCodeInList(p.ineligible, code, reassignToCode),
      wants: p.wants ? renameCodeInList(p.wants, code, reassignToCode) : p.wants,
      avoids: p.avoids ? renameCodeInList(p.avoids, code, reassignToCode) : p.avoids,
    })),
    coverage: removeCodeFromCoverage(coverage, code),
  }
}
