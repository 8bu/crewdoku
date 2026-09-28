import { describe, expect, it } from 'vitest'
import {
  UNASSIGNED_TEAM_ID,
  type Person,
  type ShiftDef,
  type Tag,
  type TagGroup,
  type Team,
} from '@crewdoku/domain'
import { applyBatchImport, parseWorkbook, type BatchImportParse } from './batchImport'

/** Deliberately mixed-case codes so a test can tell catalog casing from input casing. */
const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400' },
  { code: 'Late', label: 'Late', start: '1400', end: '2200' },
]

/** The cases below cover no tags at all, so they run against the empty catalog. */
const NO_TAGS: { tagGroups: TagGroup[]; tags: Tag[] } = { tagGroups: [], tags: [] }
const apply = (people: Person[], teams: Team[], parse: BatchImportParse) =>
  applyBatchImport(people, teams, SHIFTS, parse, NO_TAGS)

describe('parseWorkbook', () => {
  it('reads a People sheet whose name and headers vary in case', () => {
    const parse = parseWorkbook({ PEOPLE: [['NAME', 'TEAM'], ['Alice', 'Frontline']] })
    expect(parse.errors).toEqual([])
    expect(parse.warnings).toEqual([])
    expect(parse.people).toEqual([{ name: 'Alice', team: 'Frontline' }])
    expect(parse.teams).toEqual([])
  })

  it('takes Roster as the People sheet and omits blank cells', () => {
    const parse = parseWorkbook({ Roster: [['name', 'team'], ['Bob', '']] })
    expect(parse.people).toEqual([{ name: 'Bob' }])
  })

  it('reads a Teams sheet, leaving a blank preference cell out', () => {
    const parse = parseWorkbook({
      Teams: [['Name', 'Wants', 'Avoids'], ['Frontline', 'EARLY; late', '']],
    })
    expect(parse.teams).toEqual([{ name: 'Frontline', wants: ['EARLY', 'late'] }])
    expect(parse.errors).toEqual([])
  })

  it('ignores a reference-only Shifts sheet', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Alice']],
      Shifts: [['code', 'label', 'start', 'end'], ['EARLY', 'Early', '0600', '1400']],
    })
    expect(parse.errors).toEqual([])
    expect(parse.people).toEqual([{ name: 'Alice' }])
  })

  it('splits one list cell on commas, semicolons and whitespace without deduping', () => {
    const parse = parseWorkbook({
      People: [
        ['name', 'wants', 'avoids', 'ineligible'],
        ['Alice', 'EARLY, Late; EARLY', 'Late EARLY', 'EARLY,late'],
      ],
    })
    expect(parse.people).toEqual([
      {
        name: 'Alice',
        wants: ['EARLY', 'Late', 'EARLY'],
        avoids: ['Late', 'EARLY'],
        ineligible: ['EARLY', 'late'],
      },
    ])
  })

  it('reads an explicit useTeamPreference and leaves a blank cell undefined', () => {
    const parse = parseWorkbook({
      People: [
        ['name', 'useTeamPreference'],
        ['Alice', 'Yes'],
        ['Bob', 'n'],
        ['Carol', 'FALSE'],
        ['Dave', 'x'],
        ['Erin', ''],
      ],
    })
    expect(parse.people).toEqual([
      { name: 'Alice', useTeamPreference: true },
      { name: 'Bob', useTeamPreference: false },
      { name: 'Carol', useTeamPreference: false },
      { name: 'Dave', useTeamPreference: true },
      { name: 'Erin' },
    ])
  })

  it('parses weekday tokens and digits, warning on anything else', () => {
    const parse = parseWorkbook({
      People: [
        ['name', 'recurringOff'],
        ['Alice', 'sun Mon 5 SUNDAY'],
        ['Bob', '7 funday'],
        ['Carol', 'saturday,3'],
      ],
    })
    expect(parse.people).toEqual([
      { name: 'Alice', recurringOff: [0, 1, 5] },
      { name: 'Bob' },
      { name: 'Carol', recurringOff: [6, 3] },
    ])
    expect(parse.warnings).toEqual([
      { kind: 'badWeekday', row: 3, value: '7' },
      { kind: 'badWeekday', row: 3, value: 'funday' },
    ])
  })

  it('reads the TimeOff sheet as raw person/date rows', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TimeOff: [
        ['person', 'date'],
        ['Ada', '2026-01-05'],
        ['', '2026-01-09'],
        ['Ada', '2026-02-30'],
      ],
    })
    expect(parse.timeOff).toEqual([
      { person: 'Ada', date: '2026-01-05' },
      { person: 'Ada', date: '2026-02-30' },
    ])
    expect(parse.warnings).toEqual([])
  })

  it('takes the TimeOff sheet by either alias and a name column for person', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      'Time off': [
        ['name', 'date'],
        ['Ada', '2026-01-05'],
      ],
    })
    expect(parse.timeOff).toEqual([{ person: 'Ada', date: '2026-01-05' }])
  })

  it('skips a TimeOff sheet with neither a person nor a name column', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TimeOff: [
        ['who', 'date'],
        ['Ada', '2026-01-05'],
      ],
    })
    expect(parse.timeOff).toEqual([])
    expect(parse.errors).toEqual([])
    expect(parse.people).toEqual([{ name: 'Ada' }])
  })

  it('returns an empty timeOff list for a workbook with no TimeOff sheet', () => {
    const parse = parseWorkbook({ People: [['name'], ['Alice']] })
    expect(parse.timeOff).toEqual([])
    expect(parse.errors).toEqual([])
  })

  it('takes the first non-empty row as the header and skips blank names', () => {
    const parse = parseWorkbook({
      People: [[], ['name', 'recurringOff'], ['Alice', 'mon'], ['', 'sun'], [''], ['Bob', 'nope']],
    })
    expect(parse.people).toEqual([{ name: 'Alice', recurringOff: [1] }, { name: 'Bob' }])
    // Bob sits on spreadsheet row 6 — blank and name-less rows still count.
    expect(parse.warnings).toEqual([{ kind: 'badWeekday', row: 6, value: 'nope' }])
  })

  it('reports a recognized sheet with no name column and skips only that sheet', () => {
    const parse = parseWorkbook({
      Teams: [['label'], ['Frontline']],
      People: [['name'], ['Alice']],
    })
    expect(parse.errors).toEqual([{ kind: 'missingNameHeader', sheet: 'Teams' }])
    expect(parse.teams).toEqual([])
    expect(parse.people).toEqual([{ name: 'Alice' }])
  })

  it('reports both sheets when neither has a name column', () => {
    const parse = parseWorkbook({
      People: [['person'], ['Alice']],
      Teams: [['team'], ['Frontline']],
    })
    expect(parse.errors).toEqual([
      { kind: 'missingNameHeader', sheet: 'Teams' },
      { kind: 'missingNameHeader', sheet: 'People' },
    ])
    expect(parse.people).toEqual([])
    expect(parse.teams).toEqual([])
  })


  it('reads a Tags sheet with its group and exclusive flag', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      Tags: [
        ['name', 'group', 'exclusive'],
        ['Spanish speaker', 'Languages', 'yes'],
        ['Student', '', ''],
        ['Youth worker', 'Languages', 'no'],
      ],
    })
    expect(parse.tags).toEqual([
      { name: 'Spanish speaker', group: 'Languages', exclusive: true },
      { name: 'Student' },
      { name: 'Youth worker', group: 'Languages', exclusive: false },
    ])
    expect(parse.errors).toEqual([])
    expect(parse.warnings).toEqual([])
  })

  it('splits a People tags cell on commas and semicolons only, so a name keeps its spaces', () => {
    const parse = parseWorkbook({
      People: [['name', 'tags'], ['Ada', 'Spanish speaker, Student;Youth worker ,']],
      Tags: [['name', 'group'], ['Spanish speaker', 'Languages']],
    })
    expect(parse.people).toEqual([
      { name: 'Ada', tags: ['Spanish speaker', 'Student', 'Youth worker'] },
    ])
  })

  it('reads every repeat form a TagRules row can carry', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TagRules: [
        ['tag', 'kind', 'shift', 'repeat', 'on', 'strict'],
        ['Student', 'avoid', 'M', 'weekly', 'Mon Tue', 'no'],
        ['Student', 'avoid', '', 'always', '', 'yes'],
        ['Student', 'want', 'any', 'date', '2026-05-01', ''],
        ['Student', 'avoid', 'EARLY', 'monthly', '15', ''],
        ['Student', 'avoid', 'Late', 'monthly', 'last fri', ''],
        ['Student', 'avoid', 'Late', 'monthly', 'third mon', ''],
        ['Student', 'want', 'EARLY', 'yearly', '12-25', ''],
      ],
    })
    expect(parse.tagRules).toEqual([
      { tag: 'Student', kind: 'avoid', shift: ['M'], when: { type: 'weekly', weekdays: [1, 2] } },
      { tag: 'Student', kind: 'avoid', when: { type: 'always' }, strict: true },
      // A blank shift cell and an explicit `any` both mean every shift.
      { tag: 'Student', kind: 'want', when: { type: 'date', iso: '2026-05-01' } },
      { tag: 'Student', kind: 'avoid', shift: ['EARLY'], when: { type: 'monthlyDay', day: 15 } },
      { tag: 'Student', kind: 'avoid', shift: ['Late'], when: { type: 'monthlyNth', nth: -1, weekday: 5 } },
      { tag: 'Student', kind: 'avoid', shift: ['Late'], when: { type: 'monthlyNth', nth: 3, weekday: 1 } },
      { tag: 'Student', kind: 'want', shift: ['EARLY'], when: { type: 'yearly', month: 12, day: 25 } },
    ])
    expect(parse.warnings).toEqual([])
  })

  it('warns and drops a rule line whose kind, repeat or on-value it cannot read', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      Tags: [['name'], ['Student']],
      TagRules: [
        ['tag', 'kind', 'shift', 'repeat', 'on'],
        ['Student', 'prefer', 'M', 'weekly', 'Mon'],
        ['Student', 'avoid', 'M', 'sometimes', 'Mon'],
        ['Student', 'avoid', 'M', 'date', '2026-02-30'],
        ['Student', 'avoid', 'M', 'weekly', 'funday'],
        ['Student', 'avoid', 'M', 'monthly', 'funday fri'],
        ['Student', 'avoid', 'M', 'yearly', '13-01'],
        ['Student', 'avoid', 'M', 'weekly', 'Mon'],
      ],
    })
    expect(parse.tagRules).toEqual([
      { tag: 'Student', kind: 'avoid', shift: ['M'], when: { type: 'weekly', weekdays: [1] } },
    ])
    expect(parse.warnings).toEqual([
      { kind: 'badTagRuleKind', row: 2, value: 'prefer' },
      { kind: 'badTagRuleRepeat', row: 3, value: 'sometimes' },
      { kind: 'badDate', row: 4, value: '2026-02-30' },
      { kind: 'badWeekday', row: 5, value: 'funday' },
      { kind: 'badTagRuleWhen', row: 6, value: 'funday fri' },
      { kind: 'badTagRuleWhen', row: 7, value: '13-01' },
    ])
  })

  it('warns when strict sits on a want and reads the line as an ordinary want', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TagRules: [['tag', 'kind', 'shift', 'repeat', 'on', 'strict'], ['Student', 'want', 'M', 'always', '', 'yes']],
    })
    expect(parse.tagRules).toEqual([{ tag: 'Student', kind: 'want', shift: ['M'], when: { type: 'always' } }])
    expect(parse.warnings).toEqual([{ kind: 'strictOnWant', row: 2 }])
  })

  it('reports a Tags sheet with no name column and skips only that sheet', () => {
    const parse = parseWorkbook({ People: [['name'], ['Ada']], Tags: [['label'], ['Student']] })
    expect(parse.errors).toEqual([{ kind: 'missingNameHeader', sheet: 'Tags' }])
    expect(parse.tags).toEqual([])
    expect(parse.people).toEqual([{ name: 'Ada' }])
  })

  it('skips a TagRules sheet carrying neither a tag nor a kind column', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TagRules: [['who', 'repeat'], ['Student', 'always']],
    })
    expect(parse.tagRules).toEqual([])
    expect(parse.errors).toEqual([])
    expect(parse.warnings).toEqual([])
  })

  it('reports an empty workbook separately from one with no People or Teams sheet', () => {
    expect(parseWorkbook({}).errors).toEqual([{ kind: 'noSheets' }])
    expect(parseWorkbook({ Settings: [['x'], ['y']] }).errors).toEqual([{ kind: 'noPeopleOrTeams' }])
  })
})

