import { describe, expect, it } from 'vitest'
import { OFF_CODE, UNASSIGNED_TEAM_ID, type Person, type ShiftDef, type Team } from '@crewdoku/domain'
import { buildDefinedNames, buildImportWorkbook, buildTemplateValidations, type ImportWorkbook } from './importTemplate'

const SHIFTS: ShiftDef[] = [
  { code: 'OPEN', label: 'Opening', start: '0900', end: '1500' },
  { code: 'MID', label: 'Mid', start: '1100', end: '1900' },
  { code: 'CLOSE', label: 'Closing', start: '1500', end: '2100' },
]

const TEAMS: Team[] = [
  { id: 't1', name: 'Bakery', wants: ['OPEN'], avoids: ['CLOSE'] },
  { id: 't2', name: 'Counter', wants: [], avoids: [] },
]

const PEOPLE: Person[] = [
  {
    id: 'p1',
    name: 'Ada',
    teamId: 't1',
    ineligible: ['CLOSE', 'MID'],
    timeOff: ['2026-01-05', '2026-01-06'],
    recurringOff: [0, 6],
    wants: ['OPEN', 'MID'],
    useTeamPreference: false,
  },
  { id: 'p2', name: 'Bo', teamId: UNASSIGNED_TEAM_ID, ineligible: [] },
  // Removed people are gone from the roster, so their dates are gone too.
  { id: 'p3', name: 'Cy (removed)', teamId: 't2', ineligible: [], timeOff: ['2026-02-01'], removed: true },
]

function rowsOf(wb: ImportWorkbook, sheetName: string): string[][] {
  return wb.sheets.find((sheet) => sheet.name === sheetName)!.rows
}

const POPULATED = buildImportWorkbook({ shifts: SHIFTS, teams: TEAMS, people: PEOPLE })

