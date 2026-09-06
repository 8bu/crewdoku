import { describe, expect, it } from 'vitest'
import { UNASSIGNED_TEAM_ID } from './entities'
import { DEFAULT_SHIFTS, defaultCoverageTable, makePeriod, makePerson, makeTeam } from './factories'

describe('makePerson', () => {
  it('defaults to unassigned, no ineligibilities, and a unique kind-prefixed id', () => {
    const a = makePerson({ name: 'A' })
    const b = makePerson({ name: 'B' })
    expect(a.teamId).toBe(UNASSIGNED_TEAM_ID)
    expect(a.ineligible).toEqual([])
    expect(a.id).toMatch(/^person-/)
    expect(a.id).not.toBe(b.id)
  })

  it('keeps explicit values, including an explicit undefined id', () => {
    const person = makePerson({ name: 'C', id: undefined, teamId: 'team-1', ineligible: ['NIGHT'] })
    expect(person.id).toMatch(/^person-/)
    expect(person.teamId).toBe('team-1')
    expect(person.ineligible).toEqual(['NIGHT'])
  })
})

describe('makeTeam and makePeriod', () => {
  it('produce valid entities with empty preference defaults', () => {
    const team = makeTeam({ name: 'Alpha' })
    expect(team.id).toMatch(/^team-/)
    expect(team.wants).toEqual([])
    expect(team.avoids).toEqual([])

    const period = makePeriod({ label: 'P1', start: '2026-08-17', end: '2026-09-27' })
    expect(period.id).toMatch(/^period-/)
    expect(period.start < period.end).toBe(true)
  })
})

describe('defaultCoverageTable', () => {
  it('seeds teamCount..teamCount*2 for every shift on every weekday, no overrides', () => {
    const table = defaultCoverageTable(DEFAULT_SHIFTS, 3)
    expect(Object.keys(table.byDow)).toHaveLength(7)
    for (let dow = 0; dow < 7; dow++) {
      for (const shift of DEFAULT_SHIFTS) {
        expect(table.byDow[dow]?.[shift.code]).toEqual({ min: 3, max: 6 })
      }
    }
    expect(table.dateOverrides).toEqual({})
  })
})
