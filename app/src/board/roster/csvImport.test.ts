import { describe, expect, it } from 'vitest'
import { applyCsvImport, parseEmployeeCsv, parseEmployeeRows, parsePastedRoster } from './csvImport'
import { UNASSIGNED_TEAM_ID } from '@crewdoku/domain'

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
})

describe('parseEmployeeRows', () => {
  it('reads a two-column table, leaving a blank team blank', () => {
    const result = parseEmployeeRows([
      ['name', 'team'],
      ['Alice', 'Frontline'],
      ['Bob', ''],
    ])
    expect(result.rows).toEqual([
      { name: 'Alice', team: 'Frontline' },
      { name: 'Bob', team: '' },
    ])
    expect(result.errors).toEqual([])
  })

  it('drops fully-empty trailing rows', () => {
    const result = parseEmployeeRows([
      ['name', 'team'],
      ['Alice', 'A'],
      ['', ''],
    ])
    expect(result.rows).toEqual([{ name: 'Alice', team: 'A' }])
    expect(result.errors).toEqual([])
  })

  it('rejects a table with no name/team header', () => {
    const result = parseEmployeeRows([
      ['x', 'y'],
      ['Alice', 'A'],
    ])
    expect(result.errors[0]).toEqual({ kind: 'noHeader' })
  })

  it('reports a header with no rows below it', () => {
    expect(parseEmployeeRows([['name', 'team']]).errors).toEqual([{ kind: 'noRows' }])
  })

  it('reports empty input', () => {
    expect(parseEmployeeRows([]).errors).toEqual([{ kind: 'empty' }])
  })

  it('skips a blank-name row but keeps the rest and reports why', () => {
    const result = parseEmployeeRows([
      ['name', 'team'],
      ['', 'A'],
      ['Bob', 'B'],
    ])
    expect(result.rows).toEqual([{ name: 'Bob', team: 'B' }])
    expect(result.errors).toEqual([{ kind: 'missingName', line: 2 }])
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

describe('parsePastedRoster', () => {
  it('parses one name per line, with or without a team', () => {
    expect(parsePastedRoster('Anna Bauer, Front desk\nBen Keller\n\nChloe Martin,  Kitchen ')).toEqual([
      { name: 'Anna Bauer', team: 'Front desk' },
      { name: 'Ben Keller', team: '' },
      { name: 'Chloe Martin', team: 'Kitchen' },
    ])
  })

  it('splits on tabs, so a two-column spreadsheet range pastes straight in', () => {
    expect(parsePastedRoster('Anna\tWard A\nBen\tWard B')).toEqual([
      { name: 'Anna', team: 'Ward A' },
      { name: 'Ben', team: 'Ward B' },
    ])
  })

  it('drops a pasted name/team header line but keeps anything else', () => {
    expect(parsePastedRoster('Name, Team\nAnna, Ward A')).toEqual([{ name: 'Anna', team: 'Ward A' }])
    expect(parsePastedRoster('Name Smith, Ward A')).toEqual([{ name: 'Name Smith', team: 'Ward A' }])
  })
})