describe('buildImportWorkbook', () => {
  it('emits Teams, People, TimeOff and Shifts with the exact contract headers', () => {
    expect(POPULATED.sheets.map((sheet) => sheet.name)).toEqual(['Teams', 'People', 'TimeOff', 'Shifts'])
    expect(rowsOf(POPULATED, 'Teams')[0]).toEqual(['name', 'wants', 'avoids'])
    expect(rowsOf(POPULATED, 'People')[0]).toEqual([
      'name',
      'team',
      'ineligible',
      'wants',
      'avoids',
      'useTeamPreference',
      'recurringOff',
    ])
    expect(rowsOf(POPULATED, 'TimeOff')[0]).toEqual(['person', 'date'])
    expect(rowsOf(POPULATED, 'Shifts')[0]).toEqual(['code', 'label', 'start', 'end'])
  })

  it('writes one Teams row per team and one Shifts row per catalog entry', () => {
    expect(rowsOf(POPULATED, 'Teams')).toEqual([
      ['name', 'wants', 'avoids'],
      ['Bakery', 'OPEN', 'CLOSE'],
      ['Counter', '', ''],
    ])
    expect(rowsOf(POPULATED, 'Shifts')).toEqual([
      ['code', 'label', 'start', 'end'],
      ['OPEN', 'Opening', '0900', '1500'],
      ['MID', 'Mid', '1100', '1900'],
      ['CLOSE', 'Closing', '1500', '2100'],
    ])
  })

  it('writes one People row per active person, resolved and serialized', () => {
    expect(rowsOf(POPULATED, 'People')).toEqual([
      ['name', 'team', 'ineligible', 'wants', 'avoids', 'useTeamPreference', 'recurringOff'],
      ['Ada', 'Bakery', 'CLOSE MID', 'OPEN MID', '', 'no', 'Sun Sat'],
      // No team -> blank cell, no own preference -> inherits (yes), no rows -> blank cells.
      ['Bo', '', '', '', '', 'yes', ''],
    ])
  })

  it('drops weekdays outside the week and the reserved OFF code', () => {
    const wb = buildImportWorkbook({
      shifts: SHIFTS,
      teams: TEAMS,
      people: [{ id: 'p9', name: 'Dot', teamId: 't1', ineligible: [], avoids: [OFF_CODE, 'CLOSE'], recurringOff: [7, -1, 3] }],
    })
    expect(rowsOf(wb, 'People')[1]).toEqual(['Dot', 'Bakery', '', '', 'CLOSE', 'yes', 'Wed'])
  })

  it('gives every date off its own TimeOff row, for active people only', () => {
    expect(rowsOf(POPULATED, 'TimeOff')).toEqual([
      ['person', 'date'],
      ['Ada', '2026-01-05'],
      ['Ada', '2026-01-06'],
    ])
  })

  it('falls back to illustrative rows on an empty workspace, all referencing real codes and teams', () => {
    const empty = buildImportWorkbook({ shifts: SHIFTS, teams: [], people: [] })
    const teams = rowsOf(empty, 'Teams')
    const people = rowsOf(empty, 'People')
    const shifts = rowsOf(empty, 'Shifts')

    expect(teams).toHaveLength(3)
    expect(people).toHaveLength(3)
    expect(shifts).toHaveLength(SHIFTS.length + 1)

    const codes = new Set(shifts.slice(1).map((row) => row[0]))
    const teamNames = new Set(teams.slice(1).map((row) => row[0]))
    for (const row of people.slice(1)) {
      expect(teamNames.has(row[1]!)).toBe(true)
      for (const cell of [row[2], row[3], row[4]]) {
        for (const code of (cell ?? '').split(/\s+/).filter(Boolean)) expect(codes.has(code)).toBe(true)
      }
    }
  })

  it('illustrates time off on an empty workspace with dates for a person the People sheet has', () => {
    const empty = buildImportWorkbook({ shifts: SHIFTS, teams: [], people: [] })
    const timeOff = rowsOf(empty, 'TimeOff')
    const personNames = new Set(rowsOf(empty, 'People').slice(1).map((row) => row[0]))

    expect(timeOff).toEqual([
      ['person', 'date'],
      ['Person A', '2026-01-01'],
      ['Person A', '2026-01-02'],
    ])
    for (const row of timeOff.slice(1)) {
      expect(personNames.has(row[0]!)).toBe(true)
      expect(row[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('is deterministic', () => {
    expect(buildImportWorkbook({ shifts: SHIFTS, teams: TEAMS, people: PEOPLE })).toEqual(POPULATED)
  })
})

describe('buildTemplateValidations', () => {
  const dv = buildTemplateValidations(POPULATED)

  it('points every code, team and person dropdown at a dynamic named range', () => {
    expect(dv.Teams).toContain('sqref="B2:B1000"><formula1>ShiftCodes</formula1>')
    expect(dv.Teams).toContain('sqref="C2:C1000"><formula1>ShiftCodes</formula1>')
    expect(dv.People).toContain('sqref="B2:B1000"><formula1>TeamNames</formula1>')
    for (const col of ['C', 'D', 'E']) {
      expect(dv.People).toContain(`sqref="${col}2:${col}1000"><formula1>ShiftCodes</formula1>`)
    }
    expect(dv.TimeOff).toContain('sqref="A2:A1000"><formula1>PersonNames</formula1>')
  })

  it('uses inline literal lists for the yes/no and weekday columns, on the columns the headers put them', () => {
    expect(dv.People).toContain('sqref="F2:F1000"><formula1>&quot;yes,no&quot;</formula1>')
    // recurringOff moved to column G when time off became its own sheet.
    expect(dv.People).toContain('sqref="G2:G1000"><formula1>&quot;Sun,Mon,Tue,Wed,Thu,Fri,Sat&quot;</formula1>')
    expect(dv.People).not.toContain('sqref="H2:H1000"')
  })

  it('never validates the reference-only Shifts sheet or the TimeOff date column', () => {
    expect(dv.Shifts).toBeUndefined()
    expect(dv.TimeOff).not.toContain('sqref="B2:B1000"')
  })

  it('never blocks entry, so multi-code cells still import (errors suppressed on every rule)', () => {
    const rules = Object.values(dv).join('')
    const total = [...rules.matchAll(/<dataValidation /g)].length
    expect(total).toBe(9) // Teams 2 + People 6 + TimeOff 1
    expect([...rules.matchAll(/showErrorMessage="0"/g)]).toHaveLength(total)
    expect(rules).not.toContain('showErrorMessage="1"')
  })
})

describe('buildDefinedNames', () => {
  it('defines one auto-sizing OFFSET/COUNTA range per list column', () => {
    const defined = [
      ...buildDefinedNames().matchAll(/<definedName name="([^"]+)">([^<]+)<\/definedName>/g),
    ].map((match): [string, string] => [match[1] ?? '', match[2] ?? ''])
    expect(defined.map(([name]) => name)).toEqual(['ShiftCodes', 'TeamNames', 'PersonNames'])

    const sheetByRange: Record<string, string> = { ShiftCodes: 'Shifts', TeamNames: 'Teams', PersonNames: 'People' }
    for (const [name, formula] of defined) {
      expect(formula).toContain(`${sheetByRange[name]}!$A$2`)
      expect(formula).toContain('OFFSET(')
      expect(formula).toContain('COUNTA(')
    }
  })
})
