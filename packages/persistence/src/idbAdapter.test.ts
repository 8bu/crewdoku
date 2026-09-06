import 'fake-indexeddb/auto'
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
import { IdbWorkspaceStorage } from './idbAdapter'
import * as PersistenceModule from './index'

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

describe('IdbWorkspaceStorage', () => {
  it('exports expected symbols from the package index', () => {
    expect(typeof PersistenceModule.IdbWorkspaceStorage).toBe('function')
    expect(typeof PersistenceModule.toWorkspaceDTO).toBe('function')
    expect(typeof PersistenceModule.fromWorkspaceDTO).toBe('function')
    expect(typeof PersistenceModule.migrate).toBe('function')
  })

  it('save then load round-trips the rich fixture bit-for-bit (deep equal incl. Map key sets)', async () => {
    const fixture = makeRichFixture()
    const storage = new IdbWorkspaceStorage('crewdoku-roundtrip-test')

    await storage.save(fixture)
    const loaded = await storage.load()

    expect(loaded).not.toBeNull()
    if (loaded !== null) {
      expect(loaded.people).toEqual(fixture.people)
      expect(loaded.teams).toEqual(fixture.teams)
      expect(loaded.shifts).toEqual(fixture.shifts)
      expect(loaded.settings).toEqual(fixture.settings)
      expect(loaded.periods).toEqual(fixture.periods)
      expect(loaded.coverage).toEqual(fixture.coverage)

      // Map key sets and assignments preserved exactly
      expect([...loaded.schedules.keys()].sort()).toEqual([...fixture.schedules.keys()].sort())

      for (const [periodId, originalSchedule] of fixture.schedules) {
        const loadedSchedule = loaded.schedules.get(periodId)
        expect(loadedSchedule).toBeDefined()
        if (loadedSchedule !== undefined) {
          expect([...loadedSchedule.keys()].sort()).toEqual([...originalSchedule.keys()].sort())
          for (const [cellKey, originalAssignment] of originalSchedule) {
            expect(loadedSchedule.get(cellKey)).toEqual(originalAssignment)
          }
        }
      }

      expect(loaded).toEqual(fixture)
    }
  })

  it('load() on a fresh distinct db name returns null (first-run signal)', async () => {
    const freshStorage = new IdbWorkspaceStorage('crewdoku-fresh-db-' + Date.now())
    const result = await freshStorage.load()
    expect(result).toBeNull()
  })

  it('a second save overwrites (load returns the newer workspace)', async () => {
    const fixture1 = makeRichFixture()
    const storage = new IdbWorkspaceStorage('crewdoku-overwrite-test')

    await storage.save(fixture1)

    const fixture2: Workspace = {
      ...fixture1,
      people: [
        ...fixture1.people,
        makePerson({ id: 'person-charlie', name: 'Charlie', teamId: 'team-ops' }),
      ],
    }

    await storage.save(fixture2)

    const loaded = await storage.load()
    expect(loaded).not.toBeNull()
    if (loaded !== null) {
      expect(loaded.people.length).toBe(3)
      expect(loaded.people[2]?.name).toBe('Charlie')
      expect(loaded).toEqual(fixture2)
    }
  })
})
