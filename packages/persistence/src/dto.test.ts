import { describe, expect, it } from 'vitest'
import type { Assignment, CoverageTable, Schedule, Tag, TagGroup, Workspace } from '@crewdoku/domain'
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
    tagIds: ['tag-spanish'],
  })

  const bob = makePerson({
    id: 'person-bob',
    name: 'Bob',
    teamId: 'team-ops',
    ineligible: ['EARLY', 'MID'],
    timeOff: ['2026-09-02'],
    removed: true,
    tagIds: ['tag-student'],
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

  // One tag group holding a tag with every `TagWhen` variant on its rule lines,
  // plus a loose tag with none.
  const tagGroups: TagGroup[] = [{ id: 'taggroup-lang', name: 'Languages', exclusive: true }]
  const tags: Tag[] = [
    {
      id: 'tag-spanish',
      name: 'Spanish',
      groupId: 'taggroup-lang',
      rules: [
        { id: 'rule-always', kind: 'want', shift: 'EARLY', when: { type: 'always' } },
        { id: 'rule-date', kind: 'avoid', shift: null, when: { type: 'date', iso: '2026-09-03' } },
        { id: 'rule-weekly', kind: 'avoid', shift: 'NIGHT', when: { type: 'weekly', weekdays: [0, 6] } },
        { id: 'rule-monthly-day', kind: 'want', shift: 'MID', when: { type: 'monthlyDay', day: 15 } },
        {
          id: 'rule-monthly-nth',
          kind: 'avoid',
          shift: 'LATE',
          when: { type: 'monthlyNth', nth: -1, weekday: 5 },
          strict: true,
        },
        { id: 'rule-yearly', kind: 'avoid', shift: 'EARLY', when: { type: 'yearly', month: 12, day: 25 } },
      ],
    },
    { id: 'tag-student', name: 'Student', rules: [] },
  ]

  const tagCoverage: Record<string, CoverageTable> = {
    'tag-spanish': {
      byDow: { 1: { MID: { min: 1, max: Infinity } } },
      dateOverrides: { '2026-09-02': { EARLY: { min: 2, max: 3 } } },
    },
  }

  return {
    people: [alice, bob],
    teams: [team],
    tagGroups,
    tags,
    shifts: [...DEFAULT_SHIFTS],
    coverage,
    tagCoverage,
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
    expect(restored.tagGroups).toEqual(fixture.tagGroups)
    expect(restored.tags).toEqual(fixture.tags)
    expect(restored.shifts).toEqual(fixture.shifts)
    expect(restored.settings).toEqual(fixture.settings)
    expect(restored.periods).toEqual(fixture.periods)
    expect(restored.coverage).toEqual(fixture.coverage)

    // Tags survive in full: rule lines, person membership, and the per-tag
    // band table with its Infinity ceiling.
    expect(restored.tags[0]?.rules.map((rule) => rule.when.type)).toEqual([
      'always',
      'date',
      'weekly',
      'monthlyDay',
      'monthlyNth',
      'yearly',
    ])
    expect(restored.people[0]?.tagIds).toEqual(['tag-spanish'])
    expect(restored.people[1]?.tagIds).toEqual(['tag-student'])
    expect(restored.tagCoverage['tag-spanish']?.byDow[1]?.['MID']).toEqual({ min: 1, max: Infinity })
    expect(restored.tagCoverage['tag-spanish']?.dateOverrides['2026-09-02']?.['EARLY']).toEqual({
      min: 2,
      max: 3,
    })

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

    it('loads a v1 blob written before tags, with empty tags and migrated settings', () => {
      const dto = toWorkspaceDTO(makeRichFixture())
      // Exactly what an older build wrote: no tag fields at all, and rule
      // settings that predate H6/H7/S6.
      const legacy = {
        schemaVersion: 1,
        people: dto.people,
        teams: dto.teams,
        shifts: dto.shifts,
        coverage: dto.coverage,
        settings: {
          hardRules: {
            enabled: { H1: true, H2: true, H3: false, H5: true },
            maxHoursPerWeek: 40,
            minRestHours: 11,
          },
          softGoalOrder: ['S1', 'S2', 'S3', 'S4', 'S5'],
          softGoalEnabled: { S1: true, S2: false, S3: true, S4: true, S5: true },
        },
        periods: dto.periods,
        schedules: dto.schedules,
      }

      const migrated = migrate(legacy)
      expect(migrated).not.toBeNull()
      if (migrated === null) return
      const workspace = fromWorkspaceDTO(migrated)

      expect(workspace.tagGroups).toEqual([])
      expect(workspace.tags).toEqual([])
      expect(workspace.tagCoverage).toEqual({})
      expect(workspace.people).toEqual(dto.people)

      // The new rules arrive enabled, ranked as the defaults rank them; the
      // planner's own toggles survive untouched.
      expect(workspace.settings.hardRules.enabled.H6).toBe(true)
      expect(workspace.settings.hardRules.enabled.H7).toBe(true)
      expect(workspace.settings.hardRules.enabled.H3).toBe(false)
      expect(workspace.settings.softGoalOrder).toEqual(['S1', 'S6', 'S2', 'S3', 'S4', 'S5'])
      expect(workspace.settings.softGoalEnabled.S6).toBe(true)
      expect(workspace.settings.softGoalEnabled.S2).toBe(false)
    })

    it('appends S6 when a stored order has no S2 to sit before', () => {
      const dto = toWorkspaceDTO(makeRichFixture())
      const migrated = migrate({
        ...dto,
        settings: { ...dto.settings, softGoalOrder: ['S1', 'S3', 'S4', 'S5'] },
      })
      expect(migrated?.settings.softGoalOrder).toEqual(['S1', 'S3', 'S4', 'S5', 'S6'])
    })

    it('rejects malformed tag fields rather than dropping them', () => {
      const dto = toWorkspaceDTO(makeRichFixture())
      const malformed: Record<string, unknown>[] = [
        { tagGroups: 'languages' },
        { tagGroups: [{ id: 'taggroup-lang' }] },
        { tags: { 'tag-spanish': {} } },
        { tags: [{ id: 'tag-spanish', name: 'Spanish' }] },
        { tagCoverage: [] },
        { tagCoverage: { 'tag-spanish': {} } },
        { tagCoverage: { 'tag-spanish': { byDow: {}, dateOverrides: 0 } } },
      ]
      for (const patch of malformed) {
        expect(migrate({ ...dto, ...patch })).toBeNull()
      }
    })

    it('fills missing tag fields on migrate so readers never see undefined', () => {
      const dto = toWorkspaceDTO(makeRichFixture())
      const migrated = migrate({
        schemaVersion: 1,
        people: dto.people,
        teams: dto.teams,
        shifts: dto.shifts,
        coverage: dto.coverage,
        settings: dto.settings,
        periods: dto.periods,
        schedules: dto.schedules,
      })
      expect(migrated?.tagGroups).toEqual([])
      expect(migrated?.tags).toEqual([])
      expect(migrated?.tagCoverage).toEqual({})
    })
  })
})
