import { useT } from '../i18n/useT'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Period } from '../state/shell'
import {
  DEFAULT_SHIFTS,
  OFF_CODE,
  type Assignment,
  type Person,
  type ShiftDef,
  type Team,
} from '@crewdoku/domain'
import type { BoardData } from '../board/mockBoard'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { useBoardSchedule } from '../state/schedule'
import { useMarkOnboarded } from '../state/onboarding'
import { applyScheduleImport, parseScheduleCsv } from '../board/roster/scheduleImport'

/**
 * The paste-first import surface (wayfinder ticket 17 rework, path 3): used
 * both as a brand-new period's first-run screen (`ScheduleImportScreen`
 * below) and as the empty-board banner's in-place import (`BoardGrid`'s
 * overlay) — one component, two hosts, so the parsing/preview/apply logic
 * never forks. Mirrors `ImportStep`'s shape (parse into local state, show
 * counts and errors, one commit button) but previews through
 * `applyScheduleImport` before that button is ever live, since a schedule
 * import can fail in ways a bare roster import can't (unknown shift code,
 * a date outside the period). `people`/`teams` are the workspace-global
 * roster now — a schedule import reconciles imported names against
 * whichever period's board is open, but adds/matches land in the one
 * shared roster every period reads from.
 */
export function ScheduleImportPanel({
  dates,
  people,
  teams,
  shifts,
  onApply,
}: {
  dates: string[]
  people: Person[]
  teams: Team[]
  shifts: ShiftDef[]
  onApply: (result: { people: Person[]; teams: Team[]; assignments: Map<string, Assignment> }) => void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const content = await file.text()
    setFileName(file.name)
    setText(content)
  }

  const parsed = useMemo(() => (text.trim() ? parseScheduleCsv(text) : null), [text])

  // Only worth previewing once there's at least one row to apply — a header
  // problem (or an empty paste) already has nothing for `applyScheduleImport`
  // to do, and its own errors would just repeat "no rows" back at the reader.
  const preview = useMemo(() => {
    if (!parsed || parsed.rows.length === 0) return null
    return applyScheduleImport(parsed.rows, people, teams, shifts, dates)
  }, [parsed, people, teams, shifts, dates])

  const blockingErrors = [...(parsed?.errors ?? []), ...(preview?.errors ?? [])]
  const warnings = preview?.warnings ?? []
  const canApply = preview !== null && blockingErrors.length === 0

  // Days actually inside the period, not every column the CSV happened to
  // list — a manager pasting a longer export than this period covers
  // shouldn't see a count that includes days the board doesn't have.
  const importedDates = parsed ? parsed.dates.filter((d) => dates.includes(d)) : []
  const filledCount = preview
    ? Array.from(preview.assignments.values()).filter((a) => a.code !== OFF_CODE).length
    : 0
  const rowCount = parsed?.rows.length ?? 0

  const exampleHeader = `name,team,${dates[0] ?? '2026-08-17'},${dates[dates.length - 1] ?? '2026-08-18'}`

  return (
    <div className="flex flex-col gap-4">
      <textarea
        className="h-40 w-full resize-y rounded-md border border-base-300 bg-base-100 p-3 font-mono text-xs text-base-content outline-none transition-colors duration-150 focus:border-primary/50"
        placeholder={`${exampleHeader}\nAlex Chen,Alpha,EARLY,OFF`}
        value={text}
        onChange={(e) => {
          setFileName('')
          setText(e.target.value)
        }}
      />

      <div className="flex items-center gap-2">
        <label className="btn btn-ghost btn-xs rounded-md">
          {fileName || t('onbex.import.chooseFile')}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
        </label>
      </div>

      {blockingErrors.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-error">
          {blockingErrors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-warning">
          {warnings.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}

      {preview && (
        <p className="text-xs text-base-content/50">
          {rowCount} {rowCount === 1 ? t('onbex.import.person') : t('onbex.import.people')} · {filledCount}{' '}
          {filledCount === 1 ? t('onbex.import.filledCell') : t('onbex.import.filledCells')} {t('onbex.import.across')}{' '}
          {importedDates.length} {importedDates.length === 1 ? t('onbex.import.day') : t('onbex.import.days')}
        </p>
      )}

      <details className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-xs text-base-content/60">
        <summary className="cursor-pointer select-none font-medium text-base-content/70">{t('onbex.import.csvFormat')}</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-base-100 p-2 font-mono text-[11px] text-base-content/70">
          {`${exampleHeader}\nAlex Chen,Alpha,EARLY,OFF\nSam Lee,Bravo,OFF,LATE`}
        </pre>
      </details>

      <button
        type="button"
        className="btn btn-primary self-start"
        disabled={!canApply}
        onClick={() => preview && onApply({ people: preview.people, teams: preview.teams, assignments: preview.assignments })}
      >
        {t('onbex.import.btn')}
      </button>
    </div>
  )
}

/**
 * First-run surface for a period created with `setup: 'import'` (ticket 17
 * rework, path 3) — framed the same way `Onboarding` is (centered column,
 * one clear job) but with no wizard steps and no auto-generate: importing
 * an actual schedule already produces a finished board, so there is
 * nothing left for the solver to fill in. `Skip` exists because a manager
 * who picked "import" by mistake (or just wants to start blank) must not
 * be stuck staring at a paste box forever — it marks this period's import
 * gate done the same way `Onboarding`'s own "Skip for now" marks the
 * workspace wizard done. People/teams/shifts here are the shared global
 * roster; only the schedule itself is this period's own.
 */
export function ScheduleImportScreen({ period, initial }: { period: Period; initial: BoardData }) {
  const navigate = useNavigate()
  const t = useT()
  const [people, setPeople] = useRosterPeople(initial.people)
  const [teams, setTeams] = useRosterTeams(initial.teams)
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const [, , setSchedule] = useBoardSchedule(period.id, initial.assignments)
  const markOnboarded = useMarkOnboarded()
  const dates = useMemo(() => initial.dates.map((d) => d.iso), [initial.dates])

  function handleApply(result: { people: Person[]; teams: Team[]; assignments: Map<string, Assignment> }) {
    setPeople(() => result.people)
    setTeams(() => result.teams)
    setSchedule(result.assignments, true)
    markOnboarded(period.id)
    navigate('/board')
  }

  function handleSkip() {
    markOnboarded(period.id)
    navigate('/board')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] p-8">
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight text-base-content">{t('onbex.import.title')}</h1>
            <p className="mt-1 text-sm text-base-content/60">
              {t('onbex.import.subtitle')}
            </p>
          </div>
          <ScheduleImportPanel dates={dates} people={people} teams={teams} shifts={shifts} onApply={handleApply} />
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-base-300 bg-base-100 px-6 py-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleSkip}>
          {t('onbex.import.skip')}
        </button>
      </div>
    </div>
  )
}
