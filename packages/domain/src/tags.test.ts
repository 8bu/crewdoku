import { describe, expect, it } from 'vitest'
import type { Person, Team } from './entities'
import { UNASSIGNED_TEAM_ID } from './entities'
import {
  basePreference,
  cellPreference,
  normalizeTagIds,
  personTags,
  tagRuleApplies,
  tagWhenMatches,
  togglePersonTag,
} from './tags'
import type { Tag, TagGroup, TagRule, TagWhen } from './tags'

function rule(init: Partial<TagRule> & { kind: TagRule['kind'] }): TagRule {
  return { id: 'rule-1', shift: null, when: { type: 'always' }, ...init }
}

function tag(id: string, rules: TagRule[] = [], groupId?: string): Tag {
  return { id, name: `${id} name`, ...(groupId === undefined ? {} : { groupId }), rules }
}

function person(overrides: Partial<Person> = {}): Person {
  return { id: 'p1', name: 'Ana', teamId: UNASSIGNED_TEAM_ID, ineligible: [], ...overrides }
}

const NO_TEAM: Team | undefined = undefined

describe('tagWhenMatches', () => {
  it('always matches every date, and a date rule only its own', () => {
    expect(tagWhenMatches({ type: 'always' }, '2026-02-23')).toBe(true)
    expect(tagWhenMatches({ type: 'date', iso: '2026-02-23' }, '2026-02-23')).toBe(true)
    expect(tagWhenMatches({ type: 'date', iso: '2026-02-23' }, '2026-02-24')).toBe(false)
  })

  it('matches listed weekdays only, and never with an empty list', () => {
    const weekend: TagWhen = { type: 'weekly', weekdays: [0, 6] }
    expect(tagWhenMatches(weekend, '2026-01-11')).toBe(true) // Sunday
    expect(tagWhenMatches(weekend, '2026-01-31')).toBe(true) // Saturday
    expect(tagWhenMatches(weekend, '2026-01-30')).toBe(false) // Friday
    expect(tagWhenMatches({ type: 'weekly', weekdays: [] }, '2026-01-11')).toBe(false)
  })

  it('matches a day of month that does not exist in a month never', () => {
    const thirtyFirst: TagWhen = { type: 'monthlyDay', day: 31 }
    expect(tagWhenMatches(thirtyFirst, '2026-01-31')).toBe(true)
    expect(tagWhenMatches(thirtyFirst, '2026-04-30')).toBe(false) // April has 30 days
    expect(tagWhenMatches(thirtyFirst, '2026-03-30')).toBe(false)
    expect(tagWhenMatches({ type: 'monthlyDay', day: 15 }, '2026-01-15')).toBe(true)
    expect(tagWhenMatches({ type: 'monthlyDay', day: 15 }, '2026-02-15')).toBe(true)
    expect(tagWhenMatches({ type: 'monthlyDay', day: 31 }, '2026-02-28')).toBe(false)
  })

  it('matches the nth weekday, including the 5th week never being the 4th', () => {
    // March 2026 has five Mondays: 2, 9, 16, 23, 30.
    const fourthMonday: TagWhen = { type: 'monthlyNth', nth: 4, weekday: 1 }
    expect(tagWhenMatches(fourthMonday, '2026-03-23')).toBe(true)
    expect(tagWhenMatches(fourthMonday, '2026-03-30')).toBe(false) // the 5th Monday
    expect(tagWhenMatches(fourthMonday, '2026-03-16')).toBe(false) // the 3rd
    expect(tagWhenMatches({ type: 'monthlyNth', nth: 1, weekday: 1 }, '2026-03-02')).toBe(true)
  })

  it('matches the last weekday of the month, whatever the month length', () => {
    const lastMonday: TagWhen = { type: 'monthlyNth', nth: -1, weekday: 1 }
    expect(tagWhenMatches(lastMonday, '2026-01-26')).toBe(true)
    expect(tagWhenMatches(lastMonday, '2026-01-19')).toBe(false)
    expect(tagWhenMatches(lastMonday, '2026-02-23')).toBe(true) // February's own last Monday
  })

  it('matches the last weekday in a short February and in a leap February', () => {
    const lastWednesday: TagWhen = { type: 'monthlyNth', nth: -1, weekday: 3 }
    expect(tagWhenMatches(lastWednesday, '2023-02-22')).toBe(true) // 28-day February
    expect(tagWhenMatches(lastWednesday, '2023-02-15')).toBe(false)
    expect(tagWhenMatches(lastWednesday, '2024-02-28')).toBe(true) // leap February: the 29th is a Thursday
    expect(tagWhenMatches(lastWednesday, '2024-02-21')).toBe(false)

    const lastThursday: TagWhen = { type: 'monthlyNth', nth: -1, weekday: 4 }
    expect(tagWhenMatches(lastThursday, '2024-02-29')).toBe(true) // the leap day itself
  })

  it('matches a yearly month/day, including a leap day that most years never have', () => {
    const leapDay: TagWhen = { type: 'yearly', month: 2, day: 29 }
    expect(tagWhenMatches(leapDay, '2024-02-29')).toBe(true)
    expect(tagWhenMatches(leapDay, '2023-02-28')).toBe(false)
    const christmas: TagWhen = { type: 'yearly', month: 12, day: 25 }
    expect(tagWhenMatches(christmas, '2026-12-25')).toBe(true)
    expect(tagWhenMatches(christmas, '2026-12-26')).toBe(false)
    expect(tagWhenMatches(christmas, '2027-12-25')).toBe(true)
  })

  it('matches the last weekday of a month with five of them', () => {
    // March 2026: Mondays 2, 9, 16, 23, 30 — the last one is five weeks in.
    const lastMonday: TagWhen = { type: 'monthlyNth', nth: -1, weekday: 1 }
    expect(tagWhenMatches(lastMonday, '2026-03-30')).toBe(true)
    expect(tagWhenMatches(lastMonday, '2026-03-23')).toBe(false)
  })
})

