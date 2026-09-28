import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { UNASSIGNED_TEAM_ID, type Person, type Tag } from '@crewdoku/domain'
import { ChevronLeft, ChevronRight, Plus, X } from '../../ui/icons'
import { useT } from '../../i18n/useT'
import { useIsNarrow } from '../../ui/useIsNarrow'
import { Input } from '../../ui/Input'
import { DeleteButton } from '../../ui/DeleteButton'
import { UNASSIGNED_TEAM } from '../../board/mockBoard'
import type { Period } from '../../state/shell'
import { AdaptiveSelect, TagRuleEditor } from './TagRuleEditor'
import { useTagsController } from './useTagsController'

/** What the detail pane is showing: one group's settings, or one tag's people and rules. */
type Selection = { kind: 'group'; id: string } | { kind: 'tag'; id: string }

/** A list row — the same shape the Teams list uses, so both halves read as one page. */
const rowCls =
  'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent bg-transparent px-3 py-1.5 text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200 data-[active]:border-primary/30 data-[active]:bg-primary/10 data-[active]:font-semibold data-[active]:text-primary md:min-h-0 md:px-2.5'

const heading = 'm-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40'

/**
 * The Teams page's second half: tags as a second grouping of people, across
 * teams (religion, language, student status…). Same master-detail layout and
 * the same narrow-screen behaviour as the Teams view it sits beside — the
 * list IS the page under `md`, and a tapped row swaps in the detail behind a
 * back row.
 *
 * A group is only a folder plus one policy flag ("one per person"); the
 * preferences themselves are the tag's rule lines, which read as sentences
 * because that is what they are — see `TagRuleEditor`.
 */
