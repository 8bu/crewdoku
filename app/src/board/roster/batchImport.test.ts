import { describe, expect, it } from 'vitest'
import { UNASSIGNED_TEAM_ID, type Person, type ShiftDef, type Team } from '@crewdoku/domain'
import { applyBatchImport, parseWorkbook } from './batchImport'

/** Deliberately mixed-case codes so a test can tell catalog casing from input casing. */
const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400' },
  { code: 'Late', label: 'Late', start: '1400', end: '2200' },
]

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
    const result = applyBatchImport([], [], SHIFTS, parse)

    expect(result.people.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(result.people[0]!.id).not.toBe(result.people[1]!.id)
    expect(result.teams.map((t) => t.name)).toEqual(['Frontline'])
    expect(result.teams[0]!.wants).toEqual(['EARLY'])
    expect(result.people[0]!.teamId).toBe(result.teams[0]!.id)
    expect(result.people[1]!.teamId).toBe(result.teams[0]!.id)
    expect(result.warnings).toEqual([])
    expect(result.counts).toEqual({ teamsCreated: 1, teamsUpdated: 0, teamsAutoCreated: 0, peopleAdded: 2 })
  })

  it('stores codes in the catalog casing and drops unknown ones with a row warning', () => {
    const parse = parseWorkbook({
      People: [['name', 'wants', 'avoids'], ['Alice', 'late, OFF, nope', 'early']],
    })
    const result = applyBatchImport([], [], SHIFTS, parse)

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
    expect(applyBatchImport([], [], SHIFTS, parse).people[0]!.wants).toEqual(['EARLY'])
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
    const result = applyBatchImport([], [], SHIFTS, parse)

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
    const result = applyBatchImport([], [], SHIFTS, parse)

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
    const result = applyBatchImport([], [], SHIFTS, parse)

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
      applyBatchImport([], [], SHIFTS, parse).people.map((p) => [p.name, p] as const),
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
    expect(applyBatchImport([], [], SHIFTS, parse).people[0]!.recurringOff).toEqual([0, 5])
  })

  it('updates only the team preference side the sheet filled in', () => {
    const teams: Team[] = [{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: ['Late'] }]
    const parse = parseWorkbook({ Teams: [['name', 'wants', 'avoids'], ['frontline', '', 'Early']] })
    const result = applyBatchImport([], teams, SHIFTS, parse)

    expect(result.teams).toEqual([{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: ['EARLY'] }])
    expect(result.counts).toEqual({ teamsCreated: 0, teamsUpdated: 1, teamsAutoCreated: 0, peopleAdded: 0 })
    expect(result.warnings).toEqual([])
  })

  it('leaves a side alone when every code the sheet offered was unknown', () => {
    const teams: Team[] = [{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: ['Late'] }]
    const parse = parseWorkbook({ Teams: [['name', 'wants'], ['Frontline', 'nope']] })
    const result = applyBatchImport([], teams, SHIFTS, parse)

    expect(result.teams[0]!.wants).toEqual(['EARLY'])
    expect(result.counts.teamsUpdated).toBe(1)
    expect(result.warnings).toEqual([{ kind: 'unknownCode', sheet: 'Teams', row: 2, code: 'nope' }])
  })

  it('creates a new team with the preferences its row supplied', () => {
    const parse = parseWorkbook({ Teams: [['name', 'wants', 'avoids'], ['Kitchen', '', 'EARLY']] })
    const result = applyBatchImport([], [], SHIFTS, parse)

    expect(result.teams).toEqual([{ id: 't1', name: 'Kitchen', wants: [], avoids: ['EARLY'] }])
    expect(result.counts).toEqual({ teamsCreated: 1, teamsUpdated: 0, teamsAutoCreated: 0, peopleAdded: 0 })
  })

  it('auto-creates an unknown team once and shares it with later rows', () => {
    const parse = parseWorkbook({
      People: [['name', 'team'], ['Alice', 'Kitchen'], ['Bob', 'kitchen'], ['Carol', '']],
    })
    const result = applyBatchImport([], [], SHIFTS, parse)

    expect(result.teams.map((t) => t.name)).toEqual(['Kitchen'])
    expect(result.people[0]!.teamId).toBe(result.teams[0]!.id)
    expect(result.people[1]!.teamId).toBe(result.teams[0]!.id)
    expect(result.people[2]!.teamId).toBe(UNASSIGNED_TEAM_ID)
    expect(result.warnings).toEqual([{ kind: 'teamAutoCreated', name: 'Kitchen' }])
    expect(result.counts).toEqual({ teamsCreated: 0, teamsUpdated: 0, teamsAutoCreated: 1, peopleAdded: 3 })
  })

  it('appends onto an existing roster and reuses an existing team instead of duplicating it', () => {
    const people: Person[] = [{ id: 'p1', name: 'Zoe', teamId: 't1', ineligible: [] }]
    const teams: Team[] = [{ id: 't1', name: 'Frontline', wants: [], avoids: [] }]
    const parse = parseWorkbook({
      People: [['name', 'team', 'ineligible'], ['Alice', 'FRONTLINE', 'late']],
    })
    const result = applyBatchImport(people, teams, SHIFTS, parse)

    expect(result.people.map((p) => p.name)).toEqual(['Zoe', 'Alice'])
    expect(result.people[1]!.id).toBe('p2')
    expect(result.people[1]!.teamId).toBe('t1')
    expect(result.people[1]!.ineligible).toEqual(['Late'])
    expect(result.people[0]!.ineligible).toEqual([])
    expect(result.teams).toHaveLength(1)
    expect(result.counts).toEqual({ teamsCreated: 0, teamsUpdated: 0, teamsAutoCreated: 0, peopleAdded: 1 })
  })

  it('carries parse warnings through beside its own', () => {
    const parse = parseWorkbook({
      People: [['name', 'recurringOff', 'wants'], ['Alice', 'funday', 'nope']],
    })
    expect(applyBatchImport([], [], SHIFTS, parse).warnings).toEqual([
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
    applyBatchImport(people, teams, SHIFTS, parse)

    expect(people).toEqual([{ id: 'p1', name: 'Zoe', teamId: 't1', ineligible: [] }])
    expect(teams).toEqual([{ id: 't1', name: 'Frontline', wants: ['EARLY'], avoids: [] }])
  })
})