describe('tagRuleApplies', () => {
  it('treats a null shift as any shift', () => {
    const anyShift = rule({ kind: 'avoid', shift: null })
    expect(tagRuleApplies(anyShift, 'EARLY', '2026-01-05')).toBe(true)
    expect(tagRuleApplies(anyShift, 'NIGHT', '2026-01-05')).toBe(true)
    expect(tagRuleApplies(anyShift, 'OFF', '2026-01-05')).toBe(true)
  })

  it('needs both the shift and the date to match', () => {
    const fridayNights = rule({ kind: 'avoid', shift: 'NIGHT', when: { type: 'weekly', weekdays: [5] } })
    expect(tagRuleApplies(fridayNights, 'NIGHT', '2026-01-30')).toBe(true) // Friday
    expect(tagRuleApplies(fridayNights, 'EARLY', '2026-01-30')).toBe(false)
    expect(tagRuleApplies(fridayNights, 'NIGHT', '2026-01-29')).toBe(false) // Thursday
  })
})

describe('personTags', () => {
  const t1 = tag('t1')
  const t2 = tag('t2')

  it('returns held tags in workspace tag order, dropping unknown ids', () => {
    expect(personTags(person({ tagIds: ['t2', 'ghost', 't1'] }), [t1, t2])).toEqual([t1, t2])
  })
})

