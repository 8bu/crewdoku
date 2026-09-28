import { Upload, Plus, ChevronLeft, ChevronRight } from '../ui/icons'
import { useT } from '../i18n/useT'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useIsNarrow } from '../ui/useIsNarrow'
import { useAtomValue } from 'jotai'
import { selectedPeriodAtom, type Period } from '../state/shell'
import { UNASSIGNED_TEAM_ID, type Person } from '@crewdoku/domain'
import { UNASSIGNED_TEAM } from '../board/mockBoard'
import { Stub } from './Stub'
import { useTeamsController } from './teams/useTeamsController'
import { TagsView } from './teams/TagsView'
import { DeleteTeamPopover } from './teams/DeleteTeamPopover'
import { DeleteButton } from '../ui/DeleteButton'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { AioImportModal } from '../ui/AioImportModal'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { useTagGroups, useTags } from '../state/tags'
import { track, usePageView } from '../analytics'

/**
 * Create, rename, delete teams and manage who's on each one (wayfinder
 * ticket 19 + its UI revamp) — its own page, master-detail layout (won out
 * over a card grid and a dense table, prototyped via the `prototype` skill's
 * UI branch). Member rows carry their own team `<select>` — moving someone
 * off this team and onto another is the same one-click edit Roster already
 * uses, so a manager never has to leave this page to restaff a team (8bu's
 * ask: "I don't wanna jump to roster page to do team setup again").
 *
 * Not every person has a team (8bu: "the mock is assuming every roster has a
 * team, that's not correct") — `UNASSIGNED_TEAM` is a fixed, always-present
 * pseudo-team (not a real `Team` record: no rename, no preference, can't be
 * deleted) that shows up in every team picker alongside the real ones.
 *
 * Presented as a full-height console surface in the same chrome Roster and
 * Coverage use (compact header bar, border-separated scrolling panes) —
 * the new-team input lives in the header's control group, mirroring
 * Roster's "+ Add person".
 */
export function Teams() {
  usePageView('/teams')
  const t = useT()
  const period = useAtomValue(selectedPeriodAtom)
  if (!period) return <Stub title={t('rtc.teams.title')} tickets="19" />
  return <TeamsPage period={period} />
}

