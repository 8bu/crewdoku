import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UNASSIGNED_TEAM_ID, type Person, type Tag } from '@crewdoku/domain'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from '../../ui/icons'
import { useT } from '../../i18n/useT'
import { useIsNarrow } from '../../ui/useIsNarrow'
import { Input } from '../../ui/Input'
import { DeleteButton } from '../../ui/DeleteButton'
import { UNASSIGNED_TEAM } from '../../board/mockBoard'
import type { Period } from '../../state/shell'
import { AdaptiveSelect, TagRuleEditor } from './TagRuleEditor'
import { TagCoverageCard } from './TagCoverageCard'
import { useTagsController } from './useTagsController'

/** What the detail pane is showing: one group's settings, or one tag's people, rules and coverage. */
type Selection = { kind: 'group'; id: string } | { kind: 'tag'; id: string }

/** A list row — the same shape the Teams list uses, so both halves read as one page. */
const rowCls =
  'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent bg-transparent px-3 py-1.5 text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200 data-[active]:border-primary/30 data-[active]:bg-primary/10 data-[active]:font-semibold data-[active]:text-primary md:min-h-0 md:px-2.5'

/** A group is a section header you can open, not a row beside its own tags. */
const groupRowCls =
  'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-base-200 data-[active]:bg-primary/10 md:min-h-0 md:py-1'

/** The small uppercase label a list section and a card's own eyebrow both wear. */
const heading = 'm-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40'

/** The shared Settings card: edge to edge on a phone, a box from `md` up. */
const cardCls =
  '-mx-4 flex flex-col gap-3 border-b border-base-300 px-4 pb-5 md:mx-0 md:rounded-lg md:border md:border-base-300 md:bg-base-100 md:p-5'
const cardTitle = 'm-0 text-sm font-semibold tracking-tight text-base-content'

/**
 * The Teams page's second half: tags as a second grouping of people, across
 * teams (religion, language, student status…). Same master-detail layout and
 * the same narrow-screen behaviour as the Teams view it sits beside — the
 * list IS the page under `md`, and a tapped row swaps in the detail behind a
 * back row.
 *
 * One place creates, and one place edits. The list's two buttons are the only
 * way in (a name is asked for by typing over the one you were given, in the
 * pane you have just been sent to), and everything about the selected thing —
 * its name, its group, its people, its rule lines, its coverage — is in the
 * detail pane beside it.
 *
 * A group is only a folder plus one policy flag ("one per person"); the
 * preferences themselves are the tag's rule lines, which read as sentences
 * because that is what they are — see `TagRuleEditor`.
 */
