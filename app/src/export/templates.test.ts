import { describe, expect, it } from 'vitest'
import { buildTemplateRows } from './templates'
import { type ExportInputs } from './exportCsv'
import {
  UNASSIGNED_TEAM_ID,
  type Assignment,
  type Person,
  type ShiftDef,
  type Team,
} from '@crewdoku/domain'
import { emptyBoardData } from '../board/mockBoard'

function makeAssignment(code: string): Assignment {
  return {
    code,
    start: null,
    end: null,
    pinned: false,
    ineligible: false,
  }
}

describe('export templates', () => {
  const dates = emptyBoardData('2024-01-01', 3).dates

  const teams: Team[] = [
    { id: 't1', name: 'Alpha', wants: [], avoids: [] },
    { id: 't_empty', name: 'Empty', wants: [], avoids: [] },
    { id: 't2', name: 'Bravo', wants: [], avoids: [] },
  ]

  const shifts: ShiftDef[] = [
    { code: 'EARLY', label: 'Early', start: '0800', end: '1600' },
    { code: 'MID', label: 'Mid', start: '1200', end: '2000' },
    { code: 'LATE', label: 'Late', start: '1600', end: '0000' },
    { code: 'NIGHT', label: 'Night', start: '0000', end: '0800' },
    { code: 'OFF', label: 'Off', start: '', end: '' },
  ]

  const people: Person[] = [
    { id: 'p1', name: 'Alice', teamId: 't1', ineligible: [] },
    { id: 'p2', name: 'Bob', teamId: 't1', ineligible: [] },
    { id: 'p3', name: 'Charlie', teamId: 't2', ineligible: [] },
    { id: 'p4', name: 'Dan', teamId: UNASSIGNED_TEAM_ID, ineligible: [] },
    { id: 'p5', name: 'Eve', teamId: 'unresolved_team', ineligible: [] },
    { id: 'p6', name: 'Frank', teamId: 't1', ineligible: [], removed: true },
  ]

  const assignmentMap: Record<string, Assignment> = {
    'p1:2024-01-01': makeAssignment('EARLY'),
    'p1:2024-01-02': makeAssignment('MID'),
    'p1:2024-01-03': makeAssignment('OFF'),

    'p2:2024-01-01': makeAssignment('OFF'),
    'p2:2024-01-02': makeAssignment('LATE'),
    'p2:2024-01-03': makeAssignment('EARLY'),

    'p3:2024-01-01': makeAssignment('NIGHT'),
    'p3:2024-01-02': makeAssignment('OFF'),
    'p3:2024-01-03': makeAssignment('NIGHT'),

    'p4:2024-01-01': makeAssignment('MID'),
    'p4:2024-01-02': makeAssignment('OFF'),
    'p4:2024-01-03': makeAssignment('MID'),

    'p5:2024-01-01': makeAssignment('OFF'),
    'p5:2024-01-02': makeAssignment('EARLY'),
    'p5:2024-01-03': makeAssignment('OFF'),

    'p6:2024-01-01': makeAssignment('EARLY'),
    'p6:2024-01-02': makeAssignment('EARLY'),
    'p6:2024-01-03': makeAssignment('EARLY'),
  }

  const inputs: ExportInputs = {
    people,
    teams,
    shifts,
    dates,
    getAssignment: (personId, dateIso) => assignmentMap[`${personId}:${dateIso}`] ?? makeAssignment('OFF'),
  }

  it('builds exact matrix for board template: team headers, skipped empty team, unassigned last, OFF blank', () => {
    const rows = buildTemplateRows('board', inputs)
    const expected = [
      ['name', '2024-01-01', '2024-01-02', '2024-01-03'],
      ['Alpha', '', '', ''],
      ['Alice', 'EARLY', 'MID', ''],
      ['Bob', '', 'LATE', 'EARLY'],
      ['Bravo', '', '', ''],
      ['Charlie', 'NIGHT', '', 'NIGHT'],
      ['Unassigned', '', '', ''],
      ['Dan', 'MID', '', 'MID'],
      ['Eve', '', 'EARLY', ''],
    ]

    expect(rows).toEqual(expected)
  })

  it('skips the Unassigned section in board layout when no unassigned members exist', () => {
    const assignedOnlyInputs: ExportInputs = {
      ...inputs,
      people: [
        { id: 'p1', name: 'Alice', teamId: 't1', ineligible: [] },
        { id: 'p3', name: 'Charlie', teamId: 't2', ineligible: [] },
      ],
    }

    const rows = buildTemplateRows('board', assignedOnlyInputs)
    const expected = [
      ['name', '2024-01-01', '2024-01-02', '2024-01-03'],
      ['Alpha', '', '', ''],
      ['Alice', 'EARLY', 'MID', ''],
      ['Bravo', '', '', ''],
      ['Charlie', 'NIGHT', '', 'NIGHT'],
    ]

    expect(rows).toEqual(expected)
  })

  it('builds exact matrix for coverage-pivot: headcount per shift per day excluding OFF code', () => {
    const rows = buildTemplateRows('coverage-pivot', inputs)
    const expected = [
      ['shift', '2024-01-01', '2024-01-02', '2024-01-03'],
      ['EARLY', 1, 1, 1],
      ['MID', 1, 1, 1],
      ['LATE', 0, 1, 0],
      ['NIGHT', 1, 0, 1],
    ]

    expect(rows).toEqual(expected)
  })
})
