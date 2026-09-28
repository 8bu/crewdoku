/**
 * Pure tag-catalog edits — the Teams → Tags view and the person panel both
 * come through here, so create/rename/move/delete and the rule lines stay
 * testable without a DOM. Mirrors `teamOps.ts`'s shape.
 *
 * Two of these are more than a filter, and that is the point: deleting a tag
 * takes it out of every person's `tagIds` *and* drops its coverage table, and
 * flipping a group to exclusive re-normalises every person against the new
 * rule. Deleting a group is deliberately the cheap one — its tags survive as
 * loose tags (a folder is not its contents).
 */
import {
  makeTag,
  makeTagGroup,
  normalizeTagIds,
  togglePersonTag,
  type CoverageTable,
  type Person,
  type Tag,
  type TagGroup,
  type TagRule,
} from '@crewdoku/domain'

/** Case-insensitive name check, the same rule `shiftOps.isCodeTaken` applies to shift codes. */
export function isTagGroupNameTaken(groups: readonly TagGroup[], name: string): boolean {
  const wanted = name.trim().toLowerCase()
  return groups.some((g) => g.name.trim().toLowerCase() === wanted)
}

/** Tags have their own name space — a tag may carry the same word as a group. */
export function isTagNameTaken(tags: readonly Tag[], name: string): boolean {
  const wanted = name.trim().toLowerCase()
  return tags.some((t) => t.name.trim().toLowerCase() === wanted)
}

/**
 * The name a one-click "new tag"/"new group" starts from: the bare default,
 * then "New tag 2", " 3"… on collision. Creating without asking for a name is
 * only safe if the result is always a *distinct* row — `addTag` refuses a
 * duplicate outright, so a second "New tag" would otherwise do nothing at all.
 * Same case-insensitive rule as `isTagNameTaken`, since that is what decides
 * whether the name we hand back is accepted.
 */
export function freshName(existing: readonly string[], base: string): string {
  const taken = existing.map((name) => name.trim().toLowerCase())
  if (!taken.includes(base.trim().toLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.includes(candidate.toLowerCase())) return candidate
  }
}

/** A new group starts non-exclusive: one-per-person is a deliberate per-group choice. */
export function addTagGroup(groups: TagGroup[], name: string): TagGroup[] {
  const trimmed = name.trim()
  if (trimmed === '' || isTagGroupNameTaken(groups, trimmed)) return groups
  return [...groups, makeTagGroup(trimmed)]
}

export function renameTagGroup(groups: TagGroup[], groupId: string, name: string): TagGroup[] {
  return groups.map((g) => (g.id === groupId ? { ...g, name } : g))
}

/**
 * Flips "one tag per person". Turning it on re-normalises every person's
 * `tagIds` (the last listed tag of the group wins) and counts how many people
 * actually lost one, so the caller can say so rather than change a roster
 * silently. Turning it off changes nothing about who holds what.
 */
export function setGroupExclusive(
  groups: readonly TagGroup[],
  tags: readonly Tag[],
  people: Person[],
  groupId: string,
  exclusive: boolean,
): { groups: TagGroup[]; people: Person[]; dropped: number } {
  const nextGroups = groups.map((g) => (g.id === groupId ? { ...g, exclusive } : g))
  if (!exclusive) return { groups: nextGroups, people, dropped: 0 }

  let dropped = 0
  const nextPeople = people.map((person) => {
    const before = person.tagIds ?? []
    if (before.length === 0) return person
    const after = normalizeTagIds(before, tags, nextGroups)
    if (after.length === before.length && after.every((id, i) => id === before[i])) return person
    if (before.some((id) => !after.includes(id))) dropped++
    return { ...person, tagIds: after }
  })
  return { groups: nextGroups, people: nextPeople, dropped }
}

/** `groupId` omitted rather than set to `undefined`, so a loose tag has one shape. */
function withoutGroup(tag: Tag): Tag {
  return { id: tag.id, name: tag.name, rules: tag.rules }
}