export function TagsView({ period, viewSwitch }: { period: Period; viewSwitch: ReactNode }) {
  const t = useT()
  const isNarrow = useIsNarrow()
  const c = useTagsController(period)
  const [searchParams] = useSearchParams()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Selection | null>(null)
  /** The item whose title should take focus-and-select once: the one just created. */
  const [nameFocusId, setNameFocusId] = useState<string | null>(null)

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

  // `/teams?view=tags&tag=<id>` — the person panel's way of sending someone
  // here to edit the tag they were looking at. Applied once per param value,
  // so an edit made here (which re-renders the catalog) never yanks the pane
  // back to a tag the user has since navigated away from. Nothing writes the
  // param back: picking things in the UI is not a navigation.
  const appliedDeepLink = useRef<string | null>(null)
  useEffect(() => {
    const deepTagId = searchParams.get('tag')
    if (deepTagId === null || appliedDeepLink.current === deepTagId) return
    if (!c.tags.some((tag) => tag.id === deepTagId)) return
    appliedDeepLink.current = deepTagId
    setSelection({ kind: 'tag', id: deepTagId })
    setPendingDelete(null)
    if (isNarrow) setDetailOpen(true)
  }, [searchParams, c.tags, isNarrow])

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

  /** Show an item and put the caret back where it belongs. */
  function show(item: Selection, focusName: boolean) {
    setSelection(item)
    setPendingDelete(null)
    setNameFocusId(focusName ? item.id : null)
    // Touch has no hover to preview a pane: a tap opens the item, a second
    // tap never deselects it.
    if (isNarrow) setDetailOpen(true)
  }

  /**
   * A new tag lands in the group in front of you — the selected group, or the
   * group of the selected tag — so "another one of these" is one click. With
   * a loose selection it is ungrouped.
   */
  function newTag(intoGroupId?: string) {
    const id = c.createTag(intoGroupId ?? selectedGroup?.id ?? selectedTag?.groupId)
    if (id === null) return
    show({ kind: 'tag', id }, true)
  }

  function newGroup() {
    const id = c.createGroup()
    if (id === null) return
    show({ kind: 'group', id }, true)
  }

  function tagRow(tag: Tag, indent: boolean) {
    return (
      <button
        type="button"
        onClick={() => show({ kind: 'tag', id: tag.id }, false)}
        className={`${rowCls} ${indent ? 'pl-6 md:pl-5' : ''}`}
        data-active={selectedKey === `tag:${tag.id}` || undefined}
      >
        {/* The name takes the slack, so the count and the chevron stay together
            at the row's end instead of the count drifting to the middle. */}
        <span className="min-w-0 flex-1 truncate">{tag.name || t('rtc.common.unnamed')}</span>
        <span className="shrink-0 font-mono text-sm text-base-content/60">{c.countHolders(tag.id)}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-base-content/30 md:hidden" />
      </button>
    )
  }

  /** The two ways to make a tag or a group, wherever they are offered. */
  const createButtons = (
    <>
      <button type="button" onClick={() => newTag()} className="btn btn-primary btn-sm min-h-11 flex-1 gap-1.5 md:min-h-0">
        <Plus className="h-4 w-4" />
        {t('tags.defaultTagName')}
      </button>
      <button type="button" onClick={newGroup} className="btn btn-outline btn-sm min-h-11 flex-1 gap-1.5 md:min-h-0">
        <Plus className="h-4 w-4" />
        {t('tags.defaultGroupName')}
      </button>
    </>
  )

  const showList = !isNarrow || !detailOpen
  const showDetail = !isNarrow || detailOpen
  const groupCount = c.groups.length === 1 ? t('tags.count.group', { count: c.groups.length }) : t('tags.count.groups', { count: c.groups.length })
  const tagCount = c.tags.length === 1 ? t('tags.count.tag', { count: c.tags.length }) : t('tags.count.tags', { count: c.tags.length })

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-300 px-4 py-2 md:h-12 md:flex-nowrap md:py-0">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('tags.title')}</h1>
        <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
          {groupCount} · {tagCount}
        </span>
        {viewSwitch}
      </div>

      {/* Mobile: one pane at a time in a column (list, then the tapped item's
          detail). `md:` restores the same 260px + fluid grid the Teams list uses. */}
      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[260px_1fr]">
        {showList && (
          <aside className="flex min-h-0 flex-1 flex-col border-b border-base-300 md:border-b-0 md:border-r">
            {/* One action bar, and the same two actions wherever it sits: above
                the tree on a desktop, pinned to the pane's bottom edge inside
                thumb reach on a phone (`order` does the swap, so there is one
                copy of these buttons and one set of handlers). */}
            <div className="order-2 flex shrink-0 gap-2 border-t border-base-300 p-2 md:order-1 md:border-t-0 md:border-b">
              {createButtons}
            </div>

            <div className="order-1 min-h-0 flex-1 overflow-y-auto p-2 md:order-2">
              {c.groups.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {c.groups.map((group) => {
                    const tags = c.tags.filter((tag) => tag.groupId === group.id)
                    return (
                      <li key={group.id}>
                        <button
                          type="button"
                          onClick={() => show({ kind: 'group', id: group.id }, false)}
                          className={groupRowCls}
                          data-active={selectedKey === `group:${group.id}` || undefined}
                        >
                          <span className={`${heading} min-w-0 flex-1 truncate`}>{group.name || t('rtc.common.unnamed')}</span>
                          {/* One-per-person is per group, so the header says which
                              groups carry it. The switch itself is in the group's
                              own detail, where its consequences are explained. */}
                          {group.exclusive && (
                            <span className="shrink-0 text-2xs text-base-content/40">{t('tags.group.exclusive')}</span>
                          )}
                          <span className="shrink-0 font-mono text-2xs text-base-content/40">{tags.length}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-base-content/30 md:hidden" />
                        </button>
                        {tags.length > 0 && (
                          <ul className="m-0 mt-0.5 flex list-none flex-col gap-0.5 p-0">
                            {tags.map((tag) => (
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
              )}

              {looseTags.length > 0 && (
                <div className={c.groups.length > 0 ? 'mt-2' : undefined}>
                  <h2 className={`${heading} px-2.5 pb-1`}>{t('tags.ungrouped')}</h2>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {looseTags.map((tag) => (
                      <li key={tag.id}>{tagRow(tag, false)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {c.tags.length === 0 && c.groups.length === 0 && (
                <p className="px-3 py-3 text-sm text-base-content/40">{t('tags.empty')}</p>
              )}
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
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 md:gap-5 md:px-6 md:py-5">
              {selectedGroup && (
                <>
                  <InlineTitle
                    key={selectedGroup.id}
                    value={selectedGroup.name}
                    onChange={(name) => c.renameGroup(selectedGroup.id, name)}
                    placeholder={t('tags.group.namePlaceholder')}
                    ariaLabel={t('tags.group.namePlaceholder')}
                    autoFocus={nameFocusId === selectedGroup.id}
                  />

                  {/* The group's one policy gets a box of its own, so a group
                      page reads the same as a tag page: a heading, then boxes.
                      No title: the switch already names itself, and a heading
                      saying the same words twice adds nothing. */}
                  <div className={cardCls}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 md:min-h-0">
                      <input
                        type="checkbox"
                        className="toggle toggle-sm toggle-primary"
                        checked={selectedGroup.exclusive}
                        onChange={(e) => c.setExclusive(selectedGroup.id, e.target.checked)}
                        aria-label={t('tags.group.exclusive')}
                      />
                      <span className="text-sm font-semibold text-base-content">{t('tags.group.exclusive')}</span>
                    </label>
                    <p className="m-0 text-xs text-base-content/60">{t('tags.group.exclusiveHint')}</p>
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

                  <div className={cardCls}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className={cardTitle}>{t('tags.group.tagsHeader', { count: groupTags.length })}</h2>
                      <button
                        type="button"
                        onClick={() => newTag(selectedGroup.id)}
                        className="btn btn-outline btn-sm min-h-11 gap-1.5 md:min-h-0"
                      >
                        <Plus className="h-4 w-4" />
                        {t('tags.group.addTag')}
                      </button>
                    </div>
                    {groupTags.length === 0 ? (
                      <p className="m-0 text-sm text-base-content/40">{t('tags.group.noTags')}</p>
                    ) : (
                      <ul className="m-0 flex list-none flex-col divide-y divide-base-300 p-0">
                        {groupTags.map((tag) => (
                          <li key={tag.id} className="-mx-4 px-4 md:mx-0 md:px-0">
                            <button
                              type="button"
                              onClick={() => show({ kind: 'tag', id: tag.id }, false)}
                              className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent py-2 text-left text-sm text-base-content transition-colors duration-150 hover:text-primary md:min-h-0"
                            >
                              <span className="truncate">{tag.name || t('rtc.common.unnamed')}</span>
                              <span className="flex shrink-0 items-center gap-2 text-2xs text-base-content/40">
                                <span className="font-mono">{c.countHolders(tag.id)}</span>
                                <ChevronRight className="h-4 w-4" />
                              </span>
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
                  {/* Name, where it lives, and the way out. The group picker
                      wraps under the title on a phone; the delete keeps the
                      title's line so it never sits between the two. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2 md:gap-x-3">
                    <InlineTitle
                      key={selectedTag.id}
                      value={selectedTag.name}
                      onChange={(name) => c.renameTag(selectedTag.id, name)}
                      placeholder={t('tags.tag.namePlaceholder')}
                      ariaLabel={t('tags.tag.namePlaceholder')}
                      autoFocus={nameFocusId === selectedTag.id}
                      className="min-w-0 flex-1"
                    />
                    {pendingDelete?.kind === 'tag' && pendingDelete.id === selectedTag.id ? (
                      // Confirming is a question plus two answers, which never
                      // fits beside a title: it is a direct child of the row
                      // (not of the delete's own box) so `w-full` gives it a
                      // line of its own on a phone and it sits inline from `md`.
                      <div className="order-2 flex w-full flex-wrap items-center justify-end gap-2 md:order-3 md:w-auto">
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
                      // On a phone the delete is an icon on the title's own row —
                      // as a labelled button it was stranded on a line between
                      // the title and the group picker. From `md` there is room
                      // to say what it does.
                      <div className="order-2 flex shrink-0 items-center md:order-3">
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ kind: 'tag', id: selectedTag.id })}
                          aria-label={t('tags.tag.delete')}
                          className="btn btn-ghost btn-sm min-h-11 min-w-11 text-error hover:bg-error/10 md:hidden"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <span className="hidden md:block">
                          <DeleteButton
                            label={t('tags.tag.delete')}
                            onClick={() => setPendingDelete({ kind: 'tag', id: selectedTag.id })}
                          />
                        </span>
                      </div>
                    )}
                    <div className="order-3 flex w-full min-w-0 items-center gap-2 md:order-2 md:w-auto md:shrink-0">
                      <span className={`${heading} shrink-0`}>{t('tags.tag.groupAria')}</span>
                      <AdaptiveSelect
                        value={selectedTag.groupId ?? ''}
                        onChange={(value) => c.setTagGroup(selectedTag.id, value === '' ? null : value)}
                        options={[
                          { value: '', label: t('tags.ungrouped') },
                          ...c.groups.map((group) => ({ value: group.id, label: group.name || t('rtc.common.unnamed') })),
                        ]}
                        ariaLabel={t('tags.tag.groupAria')}
                        className="min-w-0 flex-1 md:w-52"
                      />
                    </div>
                  </div>

                  <div className={cardCls}>
                    <h2 className={cardTitle}>{t('tags.tag.membersHeader', { count: members.length })}</h2>
                    {/* One line says which of the three states this is: nobody
                        on the roster at all, nobody holding the tag, or chips.
                        "Everyone active already has this tag" below is only true
                        when there is someone it could be true of. */}
                    {c.activePeople.length === 0 ? (
                      <p className="m-0 text-sm text-base-content/40">{t('tags.tag.noRoster')}</p>
                    ) : members.length === 0 ? (
                      <p className="m-0 text-sm text-base-content/40">{t('tags.tag.noMembers')}</p>
                    ) : (
                      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {members.map((person) => (
                          <li
                            key={person.id}
                            className="flex min-h-11 min-w-0 items-center gap-1 rounded-full border border-base-300 bg-base-100 pl-3 pr-0.5 text-sm md:min-h-0 md:py-0.5"
                          >
                            <span className="min-w-0 truncate">{person.name || t('rtc.common.unnamed')}</span>
                            <span className="shrink-0 text-2xs text-base-content/40">{teamLabel(person.teamId)}</span>
                            <button
                              type="button"
                              onClick={() => c.toggleMember(person.id, selectedTag.id)}
                              aria-label={t('tags.tag.removeMemberAria', { name: person.name || t('rtc.common.unnamed') })}
                              className="btn btn-ghost btn-xs min-h-11 min-w-11 shrink-0 rounded-full text-base-content/50 hover:text-error md:min-h-0 md:min-w-0"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Finding someone and taking a whole team in one go are the
                        same kind of move, so they share a row from `md` up and
                        the bulk picker takes the line below the search on a
                        phone. */}
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                      {candidates.length > 0 ? (
                        <AddMemberSearch
                          key={selectedTag.id}
                          candidates={candidates}
                          teamLabel={teamLabel}
                          onAdd={(personId) => c.toggleMember(personId, selectedTag.id)}
                        />
                      ) : (
                        c.activePeople.length > 0 && (
                          <p className="m-0 text-xs text-base-content/40">{t('tags.tag.everyoneHas')}</p>
                        )
                      )}

                      {/* One-time, not live: tagging a whole team is a bulk
                          starting point, and the chips above stay the truth. */}
                      {bulkTeams.length > 0 && (
                        <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-1 md:flex-nowrap">
                          <span className={`${heading} w-full md:w-auto md:shrink-0`}>{t('tags.tag.bulkLabel')}</span>
                          <AdaptiveSelect
                            value={bulkTeamId}
                            onChange={c.setBulkTeamId}
                            options={teamOptions}
                            ariaLabel={t('tags.tag.bulkTeamAria')}
                            className="min-w-0 flex-1 md:min-w-[8rem] md:max-w-64"
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
                      )}
                    </div>
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

                  <div className={cardCls}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className={cardTitle}>{t('tags.tag.rulesHeader')}</h2>
                      <button
                        type="button"
                        onClick={() => c.addRuleLine(selectedTag.id)}
                        className="btn btn-outline btn-sm min-h-11 gap-1.5 md:min-h-0"
                      >
                        <Plus className="h-4 w-4" />
                        {t('tags.rules.add')}
                      </button>
                    </div>
                    <TagRuleEditor
                      tag={selectedTag}
                      shifts={c.shifts}
                      periodStart={period.start}
                      onPatchRule={(ruleId, patch) => c.changeRule(selectedTag.id, ruleId, patch)}
                      onRemoveRule={(ruleId) => c.removeRuleLine(selectedTag.id, ruleId)}
                    />
                  </div>

                  <TagCoverageCard
                    tagId={selectedTag.id}
                    shifts={c.shifts}
                    table={c.tagCoverage[selectedTag.id]}
                    onAdd={() => c.addCoverage(selectedTag.id)}
                    onRemove={() => c.removeCoverage(selectedTag.id)}
                    edits={c.coverageEdits(selectedTag.id)}
                  />
                </>
              )}

              {/* An empty workspace is not a broken pane: it is the one place
                  both create actions can be offered next to the explanation
                  of what tags are for, instead of leaving a blank half. */}
              {!selectedGroup && !selectedTag && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <h2 className="m-0 text-lg font-semibold tracking-tight">{t('tags.emptyTitle')}</h2>
                  <p className="m-0 max-w-md text-sm text-base-content/50">{t('tags.emptyHint')}</p>
                  <div className="flex w-full max-w-xs gap-2">{createButtons}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * A name that is edited where it is read: a heading you can type in, with a
 * border that only appears under the pointer or the caret. A boxed input in a
 * card of boxed inputs — which is where a tag's name used to live — says
 * "field" for the one thing on the page that is the title.
 *
 * `autoFocus` is the create flow's other half: the new item already has a
 * unique name, so the caret selects it and the first keystroke replaces it.
 */
function InlineTitle({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus = false,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  autoFocus?: boolean
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    ref.current?.focus()
    ref.current?.select()
  }, [autoFocus])

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold tracking-tight text-base-content outline-none transition-colors duration-150 hover:border-base-300 focus:border-primary/60 ${className}`}
    />
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
    <div className="relative w-full min-w-0 md:max-w-[360px]">
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