function TeamsPage({ period }: { period: Period }) {
  const t = useT()
  const c = useTeamsController(period)
  // The import modal writes whole rosters, so it needs the team and shift
  // catalogs and a way to set both atoms. The controller owns the seeding of
  // these three workspace atoms, so its current values are the initial value
  // here — one seeder, no second `seedBoardData(period)`.
  const [people, setPeople] = useRosterPeople(c.people)
  const [teams, setTeams] = useRosterTeams(c.teams)
  const [shifts] = useRosterShifts(c.shifts)
  // The tag catalog comes straight from its own atoms: this page only writes
  // them when an import brings tags in, everything else lives in TagsView.
  const [tagGroups, setTagGroups] = useTagGroups()
  const [tags, setTags] = useTags()
  const isNarrow = useIsNarrow()
  // The second half of this page is a URL, not local state: reloading, or
  // coming back to a bookmarked link, lands on the same half.
  const [params] = useSearchParams()
  const tagsView = params.get('view') === 'tags'
  const sidebarTeams = [...c.teams, UNASSIGNED_TEAM]
  const [selectedId, setSelectedId] = useState(c.teams[0]?.id ?? UNASSIGNED_TEAM_ID)
  // Below `md` the two panes can't sit side by side, so they become a
  // master-detail pair: the list IS the page, and tapping a team swaps in its
  // detail full-width behind a back row. Above `md` both panes render at once
  // and this flag is never read — the grid is the layout.
  const [detailOpen, setDetailOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const selected = sidebarTeams.find((t) => t.id === selectedId) ?? sidebarTeams[0]!
  const isUnassigned = selected.id === UNASSIGNED_TEAM_ID
  const pendingTeam = c.pendingDelete ? c.teams.find((t) => t.id === c.pendingDelete!.teamId) : null
  const showList = !isNarrow || !detailOpen
  const showDetail = !isNarrow || detailOpen

  const members = c.members(selected.id)
  const candidates = c.activePeople.filter((p) => p.teamId !== selected.id)

  function teamLabel(teamId: string) {
    if (teamId === UNASSIGNED_TEAM_ID) return t('rtc.common.unassigned')
    return sidebarTeams.find((t) => t.id === teamId)?.name || t('rtc.common.unnamed')
  }

  // The Tags half is its own component with its own controller, so the switch
  // renders it instead of this page — the two views keep their own panes.
  if (tagsView) return <TagsView period={period} viewSwitch={<TeamsTagsSwitch tagsView />} />

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-300 px-4 py-2 md:h-12 md:flex-nowrap md:py-0">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('rtc.teams.title')}</h1>
        <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
          {c.teams.length === 1 ? t('rtc.teams.count.team', { count: c.teams.length }) : t('rtc.teams.count.teams', { count: c.teams.length })} · {c.activePeople.length === 1 ? t('rtc.teams.count.person', { count: c.activePeople.length }) : t('rtc.teams.count.people', { count: c.activePeople.length })}
        </span>
        <TeamsTagsSwitch tagsView={false} />
        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto md:flex-nowrap">
          <button type="button" onClick={() => setImportOpen(true)} className="btn btn-ghost btn-sm min-h-11 flex-1 gap-1.5 md:min-h-0 md:flex-initial">
            <Upload className="h-4 w-4" />
            {t('rtc.teams.import')}
          </button>
          <Input
            ref={c.newNameInputRef}
            type="text"
            value={c.newName}
            onChange={(e) => c.setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') c.handleAdd()
            }}
            placeholder={t('rtc.teams.newTeamPlaceholder')}
            className="order-last w-full md:order-none md:w-48"
          />
          <button type="button" onClick={c.handleAdd} disabled={!c.newName.trim()} className="btn btn-primary btn-sm min-h-11 flex-1 gap-1.5 md:min-h-0 md:flex-initial">
            <Plus className="h-4 w-4" />
            {t('rtc.teams.addTeam')}
          </button>
        </div>
      </div>

      {/* Mobile: one pane at a time in a column (list, then the tapped team's
          detail). `md:` restores today's 260px + fluid two-pane grid. */}
      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[260px_1fr]">
        {showList && (
          <aside className="min-h-0 flex-1 overflow-y-auto border-b border-base-300 p-2 md:border-b-0 md:border-r">
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {sidebarTeams.map((team) => {
                const count = c.countMembers(team.id)
                const virtual = team.id === UNASSIGNED_TEAM_ID
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(team.id)
                        // Touch has no hover to preview a pane: a tap opens
                        // the team, a second tap never deselects it.
                        if (isNarrow) setDetailOpen(true)
                      }}
                      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent bg-transparent px-3 py-1.5 text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200 data-[active]:border-primary/30 data-[active]:bg-primary/10 data-[active]:font-semibold data-[active]:text-primary data-[virtual]:text-base-content/60 data-[virtual]:italic md:min-h-0 md:px-2.5"
                      data-active={team.id === selected.id || undefined}
                      data-virtual={virtual || undefined}
                    >
                      <span className="truncate">{virtual ? t('rtc.common.unassigned') : (team.name || t('rtc.common.unnamed'))}</span>
                      <span className="font-mono text-sm text-base-content/60">{count}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-base-content/30 md:hidden" />
                    </button>
                  </li>
                )
              })}
            </ul>
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
              {isUnassigned ? (
                <p className="text-lg font-semibold tracking-tight">{t('rtc.common.unassigned')}</p>
              ) : (
                <Input
                  type="text"
                  value={selected.name}
                  onChange={(e) => c.rename(selected.id, e.target.value)}
                  className="max-w-[360px] text-lg font-semibold text-base-content"
                />
              )}

              {!isUnassigned && (
                <>
                  <div className="flex flex-col gap-2">
                    <h2 className="m-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('rtc.teams.wants')}</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {c.shifts.map(({ code }) => (
                        <button
                          key={code}
                          type="button"
                          className="inline-flex min-h-11 cursor-pointer select-none items-center justify-center rounded-md border border-base-300 bg-base-100 px-3 py-1 text-2xs font-semibold text-base-content transition-colors duration-150 data-[active]:border-success data-[active]:bg-success data-[active]:text-success-content md:min-h-0 md:px-2.5"
                          data-shift={code}
                          data-active={selected.wants.includes(code) || undefined}
                          onClick={() => c.toggleWant(selected.id, code)}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className="m-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('rtc.teams.avoids')}</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {c.shifts.map(({ code }) => (
                        <button
                          key={code}
                          type="button"
                          className="inline-flex min-h-11 cursor-pointer select-none items-center justify-center rounded-md border border-base-300 bg-base-100 px-3 py-1 text-2xs font-semibold text-base-content transition-colors duration-150 data-[active]:border-error data-[active]:bg-error data-[active]:text-error-content md:min-h-0 md:px-2.5"
                          data-shift={code}
                          data-active={selected.avoids.includes(code) || undefined}
                          onClick={() => c.toggleAvoid(selected.id, code)}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2">
                <h2 className="m-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40">
                  {t('rtc.teams.peopleHeader', { count: members.length })}
                </h2>
                {members.length === 0 ? (
                  <p className="py-3.5 text-sm text-base-content/40">{t('rtc.teams.noOneHere')}</p>
                ) : (
                  <ul className="m-0 flex max-w-full list-none flex-col p-0 md:max-w-[420px]">
                    {members.map((p) => (
                      <li
                        key={p.id}
                        className="flex min-h-11 items-center justify-between gap-2 border-b border-base-300/60 py-1 pl-0 pr-0 text-sm transition-colors duration-150 hover:bg-base-200/40 md:min-h-0 md:pl-2.5 md:pr-1"
                      >
                        <span className="truncate">{p.name || t('rtc.common.unnamed')}</span>
                        <Select
                          // Ghost reads as inline text under a mouse; on a phone
                          // the boxed `field` variant is the one that shows a
                          // 44px target (`.cd-field` supplies the height).
                          variant={isNarrow ? 'field' : 'ghost'}
                          className="w-40 shrink-0 md:w-auto md:shrink"
                          value={p.teamId}
                          onChange={(v) => c.moveToTeam(p.id, v)}
                          options={sidebarTeams.map((team) => ({ value: team.id, label: team.id === UNASSIGNED_TEAM_ID ? t('rtc.common.unassigned') : (team.name || t('rtc.common.unnamed')) }))}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                {candidates.length > 0 ? (
                  <AddMemberSearch
                    key={selected.id}
                    candidates={candidates}
                    teamLabel={teamLabel}
                    onAdd={(personId) => c.moveToTeam(personId, selected.id)}
                  />
                ) : (
                  <p className="mt-1 text-xs text-base-content/40">{t('rtc.teams.everyoneHere')}</p>
                )}
              </div>

              {!isUnassigned && (
                <div className="flex flex-col gap-2">
                  <DeleteButton
                    label={t('rtc.teams.deleteTeam')}
                    onClick={(anchor) => c.startDelete(selected.id, anchor)}
                    disabled={c.teams.length <= 1}
                    title={c.teams.length <= 1 ? t('rtc.teams.cantDeleteLastTeam') : undefined}
                  />
                  {/* A `title` never fires on touch — the why-won't-this-work
                      answer has to be on the page itself below `md`. */}
                  {c.teams.length <= 1 && (
                    <p className="m-0 text-xs text-base-content/40 md:hidden">{t('rtc.teams.cantDeleteLastTeam')}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {c.pendingDelete && pendingTeam && (
          <DeleteTeamPopover
            rect={c.pendingDelete.rect}
            teamName={pendingTeam.name}
            count={c.countMembers(pendingTeam.id)}
            otherTeams={[...c.teams.filter((t) => t.id !== pendingTeam.id), UNASSIGNED_TEAM]}
            reassignToId={c.reassignToId}
            onReassignChange={c.setReassignToId}
            onConfirm={() => {
              c.confirmDelete()
              // The team the detail pane was showing is gone; the list is the
              // only honest place to land back on.
              if (isNarrow) setDetailOpen(false)
            }}
            onCancel={c.cancelDelete}
          />
        )}
      </div>
      {importOpen && (
        <AioImportModal
          people={people}
          teams={teams}
          shifts={shifts}
          tagGroups={tagGroups}
          tags={tags}
          onApply={(r, m) => {
            setPeople(() => r.people)
            setTeams(() => r.teams)
            setTagGroups(() => r.tagGroups)
            setTags(() => r.tags)
            track('roster_imported', { source: m.source, rows: m.peopleAdded })
          }}
          onCancel={() => setImportOpen(false)}
        />
      )}
    </section>
  )
}

/**
 * Teams | Tags — the same join of two `btn-xs` buttons the board/calendar
 * switch uses, shared by both halves of the page (each renders it in its own
 * header, so the control never moves under the cursor when the view flips).
 *
 * Links, not buttons: each half is a URL, so a reload, a bookmark, or a
 * middle-click all land where they promise. `?view=tags` is the whole state —
 * the tag catalog itself is persisted with the workspace.
 */
function TeamsTagsSwitch({ tagsView }: { tagsView: boolean }) {
  const t = useT()
  const half = (active: boolean) =>
    `btn btn-xs join-item px-2.5 no-underline ${active ? 'btn-primary' : 'btn-ghost text-base-content/60'}`
  return (
    <div role="group" aria-label={t('tags.viewSwitchAria')} className="join shrink-0">
      <Link to="/teams" aria-current={tagsView ? undefined : 'page'} className={half(!tagsView)}>
        {t('rtc.teams.title')}
      </Link>
      <Link to="/teams?view=tags" aria-current={tagsView ? 'page' : undefined} className={half(tagsView)}>
        {t('tags.title')}
      </Link>
    </div>
  )
}

/**
 * Type-to-filter instead of a plain `<select>` (8bu: a full roster dropdown
 * "will be a problem if there is more than 500+ roster"). Nothing renders
 * until there's a query, so the candidate list — however large — never gets
 * dumped into the DOM at once; matches cap at 8.
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
  const results = q ? candidates.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : []

  return (
    <div className="relative mt-1 w-full max-w-full md:max-w-[420px]">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={candidates.length === 1 ? t('rtc.teams.searchToAdd.person', { count: candidates.length }) : t('rtc.teams.searchToAdd.people', { count: candidates.length })}
        className="w-full"
      />
      {q && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 flex max-h-[260px] list-none flex-col gap-0.5 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1.5 shadow-lg">
          {results.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-base-content/40">{t('rtc.teams.noMatch')}</li>
          ) : (
            results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(p.id)
                    setQuery('')
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left text-sm text-base-content transition-colors duration-150 hover:bg-base-200 md:min-h-0"
                >
                  <span className="truncate">{p.name || t('rtc.common.unnamed')}</span>
                  <span className="shrink-0 text-2xs text-base-content/40">{teamLabel(p.teamId)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
