import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  makePerson,
  makeTeam,
  type Assignment,
  type Schedule,
} from '@crewdoku/domain'
import { buildModelInput, type ModelInputParts } from './modelInput'

const DATES = ['2026-01-05', '2026-01-06', '2026-01-07']

function parts(overrides: Partial<ModelInputParts> = {}): ModelInputParts {
  return {
    people: [makePerson({ id: 'p1', name: 'Ada' })],
    teams: [makeTeam({ id: 't1', name: 'A' })],
    shifts: DEFAULT_SHIFTS,
    coverage: defaultCoverageTable(DEFAULT_SHIFTS, 1),
    settings: DEFAULT_SOLVE_SETTINGS,
    dates: DATES,
    current: new Map<string, Assignment>(),
    ...overrides,
  }
}

describe('buildModelInput', () => {
  it('derives the period from the first and last board date', () => {
    expect(buildModelInput(parts()).period).toEqual({ start: '2026-01-05', end: '2026-01-07' })
  })

  it('drops removed people so the solver never assigns them', () => {
    const input = buildModelInput(
      parts({
        people: [makePerson({ id: 'p1', name: 'Ada' }), makePerson({ id: 'p2', name: 'Gone', removed: true })],
      }),
    )
    expect(input.people.map((p) => p.id)).toEqual(['p1'])
  })

  it('carries the current schedule (pins), catalog, and settings through verbatim', () => {
    const current: Schedule = new Map<string, Assignment>()
    const pinned: Assignment = { code: 'EARLY', start: null, end: null, pinned: true, ineligible: false }
    current.set('p1|2026-01-05', pinned)
    const input = buildModelInput(parts({ current }))
    expect(input.current.get('p1|2026-01-05')).toEqual(pinned)
    expect(input.settings).toBe(DEFAULT_SOLVE_SETTINGS)
    expect(input.teams?.map((t) => t.id)).toEqual(['t1'])
  })

  it('throws when the period has no dates', () => {
    expect(() => buildModelInput(parts({ dates: [] }))).toThrow(/no dates/)
  })
})