/** Deleting a group keeps its tags: they become loose, nothing else references a group id. */
export function deleteTagGroup(
  groups: TagGroup[],
  tags: Tag[],
  groupId: string,
): { groups: TagGroup[]; tags: Tag[] } {
  return {
    groups: groups.filter((g) => g.id !== groupId),
    tags: tags.map((tag) => (tag.groupId === groupId ? withoutGroup(tag) : tag)),
  }
}

export function addTag(tags: Tag[], name: string, groupId?: string): Tag[] {
  const trimmed = name.trim()
  if (trimmed === '' || isTagNameTaken(tags, trimmed)) return tags
  return [...tags, makeTag(trimmed, groupId || undefined)]
}

export function renameTag(tags: Tag[], tagId: string, name: string): Tag[] {
  return tags.map((tag) => (tag.id === tagId ? { ...tag, name } : tag))
}

/** Moves a tag between groups; `null` makes it loose. */
export function setTagGroup(tags: Tag[], tagId: string, groupId: string | null): Tag[] {
  return tags.map((tag) => {
    if (tag.id !== tagId) return tag
    return groupId === null ? withoutGroup(tag) : { ...tag, groupId }
  })
}

/** Deletes a tag and everything that points at it: every person's `tagIds`, and its coverage table. */
export function deleteTag(
  tags: Tag[],
  people: Person[],
  coverage: Readonly<Record<string, CoverageTable>>,
  tagId: string,
): { tags: Tag[]; people: Person[]; coverage: Record<string, CoverageTable> } {
  return {
    tags: tags.filter((tag) => tag.id !== tagId),
    people: people.map((person) => {
      const held = person.tagIds
      if (!held || !held.includes(tagId)) return person
      return { ...person, tagIds: held.filter((id) => id !== tagId) }
    }),
    coverage: Object.fromEntries(Object.entries(coverage).filter(([id]) => id !== tagId)),
  }
}

export function addRule(tags: Tag[], tagId: string, rule: TagRule): Tag[] {
  return tags.map((tag) => (tag.id === tagId ? { ...tag, rules: [...tag.rules, rule] } : tag))
}

/**
 * Edits one rule line in place. `strict` is dropped when the line becomes a
 * want — the domain ignores it there, and leaving a stale `true` on a rule
 * that no longer means it is the kind of leftover that reads as a bug later.
 */
export function updateRule(
  tags: Tag[],
  tagId: string,
  ruleId: string,
  patch: Partial<Omit<TagRule, 'id'>>,
): Tag[] {
  return tags.map((tag) => {
    if (tag.id !== tagId) return tag
    return {
      ...tag,
      rules: tag.rules.map((rule) => {
        if (rule.id !== ruleId) return rule
        const next = { ...rule, ...patch }
        if (next.kind === 'want' && next.strict) {
          return { id: next.id, kind: next.kind, shift: next.shift, when: next.when }
        }
        return next
      }),
    }
  })
}

export function removeRule(tags: Tag[], tagId: string, ruleId: string): Tag[] {
  return tags.map((tag) => (tag.id === tagId ? { ...tag, rules: tag.rules.filter((r) => r.id !== ruleId) } : tag))
}

/**
 * The one-time "add everyone in team X" bulk action. Each person goes through
 * `togglePersonTag`, so a tag in an exclusive group replaces whatever that
 * person already held from that group instead of stacking a second one.
 * Removed people are left alone — they are not on the schedule to prefer
 * anything, and one bulk tap should not resurrect them.
 */
export function addTeamToTag(
  people: Person[],
  tags: readonly Tag[],
  groups: readonly TagGroup[],
  tagId: string,
  teamId: string,
): { people: Person[]; tagged: number } {
  let tagged = 0
  const nextPeople = people.map((person) => {
    if (person.removed || person.teamId !== teamId || person.tagIds?.includes(tagId)) return person
    tagged++
    return { ...person, tagIds: togglePersonTag(person.tagIds ?? [], tagId, tags, groups) }
  })
  return { people: nextPeople, tagged }
}
