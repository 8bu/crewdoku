import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  makePerson,
  makeTag,
  makeTeam,
  type Assignment,
  type CoverageTable,
  type Tag,
} from '@crewdoku/domain'
import { buildModelInput, type ModelInputParts } from './modelInput'

const DATES = ['2026-01-05', '2026-01-06', '2026-01-07']

const TAGS: Tag[] = [makeTag('Spanish')]

function tagCoverage(): Record<string, CoverageTable> {
  const tag = TAGS[0]
  if (tag === undefined) throw new Error('test tags are empty')
  return { [tag.id]: { byDow: { 1: { MID: { min: 1, max: Infinity } } }, dateOverrides: {} } }
}

function parts(overrides: Partial<ModelInputParts> = {}): ModelInputParts {
  return {
    people: [makePerson({ id: 'p1', name: 'Ada' })],
    teams: [makeTeam({ id: 't1', name: 'A' })],
    tags: TAGS,
    shifts: DEFAULT_SHIFTS,
    coverage: defaultCoverageTable(DEFAULT_SHIFTS, 1),
    tagCoverage: tagCoverage(),
    settings: DEFAULT_SOLVE_SETTINGS,
    dates: DATES,
    current: new Map<string, Assignment>(),
    ...overrides,
  }
}

describe('buildModelInput', () => {
  it('drops removed people so the solver never assigns them', () => {
    const input = buildModelInput(
      parts({
        people: [makePerson({ id: 'p1', name: 'Ada' }), makePerson({ id: 'p2', name: 'Gone', removed: true })],
      }),
    )
    expect(input.people.map((p) => p.id)).toEqual(['p1'])
  })

  it('throws when the period has no dates', () => {
    expect(() => buildModelInput(parts({ dates: [] }))).toThrow(/no dates/)
  })
})
