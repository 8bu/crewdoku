import { X, Upload, Plus } from '../ui/icons'
import { useT } from '../i18n/useT'
import { csvErrorText } from '../i18n/csvErrors'
import { useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { selectedPeriodAtom, type Period } from '../state/shell'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { DEFAULT_SHIFTS, UNASSIGNED_TEAM_ID } from '@crewdoku/domain'
import { UNASSIGNED_TEAM } from '../board/mockBoard'
import { seedBoardData } from '../board/periodSeed'
import {
  activeRoster,
  addPerson,
  removePerson,
  setPersonName,
  setPersonTeam,
  toggleShiftEligibility,
} from '../board/roster/rosterOps'
import { parsePastedRoster, applyCsvImport, employeeRowsToLines, type CsvRow } from '../board/roster/csvImport'
import { readEmployeeFile } from '../board/roster/xlsxImport'
import { swatchBgMuted } from '../board/shiftColors'
import { Stub } from './Stub'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { BatchImportModal } from '../ui/BatchImportModal'

/**
 * Add, edit, remove people (wayfinder ticket 16) — its own dense table, not
 * a reuse of ticket 09's `PersonPanel` (8bu's call: two different jobs —
 * this one is bulk and fast, the panel is one-at-a-time and contextual from
 * the board). Shares `useRosterPeople` with `BoardGrid`, so an edit here
 * shows up on the board immediately and vice versa.
 *
 * Presented as a full-height console surface in `CoverageGrid`'s chrome
 * (compact header bar, scrollable body) rather than a narrow form page, with
 * rows grouped under sticky team section headers in teams-array order —
 * Unassigned last, and only when someone is actually in it. Eligibility
 * chips carry each shift's configured colour (`swatchBgMuted` — the light
 * identity-based palette the board and Settings use, not a second visual
 * language.
 */
export function Roster() {
  const t = useT()
  const period = useAtomValue(selectedPeriodAtom)
  if (!period) return <Stub title={t('rtc.roster.title')} tickets="16" />
  return <RosterTable period={period} />
}

function RosterTable({ period }: { period: Period }) {
  const t = useT()
  const initial = useMemo(() => seedBoardData(period), [period])
  const [people, setPeople] = useRosterPeople(initial.people)
  const [teams, setTeams] = useRosterTeams(initial.teams)
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const active = useMemo(() => activeRoster(people), [people])
  const [query, setQuery] = useState('')
  const [teamFilterId, setTeamFilterId] = useState<string>('all')
  const [importOpen, setImportOpen] = useState(false)
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return active.filter((p) => {
      if (teamFilterId !== 'all' && p.teamId !== teamFilterId) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [active, query, teamFilterId])
  const filtered = query.trim() !== '' || teamFilterId !== 'all'
  // Team sections in teams-array order, Unassigned last; a person whose
  // teamId no longer resolves to a real team (e.g. its team was deleted)
  // buckets into Unassigned rather than vanishing. Empty groups are
  // dropped — under an active filter only matching sections remain.
  const groups = useMemo(() => {
    const known = new Set(teams.map((t) => t.id))
    return [...teams, UNASSIGNED_TEAM]
      .map((team) => ({
        id: team.id,
        name: team.id === UNASSIGNED_TEAM_ID ? t('rtc.common.unassigned') : team.name,
        members: rows.filter((p) => (known.has(p.teamId) ? p.teamId : UNASSIGNED_TEAM_ID) === team.id),
      }))
      .filter((g) => g.members.length > 0)
  }, [teams, rows])
  // `addPerson` appends an unassigned blank, so the row it just created is
  // always the last row of the LAST group — that's where the ref points.
  const lastRowId = groups.at(-1)?.members.at(-1)?.id
  const lastNameInputRef = useRef<HTMLInputElement | null>(null)

  function handleAdd() {
    setPeople((prev) => addPerson(prev))
  }

  function handleAddAndFocusNext() {
    // A new row is always blank, so a name filter would hide it the instant
    // it's added — clearing filters here keeps "Enter to add the next row"
    // honest, whether or not the planner was mid-search.
    setQuery('')
    setTeamFilterId('all')
    handleAdd()
    // The new row's name input mounts next render — focus follows it so
    // typing 40 names is Enter, type, Enter, type, never a mouse click.
    requestAnimationFrame(() => lastNameInputRef.current?.focus())
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-base-300 px-4">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('rtc.roster.title')}</h1>
        <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
          {filtered
            ? active.length === 1
              ? t('rtc.roster.countFiltered.person', { filtered: rows.length, total: active.length })
              : t('rtc.roster.countFiltered.people', { filtered: rows.length, total: active.length })
            : active.length === 1
              ? t('rtc.roster.count.person', { count: active.length })
              : t('rtc.roster.count.people', { count: active.length })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setImportOpen(true)} className="btn btn-ghost btn-sm gap-1.5">
            <Upload className="h-4 w-4" />
            {t('rtc.roster.import')}
          </button>
          <button type="button" onClick={handleAddAndFocusNext} className="btn btn-primary btn-sm gap-1.5">
            <Plus className="h-4 w-4" />
            {t('rtc.roster.addPerson')}
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-base-300 px-4 py-2">
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('rtc.roster.filterPlaceholder')}
          className="w-56"
        />
        <Select
          value={teamFilterId}
          onChange={setTeamFilterId}
          options={[
            { value: 'all', label: t('rtc.common.allTeams') },
            { value: UNASSIGNED_TEAM_ID, label: t('rtc.common.unassigned') },
            ...teams.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setTeamFilterId('all')
            }}
            className="link link-hover text-xs text-base-content/60 transition-colors duration-150 hover:text-base-content"
          >
            {t('rtc.roster.clearFilter')}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="m-0 text-sm text-[color:var(--text-dim)]">
              {t('rtc.roster.emptyDescription')}
            </p>
            <button type="button" onClick={handleAddAndFocusNext} className="btn btn-primary btn-sm gap-1.5">
              <Plus className="h-4 w-4" />
              {t('rtc.roster.addPerson')}
            </button>
          </div>
        ) : (
          <div className="max-w-[880px] px-4 py-4">
            {rows.length === 0 && <p className="m-0 py-3.5 text-sm text-base-content/40">{t('rtc.roster.noMatch')}</p>}
            <table className="w-full border-collapse text-sm">
              {groups.map((group) => (
                <tbody key={group.id}>
                  <tr>
                    {/* Opaque flatten of base-200/50 over base-100 — a translucent
                        sticky header would let scrolled rows bleed through it. */}
                    <th
                      colSpan={4}
                      className="sticky top-0 z-[1] border-b border-base-300 bg-[color-mix(in_oklch,var(--color-base-200)_50%,var(--color-base-100))] px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-base-content/40"
                    >
                      {group.name}
                      <span className="ml-2 font-normal tabular-nums normal-case tracking-normal">
                        {group.members.length}
                      </span>
                    </th>
                  </tr>
                  {group.members.map((person) => (
                    <tr
                      key={person.id}
                      className="h-10 border-b border-base-300/60 transition-colors duration-150 hover:bg-base-200/40"
                    >
                      <td className="w-[184px] px-2 py-1">
                        <Input
                          ref={person.id === lastRowId ? lastNameInputRef : undefined}
                          type="text"
                          value={person.name}
                          placeholder={t('rtc.roster.namePlaceholder')}
                          onChange={(e) => setPeople((prev) => setPersonName(prev, person.id, e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddAndFocusNext()
                          }}
                          className="w-[168px]"
                        />
                      </td>
                      <td className="w-[160px] px-2 py-1">
                        {/* Field select keeps a person movable across groups from any row. */}
                        <Select
                          variant="field"
                          value={person.teamId}
                          onChange={(v) => setPeople((prev) => setPersonTeam(prev, person.id, v))}
                          options={[
                            { value: UNASSIGNED_TEAM_ID, label: t('rtc.common.unassigned') },
                            ...teams.map((t) => ({ value: t.id, label: t.name })),
                          ]}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap gap-1.5 py-1">
                          {shifts.map((shift) => {
                            const eligible = !person.ineligible.includes(shift.code)
                            return (
                              <button
                                key={shift.code}
                                type="button"
                                data-shift={shift.code}
                                onClick={() => setPeople((prev) => toggleShiftEligibility(prev, person.id, shift.code))}
                                className={`cursor-pointer select-none rounded-md border border-transparent px-2.5 py-1 text-2xs font-semibold transition-colors duration-150 ${
                                  eligible ? 'text-base-content' : 'bg-base-200 text-base-content/40 line-through'
                                }`}
                                style={eligible ? { background: swatchBgMuted(shift.color) } : undefined}
                              >
                                {shift.code}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      <td className="w-10 px-2 py-1 text-right">
                        <button
                          type="button"
                          aria-label={person.name.trim() ? t('rtc.roster.removePerson', { name: person.name.trim() }) : t('rtc.roster.removeUnnamed')}
                          onClick={() => setPeople((prev) => removePerson(prev, person.id))}
                          className="btn btn-ghost btn-xs btn-square text-base-content/40 transition-colors duration-150 hover:text-error"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
            {teams.length === 0 && <p className="mt-3 text-sm text-base-content/40">{t('rtc.roster.noTeams')}</p>}
          </div>
        )}
      </div>
      {importOpen && (
        <BatchImportModal<CsvRow>
          title={t('rtc.roster.importTitle')}
          subtitle={
            <>
              {t('rtc.roster.importSubtitlePrefix')} <span className="font-mono text-xs">Name, Team</span>
              {t('rtc.roster.importSubtitleSuffix')}
            </>
          }
          placeholder={t('rtc.roster.importPlaceholder')}
          emptyLabel={t('rtc.roster.importEmpty')}
          applyLabel={t('rtc.import.apply')}
          cancelLabel={t('rtc.common.cancel')}
          parse={parsePastedRoster}
          renderSummary={(rows) => {
            const teamNames = new Set(rows.filter((r) => r.team).map((r) => r.team.toLowerCase()))
            const peopleLabel =
              rows.length === 1
                ? t('rtc.roster.count.person', { count: rows.length })
                : t('rtc.roster.count.people', { count: rows.length })
            if (teamNames.size === 0) return peopleLabel
            const teamsLabel =
              teamNames.size === 1
                ? t('rtc.teams.count.team', { count: teamNames.size })
                : t('rtc.teams.count.teams', { count: teamNames.size })
            return `${peopleLabel} · ${teamsLabel}`
          }}
          onApply={(rows) => {
            const result = applyCsvImport(people, teams, rows)
            setPeople(() => result.people)
            setTeams(() => result.teams)
          }}
          file={{
            label: t('rtc.roster.importFromFile'),
            accept: '.csv,.xlsx',
            read: async (f) => {
              try {
                const parsed = await readEmployeeFile(f)
                return {
                  text: employeeRowsToLines(parsed.rows).join('\n'),
                  errors: parsed.errors.map((e) => csvErrorText(t, e)),
                }
              } catch {
                return { text: '', errors: [t('rtc.import.fileError.unreadable')] }
              }
            },
          }}
          onCancel={() => setImportOpen(false)}
        />
      )}
    </section>
  )
}
