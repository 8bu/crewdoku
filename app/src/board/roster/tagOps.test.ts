import { describe, expect, it } from 'vitest'
import type { CoverageTable, Person, Tag, TagGroup } from '@crewdoku/domain'
import {
  addTag,
  addTagGroup,
  addTeamToTag,
  deleteTag,
  deleteTagGroup,
  isTagGroupNameTaken,
  isTagNameTaken,
  removeRule,
  setGroupExclusive,
  setTagGroup,
  updateRule,
} from './tagOps'

const groups: TagGroup[] = [
  { id: 'g1', name: 'Faith', exclusive: false },
  { id: 'g2', name: 'Languages', exclusive: false },
]

function tag(overrides: Partial<Tag> & { id: string }): Tag {
  return { name: overrides.id, rules: [], ...overrides }
}

function person(overrides: Partial<Person> & { id: string }): Person {
  return { name: overrides.id, teamId: 't1', ineligible: [], ...overrides }
}

const band = { min: 1, max: 2 }

function coverageTable(): CoverageTable {
  return { byDow: { 0: { EARLY: band } }, dateOverrides: {} }
}

describe('duplicate names', () => {
  it('ignores case and surrounding space, like shift codes do', () => {
    expect(isTagGroupNameTaken(groups, ' faith ')).toBe(true)
    expect(isTagGroupNameTaken(groups, 'Faiths')).toBe(false)
    expect(isTagNameTaken([tag({ id: 'x', name: 'Ramadan' })], 'ramadan')).toBe(true)
  })

  it('addTagGroup refuses a taken name instead of appending', () => {
    expect(addTagGroup(groups, 'FAITH')).toBe(groups)
    expect(addTagGroup(groups, '   ')).toBe(groups)
    expect(addTagGroup(groups, ' Shifts ').at(-1)!.name).toBe('Shifts')
  })

  it('addTag refuses a taken name, and keeps tags in their own name space', () => {
    const tags = [tag({ id: 'x', name: 'Night owl' })]
    expect(addTag(tags, 'night OWL')).toBe(tags)
    // A tag may reuse a group's word: the two are different catalogs.
    expect(addTag(tags, 'Faith').at(-1)!.name).toBe('Faith')
  })
})

describe('setGroupExclusive', () => {
  const tags = [
    tag({ id: 'a', name: 'Sunni', groupId: 'g1' }),
    tag({ id: 'b', name: 'Shia', groupId: 'g1' }),
    tag({ id: 'c', name: 'Vietnamese', groupId: 'g2' }),
  ]

  it('normalises everyone to one tag of the group, counting who lost one', () => {
    const people = [
      person({ id: 'p1', tagIds: ['a', 'b', 'c'] }),
      person({ id: 'p2', tagIds: ['b', 'c'] }),
      person({ id: 'p3', tagIds: [] }),
    ]
    const result = setGroupExclusive(groups, tags, people, 'g1', true)
    expect(result.groups[0]!.exclusive).toBe(true)
    // The last listed tag of the group wins, exactly as `normalizeTagIds` decides.
    expect(result.people[0]!.tagIds).toEqual(['b', 'c'])
    expect(result.people[1]!.tagIds).toEqual(['b', 'c'])
    expect(result.people[2]).toBe(people[2])
    expect(result.dropped).toBe(1)
  })

  it('leaves people alone when the group is not made exclusive', () => {
    const people = [person({ id: 'p1', tagIds: ['a', 'b'] })]
    const result = setGroupExclusive(groups, tags, people, 'g1', false)
    expect(result.groups[0]!.exclusive).toBe(false)
    expect(result.people).toBe(people)
    expect(result.dropped).toBe(0)
  })

  it('does not count people who lose nothing', () => {
    const people = [person({ id: 'p1', tagIds: ['b'] }), person({ id: 'p2', tagIds: ['c'] })]
    const result = setGroupExclusive(groups, tags, people, 'g1', true)
    expect(result.dropped).toBe(0)
    expect(result.people[0]!.tagIds).toEqual(['b'])
  })
})

