import { describe, expect, it } from 'vitest'
import type { Assignment, Schedule, Workspace } from '@crewdoku/domain'
import {
  assignmentKey,
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  makePeriod,
  makePerson,
  makeTeam,
  OFF_ASSIGNMENT,
} from '@crewdoku/domain'
import {
  exportWorkspaceFile,
  importWorkspaceFile,
  workspaceFileName,
} from './workspaceFile'

function makeRichFixture(): Workspace {
  const alice = makePerson({
    id: 'person-alice',
    name: 'Alice',
    teamId: 'team-ops',
    ineligible: ['NIGHT'],
    timeOff: ['2026-09-01'],
    recurringOff: [0, 6],
    wants: ['EARLY'],
    avoids: ['LATE'],
    useTeamPreference: false,
    removed: false,
  })

  const bob = makePerson({
    id: 'person-bob',
    name: 'Bob',
    teamId: 'team-ops',
    ineligible: ['EARLY', 'MID'],
    timeOff: ['2026-09-02'],
    removed: true,
  })

  const team = makeTeam({
    id: 'team-ops',
    name: 'Operations',
    wants: ['EARLY'],
    avoids: ['NIGHT'],
  })

  const p1 = makePeriod({
    id: 'period-1',
    label: 'Period 1',
    start: '2026-09-01',
    end: '2026-09-07',
  })

  const p2 = makePeriod({
    id: 'period-2',
    label: 'Period 2',
    start: '2026-09-08',
    end: '2026-09-14',
  })

  const s1: Schedule = new Map()
  const s2: Schedule = new Map()

  const pinnedAssignment: Assignment = {
    code: 'EARLY',
    start: '0600',
    end: '1400',
    pinned: true,
    ineligible: false,
  }

  const ineligibleAssignment: Assignment = {
    code: 'NIGHT',
    start: '2200',
    end: '0600',
    pinned: false,
    ineligible: true,
  }

  s1.set(assignmentKey(alice.id, '2026-09-01'), pinnedAssignment)
  s1.set(assignmentKey(bob.id, '2026-09-01'), ineligibleAssignment)
  s1.set(assignmentKey(alice.id, '2026-09-02'), OFF_ASSIGNMENT)

  s2.set(assignmentKey(alice.id, '2026-09-08'), pinnedAssignment)
  s2.set(assignmentKey(bob.id, '2026-09-08'), OFF_ASSIGNMENT)

  const schedules = new Map<string, Schedule>()
  schedules.set(p1.id, s1)
  schedules.set(p2.id, s2)

  const coverage = defaultCoverageTable(DEFAULT_SHIFTS, 2)
  const sundayRow = coverage.byDow[0]
  if (sundayRow !== undefined) {
    sundayRow['EARLY'] = { min: 0, max: Infinity }
  }

  coverage.dateOverrides['2026-09-01'] = {
    EARLY: { min: 1, max: Infinity },
    LATE: { min: 2, max: 5 },
  }

  return {
    people: [alice, bob],
    teams: [team],
    shifts: [...DEFAULT_SHIFTS],
    coverage,
    settings: {
      ...DEFAULT_SOLVE_SETTINGS,
      hardRules: {
        ...DEFAULT_SOLVE_SETTINGS.hardRules,
        maxHoursPerWeek: 48,
      },
    },
    periods: [p1, p2],
    schedules,
  }
}

describe('workspaceFile', () => {
  describe('workspaceFileName', () => {
    it('formats filename with crewdoku prefix and iso date', () => {
      expect(workspaceFileName('2026-09-02')).toBe('crewdoku-workspace-2026-09-02.json')
    })
  })

  describe('exportWorkspaceFile', () => {
    it('pretty-prints JSON with newline and 2-space indentation', () => {
      const fixture = makeRichFixture()
      const exported = exportWorkspaceFile(fixture)

      expect(exported.startsWith('{\n  ')).toBe(true)
      expect(exported).toContain('\n  "schemaVersion": 1,')
      expect(() => JSON.parse(exported)).not.toThrow()
    })
  })

  describe('importWorkspaceFile', () => {
    it('losslessly round-trips a rich workspace including Maps and Infinity bands', () => {
      const fixture = makeRichFixture()
      const exported = exportWorkspaceFile(fixture)
      const result = importWorkspaceFile(exported)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.workspace).toEqual(fixture)
        expect(result.workspace.people).toEqual(fixture.people)
        expect(result.workspace.teams).toEqual(fixture.teams)
        expect(result.workspace.shifts).toEqual(fixture.shifts)
        expect(result.workspace.settings).toEqual(fixture.settings)
        expect(result.workspace.periods).toEqual(fixture.periods)
        expect(result.workspace.coverage).toEqual(fixture.coverage)

        expect([...result.workspace.schedules.keys()].sort()).toEqual(
          [...fixture.schedules.keys()].sort(),
        )

        for (const [periodId, originalSchedule] of fixture.schedules) {
          const restoredSchedule = result.workspace.schedules.get(periodId)
          expect(restoredSchedule).toBeDefined()
          if (restoredSchedule !== undefined) {
            expect([...restoredSchedule.keys()].sort()).toEqual(
              [...originalSchedule.keys()].sort(),
            )
            for (const [cellKey, originalAssignment] of originalSchedule) {
              expect(restoredSchedule.get(cellKey)).toEqual(originalAssignment)
            }
          }
        }
      }
    })

    it('returns not-json for corrupted text', () => {
      const result = importWorkspaceFile('{not json')
      expect(result).toEqual({
        ok: false,
        reason: 'not-json',
        message: 'This file is not a Crewdoku workspace file.',
      })
    })

    it('returns not-a-workspace for valid JSON non-workspace objects', () => {
      const result = importWorkspaceFile('{"a":1}')
      expect(result).toEqual({
        ok: false,
        reason: 'not-a-workspace',
        message: 'This file does not contain a Crewdoku workspace.',
      })
    })

    it('returns newer-schema when schemaVersion is greater than 1', () => {
      const result = importWorkspaceFile(JSON.stringify({ schemaVersion: 2 }))
      expect(result).toEqual({
        ok: false,
        reason: 'newer-schema',
        message: 'This file was made by a newer version of Crewdoku. Update the app to open it.',
      })
    })

    it('returns newer-schema for a full workspace payload with newer schemaVersion', () => {
      const fixture = makeRichFixture()
      const text = exportWorkspaceFile(fixture).replace(
        '"schemaVersion": 1',
        '"schemaVersion": 2',
      )
      const result = importWorkspaceFile(text)
      expect(result).toEqual({
        ok: false,
        reason: 'newer-schema',
        message: 'This file was made by a newer version of Crewdoku. Update the app to open it.',
      })
    })

    it('returns not-a-workspace when schemaVersion is 1 but payload is invalid', () => {
      const result = importWorkspaceFile(JSON.stringify({ schemaVersion: 1 }))
      expect(result).toEqual({
        ok: false,
        reason: 'not-a-workspace',
        message: 'This file does not contain a Crewdoku workspace.',
      })
    })
  })
})
