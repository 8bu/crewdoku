import { describe, expect, it } from 'vitest'
import { buildCoverageView } from './coverageData'
import { emptyBoardData, type Assignment, type Person, type ShiftDef } from '../board/mockBoard'
import type { CoverageTable } from '../state/coverageRules'

/**
 * The pivot behind `/coverage` (ticket 21): counts come from the injected
 * `getAssignment` (overrides-over-schedule at the call site), statuses from
 * the authored band, and a team lens suppresses status entirely — the
 * requirement table is org-wide, so a per-team "short" would be a lie.
 */

const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400', color: 'amber' },
  { code: 'LATE', label: 'Late', start: '1400', end: '2200', color: 'orange' },
]

function person(id: string, teamId: string): Person {
  return { id, name: id, teamId, rotationOffset: 0, ineligible: [] }
}

const PEOPLE = [person('a', 't1'), person('b', 't1'), person('c', 't2')]

// Mon 2026-08-17 + Tue 2026-08-18.
const DATES = emptyBoardData('2026-08-17', 2).dates

// Mon: a+b EARLY, c LATE. Tue: everyone OFF.
const CODES: Record<string, string> = {
  'a|2026-08-17': 'EARLY',
  'b|2026-08-17': 'EARLY',
  'c|2026-08-17': 'LATE',
}

function getAssignment(personId: string, dateIso: string): Assignment {
  const code = CODES[`${personId}|${dateIso}`] ?? 'OFF'
  return { code, start: null, end: null, pinned: false, ineligible: false }
}

/** EARLY needs exactly 1 (so Mon's 2 is over, Tue's 0 short); LATE needs 1–2. */
function table(): CoverageTable {
  const row = { EARLY: { min: 1, max: 1 }, LATE: { min: 1, max: 2 } }
  const byDow: CoverageTable['byDow'] = {}
  for (let dow = 0; dow < 7; dow++) byDow[dow] = { ...row }
  return { byDow, dateOverrides: {} }
}

describe('buildCoverageView', () => {
  it('counts, statuses, margins, and day totals from the live view of assignments', () => {
    const view = buildCoverageView(PEOPLE, DATES, SHIFTS, table(), getAssignment, 'all')

    const early = view.rows[0]!
    expect(early.cells.map((c) => c.count)).toEqual([2, 0])
    expect(early.cells.map((c) => c.status)).toEqual(['over', 'short'])
    expect([early.shortDays, early.overDays]).toEqual([1, 1])

    const late = view.rows[1]!
    expect(late.cells.map((c) => c.status)).toEqual(['ok', 'short'])

    expect([view.shortCells, view.overCells]).toEqual([2, 1])
    expect(view.dayTotals.map((d) => d.assigned)).toEqual([3, 0])
    expect(view.dayTotals.map((d) => d.minTotal)).toEqual([2, 2])
    // Worst-of: Mon has an over (EARLY) and an ok (LATE) -> over; Tue all short.
    expect(view.dayTotals.map((d) => d.status)).toEqual(['over', 'short'])
  })

  it('a date override beats the weekday default', () => {
    const t = table()
    t.dateOverrides['2026-08-17'] = { EARLY: { min: 2, max: 3 } }
    const view = buildCoverageView(PEOPLE, DATES, SHIFTS, t, getAssignment, 'all')
    expect(view.rows[0]!.cells[0]!.status).toBe('ok')
  })

  it('an unlisted shift reads as no requirement and can never be short or over', () => {
    const t: CoverageTable = { byDow: {}, dateOverrides: {} }
    const view = buildCoverageView(PEOPLE, DATES, SHIFTS, t, getAssignment, 'all')
    expect(view.rows.flatMap((r) => r.cells.map((c) => c.status))).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(view.rows[0]!.cells[0]!.max).toBe(Infinity)
  })

  it('a team lens filters counts but suppresses every status', () => {
    const view = buildCoverageView(PEOPLE, DATES, SHIFTS, table(), getAssignment, 't1')
    expect(view.scoped).toBe(true)
    expect(view.rows[0]!.cells[0]!.count).toBe(2)
    expect(view.rows[1]!.cells[0]!.count).toBe(0) // c is t2, out of scope
    expect(view.rows.flatMap((r) => r.cells.map((c) => c.status))).toEqual([null, null, null, null])
    expect([view.shortCells, view.overCells]).toEqual([0, 0])
    expect(view.dayTotals.map((d) => d.status)).toEqual([null, null])
  })

  it('names in a cell are the in-scope people on that shift', () => {
    const view = buildCoverageView(PEOPLE, DATES, SHIFTS, table(), getAssignment, 'all')
    expect(view.rows[0]!.cells[0]!.people.map((p) => p.id)).toEqual(['a', 'b'])
  })
})
