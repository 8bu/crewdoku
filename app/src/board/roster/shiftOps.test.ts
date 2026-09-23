import { describe, expect, it } from 'vitest'
import { addShift, deleteShift, isCodeTaken, renameShiftCode, rewriteAssignmentCode } from './shiftOps'
import { defaultCoverageTable, type Assignment, type Person, type ShiftDef, type Team } from '@crewdoku/domain'

const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400' },
  { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true },
]

const TEAMS: Team[] = [{ id: 't1', name: 'Team A', wants: ['NIGHT'], avoids: [] }]

const PEOPLE: Person[] = [
  { id: 'p1', name: 'Anna', teamId: 't1', ineligible: ['NIGHT'], wants: ['EARLY'], avoids: ['NIGHT'] },
]

describe('isCodeTaken', () => {
  it('is case-insensitive', () => {
    expect(isCodeTaken(SHIFTS, 'night')).toBe(true)
    expect(isCodeTaken(SHIFTS, 'SWING')).toBe(false)
  })

  it('excludes the row being edited', () => {
    expect(isCodeTaken(SHIFTS, 'NIGHT', 1)).toBe(false)
  })
})

describe('addShift', () => {
  it('uppercases the code and defaults the label to it when blank', () => {
    const next = addShift(SHIFTS, 'swing', '')
    expect(next.at(-1)).toMatchObject({ code: 'SWING', label: 'SWING' })
  })
})

describe('renameShiftCode', () => {
  it('rewrites the catalog, team wants/avoids, person ineligible/wants/avoids, and coverage rows', () => {
    const coverage = defaultCoverageTable(SHIFTS, 1)
    const result = renameShiftCode(SHIFTS, TEAMS, PEOPLE, coverage, 'NIGHT', 'GRAVEYARD')

    expect(result.shifts.find((s) => s.code === 'GRAVEYARD')).toBeTruthy()
    expect(result.shifts.find((s) => s.code === 'NIGHT')).toBeUndefined()
    expect(result.teams[0]!.wants).toEqual(['GRAVEYARD'])
    expect(result.people[0]!.ineligible).toEqual(['GRAVEYARD'])
    expect(result.people[0]!.avoids).toEqual(['GRAVEYARD'])
    expect(result.people[0]!.wants).toEqual(['EARLY']) // untouched code stays as-is
    expect(result.coverage.byDow[1]!['GRAVEYARD']).toBeTruthy()
    expect(result.coverage.byDow[1]!['NIGHT']).toBeUndefined()
  })

  it('is a no-op when the new code equals the old one', () => {
    const coverage = defaultCoverageTable(SHIFTS, 1)
    const result = renameShiftCode(SHIFTS, TEAMS, PEOPLE, coverage, 'NIGHT', 'NIGHT')
    expect(result.shifts).toEqual(SHIFTS)
  })
})

describe('deleteShift', () => {
  it('removes the row and reassigns every reference to the fallback code', () => {
    const coverage = defaultCoverageTable(SHIFTS, 1)
    const result = deleteShift(SHIFTS, TEAMS, PEOPLE, coverage, 'NIGHT', 'EARLY')

    expect(result.shifts.map((s) => s.code)).toEqual(['EARLY'])
    expect(result.teams[0]!.wants).toEqual(['EARLY'])
    expect(result.people[0]!.ineligible).toEqual(['EARLY'])
    expect(result.people[0]!.avoids).toEqual(['EARLY'])
    expect(result.coverage.byDow[1]!['NIGHT']).toBeUndefined()
    expect(result.coverage.byDow[1]!['EARLY']).toBeTruthy()
  })
})

describe('rewriteAssignmentCode', () => {
  const assignment = (code: string): Assignment => ({ code, start: '2200', end: '0600', pinned: true, ineligible: false })

  it('rewrites every cell on the old code, recomputing times from the new catalog', () => {
    const assignments = new Map([
      ['p1|2026-01-05', assignment('NIGHT')],
      ['p1|2026-01-06', assignment('EARLY')],
    ])
    const next = rewriteAssignmentCode(assignments, SHIFTS, 'NIGHT', 'EARLY')
    expect(next.get('p1|2026-01-05')).toMatchObject({ code: 'EARLY', start: '0600', end: '1400', pinned: true })
    expect(next.get('p1|2026-01-06')).toEqual(assignments.get('p1|2026-01-06')) // untouched cell, same reference
  })
})