describe('applyBatchImport', () => {
  it('appends a person per row and resolves a team imported in the same workbook', () => {
    const parse = parseWorkbook({
      Teams: [['name', 'wants'], ['Frontline', 'EARLY']],
      People: [['name', 'team'], ['Alice', 'frontline'], ['Bob', 'Frontline']],
    })
    const result = apply([], [], parse)

    expect(result.people.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(result.people[0]!.id).not.toBe(result.people[1]!.id)
    expect(result.teams.map((t) => t.name)).toEqual(['Frontline'])
    expect(result.teams[0]!.wants).toEqual(['EARLY'])
    expect(result.people[0]!.teamId).toBe(result.teams[0]!.id)
    expect(result.people[1]!.teamId).toBe(result.teams[0]!.id)
    expect(result.warnings).toEqual([])
    expect(result.counts).toEqual({ teamsCreated: 1, teamsUpdated: 0, teamsAutoCreated: 0, peopleAdded: 2, tagGroupsCreated: 0, tagsCreated: 0, tagRulesImported: 0 })
  })

  it('stores codes in the catalog casing and drops unknown ones with a row warning', () => {
    const parse = parseWorkbook({
      People: [['name', 'wants', 'avoids'], ['Alice', 'late, OFF, nope', 'early']],
    })
    const result = apply([], [], parse)

    expect(result.people[0]!.wants).toEqual(['Late'])
    expect(result.people[0]!.avoids).toEqual(['EARLY'])
    expect(result.people[0]!.useTeamPreference).toBe(false)
    expect(result.warnings).toEqual([
      { kind: 'unknownCode', sheet: 'People', row: 2, code: 'OFF' },
      { kind: 'unknownCode', sheet: 'People', row: 2, code: 'nope' },
    ])
  })

  it('dedupes a code repeated in one cell', () => {
    const parse = parseWorkbook({ People: [['name', 'wants'], ['Alice', 'EARLY, early, EARLY']] })
    expect(apply([], [], parse).people[0]!.wants).toEqual(['EARLY'])
  })

  it('applies TimeOff rows to the people the same workbook added', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada'], ['Bo']],
      TimeOff: [
        ['person', 'date'],
        ['Ada', '2026-01-05'],
        ['ada', '2026-01-05'],
        [' Ada ', '2026-01-06'],
        ['BO', '2026-02-01'],
      ],
    })
    const result = apply([], [], parse)

    expect(result.people[0]!.timeOff).toEqual(['2026-01-05', '2026-01-06'])
    expect(result.people[1]!.timeOff).toEqual(['2026-02-01'])
    expect(result.warnings).toEqual([])
  })

  it('warns unknownPerson for a TimeOff row naming nobody the import added', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TimeOff: [
        ['person', 'date'],
        ['Ada', '2026-01-06'],
        ['Zoe', '2026-01-05'],
      ],
    })
    const result = apply([], [], parse)

    expect(result.people[0]!.timeOff).toEqual(['2026-01-06'])
    expect(result.warnings).toEqual([{ kind: 'unknownPerson', sheet: 'TimeOff', row: 3, name: 'Zoe' }])
  })

  it('warns badDate with the TimeOff row and keeps that person other dates', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TimeOff: [
        ['person', 'date'],
        ['Ada', '2026-02-30'],
        ['Ada', '2026-03-01'],
      ],
    })
    const result = apply([], [], parse)

    expect(result.people[0]!.timeOff).toEqual(['2026-03-01'])
    expect(result.warnings).toEqual([{ kind: 'badDate', row: 2, value: '2026-02-30' }])
  })

  it('defaults useTeamPreference from the person having preferences of their own', () => {
    const parse = parseWorkbook({
      People: [
        ['name', 'wants', 'avoids', 'useTeamPreference'],
        ['Alice', '', '', ''],
        ['Bob', 'EARLY', '', ''],
        ['Carol', '', 'Late', ''],
        ['Dave', 'EARLY', '', 'yes'],
        ['Erin', '', '', 'no'],
      ],
    })
    const byName = new Map(
      apply([], [], parse).people.map((p) => [p.name, p] as const),
    )

    expect(byName.get('Alice')!.useTeamPreference).toBe(true)
    expect(byName.get('Bob')!.useTeamPreference).toBe(false)
    expect(byName.get('Carol')!.useTeamPreference).toBe(false)
    expect(byName.get('Dave')!.useTeamPreference).toBe(true)
    expect(byName.get('Dave')!.wants).toEqual(['EARLY'])
    expect(byName.get('Erin')!.useTeamPreference).toBe(false)
  })

  it('applies recurring days off as sorted weekday numbers', () => {
    const parse = parseWorkbook({ People: [['name', 'recurringOff'], ['Alice', '5 sun 0']] })
    expect(apply([], [], parse).people[0]!.recurringOff).toEqual([0, 5])
  })

  it('updates only the team preference side the sheet filled in', () => {
    const teams: Team[] = [{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: ['Late'] }]
    const parse = parseWorkbook({ Teams: [['name', 'wants', 'avoids'], ['frontline', '', 'Early']] })
    const result = apply([], teams, parse)

    expect(result.teams).toEqual([{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: ['EARLY'] }])
    expect(result.counts).toEqual({ teamsCreated: 0, teamsUpdated: 1, teamsAutoCreated: 0, peopleAdded: 0, tagGroupsCreated: 0, tagsCreated: 0, tagRulesImported: 0 })
    expect(result.warnings).toEqual([])
  })

  it('leaves a side alone when every code the sheet offered was unknown', () => {
    const teams: Team[] = [{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: ['Late'] }]
    const parse = parseWorkbook({ Teams: [['name', 'wants'], ['Frontline', 'nope']] })
    const result = apply([], teams, parse)

    expect(result.teams[0]!.wants).toEqual(['EARLY'])
    expect(result.counts.teamsUpdated).toBe(1)
    expect(result.warnings).toEqual([{ kind: 'unknownCode', sheet: 'Teams', row: 2, code: 'nope' }])
  })

  it('creates a new team with the preferences its row supplied', () => {
    const parse = parseWorkbook({ Teams: [['name', 'wants', 'avoids'], ['Kitchen', '', 'EARLY']] })
    const result = apply([], [], parse)

    expect(result.teams).toEqual([{ id: 't1', name: 'Kitchen', wants: [], avoids: ['EARLY'] }])
    expect(result.counts).toEqual({ teamsCreated: 1, teamsUpdated: 0, teamsAutoCreated: 0, peopleAdded: 0, tagGroupsCreated: 0, tagsCreated: 0, tagRulesImported: 0 })
  })

  it('auto-creates an unknown team once and shares it with later rows', () => {
    const parse = parseWorkbook({
      People: [['name', 'team'], ['Alice', 'Kitchen'], ['Bob', 'kitchen'], ['Carol', '']],
    })
    const result = apply([], [], parse)

    expect(result.teams.map((t) => t.name)).toEqual(['Kitchen'])
    expect(result.people[0]!.teamId).toBe(result.teams[0]!.id)
    expect(result.people[1]!.teamId).toBe(result.teams[0]!.id)
    expect(result.people[2]!.teamId).toBe(UNASSIGNED_TEAM_ID)
    expect(result.warnings).toEqual([{ kind: 'teamAutoCreated', name: 'Kitchen' }])
    expect(result.counts).toEqual({ teamsCreated: 0, teamsUpdated: 0, teamsAutoCreated: 1, peopleAdded: 3, tagGroupsCreated: 0, tagsCreated: 0, tagRulesImported: 0 })
  })

  it('appends onto an existing roster and reuses an existing team instead of duplicating it', () => {
    const people: Person[] = [{ id: 'p1', name: 'Zoe', teamId: 't1', ineligible: [] }]
    const teams: Team[] = [{ id: 't1', name: 'Frontline', wants: [], avoids: [] }]
    const parse = parseWorkbook({
      People: [['name', 'team', 'ineligible'], ['Alice', 'FRONTLINE', 'late']],
    })
    const result = apply(people, teams, parse)

    expect(result.people.map((p) => p.name)).toEqual(['Zoe', 'Alice'])
    expect(result.people[1]!.id).toBe('p2')
    expect(result.people[1]!.teamId).toBe('t1')
    expect(result.people[1]!.ineligible).toEqual(['Late'])
    expect(result.people[0]!.ineligible).toEqual([])
    expect(result.teams).toHaveLength(1)
    expect(result.counts).toEqual({ teamsCreated: 0, teamsUpdated: 0, teamsAutoCreated: 0, peopleAdded: 1, tagGroupsCreated: 0, tagsCreated: 0, tagRulesImported: 0 })
  })

  it('carries parse warnings through beside its own', () => {
    const parse = parseWorkbook({
      People: [['name', 'recurringOff', 'wants'], ['Alice', 'funday', 'nope']],
    })
    expect(apply([], [], parse).warnings).toEqual([
      { kind: 'badWeekday', row: 2, value: 'funday' },
      { kind: 'unknownCode', sheet: 'People', row: 2, code: 'nope' },
    ])
  })

  it('leaves the roster and teams it was handed untouched', () => {
    const people: Person[] = [{ id: 'p1', name: 'Zoe', teamId: 't1', ineligible: [] }]
    const teams: Team[] = [{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: [] }]
    const parse = parseWorkbook({
      Teams: [['name', 'wants'], ['Frontline', '']],
      People: [['name', 'team'], ['Alice', 'Frontline']],
    })
    apply(people, teams, parse)

    expect(people).toEqual([{ id: 'p1', name: 'Zoe', teamId: 't1', ineligible: [] }])
    expect(teams).toEqual([{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: [] }])
  })

  it('creates the groups and tags the Tags sheet names, reusing a catalog tag by name', () => {
    const groups: TagGroup[] = [{ id: 'g1', name: 'Languages', exclusive: false }]
    const tags: Tag[] = [{ id: 'tag1', name: 'Spanish speaker', groupId: 'g1', rules: [] }]
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      Tags: [
        ['name', 'group', 'exclusive'],
        ['spanish SPEAKER', 'languages', 'yes'],
        ['Student', '', ''],
      ],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, { tagGroups: groups, tags })

    expect(result.tagGroups).toEqual([{ id: 'g1', name: 'Languages', exclusive: false }])
    expect(result.tags).toEqual([
      { id: 'tag1', name: 'Spanish speaker', groupId: 'g1', rules: [] },
      { id: result.tags[1]!.id, name: 'Student', rules: [] },
    ])
    expect(result.counts.tagGroupsCreated).toBe(0)
    expect(result.counts.tagsCreated).toBe(1)
  })

  it('takes the first exclusive value a new group is given and warns on a later row that disagrees', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      Tags: [
        ['name', 'group', 'exclusive'],
        ['Arabic speaker', 'Languages', 'yes'],
        ['French speaker', 'Languages', 'no'],
        ['German speaker', 'Languages', 'yes'],
      ],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, NO_TAGS)

    expect(result.tagGroups.map((group) => group.exclusive)).toEqual([true])
    expect(result.counts.tagGroupsCreated).toBe(1)
    expect(result.counts.tagsCreated).toBe(3)
    expect(result.warnings).toEqual([{ kind: 'tagGroupExclusiveConflict', name: 'Languages' }])
  })

  it('replaces the rules of a tag the TagRules sheet mentions and leaves the other tags alone', () => {
    const groups: TagGroup[] = [{ id: 'g1', name: 'Languages', exclusive: false }]
    const tags: Tag[] = [
      {
        id: 'tag1',
        name: 'Spanish speaker',
        groupId: 'g1',
        rules: [{ id: 'r1', kind: 'avoid', shift: 'Late', when: { type: 'always' } }],
      },
      { id: 'tag2', name: 'Student', rules: [{ id: 'r2', kind: 'want', shift: null, when: { type: 'always' } }] },
    ]
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      Tags: [['name', 'group'], ['Spanish speaker', 'Languages'], ['Student', '']],
      // Column order is the sheet's business — the reader looks headers up by name.
      TagRules: [
        ['tag', 'shift', 'kind', 'repeat', 'on', 'strict'],
        ['spanish speaker', 'late', 'avoid', 'weekly', 'Fri', 'yes'],
      ],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, { tagGroups: groups, tags })

    const spanish = result.tags.find((tag) => tag.name === 'Spanish speaker')!
    expect(spanish.rules).toHaveLength(1)
    expect(spanish.rules[0]).toMatchObject({
      kind: 'avoid',
      shift: 'Late',
      when: { type: 'weekly', weekdays: [5] },
      strict: true,
    })
    expect(result.tags.find((tag) => tag.name === 'Student')!.rules).toEqual(tags[1]!.rules)
    expect(result.counts.tagRulesImported).toBe(1)
    expect(result.counts.tagsCreated).toBe(0)
  })

  it('reads a blank or any shift cell as every shift and drops codes the catalog does not have', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      Tags: [['name'], ['Student']],
      TagRules: [
        ['tag', 'kind', 'shift', 'repeat'],
        ['Student', 'avoid', '', 'always'],
        ['Student', 'avoid', 'any', 'always'],
        ['Student', 'avoid', 'nope', 'always'],
        ['Student', 'avoid', 'EARLY nope', 'always'],
      ],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, NO_TAGS)

    const rules = result.tags.find((tag) => tag.name === 'Student')!.rules
    expect(rules.map((rule) => rule.shift)).toEqual([null, null, 'EARLY'])
    expect(result.counts.tagRulesImported).toBe(3)
    expect(result.warnings).toEqual([
      { kind: 'unknownCode', sheet: 'TagRules', row: 4, code: 'nope' },
      { kind: 'unknownCode', sheet: 'TagRules', row: 5, code: 'nope' },
    ])
  })

  it('assigns a People tag that only the live catalog has, and warns for one in neither', () => {
    const tags: Tag[] = [{ id: 'tag1', name: 'Spanish speaker', rules: [] }]
    const parse = parseWorkbook({
      People: [['name', 'tags'], ['Ada', 'Spanish speaker, Student']],
      Tags: [['name'], ['Student']],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, { tagGroups: [], tags })

    // The catalog tag keeps its id, the workbook-defined one is created.
    const student = result.tags.find((tag) => tag.name === 'Student')!
    expect(result.people[0]!.tagIds).toEqual(['tag1', student.id])

    const unknown = parseWorkbook({ People: [['name', 'tags'], ['Bo', 'Ghost']] })
    const second = applyBatchImport([], [], SHIFTS, unknown, { tagGroups: [], tags })
    expect(second.people[0]!.tagIds).toBeUndefined()
    expect(second.warnings).toEqual([{ kind: 'unknownTag', sheet: 'People', row: 2, name: 'Ghost' }])
  })

  it('warns and drops a TagRules line naming a tag neither the workbook nor the catalog has', () => {
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      TagRules: [['tag', 'kind'], ['Ghost', 'avoid']],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, NO_TAGS)

    expect(result.tags).toEqual([])
    expect(result.warnings).toEqual([{ kind: 'unknownTag', sheet: 'TagRules', row: 2, name: 'Ghost' }])
  })

  it('keeps one tag per person inside an exclusive group', () => {
    const groups: TagGroup[] = [{ id: 'g1', name: 'Faith', exclusive: true }]
    const tags: Tag[] = [
      { id: 'tag1', name: 'Muslim', groupId: 'g1', rules: [] },
      { id: 'tag2', name: 'Jewish', groupId: 'g1', rules: [] },
      { id: 'tag3', name: 'Student', rules: [] },
    ]
    const parse = parseWorkbook({
      People: [['name', 'tags'], ['Ada', 'Muslim, Student, Jewish']],
      Tags: [['name', 'group'], ['Muslim', 'Faith'], ['Jewish', 'Faith'], ['Student', '']],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, { tagGroups: groups, tags })

    // The last tag listed in the exclusive group wins, so the person keeps
    // their loose tag and that one.
    expect(result.people[0]!.tagIds).toEqual(['tag3', 'tag2'])
    expect(result.counts.tagsCreated).toBe(0)
  })

  it('counts the tag groups, tags and rule lines it added', () => {
    const parse = parseWorkbook({
      People: [['name', 'tags'], ['Ada', 'Student']],
      Tags: [
        ['name', 'group'],
        ['Student', ''],
        ['Spanish speaker', 'Languages'],
        ['French speaker', 'Languages'],
      ],
      TagRules: [
        ['tag', 'kind', 'shift', 'repeat'],
        ['Student', 'avoid', 'Late', 'always'],
        ['Student', 'want', 'EARLY', 'always'],
      ],
    })
    const result = applyBatchImport([], [], SHIFTS, parse, NO_TAGS)

    expect(result.people[0]!.tagIds).toHaveLength(1)
    expect(result.counts).toEqual({
      teamsCreated: 0,
      teamsUpdated: 0,
      teamsAutoCreated: 0,
      peopleAdded: 1,
      tagGroupsCreated: 1,
      tagsCreated: 3,
      tagRulesImported: 2,
    })
  })

  it('leaves the tag catalog it was handed untouched', () => {
    const groups: TagGroup[] = [{ id: 'g1', name: 'Languages', exclusive: false }]
    const tags: Tag[] = [{ id: 'tag1', name: 'Spanish speaker', groupId: 'g1', rules: [] }]
    const parse = parseWorkbook({
      People: [['name'], ['Ada']],
      Tags: [['name'], ['Student']],
      TagRules: [['tag', 'kind'], ['Spanish speaker', 'avoid']],
    })
    applyBatchImport([], [], SHIFTS, parse, { tagGroups: groups, tags })

    expect(groups).toEqual([{ id: 'g1', name: 'Languages', exclusive: false }])
    expect(tags).toEqual([{ id: 'tag1', name: 'Spanish speaker', groupId: 'g1', rules: [] }])
  })
})
