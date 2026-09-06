/**
 * Workspace templates (wayfinder ticket 14) — a company shape a first-run
 * manager picks with one click. Each seeds the three workspace-global
 * settings a schedule needs (shift catalog, coverage table, solve
 * settings) with safe, honest defaults; everything is editable in
 * Settings afterwards. Kept pure and apart from the `Onboarding`
 * component, same as `csvImport.ts`, so the shapes are testable without
 * a DOM.
 */
import {
  DEFAULT_SOLVE_SETTINGS,
  type CoverageRow,
  type CoverageTable,
  type ShiftDef,
  type SolveSettings,
} from '@crewdoku/domain'
import type { CsvRow } from '../board/roster/csvImport'

export type TemplateId = 'ward' | 'retail' | 'office' | 'custom'

export type WorkspaceTemplate = {
  id: TemplateId
  label: string
  tagline: string
  /** Sizing nudge for the People step. Never blocks — a small roster lands on the infeasible screen's own one-click fix. */
  minPeople: number
  peopleHint: string
  shifts: ShiftDef[]
  coverage: CoverageTable
  solveSettings: SolveSettings
}

function band(min: number, max: number) {
  return { min, max }
}

/** Same row all seven days. */
function allWeek(row: CoverageRow): CoverageTable {
  const byDow: Record<number, CoverageRow> = {}
  for (let dow = 0; dow < 7; dow++) byDow[dow] = { ...row }
  return { byDow, dateOverrides: {} }
}

/** `open` Monday–Friday, `closed` Saturday/Sunday. */
function workWeek(open: CoverageRow, closed: CoverageRow): CoverageTable {
  const byDow: Record<number, CoverageRow> = {}
  for (let dow = 0; dow < 7; dow++) byDow[dow] = dow === 0 || dow === 6 ? { ...closed } : { ...open }
  return { byDow, dateOverrides: {} }
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'ward',
    label: '24/7 ward',
    tagline: 'Three shifts around the clock, every day. Hospitals, care homes, plants.',
    minPeople: 6,
    peopleHint: 'A 24/7 ward usually needs at least 6 people to cover every shift.',
    shifts: [
      { code: 'EARLY', label: 'Early', start: '0600', end: '1400', color: 'amber' },
      { code: 'LATE', label: 'Late', start: '1400', end: '2200', color: 'orange' },
      { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true, color: 'navy' },
    ],
    coverage: allWeek({ EARLY: band(1, 3), LATE: band(1, 3), NIGHT: band(1, 3) }),
    solveSettings: DEFAULT_SOLVE_SETTINGS,
  },
  {
    id: 'retail',
    label: 'Retail store',
    tagline: 'An opening and a closing shift, seven days a week. Shops, cafés, gyms.',
    minPeople: 4,
    peopleHint: 'A store usually needs at least 4 people to cover both shifts all week.',
    shifts: [
      { code: 'OPEN', label: 'Opening', start: '0900', end: '1500', color: 'amber' },
      { code: 'CLOSE', label: 'Closing', start: '1500', end: '2100', color: 'teal' },
    ],
    coverage: allWeek({ OPEN: band(1, 3), CLOSE: band(1, 3) }),
    solveSettings: DEFAULT_SOLVE_SETTINGS,
  },
  {
    id: 'office',
    label: 'Office week',
    tagline: 'One day shift, Monday to Friday. Weekends are closed.',
    minPeople: 2,
    peopleHint: 'An office runs from 2 people up.',
    shifts: [{ code: 'DAY', label: 'Day', start: '0900', end: '1700', color: 'sky' }],
    coverage: workWeek({ DAY: band(1, 20) }, { DAY: band(0, 0) }),
    solveSettings: DEFAULT_SOLVE_SETTINGS,
  },
  {
    id: 'custom',
    label: 'Start custom',
    tagline: 'One simple day shift, no requirements. Build your own in Settings.',
    minPeople: 1,
    peopleHint: '',
    shifts: [{ code: 'DAY', label: 'Day', start: '0900', end: '1700', color: 'amber' }],
    coverage: allWeek({ DAY: band(0, 20) }),
    solveSettings: DEFAULT_SOLVE_SETTINGS,
  },
]

/**
 * The People step's paste box: one person per line, `Name` or `Name, Team`
 * (tab also splits, so a two-column spreadsheet range pastes straight in).
 * A lone `name, team` header line from a copied sheet is dropped; anything
 * else is taken at face value.
 */
export function parsePastedRoster(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  for (const line of text.split(/\r\n|\r|\n/)) {
    const cells = line.split(/[,\t]/).map((c) => c.trim())
    const name = cells[0] ?? ''
    const team = cells[1] ?? ''
    if (!name) continue
    rows.push({ name, team })
  }
  const first = rows[0]
  if (first && first.name.toLowerCase() === 'name' && first.team.toLowerCase() === 'team') rows.shift()
  return rows
}
