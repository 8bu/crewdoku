import { describe, expect, it } from 'vitest'
import {
  OFF_CODE,
  UNASSIGNED_TEAM_ID,
  type Person,
  type ShiftDef,
  type Tag,
  type TagGroup,
  type Team,
} from '@crewdoku/domain'
import { buildImportWorkbook, buildTemplateValidations, type ImportWorkbook } from './importTemplate'
import { applyBatchImport, parseWorkbook } from '../board/roster/batchImport'

const SHIFTS: ShiftDef[] = [
  { code: 'OPEN', label: 'Opening', start: '0900', end: '1500' },
  { code: 'MID', label: 'Mid', start: '1100', end: '1900' },
  { code: 'CLOSE', label: 'Closing', start: '1500', end: '2100' },
]

const TEAMS: Team[] = [
  { id: 't1', name: 'Bakery', wants: ['OPEN'], avoids: ['CLOSE'] },
  { id: 't2', name: 'Counter', wants: [], avoids: [] },
]

const TAG_GROUPS: TagGroup[] = [
  { id: 'g1', name: 'Languages', exclusive: false },
  { id: 'g2', name: 'Faith', exclusive: true },
]

const TAGS: Tag[] = [
  {
    id: 'tg1',
    name: 'Spanish speaker',
    groupId: 'g1',
    rules: [{ id: 'tr1', kind: 'avoid', shift: 'CLOSE', when: { type: 'weekly', weekdays: [5] } }],
  },
  {
    id: 'tg2',
    name: 'Ramadan',
    groupId: 'g2',
    rules: [
      {
        id: 'tr2',
        kind: 'avoid',
        shift: null,
        when: { type: 'monthlyNth', nth: -1, weekday: 5 },
        strict: true,
      },
    ],
  },
  { id: 'tg3', name: 'Student', rules: [{ id: 'tr3', kind: 'want', shift: 'OPEN', when: { type: 'yearly', month: 9, day: 1 } }] },
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
    tagIds: ['tg1', 'tg3'],
  },
  { id: 'p2', name: 'Bo', teamId: UNASSIGNED_TEAM_ID, ineligible: [] },
  // Removed people are gone from the roster, so their dates are gone too.
  { id: 'p3', name: 'Cy (removed)', teamId: 't2', ineligible: [], timeOff: ['2026-02-01'], removed: true },
]

function rowsOf(wb: ImportWorkbook, sheetName: string): string[][] {
  return wb.sheets.find((sheet) => sheet.name === sheetName)!.rows
}

const POPULATED = buildImportWorkbook({
  shifts: SHIFTS,
  teams: TEAMS,
  people: PEOPLE,
  tagGroups: TAG_GROUPS,
  tags: TAGS,
})

