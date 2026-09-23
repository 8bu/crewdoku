import { describe, expect, it } from 'vitest'
import {
  buildGridCsv,
  buildPersonCsv,
  buildPersonRows,
  exportFileName,
  type ExportInputs,
} from './exportCsv'
import {
  UNASSIGNED_TEAM_ID,
  type Assignment,
  type Person,
  type ShiftDef,
  type Team,
} from '@crewdoku/domain'
import { emptyBoardData } from '../board/mockBoard'
import { parseScheduleCsv } from '../board/roster/scheduleImport'

function makeAssignment(code: string, start: string | null = null, end: string | null = null): Assignment {
  return {
    code,
    start,
    end,
    pinned: false,
    ineligible: false,
  }
}

describe('exportCsv', () => {
  const dates = emptyBoardData('2024-01-01', 3).dates
  const teams: Team[] = [
    { id: 't1', name: 'Alpha', wants: [], avoids: [] },
    { id: 't2', name: 'Bravo', wants: [], avoids: [] },
  ]
  const shifts: ShiftDef[] = [
    { code: 'EARLY', label: 'Early', start: '0800', end: '1600' },
    { code: 'MID', label: 'Mid', start: '1200', end: '2000' },
    { code: 'LATE', label: 'Late', start: '1600', end: '0000' },
    { code: 'NIGHT', label: 'Night', start: '0000', end: '0800' },
  ]

  it('generates exact grid CSV for 2 teams + 1 unassigned person with blank OFF cells', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Alice', teamId: 't1', ineligible: [] },
      { id: 'p2', name: 'Bob', teamId: 't2', ineligible: [] },
      { id: 'p3', name: 'Charlie', teamId: UNASSIGNED_TEAM_ID, ineligible: [] },
    ]

    const assignmentMap: Record<string, Assignment> = {
      'p1:2024-01-01': makeAssignment('EARLY'),
      'p1:2024-01-02': makeAssignment('MID'),
      'p1:2024-01-03': makeAssignment('OFF'),

      'p2:2024-01-01': makeAssignment('OFF'),
      'p2:2024-01-02': makeAssignment('LATE'),
      'p2:2024-01-03': makeAssignment('EARLY'),

      'p3:2024-01-01': makeAssignment('MID'),
      'p3:2024-01-02': makeAssignment('OFF'),
      'p3:2024-01-03': makeAssignment('MID'),
    }

    const inputs: ExportInputs = {
      people,
      teams,
      shifts,
      dates,
      getAssignment: (personId, dateIso) => assignmentMap[`${personId}:${dateIso}`] ?? makeAssignment('OFF'),
    }

    const csv = buildGridCsv(inputs)
    const expected = [
      'name,team,2024-01-01,2024-01-02,2024-01-03',
      'Alice,Alpha,EARLY,MID,',
      'Bob,Bravo,,LATE,EARLY',
      'Charlie,,MID,,MID',
    ].join('\n') + '\n'

    expect(csv).toBe(expected)
  })

  it('round-trips grid CSV through parseScheduleCsv without errors and preserves non-OFF codes', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Alice', teamId: 't1', ineligible: [] },
      { id: 'p2', name: 'Bob', teamId: 't2', ineligible: [] },
      { id: 'p3', name: 'Charlie', teamId: UNASSIGNED_TEAM_ID, ineligible: [] },
    ]

    const assignmentMap: Record<string, Assignment> = {
      'p1:2024-01-01': makeAssignment('EARLY'),
      'p1:2024-01-02': makeAssignment('MID'),
      'p1:2024-01-03': makeAssignment('OFF'),

      'p2:2024-01-01': makeAssignment('OFF'),
      'p2:2024-01-02': makeAssignment('LATE'),
      'p2:2024-01-03': makeAssignment('EARLY'),

      'p3:2024-01-01': makeAssignment('MID'),
      'p3:2024-01-02': makeAssignment('OFF'),
      'p3:2024-01-03': makeAssignment('MID'),
    }

    const inputs: ExportInputs = {
      people,
      teams,
      shifts,
      dates,
      getAssignment: (personId, dateIso) => assignmentMap[`${personId}:${dateIso}`] ?? makeAssignment('OFF'),
    }

    const csv = buildGridCsv(inputs)
    const parsed = parseScheduleCsv(csv)

    expect(parsed.errors).toEqual([])
    expect(parsed.dates).toEqual(['2024-01-01', '2024-01-02', '2024-01-03'])
    expect(parsed.rows).toEqual([
      {
        name: 'Alice',
        team: 'Alpha',
        codesByDate: {
          '2024-01-01': 'EARLY',
          '2024-01-02': 'MID',
        },
      },
      {
        name: 'Bob',
        team: 'Bravo',
        codesByDate: {
          '2024-01-02': 'LATE',
          '2024-01-03': 'EARLY',
        },
      },
      {
        name: 'Charlie',
        team: '',
        codesByDate: {
          '2024-01-01': 'MID',
          '2024-01-03': 'MID',
        },
      },
    ])
  })

  it('generates exact per-person CSV with 8.5h shift and cross-midnight shift, skipping OFF days', () => {
    const customShifts: ShiftDef[] = [
      { code: 'DAY', label: 'Day Shift', start: '0830', end: '1700' },
      { code: 'OVERNIGHT', label: 'Overnight Shift', start: '2200', end: '0600' },
    ]

    const people: Person[] = [
      { id: 'p1', name: 'Dana', teamId: 't1', ineligible: [] },
    ]

    const assignmentMap: Record<string, Assignment> = {
      'p1:2024-01-01': makeAssignment('DAY'),
      'p1:2024-01-02': makeAssignment('OFF'),
      'p1:2024-01-03': makeAssignment('OVERNIGHT'),
    }

    const inputs: ExportInputs = {
      people,
      teams,
      shifts: customShifts,
      dates,
      getAssignment: (personId, dateIso) => assignmentMap[`${personId}:${dateIso}`] ?? makeAssignment('OFF'),
    }

    const csv = buildPersonCsv(inputs)
    const expected = [
      'name,team,date,shift,start,end,hours',
      'Dana,Alpha,2024-01-01,DAY,08:30,17:00,8.5',
      'Dana,Alpha,2024-01-03,OVERNIGHT,22:00,06:00,8',
    ].join('\n') + '\n'

    expect(csv).toBe(expected)
  })

  it('keeps hours numeric in buildPersonRows so XLSX gets real number cells', () => {
    const customShifts: ShiftDef[] = [
      { code: 'DAY', label: 'Day Shift', start: '0830', end: '1700' },
    ]
    const people: Person[] = [
      { id: 'p1', name: 'Dana', teamId: 't1', ineligible: [] },
    ]
    const inputs: ExportInputs = {
      people,
      teams,
      shifts: customShifts,
      dates,
      getAssignment: (_personId, dateIso) =>
        dateIso === '2024-01-01' ? makeAssignment('DAY') : makeAssignment('OFF'),
    }

    const rows = buildPersonRows(inputs)
    expect(rows).toEqual([
      ['name', 'team', 'date', 'shift', 'start', 'end', 'hours'],
      ['Dana', 'Alpha', '2024-01-01', 'DAY', '08:30', '17:00', 8.5],
    ])
  })

  it('escapes fields with commas and double quotes correctly per RFC 4180', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Smith, John', teamId: 't1', ineligible: [] },
      { id: 'p2', name: 'Jane "Doc" Doe', teamId: 't2', ineligible: [] },
    ]

    const assignmentMap: Record<string, Assignment> = {
      'p1:2024-01-01': makeAssignment('EARLY'),
      'p2:2024-01-01': makeAssignment('MID'),
    }

    const inputs: ExportInputs = {
      people,
      teams,
      shifts,
      dates: dates.slice(0, 1),
      getAssignment: (personId, dateIso) => assignmentMap[`${personId}:${dateIso}`] ?? makeAssignment('OFF'),
    }

    const gridCsv = buildGridCsv(inputs)
    expect(gridCsv).toBe(
      'name,team,2024-01-01\n"Smith, John",Alpha,EARLY\n"Jane ""Doc"" Doe",Bravo,MID\n',
    )

    const personCsv = buildPersonCsv(inputs)
    expect(personCsv).toBe(
      'name,team,date,shift,start,end,hours\n' +
        '"Smith, John",Alpha,2024-01-01,EARLY,08:00,16:00,8\n' +
        '"Jane ""Doc"" Doe",Bravo,2024-01-01,MID,12:00,20:00,8\n',
    )
  })

  it('excludes soft-removed people from both grid and per-person exports', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Alice', teamId: 't1', ineligible: [] },
      { id: 'p2', name: 'Removed Person', teamId: 't1', ineligible: [], removed: true },
    ]

    const inputs: ExportInputs = {
      people,
      teams,
      shifts,
      dates: dates.slice(0, 1),
      getAssignment: () => makeAssignment('EARLY'),
    }

    const gridCsv = buildGridCsv(inputs)
    expect(gridCsv).not.toContain('Removed Person')
    expect(gridCsv).toContain('Alice')

    const personCsv = buildPersonCsv(inputs)
    expect(personCsv).not.toContain('Removed Person')
    expect(personCsv).toContain('Alice')
  })

  it('formats export file names with slugified period labels and falls back to period', () => {
    expect(exportFileName('Period 1', 'grid')).toBe('crewdoku-period-1-grid.csv')
    expect(exportFileName('Period 1', 'per-person')).toBe('crewdoku-period-1-per-person.csv')
    expect(exportFileName('Q1 2024 (Draft)', 'grid')).toBe('crewdoku-q1-2024-draft-grid.csv')
    expect(exportFileName('', 'grid')).toBe('crewdoku-period-grid.csv')
    expect(exportFileName('---', 'grid')).toBe('crewdoku-period-grid.csv')
    expect(exportFileName('!@#$', 'per-person')).toBe('crewdoku-period-per-person.csv')
  })

  it('formats xlsx file names with the ext parameter', () => {
    expect(exportFileName('Period 1', 'grid', 'xlsx')).toBe('crewdoku-period-1-grid.xlsx')
  })
})
