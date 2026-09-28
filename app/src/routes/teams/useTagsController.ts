import { useMemo, useState } from 'react'
import {
  DEFAULT_SHIFTS,
  makeTagRule,
  togglePersonTag,
  type CoverageBand,
  type CoverageTable,
  type TagRule,
  type TagWhen,
} from '@crewdoku/domain'
import { useRosterPeople } from '../../state/roster'
import { useRosterTeams } from '../../state/teams'
import { useRosterShifts } from '../../state/shifts'
import { useTagCoverage, useTagGroups, useTags } from '../../state/tags'
import { useMarkAllSettingsDirty } from '../../state/settingsDirty'
import { useT } from '../../i18n/useT'
import { seedBoardData } from '../../board/periodSeed'
import type { Period } from '../../state/shell'
import { track } from '../../analytics'
import {
  EMPTY_COVERAGE_TABLE,
  withAddedOverride,
  withBandDays,
  withOverrideBand,
  withTagTable,
  withoutOverride,
} from '../settings/coverageEdits'
import {
  addRule,
  addTag,
  addTagGroup,
  addTeamToTag,
  deleteTag,
  deleteTagGroup,
  freshName,
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
 * (delete a tag, make a group exclusive) in one testable place. Coverage is
 * the exception only in that its pure edits live in `routes/settings/coverageEdits.ts`,
 * shared with the org table so the two editors cannot drift.
 */
export function useTagsController(period: Period) {
  const t = useT()
  const initial = useMemo(() => seedBoardData(period), [period])
  const [people, setPeople] = useRosterPeople(initial.people)
  const [teams] = useRosterTeams(initial.teams)
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const [groups, setGroups] = useTagGroups()
  const [tags, setTags] = useTags()
  const [tagCoverage, setTagCoverage] = useTagCoverage()
  const markAllDirty = useMarkAllSettingsDirty()

  // The "one per person" toggle is the one edit that can silently take a tag
  // away from people, so its count is kept to be shown, not just applied.
  const [exclusiveNote, setExclusiveNote] = useState<{ groupId: string; count: number } | null>(null)
  const [bulkTeamId, setBulkTeamId] = useState('')
  const [bulkNote, setBulkNote] = useState<{ tagId: string; count: number } | null>(null)

  const activePeople = useMemo(() => people.filter((p) => !p.removed), [people])

  /**
   * A group created by one click: named "New group", or "New group 2" when
   * that is taken, and returned so the pane can select it and put the caret
   * in its title. Asking for the name first — as the old header input did —
   * is a second decision (and a second place to look) before the thing you
   * asked for exists at all.
   */
  function createGroup(): string | null {
    const name = freshName(groups.map((group) => group.name), t('tags.defaultGroupName'))
    const next = addTagGroup(groups, name)
    if (next === groups) return null
    setGroups(() => next)
    // A new group is never exclusive, so the event records that default.
    track('tag_group_created', { exclusive: false })
    return next[next.length - 1]?.id ?? null
  }

  /** `intoGroupId` lets the group pane add straight into itself, ignoring the selection. */
  function createTag(intoGroupId?: string): string | null {
    const name = freshName(tags.map((tag) => tag.name), t('tags.defaultTagName'))
    const next = addTag(tags, name, intoGroupId)
    if (next === tags) return null
    setTags(() => next)
    track('tag_created', { grouped: intoGroupId !== undefined })
    return next[next.length - 1]?.id ?? null
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

  /** Everyone active holding the tag — the detail pane's member chips. */
  function members(tagId: string) {
    return activePeople.filter((person) => person.tagIds?.includes(tagId))
  }

  function countHolders(tagId: string) {
    return activePeople.reduce((n, person) => (person.tagIds?.includes(tagId) ? n + 1 : n), 0)
  }

  /** Adding or removing a member is the same toggle: clicking a chip's x drops them. */
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

  /** Give a tag a table of its own, so its bands become editable at all. */
  function addCoverage(tagId: string) {
    setTagCoverage((prev) => (tagId in prev ? prev : { ...prev, [tagId]: EMPTY_COVERAGE_TABLE }))
    markAllDirty()
  }

  /** Back to "any shift": the tag stops asking for a minimum or maximum anywhere. */
  function removeCoverage(tagId: string) {
    setTagCoverage((prev) => {
      const rest = { ...prev }
      delete rest[tagId]
      return rest
    })
    markAllDirty()
  }

  /**
   * The four `CoverageTable` edits, bound to one tag's table through the same
   * `with*` helpers Settings uses — and every one of them marks the board
   * stale, which is the whole reason the edit functions are gathered here
   * rather than spread over the card.
   */
  function coverageEdits(tagId: string) {
    const edit = (change: (table: CoverageTable) => CoverageTable) => {
      setTagCoverage((prev) => withTagTable(prev, tagId, change))
      markAllDirty()
    }
    return {
      onSetBandDays: (weekdays: number[], code: string, band: CoverageBand) =>
        edit((table) => withBandDays(table, weekdays, code, band)),
      onAddOverride: (iso: string) => edit((table) => withAddedOverride(table, iso)),
      onSetOverrideBand: (iso: string, code: string, band: CoverageBand) =>
        edit((table) => withOverrideBand(table, iso, code, band)),
      onRemoveOverride: (iso: string) => edit((table) => withoutOverride(table, iso)),
    }
  }

  return {
    people,
    activePeople,
    teams,
    shifts,
    groups,
    tags,
    tagCoverage,
    createGroup,
    createTag,
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
    addCoverage,
    removeCoverage,
    coverageEdits,
  }
}
