import { useMemo, useRef, useState } from 'react'
import {
  DEFAULT_SHIFTS,
  makeTagRule,
  togglePersonTag,
  type TagRule,
  type TagWhen,
} from '@crewdoku/domain'
import { useRosterPeople } from '../../state/roster'
import { useRosterTeams } from '../../state/teams'
import { useRosterShifts } from '../../state/shifts'
import { useTagCoverage, useTagGroups, useTags } from '../../state/tags'
import { seedBoardData } from '../../board/periodSeed'
import type { Period } from '../../state/shell'
import { track } from '../../analytics'
import {
  addRule,
  addTag,
  addTagGroup,
  addTeamToTag,
  deleteTag,
  deleteTagGroup,
  isTagGroupNameTaken,
  isTagNameTaken,
  removeRule,
  renameTag,
  renameTagGroup,
  setGroupExclusive,
  setTagGroup,
  updateRule,
} from '../../board/roster/tagOps'

/**
 * Shared state/behaviour behind the Tags view (the Teams page's second half)
 * and the person panel's tag chips — the same shape as `useTeamsController`,
 * with the tag catalog on top of the roster it tags.
 *
 * The catalog itself lives in `state/tags.ts` (three atoms, hydrated with the
 * rest of the workspace), so this hook is the only place the Tags view writes
 * them: every edit goes through `tagOps`, which is what keeps the cascades
 * (delete a tag, make a group exclusive) in one testable place.
 */
export function useTagsController(period: Period) {
  const initial = useMemo(() => seedBoardData(period), [period])
  const [people, setPeople] = useRosterPeople(initial.people)
  const [teams] = useRosterTeams(initial.teams)
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const [groups, setGroups] = useTagGroups()
  const [tags, setTags] = useTags()
  const [tagCoverage, setTagCoverage] = useTagCoverage()

  const [newGroupName, setNewGroupName] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagGroupId, setNewTagGroupId] = useState('')
  // The "one per person" toggle is the one edit that can silently take a tag
  // away from people, so its count is kept to be shown, not just applied.
  const [exclusiveNote, setExclusiveNote] = useState<{ groupId: string; count: number } | null>(null)
  const [bulkTeamId, setBulkTeamId] = useState('')
  const [bulkNote, setBulkNote] = useState<{ tagId: string; count: number } | null>(null)
  const newGroupInputRef = useRef<HTMLInputElement | null>(null)
  const newTagInputRef = useRef<HTMLInputElement | null>(null)

  const activePeople = useMemo(() => people.filter((p) => !p.removed), [people])

  const newGroupNameTaken = newGroupName.trim() !== '' && isTagGroupNameTaken(groups, newGroupName)
  const newTagNameTaken = newTagName.trim() !== '' && isTagNameTaken(tags, newTagName)

  function handleAddGroup() {
    const name = newGroupName.trim()
    if (name === '' || isTagGroupNameTaken(groups, name)) return
    const next = addTagGroup(groups, name)
    setGroups(() => next)
    // A group you have just made is where the next tag is going, so the create
    // row's picker points at it instead of leaving tags to land ungrouped.
    const created = next[next.length - 1]
    if (created) setNewTagGroupId(created.id)
    // A new group is never exclusive, so the event records that default.
    track('tag_group_created', { exclusive: false })
    setNewGroupName('')
    newGroupInputRef.current?.focus()
  }

  /** `intoGroupId` lets the group pane add straight into itself, ignoring the picker. */
  function handleAddTag(intoGroupId?: string) {
    const name = newTagName.trim()
    if (name === '' || isTagNameTaken(tags, name)) return
    const groupId = intoGroupId ?? (newTagGroupId === '' ? undefined : newTagGroupId)
    setTags((prev) => addTag(prev, name, groupId))
    track('tag_created', { grouped: groupId !== undefined })
    setNewTagName('')
    newTagInputRef.current?.focus()
  }

  function setExclusive(groupId: string, exclusive: boolean) {
    const result = setGroupExclusive(groups, tags, people, groupId, exclusive)
    setGroups(() => result.groups)
    setPeople(() => result.people)
    setExclusiveNote(result.dropped > 0 ? { groupId, count: result.dropped } : null)
  }

  function removeGroup(groupId: string) {
    const result = deleteTagGroup(groups, tags, groupId)
    setGroups(() => result.groups)
    setTags(() => result.tags)
    setExclusiveNote(null)
  }

  function removeTag(tagId: string) {
    const result = deleteTag(tags, people, tagCoverage, tagId)
    setTags(() => result.tags)
    setPeople(() => result.people)
    setTagCoverage(() => result.coverage)
    setBulkNote(null)
  }

  /** Everyone active holding the tag — the detail pane's member list. */
  function members(tagId: string) {
    return activePeople.filter((person) => person.tagIds?.includes(tagId))
  }

  function countHolders(tagId: string) {
    return activePeople.reduce((n, person) => (person.tagIds?.includes(tagId) ? n + 1 : n), 0)
  }

  /** Adding or removing a member is the same toggle: clicking a member row drops them. */
  function toggleMember(personId: string, tagId: string) {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === personId ? { ...person, tagIds: togglePersonTag(person.tagIds ?? [], tagId, tags, groups) } : person,
      ),
    )
  }

  function addTeam(tagId: string, teamId: string) {
    const result = addTeamToTag(people, tags, groups, tagId, teamId)
    setPeople(() => result.people)
    setBulkNote({ tagId, count: result.tagged })
    track('tag_team_applied', { people: result.tagged })
  }

  function addRuleLine(tagId: string) {
    // A new line starts inert: "avoid, any shift, every week on <no days yet>"
    // matches nothing until the user picks days. The old default — "always" —
    // was a silent "never schedule this shift", which is a trap to open into.
    const when: TagWhen = { type: 'weekly', weekdays: [] }
    const rule = makeTagRule('avoid', null, when)
    setTags((prev) => addRule(prev, tagId, rule))
    track('tag_rule_added', { kind: rule.kind, strict: rule.strict === true, repeat: rule.when.type })
  }

  function changeRule(tagId: string, ruleId: string, patch: Partial<Omit<TagRule, 'id'>>) {
    setTags((prev) => updateRule(prev, tagId, ruleId, patch))
  }

  function removeRuleLine(tagId: string, ruleId: string) {
    setTags((prev) => removeRule(prev, tagId, ruleId))
  }

  return {
    people,
    activePeople,
    teams,
    shifts,
    groups,
    tags,
    newGroupName,
    setNewGroupName,
    newGroupNameTaken,
    newGroupInputRef,
    handleAddGroup,
    newTagName,
    setNewTagName,
    newTagNameTaken,
    newTagGroupId,
    setNewTagGroupId,
    newTagInputRef,
    handleAddTag,
    renameGroup: (groupId: string, name: string) => setGroups((prev) => renameTagGroup(prev, groupId, name)),
    renameTag: (tagId: string, name: string) => setTags((prev) => renameTag(prev, tagId, name)),
    setTagGroup: (tagId: string, groupId: string | null) => setTags((prev) => setTagGroup(prev, tagId, groupId)),
    setExclusive,
    exclusiveNote,
    removeGroup,
    removeTag,
    members,
    countHolders,
    toggleMember,
    bulkTeamId,
    setBulkTeamId,
    bulkNote,
    addTeam,
    addRuleLine,
    changeRule,
    removeRuleLine,
  }
}