export function TagsView({ period, viewSwitch }: { period: Period; viewSwitch: ReactNode }) {
  const t = useT()
  const isNarrow = useIsNarrow()
  const c = useTagsController(period)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Selection | null>(null)

  // Nothing selected (first visit) or the selection was just deleted: land on
  // the first group, or the first tag when there are no groups at all.
  const firstGroup = c.groups[0]
  const firstTag = c.tags[0]
  const fallback: Selection | null = firstGroup
    ? { kind: 'group', id: firstGroup.id }
    : firstTag
      ? { kind: 'tag', id: firstTag.id }
      : null
  const selId = selection?.id
  const stillThere = selId !== undefined && (selection?.kind === 'group' ? c.groups : c.tags).some((x) => x.id === selId)
  const selected = stillThere ? selection : fallback
  /** `group:<id>` / `tag:<id>` — one comparable key for the list's active row. */
  const selectedKey = selected === null ? '' : `${selected.kind}:${selected.id}`
  const selectedGroup = selected?.kind === 'group' ? c.groups.find((g) => g.id === selected.id) : undefined
  const selectedTag = selected?.kind === 'tag' ? c.tags.find((x) => x.id === selected.id) : undefined
  const groupTags = selectedGroup === undefined ? [] : c.tags.filter((tag) => tag.groupId === selectedGroup.id)
  const members = selectedTag === undefined ? [] : c.members(selectedTag.id)
  const candidates =
    selectedTag === undefined ? [] : c.activePeople.filter((person) => !person.tagIds?.includes(selectedTag.id))

  const looseTags = useMemo(
    () => c.tags.filter((tag) => !tag.groupId || !c.groups.some((group) => group.id === tag.groupId)),
    [c.tags, c.groups],
  )

  // The create row's group picker follows the pane in front of you: a group you
  // just opened is where the next tag goes, and a tag you opened puts it beside
  // that tag (and moving that tag to another group moves the picker with it).
  // Picking another group by hand still wins until the pane changes, so the
  // picker is a default, never a lock.
  const selectionGroupId = selectedGroup?.id ?? selectedTag?.groupId ?? ''
  useEffect(() => {
    c.setNewTagGroupId(selectionGroupId)
  }, [c.setNewTagGroupId, selectedKey, selectionGroupId])

  // Bulk tagging only means something where someone is still missing the tag.
  // With no such team the whole row is hidden rather than offering a no-op, and
  // a team that has just been completed stops being listed (nor stays chosen).
  const bulkTeams =
    selectedTag === undefined
      ? []
      : [...c.teams, UNASSIGNED_TEAM].filter((team) =>
          c.activePeople.some((person) => person.teamId === team.id && !person.tagIds?.includes(selectedTag.id)),
        )
  const bulkTeamId = bulkTeams.some((team) => team.id === c.bulkTeamId) ? c.bulkTeamId : ''

  function teamLabel(teamId: string) {
    if (teamId === UNASSIGNED_TEAM_ID) return t('rtc.common.unassigned')
    return c.teams.find((team) => team.id === teamId)?.name || t('rtc.common.unnamed')
  }

  const teamOptions = bulkTeams.map((team) => ({ value: team.id, label: teamLabel(team.id) }))

  function open(item: Selection) {
    setSelection(item)
    setPendingDelete(null)
    // Touch has no hover to preview a pane: a tap opens the item, a second
    // tap never deselects it.
    if (isNarrow) setDetailOpen(true)
  }

  function tagRow(tag: Tag, indent: boolean) {
    return (
      <button
        type="button"
        onClick={() => open({ kind: 'tag', id: tag.id })}
        className={`${rowCls} ${indent ? 'pl-6 md:pl-5' : ''}`}
        data-active={selectedKey === `tag:${tag.id}` || undefined}
      >
        <span className="truncate">{tag.name || t('rtc.common.unnamed')}</span>
        <span className="font-mono text-sm text-base-content/60">{c.countHolders(tag.id)}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-base-content/30 md:hidden" />
      </button>
    )
  }

  const showList = !isNarrow || !detailOpen
  const showDetail = !isNarrow || detailOpen
  const groupTagCount = c.groups.length === 1 ? t('tags.count.group', { count: c.groups.length }) : t('tags.count.groups', { count: c.groups.length })
  const tagCount = c.tags.length === 1 ? t('tags.count.tag', { count: c.tags.length }) : t('tags.count.tags', { count: c.tags.length })

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-300 px-4 py-2 md:h-12 md:flex-nowrap md:py-0">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('tags.title')}</h1>
        <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
          {groupTagCount} · {tagCount}
        </span>
        {viewSwitch}
        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto md:flex-nowrap">
          <Input
            ref={c.newGroupInputRef}
            type="text"
            value={c.newGroupName}
            onChange={(e) => c.setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') c.handleAddGroup()
            }}
            placeholder={t('tags.newGroupPlaceholder')}
            className="order-last w-full md:order-none md:w-44"
          />
          <button
            type="button"
            onClick={c.handleAddGroup}
            disabled={!c.newGroupName.trim() || c.newGroupNameTaken}
            title={c.newGroupNameTaken ? t('tags.nameTaken') : undefined}
            className="btn btn-primary btn-sm min-h-11 flex-1 gap-1.5 md:min-h-0 md:flex-initial"
          >
            <Plus className="h-4 w-4" />
            {t('tags.addGroup')}
          </button>
          {/* A `title` never fires on touch — the why-won't-this-work answer
              has to be on the page itself below `md`. */}
          {c.newGroupNameTaken && <p className="order-last m-0 w-full text-2xs text-error md:hidden">{t('tags.nameTaken')}</p>}
        </div>
      </div>

      {/* Mobile: one pane at a time in a column (list, then the tapped item's
          detail). `md:` restores the same 260px + fluid grid the Teams list uses. */}
      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[260px_1fr]">
        {showList && (
          <aside className="flex min-h-0 flex-1 flex-col border-b border-base-300 md:border-b-0 md:border-r">
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {c.groups.map((group) => {
                  const groupTags = c.tags.filter((tag) => tag.groupId === group.id)
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => open({ kind: 'group', id: group.id })}
                        className={rowCls}
                        data-active={selectedKey === `group:${group.id}` || undefined}
                      >
                        <span className="min-w-0 flex-1 truncate">{group.name || t('rtc.common.unnamed')}</span>
                        {/* One-per-person is per group, so the row says which
                            groups carry it. The switch itself is in the detail
                            pane: beside the group's own name is where its
                            policy is read and changed, not in a list of rows. */}
                        {group.exclusive && (
                          <span className="shrink-0 text-2xs text-base-content/50">{t('tags.group.exclusive')}</span>
                        )}
                        <span className="font-mono text-sm text-base-content/60">{groupTags.length}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-base-content/30 md:hidden" />
                      </button>
                      {groupTags.length > 0 && (
                        <ul className="m-0 mt-0.5 flex list-none flex-col gap-0.5 p-0">
                          {groupTags.map((tag) => (
                            <li key={tag.id}>{tagRow(tag, true)}</li>
                          ))}
                        </ul>
                      )}
                      {/* Said out loud where the switch was flipped: making a
                          group exclusive can take a tag off someone, and the
                          list row is the only switch on screen when the detail
                          pane is showing something else. */}
                      {c.exclusiveNote?.groupId === group.id && (
                        <p className="m-0 py-1 pl-6 text-2xs text-warning">
                          {c.exclusiveNote.count === 1
                            ? t('tags.group.exclusiveDropped.person', { count: c.exclusiveNote.count })
                            : t('tags.group.exclusiveDropped.people', { count: c.exclusiveNote.count })}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>

              {looseTags.length > 0 && (
                <div className="mt-2.5">
                  <h2 className={`${heading} px-2.5 pb-1`}>{t('tags.ungrouped')}</h2>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {looseTags.map((tag) => (
                      <li key={tag.id}>{tagRow(tag, false)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {c.tags.length === 0 && (
                <p className="px-3 py-3 text-sm text-base-content/40">{t('tags.empty')}</p>
              )}
            </div>

            {/* A new tag needs a name *and* somewhere to live, so the create row
                sits under the tree where both answers are visible — pinned to
                the pane's bottom edge, inside thumb reach on a phone. The name
                gets a row to itself: three controls side by side in a 260px
                column left it too narrow to show its own placeholder. */}
            <div className="flex shrink-0 flex-col gap-2 border-t border-base-300 p-2">
              <Input
                ref={c.newTagInputRef}
                type="text"
                value={c.newTagName}
                onChange={(e) => c.setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') c.handleAddTag()
                }}
                placeholder={t('tags.newTagPlaceholder')}
                className="w-full"
              />
              <div className="flex items-center gap-2">
                <AdaptiveSelect
                  value={c.newTagGroupId}
                  onChange={c.setNewTagGroupId}
                  options={[{ value: '', label: t('tags.ungrouped') }, ...c.groups.map((group) => ({ value: group.id, label: group.name || t('rtc.common.unnamed') }))]}
                  ariaLabel={t('tags.tag.groupAria')}
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => c.handleAddTag()}
                  disabled={!c.newTagName.trim() || c.newTagNameTaken}
                  className="btn btn-primary btn-sm min-h-11 shrink-0 gap-1.5 md:min-h-0"
                >
                  <Plus className="h-4 w-4" />
                  {t('tags.addTag')}
                </button>
              </div>
              {c.newTagNameTaken && <p className="m-0 text-2xs text-error">{t('tags.nameTaken')}</p>}
            </div>
          </aside>
        )}

        {showDetail && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isNarrow && (
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="sticky top-0 z-[2] flex min-h-11 w-full cursor-pointer items-center gap-1.5 border-b border-base-300 bg-base-100 px-4 text-left text-sm font-semibold text-base-content transition-colors duration-150 hover:bg-base-200"
              >
                <ChevronLeft className="h-5 w-5 shrink-0" />
                {t('chrome.back')}
              </button>
            )}
            <div className="flex max-w-[640px] flex-col gap-5 px-4 py-4 md:px-5">
              {selectedGroup && (
                <>
                  <Input
                    type="text"
                    value={selectedGroup.name}
                    onChange={(e) => c.renameGroup(selectedGroup.id, e.target.value)}
                    placeholder={t('tags.group.namePlaceholder')}
                    className="max-w-[360px] text-lg font-semibold text-base-content"
                  />

                  <div className="flex flex-col gap-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-base-content md:min-h-0">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={selectedGroup.exclusive}
                        onChange={(e) => c.setExclusive(selectedGroup.id, e.target.checked)}
                      />
                      {t('tags.group.exclusive')}
                    </label>
                    <p className="m-0 text-2xs text-base-content/50">{t('tags.group.exclusiveHint')}</p>
                    {/* Said out loud once, when it happens: making a group
                        exclusive can take a tag off someone. */}
                    {c.exclusiveNote?.groupId === selectedGroup.id && (
                      <p className="m-0 text-2xs text-warning">
                        {c.exclusiveNote.count === 1
                          ? t('tags.group.exclusiveDropped.person', { count: c.exclusiveNote.count })
                          : t('tags.group.exclusiveDropped.people', { count: c.exclusiveNote.count })}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className={heading}>{t('tags.group.tagsHeader', { count: groupTags.length })}</h2>
                    {groupTags.length === 0 ? (
                      <p className="m-0 text-sm text-base-content/40">{t('tags.group.noTags')}</p>
                    ) : (
                      <ul className="m-0 flex max-w-full list-none flex-col p-0 md:max-w-[420px]">
                        {groupTags.map((tag) => (
                          <li key={tag.id} className="border-b border-base-300/60">
                            <button
                              type="button"
                              onClick={() => open({ kind: 'tag', id: tag.id })}
                              className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200/40 md:min-h-0 md:px-2.5"
                            >
                              <span className="truncate">{tag.name || t('rtc.common.unnamed')}</span>
                              <span className="font-mono text-2xs text-base-content/50">{c.countHolders(tag.id)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {pendingDelete?.kind === 'group' && pendingDelete.id === selectedGroup.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-base-content">{t('tags.group.confirmDelete')}</span>
                        <button
                          type="button"
                          onClick={() => c.removeGroup(selectedGroup.id)}
                          className="btn btn-error btn-sm min-h-11 md:min-h-0"
                        >
                          {t('rtc.teams.confirmDelete')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="btn btn-ghost btn-sm min-h-11 md:min-h-0"
                        >
                          {t('rtc.common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <DeleteButton
                          label={t('tags.group.delete')}
                          onClick={() => setPendingDelete({ kind: 'group', id: selectedGroup.id })}
                        />
                        <p className="m-0 text-2xs text-base-content/40">{t('tags.group.deleteHint')}</p>
                      </>
                    )}
                  </div>
                </>
              )}

              {selectedTag && (
                <>
                  <Input
                    type="text"
                    value={selectedTag.name}
                    onChange={(e) => c.renameTag(selectedTag.id, e.target.value)}
                    placeholder={t('tags.tag.namePlaceholder')}
                    className="max-w-[360px] text-lg font-semibold text-base-content"
                  />

                  <div className="flex flex-col gap-2">
                    <h2 className={heading}>{t('tags.tag.groupAria')}</h2>
                    <AdaptiveSelect
                      value={selectedTag.groupId ?? ''}
                      onChange={(value) => c.setTagGroup(selectedTag.id, value === '' ? null : value)}
                      options={[
                        { value: '', label: t('tags.ungrouped') },
                        ...c.groups.map((group) => ({ value: group.id, label: group.name || t('rtc.common.unnamed') })),
                      ]}
                      ariaLabel={t('tags.tag.groupAria')}
                      className="w-full md:w-52"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className={heading}>{t('tags.tag.membersHeader', { count: members.length })}</h2>
                    {/* One line says which of the three states this is: nobody
                        on the roster at all, nobody holding the tag, or a list.
                        "Everyone active already has this tag" below is only true
                        when there is someone it could be true of. */}
                    {c.activePeople.length === 0 ? (
                      <p className="m-0 text-sm text-base-content/40">{t('tags.tag.noRoster')}</p>
                    ) : members.length === 0 ? (
                      <p className="m-0 text-sm text-base-content/40">{t('tags.tag.noMembers')}</p>
                    ) : (
                      <ul className="m-0 flex max-w-full list-none flex-col p-0 md:max-w-[420px]">
                        {members.map((person) => (
                          <li
                            key={person.id}
                            className="flex min-h-11 items-center justify-between gap-2 border-b border-base-300/60 text-sm transition-colors duration-150 hover:bg-base-200/40 md:min-h-0 md:pl-2.5 md:pr-1"
                          >
                            <span className="truncate">{person.name || t('rtc.common.unnamed')}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="text-2xs text-base-content/40">{teamLabel(person.teamId)}</span>
                              <button
                                type="button"
                                onClick={() => c.toggleMember(person.id, selectedTag.id)}
                                aria-label={t('tags.tag.removeMemberAria', { name: person.name || t('rtc.common.unnamed') })}
                                className="btn btn-ghost btn-xs min-h-11 min-w-11 text-base-content/50 hover:text-error md:min-h-0 md:min-w-0"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {candidates.length > 0 ? (
                      <AddMemberSearch
                        key={selectedTag.id}
                        candidates={candidates}
                        teamLabel={teamLabel}
                        onAdd={(personId) => c.toggleMember(personId, selectedTag.id)}
                      />
                    ) : (
                      c.activePeople.length > 0 && <p className="m-0 text-xs text-base-content/40">{t('tags.tag.everyoneHas')}</p>
                    )}

                    {/* One-time, not live: tagging a whole team is a bulk
                        starting point, and the chips above stay the truth. */}
                    {bulkTeams.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`${heading} w-full md:w-auto`}>{t('tags.tag.bulkLabel')}</span>
                        {/* Under `md` the label takes its own line and the
                            picker + button share the next one, both thumb-reach
                            wide; at `md` this is the single row it always was. */}
                        <div className="flex w-full min-w-0 items-center gap-2 md:w-auto">
                          <AdaptiveSelect
                            value={bulkTeamId}
                            onChange={c.setBulkTeamId}
                            options={teamOptions}
                            ariaLabel={t('tags.tag.bulkTeamAria')}
                            className="min-w-0 flex-1 md:w-48 md:flex-initial"
                          />
                          <button
                            type="button"
                            disabled={bulkTeamId === ''}
                            onClick={() => c.addTeam(selectedTag.id, bulkTeamId)}
                            className="btn btn-outline btn-sm min-h-11 shrink-0 md:min-h-0"
                          >
                            {t('tags.tag.bulkAdd')}
                          </button>
                        </div>
                      </div>
                    )}
                    {c.bulkNote?.tagId === selectedTag.id && (
                      <p className="m-0 text-2xs text-base-content/50">
                        {c.bulkNote.count === 0
                          ? t('tags.tag.bulkNone')
                          : c.bulkNote.count === 1
                            ? t('tags.tag.bulkDone.person', { count: c.bulkNote.count })
                            : t('tags.tag.bulkDone.people', { count: c.bulkNote.count })}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className={heading}>{t('tags.tag.rulesHeader')}</h2>
                    <TagRuleEditor
                      tag={selectedTag}
                      shifts={c.shifts}
                      periodStart={period.start}
                      onAddRule={() => c.addRuleLine(selectedTag.id)}
                      onPatchRule={(ruleId, patch) => c.changeRule(selectedTag.id, ruleId, patch)}
                      onRemoveRule={(ruleId) => c.removeRuleLine(selectedTag.id, ruleId)}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    {pendingDelete?.kind === 'tag' && pendingDelete.id === selectedTag.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-base-content">{t('tags.tag.confirmDelete')}</span>
                        <button
                          type="button"
                          onClick={() => {
                            c.removeTag(selectedTag.id)
                            setPendingDelete(null)
                            // The tag the pane was showing is gone; the list is
                            // the only honest place to land back on.
                            if (isNarrow) setDetailOpen(false)
                          }}
                          className="btn btn-error btn-sm min-h-11 md:min-h-0"
                        >
                          {t('rtc.teams.confirmDelete')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="btn btn-ghost btn-sm min-h-11 md:min-h-0"
                        >
                          {t('rtc.common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <DeleteButton
                          label={t('tags.tag.delete')}
                          onClick={() => setPendingDelete({ kind: 'tag', id: selectedTag.id })}
                        />
                        <p className="m-0 text-2xs text-base-content/40">{t('tags.tag.deleteHint')}</p>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* The list already says there are no tags yet; here the pane says
                  what tags are for, which is the question an empty pane leaves
                  open. */}
              {!selectedGroup && !selectedTag && (
                <p className="m-0 max-w-[420px] text-sm text-base-content/50">{t('tags.emptyHint')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Type-to-filter over the people who do not hold the tag yet. The roster runs
 * to 1000+, so nothing renders until there is a query and matches cap at 8 —
 * the same shape as the Teams view's member search, with this surface's own
 * copy.
 */
function AddMemberSearch({
  candidates,
  teamLabel,
  onAdd,
}: {
  candidates: Person[]
  teamLabel: (teamId: string) => string
  onAdd: (personId: string) => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const results = q ? candidates.filter((person) => person.name.toLowerCase().includes(q)).slice(0, 8) : []

  return (
    <div className="relative mt-1 w-full max-w-full md:max-w-[420px]">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          candidates.length === 1
            ? t('tags.tag.searchToAdd.person', { count: candidates.length })
            : t('tags.tag.searchToAdd.people', { count: candidates.length })
        }
        className="w-full"
      />
      {q && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 flex max-h-[260px] list-none flex-col gap-0.5 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1.5 shadow-lg">
          {results.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-base-content/40">{t('tags.tag.noMatch')}</li>
          ) : (
            results.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(person.id)
                    setQuery('')
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200 md:min-h-0"
                >
                  <span className="truncate">{person.name || t('rtc.common.unnamed')}</span>
                  <span className="shrink-0 text-2xs text-base-content/40">{teamLabel(person.teamId)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
