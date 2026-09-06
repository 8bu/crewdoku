import { describe, expect, it } from 'vitest'
import { applyCsvImport, parseEmployeeCsv } from './csvImport'
import { UNASSIGNED_TEAM_ID } from '../mockBoard'

describe('parseEmployeeCsv', () => {
  it('parses name/team rows below a header, case-insensitive header match', () => {
    const result = parseEmployeeCsv('Name,Team\nAlice,Frontline\nBob,Backline\n')
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      { name: 'Alice', team: 'Frontline' },
      { name: 'Bob', team: 'Backline' },
    ])
  })

  it('accepts the columns in either order', () => {
    const result = parseEmployeeCsv('team,name\nFrontline,Alice\n')
    expect(result.rows).toEqual([{ name: 'Alice', team: 'Frontline' }])
  })

  it('strips wrapping double quotes and whitespace', () => {
    const result = parseEmployeeCsv('name,team\n"Alice Johnson" , " Frontline "\n')
    expect(result.rows).toEqual([{ name: 'Alice Johnson', team: 'Frontline' }])
  })

  it('leaves team blank rather than inventing one', () => {
    const result = parseEmployeeCsv('name,team\nEve,\n')
    expect(result.rows).toEqual([{ name: 'Eve', team: '' }])
  })

  it('skips rows with no name and reports why', () => {
    const result = parseEmployeeCsv('name,team\n,Frontline\nBob,Backline\n')
    expect(result.rows).toEqual([{ name: 'Bob', team: 'Backline' }])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/missing a name/)
  })

  it('rejects a file with no name/team header', () => {
    const result = parseEmployeeCsv('first,last\nAlice,Johnson\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/name.*team/)
  })

  it('rejects an empty file', () => {
    const result = parseEmployeeCsv('')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/empty/)
  })

  it('reports a header with no rows below it', () => {
    const result = parseEmployeeCsv('name,team\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/No employee rows/)
  })
})

describe('applyCsvImport', () => {
  it('creates a person per row and a team per unique team name', () => {
    const result = applyCsvImport([], [], [
      { name: 'Alice', team: 'Frontline' },
      { name: 'Bob', team: 'Frontline' },
      { name: 'Carol', team: 'Backline' },
    ])
    expect(result.people).toHaveLength(3)
    expect(result.teams.map((t) => t.name)).toEqual(['Frontline', 'Backline'])
    const alice = result.people.find((p) => p.name === 'Alice')!
    const bob = result.people.find((p) => p.name === 'Bob')!
    expect(alice.teamId).toBe(bob.teamId)
  })

  it('matches an existing team case-insensitively instead of duplicating it', () => {
    const seeded = applyCsvImport([], [], [{ name: 'Alice', team: 'Frontline' }])
    const result = applyCsvImport(seeded.people, seeded.teams, [{ name: 'Bob', team: 'FRONTLINE' }])
    expect(result.teams).toHaveLength(1)
    expect(result.people.find((p) => p.name === 'Alice')!.teamId).toBe(
      result.people.find((p) => p.name === 'Bob')!.teamId,
    )
  })

  it('leaves a blank-team row on the UNASSIGNED sentinel', () => {
    const result = applyCsvImport([], [], [{ name: 'Eve', team: '' }])
    expect(result.teams).toEqual([])
    expect(result.people[0]!.teamId).toBe(UNASSIGNED_TEAM_ID)
  })

  it('appends onto an already-populated roster instead of replacing it', () => {
    const first = applyCsvImport([], [], [{ name: 'Alice', team: 'Frontline' }])
    const second = applyCsvImport(first.people, first.teams, [{ name: 'Bob', team: 'Backline' }])
    expect(second.people.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(second.teams.map((t) => t.name)).toEqual(['Frontline', 'Backline'])
  })
})