describe('basePreference', () => {
  const team: Team = { id: 'team-1', name: 'Alpha', wants: ['EARLY'], avoids: ['NIGHT'] }

  it('inherits the team default unless useTeamPreference is false', () => {
    const inherited = person({ teamId: 'team-1' })
    expect(basePreference(inherited, team)).toEqual({ wants: ['EARLY'], avoids: ['NIGHT'] })
    const own = person({ teamId: 'team-1', useTeamPreference: false, wants: ['LATE'], avoids: [] })
    expect(basePreference(own, team)).toEqual({ wants: ['LATE'], avoids: [] })
  })

  it('reads personal preferences when the person has no team', () => {
    expect(basePreference(person({ wants: ['MID'], avoids: ['NIGHT'] }), undefined)).toEqual({
      wants: ['MID'],
      avoids: ['NIGHT'],
    })
  })
})

describe('cellPreference precedence', () => {
  const iso = '2026-01-05'

  it('lets a tag avoid cancel a base want', () => {
    const held = [tag('t1', [rule({ kind: 'avoid', shift: 'NIGHT' })])]
    const pref = cellPreference(person({ wants: ['NIGHT'] }), NO_TEAM, held, 'NIGHT', iso, true)
    expect(pref.baseWant).toBe(false)
    expect(pref.tagAvoid).toBe(true)
    expect(pref.tagWant).toBe(false)
    expect(pref.strictAvoid).toBe(false)
  })

  it('lets a base avoid cancel a tag want', () => {
    const held = [tag('t1', [rule({ kind: 'want', shift: 'NIGHT' })])]
    const pref = cellPreference(person({ avoids: ['NIGHT'] }), NO_TEAM, held, 'NIGHT', iso, true)
    expect(pref.baseAvoid).toBe(true)
    expect(pref.tagWant).toBe(false)
    expect(pref.tagAvoid).toBe(false)
  })

  it('reports base and tag wants together when nothing avoids the cell', () => {
    const held = [tag('t1', [rule({ kind: 'want', shift: 'NIGHT' })])]
    const pref = cellPreference(person({ wants: ['NIGHT'] }), NO_TEAM, held, 'NIGHT', iso, true)
    expect(pref.baseWant).toBe(true)
    expect(pref.tagWant).toBe(true)
    expect(pref.tagAvoid).toBe(false)
  })

  it('folds a strict avoid into the soft tag avoid while H6 is off', () => {
    const held = [tag('t1', [rule({ kind: 'avoid', shift: 'NIGHT', strict: true })])]
    const soft = cellPreference(person({ wants: ['NIGHT'] }), NO_TEAM, held, 'NIGHT', iso, false)
    expect(soft).toEqual({
      baseAvoid: false,
      baseWant: false,
      tagAvoid: true,
      tagWant: false,
      strictAvoid: false,
    })
  })

  it('keeps a strict avoid separate, and it cancels every want, while H6 is on', () => {
    const held = [tag('t1', [rule({ kind: 'avoid', shift: 'NIGHT', strict: true })])]
    const hard = cellPreference(person({ wants: ['NIGHT'] }), NO_TEAM, held, 'NIGHT', iso, true)
    expect(hard).toEqual({
      baseAvoid: false,
      baseWant: false,
      tagAvoid: false,
      tagWant: false,
      strictAvoid: true,
    })
  })

  it('treats a null shift rule as speaking about any shift', () => {
    const held = [tag('t1', [rule({ kind: 'avoid', shift: null })])]
    expect(cellPreference(person(), NO_TEAM, held, 'EARLY', iso, true).tagAvoid).toBe(true)
    expect(cellPreference(person(), NO_TEAM, held, 'NIGHT', iso, true).tagAvoid).toBe(true)
  })

  it('resolves the base preference through the team, then stacks tag rules on it', () => {
    const team: Team = { id: 'team-1', name: 'Alpha', wants: [], avoids: ['NIGHT'] }
    const held = [tag('t1', [rule({ kind: 'want', shift: 'NIGHT' })])]
    const pref = cellPreference(person({ teamId: 'team-1' }), team, held, 'NIGHT', iso, true)
    expect(pref.baseAvoid).toBe(true)
    expect(pref.tagWant).toBe(false)
  })

  it('lets an avoid on one tag beat a want on another tag', () => {
    const held = [
      tag('t1', [rule({ kind: 'want', shift: 'NIGHT' })]),
      tag('t2', [rule({ kind: 'avoid', shift: 'NIGHT' })]),
    ]
    const pref = cellPreference(person(), NO_TEAM, held, 'NIGHT', iso, true)
    expect(pref.tagAvoid).toBe(true)
    expect(pref.tagWant).toBe(false)
  })

  it('reports nothing for a shift no rule mentions', () => {
    const held = [tag('t1', [rule({ kind: 'avoid', shift: 'NIGHT' })])]
    const pref = cellPreference(person({ wants: ['EARLY'] }), NO_TEAM, held, 'EARLY', iso, true)
    expect(pref).toEqual({
      baseAvoid: false,
      baseWant: true,
      tagAvoid: false,
      tagWant: false,
      strictAvoid: false,
    })
  })
})