describe('buildImportWorkbook', () => {
  it('emits Teams, People, TimeOff, Tags, TagRules and Shifts with the exact contract headers', () => {
    expect(POPULATED.sheets.map((sheet) => sheet.name)).toEqual([
      'Teams',
      'People',
      'TimeOff',
      'Tags',
      'TagRules',
      'Shifts',
    ])
    expect(rowsOf(POPULATED, 'Teams')[0]).toEqual(['name', 'wants', 'avoids'])
    expect(rowsOf(POPULATED, 'People')[0]).toEqual([
      'name',
      'team',
      'ineligible',
      'wants',
      'avoids',
      'useTeamPreference',
      'recurringOff',
      'tags',
    ])
    expect(rowsOf(POPULATED, 'TimeOff')[0]).toEqual(['person', 'date'])
    expect(rowsOf(POPULATED, 'Tags')[0]).toEqual(['name', 'group', 'exclusive'])
    expect(rowsOf(POPULATED, 'TagRules')[0]).toEqual(['tag', 'kind', 'shift', 'repeat', 'on', 'strict'])
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
      ['name', 'team', 'ineligible', 'wants', 'avoids', 'useTeamPreference', 'recurringOff', 'tags'],
      ['Ada', 'Bakery', 'CLOSE MID', 'OPEN MID', '', 'no', 'Sun Sat', 'Spanish speaker, Student'],
      // No team -> blank cell, no own preference -> inherits (yes), no tags -> blank cell.
      ['Bo', '', '', '', '', 'yes', '', ''],
    ])
  })

  it('drops weekdays outside the week and the reserved OFF code', () => {
    const wb = buildImportWorkbook({
      shifts: SHIFTS,
      teams: TEAMS,
      people: [{ id: 'p9', name: 'Dot', teamId: 't1', ineligible: [], avoids: [OFF_CODE, 'CLOSE'], recurringOff: [7, -1, 3] }],
      tagGroups: TAG_GROUPS,
      tags: TAGS,
    })
    expect(rowsOf(wb, 'People')[1]).toEqual(['Dot', 'Bakery', '', '', 'CLOSE', 'yes', 'Wed', ''])
  })

  it('writes the tag catalog with each tag group and its one-per-person flag', () => {
    expect(rowsOf(POPULATED, 'Tags')).toEqual([
      ['name', 'group', 'exclusive'],
      ['Spanish speaker', 'Languages', 'no'],
      ['Ramadan', 'Faith', 'yes'],
      // A loose tag names no group, so its exclusive cell stays blank.
      ['Student', '', ''],
    ])
  })

  it('writes one TagRules row per rule line, with the when encoded back to its repeat form', () => {
    expect(rowsOf(POPULATED, 'TagRules')).toEqual([
      ['tag', 'kind', 'shift', 'repeat', 'on', 'strict'],
      ['Spanish speaker', 'avoid', 'CLOSE', 'weekly', 'Fri', 'no'],
      // No shift is the rule's `any`, and `monthlyNth` writes its ordinal word.
      ['Ramadan', 'avoid', 'any', 'monthly', 'last Fri', 'yes'],
      ['Student', 'want', 'OPEN', 'yearly', '09-01', 'no'],
    ])
  })

  it('gives every date off its own TimeOff row, for active people only', () => {
    expect(rowsOf(POPULATED, 'TimeOff')).toEqual([
      ['person', 'date'],
      ['Ada', '2026-01-05'],
      ['Ada', '2026-01-06'],
    ])
  })

  it('falls back to illustrative rows on an empty workspace, all referencing real codes and teams', () => {
    const empty = buildImportWorkbook({ shifts: SHIFTS, teams: [], people: [], tagGroups: [], tags: [] })
    const teams = rowsOf(empty, 'Teams')
    const people = rowsOf(empty, 'People')
    const shifts = rowsOf(empty, 'Shifts')

    expect(teams).toHaveLength(3)
    expect(people).toHaveLength(3)
    expect(shifts).toHaveLength(SHIFTS.length + 1)

    const codes = new Set(shifts.slice(1).map((row) => row[0]))
    const teamNames = new Set(teams.slice(1).map((row) => row[0]))
    const tagNames = new Set(rowsOf(empty, 'Tags').slice(1).map((row) => row[0]))
    for (const row of people.slice(1)) {
      expect(teamNames.has(row[1]!)).toBe(true)
      for (const cell of [row[2], row[3], row[4]]) {
        for (const code of (cell ?? '').split(/\s+/).filter(Boolean)) expect(codes.has(code)).toBe(true)
      }
      // Every tag a person wears is one the Tags sheet defines.
      for (const name of (row[7] ?? '').split(',').map((tag) => tag.trim()).filter(Boolean)) {
        expect(tagNames.has(name)).toBe(true)
      }
    }
  })

  it('illustrates the tag sheets on an empty workspace: a grouped tag, a loose tag and a rule line', () => {
    const empty = buildImportWorkbook({ shifts: SHIFTS, teams: [], people: [], tagGroups: [], tags: [] })

    expect(rowsOf(empty, 'Tags')).toEqual([
      ['name', 'group', 'exclusive'],
      ['Spanish speaker', 'Languages', 'no'],
      ['Student', '', ''],
    ])
    expect(rowsOf(empty, 'TagRules')).toEqual([
      ['tag', 'kind', 'shift', 'repeat', 'on', 'strict'],
      // A real catalog code, an `on` the parser reads back, and a tag the Tags sheet defines.
      ['Student', 'avoid', SHIFTS[0]!.code, 'weekly', 'Mon Tue', 'no'],
    ])
  })

  it('illustrates time off on an empty workspace with dates for a person the People sheet has', () => {
    const empty = buildImportWorkbook({ shifts: SHIFTS, teams: [], people: [], tagGroups: [], tags: [] })
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
    expect(
      buildImportWorkbook({ shifts: SHIFTS, teams: TEAMS, people: PEOPLE, tagGroups: TAG_GROUPS, tags: TAGS }),
    ).toEqual(POPULATED)
  })

  it('round-trips: the workbook it writes comes back with the same tags, rules and tag holders', () => {
    const sheets = Object.fromEntries(POPULATED.sheets.map((sheet) => [sheet.name, sheet.rows]))
    const parse = parseWorkbook(sheets)

    expect(parse.errors).toEqual([])
    expect(parse.warnings).toEqual([])

    const result = applyBatchImport([], [], SHIFTS, parse, { tagGroups: TAG_GROUPS, tags: TAGS })
    // Everything the sheet names already exists, so nothing is created twice…
    expect(result.counts.tagGroupsCreated).toBe(0)
    expect(result.counts.tagsCreated).toBe(0)
    // …and each tag's rules are replaced, not appended to.
    expect(result.counts.tagRulesImported).toBe(TAGS.reduce((total, tag) => total + tag.rules.length, 0))
    expect(result.tagGroups).toEqual(TAG_GROUPS)
    expect(result.tags.map((tag) => tag.name)).toEqual(TAGS.map((tag) => tag.name))
    expect(result.tags[0]!.rules).toMatchObject([
      { kind: 'avoid', shift: 'CLOSE', when: { type: 'weekly', weekdays: [5] } },
    ])
    expect(result.tags[1]!.rules).toMatchObject([
      { kind: 'avoid', shift: null, when: { type: 'monthlyNth', nth: -1, weekday: 5 }, strict: true },
    ])
    expect(result.tags[2]!.rules).toMatchObject([
      { kind: 'want', shift: 'OPEN', when: { type: 'yearly', month: 9, day: 1 } },
    ])
    expect(result.people.find((person) => person.name === 'Ada')!.tagIds).toEqual(['tg1', 'tg3'])

    // Re-importing over its own result stays stable rather than growing rules.
    const again = applyBatchImport([], [], SHIFTS, parse, { tagGroups: result.tagGroups, tags: result.tags })
    expect(again.counts.tagsCreated).toBe(0)
    expect(again.tags.map((tag) => tag.rules.length)).toEqual(result.tags.map((tag) => tag.rules.length))
  })
})

describe('buildTemplateValidations', () => {
  const dv = buildTemplateValidations(POPULATED)

  it('keys every validation block by a sheet the workbook really has', () => {
    const sheetNames = new Set(POPULATED.sheets.map((sheet) => sheet.name))
    for (const name of Object.keys(dv)) expect(sheetNames.has(name)).toBe(true)
    // A key that named no sheet would be injected nowhere, silently losing its dropdowns.
    expect(Object.keys(dv).sort()).toEqual(['People', 'TagRules', 'Tags', 'Teams', 'TimeOff'])
  })

  it('never blocks entry, so multi-code cells still import (errors suppressed on every rule)', () => {
    const rules = Object.values(dv).join('')
    const total = [...rules.matchAll(/<dataValidation /g)].length
    expect(total).toBe(14) // Teams 2 + People 7 + TimeOff 1 + Tags 1 + TagRules 3
    expect([...rules.matchAll(/showErrorMessage="0"/g)]).toHaveLength(total)
    expect(rules).not.toContain('showErrorMessage="1"')
  })
})
