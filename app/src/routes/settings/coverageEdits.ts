import type { CoverageBand, CoverageTable } from '@crewdoku/domain'

/** A coverage table with no bands at all — what a tag starts from. */
export const EMPTY_COVERAGE_TABLE: CoverageTable = { byDow: {}, dateOverrides: {} }

// The four edits `CoverageTable` emits, shared by the org table (Settings) and
// a tag's own table (the Tags view) so the two editors can never drift apart.
export function withBandDays(table: CoverageTable, weekdays: number[], code: string, band: CoverageBand): CoverageTable {
  const byDow = { ...table.byDow }
  for (const wd of weekdays) byDow[wd] = { ...byDow[wd], [code]: band }
  return { ...table, byDow }
}
export function withAddedOverride(table: CoverageTable, iso: string): CoverageTable {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
  const seedRow = table.byDow[weekday] ?? {}
  return { ...table, dateOverrides: { ...table.dateOverrides, [iso]: { ...seedRow } } }
}
export function withOverrideBand(table: CoverageTable, iso: string, code: string, band: CoverageBand): CoverageTable {
  return { ...table, dateOverrides: { ...table.dateOverrides, [iso]: { ...table.dateOverrides[iso], [code]: band } } }
}
export function withoutOverride(table: CoverageTable, iso: string): CoverageTable {
  const rest = { ...table.dateOverrides }
  delete rest[iso]
  return { ...table, dateOverrides: rest }
}

/**
 * Apply an edit to one tag's table. The entry only disappears once nothing is
 * left in it: a band the planner typed back to `0..∞` is still their explicit
 * choice, and an override row the seed left empty is about to be filled in.
 */
export function withTagTable(
  prev: Record<string, CoverageTable>,
  tagId: string,
  edit: (table: CoverageTable) => CoverageTable,
): Record<string, CoverageTable> {
  const next = edit(prev[tagId] ?? EMPTY_COVERAGE_TABLE)
  if (Object.keys(next.byDow).length > 0 || Object.keys(next.dateOverrides).length > 0) return { ...prev, [tagId]: next }
  if (!(tagId in prev)) return prev
  const rest = { ...prev }
  delete rest[tagId]
  return rest
}