describe('normalizeTagIds', () => {
  const groups: TagGroup[] = [
    { id: 'g-exclusive', name: 'Faith', exclusive: true },
    { id: 'g-soft', name: 'Shift', exclusive: false },
  ]
  const tags: Tag[] = [
    tag('t1', [], 'g-exclusive'),
    tag('t2', [], 'g-exclusive'),
    tag('t3', [], 'g-soft'),
    tag('t4', [], 'g-soft'),
    tag('loose'),
  ]

  it('drops unknown ids and duplicates', () => {
    expect(normalizeTagIds(['t1', 'ghost', 't1'], tags, groups)).toEqual(['t1'])
    expect(normalizeTagIds(['ghost'], tags, groups)).toEqual([])
  })

  it('keeps only the last listed tag of an exclusive group', () => {
    expect(normalizeTagIds(['t1', 't2'], tags, groups)).toEqual(['t2'])
    expect(normalizeTagIds(['t2', 't1'], tags, groups)).toEqual(['t1'])
    expect(normalizeTagIds(['loose', 't1', 't2'], tags, groups)).toEqual(['loose', 't2'])
  })

  it('keeps every tag of a non-exclusive group, in listed order', () => {
    expect(normalizeTagIds(['t4', 't3'], tags, groups)).toEqual(['t4', 't3'])
    expect(normalizeTagIds(['t3', 't1', 't4'], tags, groups)).toEqual(['t3', 't1', 't4'])
  })
})

describe('togglePersonTag', () => {
  const groups: TagGroup[] = [
    { id: 'g-exclusive', name: 'Faith', exclusive: true },
    { id: 'g-soft', name: 'Shift', exclusive: false },
  ]
  const tags: Tag[] = [
    tag('t1', [], 'g-exclusive'),
    tag('t2', [], 'g-exclusive'),
    tag('t3', [], 'g-soft'),
    tag('loose'),
  ]

  it('adds a tag, and drops it again on the second toggle', () => {
    const added = togglePersonTag([], 't3', tags, groups)
    expect(added).toEqual(['t3'])
    expect(togglePersonTag(added, 't3', tags, groups)).toEqual([])
  })

  it('replaces the other tag when adding into an exclusive group', () => {
    expect(togglePersonTag(['t1'], 't2', tags, groups)).toEqual(['t2'])
    expect(togglePersonTag(['t1', 't3'], 't2', tags, groups)).toEqual(['t3', 't2'])
  })

  it('keeps both tags of a non-exclusive group', () => {
    expect(togglePersonTag(['t3'], 't3', tags, groups)).toEqual([])
    const first = togglePersonTag([], 'loose', tags, groups)
    expect(togglePersonTag(first, 't3', tags, groups)).toEqual(['loose', 't3'])
  })

  it('ignores an unknown tag id', () => {
    expect(togglePersonTag(['t1'], 'ghost', tags, groups)).toEqual(['t1'])
    expect(togglePersonTag([], 'ghost', tags, groups)).toEqual([])
  })
})