describe('deleteTag', () => {
  const tags = [tag({ id: 'a', name: 'Sunni', groupId: 'g1', rules: [] }), tag({ id: 'b', name: 'Shia', groupId: 'g1' })]

  it('takes the tag out of the catalog, every person, and the coverage map', () => {
    const people = [person({ id: 'p1', tagIds: ['a', 'b'] }), person({ id: 'p2', tagIds: ['b'] })]
    const result = deleteTag(tags, people, { a: coverageTable(), b: coverageTable() }, 'a')
    expect(result.tags.map((t) => t.id)).toEqual(['b'])
    expect(result.people[0]!.tagIds).toEqual(['b'])
    expect(result.people[1]).toBe(people[1])
    expect(Object.keys(result.coverage)).toEqual(['b'])
  })
})

describe('deleteTagGroup', () => {
  it('keeps its tags and makes them loose, leaving people untouched', () => {
    const tags = [tag({ id: 'a', groupId: 'g1' }), tag({ id: 'c', groupId: 'g2' })]
    const people = [person({ id: 'p1', tagIds: ['a'] })]
    const result = deleteTagGroup(groups, tags, 'g1')
    expect(result.groups.map((g) => g.id)).toEqual(['g2'])
    expect(result.tags[0]!.name).toBe('a')
    expect('groupId' in result.tags[0]!).toBe(false)
    expect(result.tags[1]!.groupId).toBe('g2')
    expect(people[0]!.tagIds).toEqual(['a'])
  })
})

describe('setTagGroup', () => {
  it('moves a tag between groups and back to loose', () => {
    const tags = [tag({ id: 'a', groupId: 'g1' }), tag({ id: 'c' })]
    const moved = setTagGroup(tags, 'a', 'g2')
    expect(moved[0]!.groupId).toBe('g2')
    expect('groupId' in moved[1]!).toBe(false)
    const loose = setTagGroup(moved, 'a', null)
    expect('groupId' in loose[0]!).toBe(false)
  })
})

describe('addTeamToTag', () => {
  const tags = [
    tag({ id: 'a', name: 'Sunni', groupId: 'g1' }),
    tag({ id: 'b', name: 'Shia', groupId: 'g1' }),
  ]
  const exclusive: TagGroup[] = [{ id: 'g1', name: 'Faith', exclusive: true }]

  it('respects an exclusive group: the bulk tag replaces what the person held', () => {
    const people = [person({ id: 'p1', tagIds: ['b'] }), person({ id: 'p2' })]
    const result = addTeamToTag(people, tags, exclusive, 'a', 't1')
    expect(result.people[0]!.tagIds).toEqual(['a'])
    expect(result.people[1]!.tagIds).toEqual(['a'])
    expect(result.tagged).toBe(2)
  })

  it('skips removed people, other teams, and anyone who already has the tag', () => {
    const people = [
      person({ id: 'p1', tagIds: ['a'] }),
      person({ id: 'p2', removed: true }),
      person({ id: 'p3', teamId: 't2' }),
    ]
    const result = addTeamToTag(people, tags, groups, 'a', 't1')
    expect(result.tagged).toBe(0)
    expect(result.people).toEqual(people)
  })

  it('stacks the tag on a non-exclusive group', () => {
    const people = [person({ id: 'p1', tagIds: ['b'] })]
    const result = addTeamToTag(people, tags, groups, 'a', 't1')
    expect(result.people[0]!.tagIds).toEqual(['b', 'a'])
  })
})

describe('rule lines', () => {
  const rule = { id: 'r1', kind: 'avoid' as const, shift: null, when: { type: 'always' as const }, strict: true }
  const tags = [tag({ id: 'a', rules: [rule] })]

  it('drops the stale strict flag when a line becomes a want', () => {
    const next = updateRule(tags, 'a', 'r1', { kind: 'want' })
    const updated = next[0]!.rules[0]!
    expect(updated.kind).toBe('want')
    expect(updated.strict).toBeUndefined()
  })

  it('keeps strict while the line stays an avoid', () => {
    const next = updateRule(tags, 'a', 'r1', { shift: 'NIGHT' })
    expect(next[0]!.rules[0]!.strict).toBe(true)
  })

  it('removes only the named line', () => {
    const two = [tag({ id: 'a', rules: [rule, { ...rule, id: 'r2' }] })]
    expect(removeRule(two, 'a', 'r1')[0]!.rules.map((r) => r.id)).toEqual(['r2'])
  })
})
