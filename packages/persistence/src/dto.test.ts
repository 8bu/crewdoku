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
import { fromWorkspaceDTO, migrate, toWorkspaceDTO } from './dto'

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
  // Add Infinity max band to test Infinity handling
  const sundayRow = coverage.byDow[0]
  if (sundayRow !== undefined) {
    sundayRow['EARLY'] = { min: 0, max: Infinity }
  }

  // Add date override with Infinity and finite values
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

describe('WorkspaceDTO', () => {
  it('losslessly round-trips a rich fixture including Map key sets and Infinity bands', () => {
    const fixture = makeRichFixture()
    const dto = toWorkspaceDTO(fixture)
    const restored = fromWorkspaceDTO(dto)

    expect(restored.people).toEqual(fixture.people)
    expect(restored.teams).toEqual(fixture.teams)
    expect(restored.shifts).toEqual(fixture.shifts)
    expect(restored.settings).toEqual(fixture.settings)
    expect(restored.periods).toEqual(fixture.periods)
    expect(restored.coverage).toEqual(fixture.coverage)

    // Schedule Map key sets and assignments match exactly
    expect([...restored.schedules.keys()].sort()).toEqual([...fixture.schedules.keys()].sort())

    for (const [periodId, originalSchedule] of fixture.schedules) {
      const restoredSchedule = restored.schedules.get(periodId)
      expect(restoredSchedule).toBeDefined()
      if (restoredSchedule !== undefined) {
        expect([...restoredSchedule.keys()].sort()).toEqual([...originalSchedule.keys()].sort())
        for (const [cellKey, originalAssignment] of originalSchedule) {
          expect(restoredSchedule.get(cellKey)).toEqual(originalAssignment)
        }
      }
    }

    expect(restored).toEqual(fixture)
  })

  it('encodes Infinity as null in DTO and decodes null back to Infinity', () => {
    const fixture = makeRichFixture()
    const dto = toWorkspaceDTO(fixture)

    // Verify DTO encoding in JSON-safe format
    const sundayRowDTO = dto.coverage.byDow[0]
    expect(sundayRowDTO).toBeDefined()
    if (sundayRowDTO !== undefined) {
      const earlyBand = sundayRowDTO['EARLY']
      expect(earlyBand).toBeDefined()
      if (earlyBand !== undefined) {
        expect(earlyBand.max).toBeNull()
      }
    }

    const overrideRowDTO = dto.coverage.dateOverrides['2026-09-01']
    expect(overrideRowDTO).toBeDefined()
    if (overrideRowDTO !== undefined) {
      const earlyBand = overrideRowDTO['EARLY']
      expect(earlyBand).toBeDefined()
      if (earlyBand !== undefined) {
        expect(earlyBand.max).toBeNull()
      }
      const lateBand = overrideRowDTO['LATE']
      expect(lateBand).toBeDefined()
      if (lateBand !== undefined) {
        expect(lateBand.max).toBe(5)
      }
    }

    // Also verify JSON stringify produces null, not dropped
    const json = JSON.stringify(dto)
    const parsed = JSON.parse(json) as typeof dto
    expect(parsed.coverage.byDow[0]?.['EARLY']?.max).toBeNull()

    // Restores back to Infinity
    const restored = fromWorkspaceDTO(dto)
    expect(restored.coverage.byDow[0]?.['EARLY']?.max).toBe(Infinity)
    expect(restored.coverage.dateOverrides['2026-09-01']?.['EARLY']?.max).toBe(Infinity)
    expect(restored.coverage.dateOverrides['2026-09-01']?.['LATE']?.max).toBe(5)
  })

  describe('migrate', () => {
    it('accepts a valid v1 object', () => {
      const fixture = makeRichFixture()
      const dto = toWorkspaceDTO(fixture)
      const migrated = migrate(dto)
      expect(migrated).not.toBeNull()
      expect(migrated).toEqual(dto)
    })

    it('rejects schemaVersion 2 and returns null', () => {
      const fixture = makeRichFixture()
      const dto = { ...toWorkspaceDTO(fixture), schemaVersion: 2 }
      expect(migrate(dto)).toBeNull()
    })

    it('rejects garbage and non-object inputs', () => {
      expect(migrate(null)).toBeNull()
      expect(migrate(undefined)).toBeNull()
      expect(migrate('string')).toBeNull()
      expect(migrate(42)).toBeNull()
      expect(migrate([])).toBeNull()
      expect(migrate({})).toBeNull()
      expect(migrate({ schemaVersion: 1 })).toBeNull()
      expect(
        migrate({
          schemaVersion: 1,
          people: 'not an array',
          teams: [],
          shifts: [],
          coverage: {},
          settings: {},
          periods: [],
          schedules: [],
        }),
      ).toBeNull()
    })
  })
})
