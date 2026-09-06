import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import type { Period } from '../state/shell'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { shiftsAtom } from '../state/shifts'
import { coverageAtom } from '../state/coverageRules'
import { solveSettingsAtom } from '../state/solveSettings'
import { useMarkAutoGenerateOnMount, useMarkWorkspaceOnboarded } from '../state/onboarding'
import { applyCsvImport, parseEmployeeCsv, type CsvRow } from '../board/roster/csvImport'
import type { BoardData } from '../board/mockBoard'
import { WORKSPACE_TEMPLATES, parsePastedRoster, type WorkspaceTemplate } from './templates'

type Step = 'shape' | 'people' | 'ready'

const STEPS: { key: Step; label: string }[] = [
  { key: 'shape', label: 'Company shape' },
  { key: 'people', label: 'People' },
  { key: 'ready', label: 'Generate' },
]

function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? 'bg-primary text-primary-content'
            : active
              ? 'border-2 border-primary text-primary'
              : 'border border-base-300 text-base-content/40'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span className={`text-sm font-medium ${active ? 'text-base-content' : 'text-base-content/50'}`}>{label}</span>
    </div>
  )
}

function toClock(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
}

function ShapeCard({ tmpl, selected, onPick }: { tmpl: WorkspaceTemplate; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex flex-col gap-2.5 rounded-lg border p-4 text-left transition-colors duration-150 ${
        selected ? 'border-primary bg-primary/5' : 'border-base-300 bg-base-100 hover:border-primary/50'
      }`}
    >
      <div>
        <div className="text-sm font-semibold text-base-content">{tmpl.label}</div>
        <div className="mt-0.5 text-xs leading-snug text-base-content/60">{tmpl.tagline}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tmpl.shifts.map((s) => (
          <span key={s.code} className="rounded border border-base-300 bg-base-200 px-1.5 py-0.5 font-mono text-2xs text-base-content/80">
            {s.code} {toClock(s.start)}–{toClock(s.end)}
          </span>
        ))}
      </div>
    </button>
  )
}

/**
 * First-run wizard for the workspace (wayfinder ticket 14): pick a company
 * shape, paste your people, generate. Only ever reached while the global
 * roster is empty (`Board.tsx`'s gate — in a running app, boot with
 * `/?fresh`). Picking a shape seeds the workspace-global shift catalog,
 * coverage table, and solve settings from a template; the People step is
 * paste-first (one name per line) with a CSV file as the fallback; the
 * roster itself is written once, at finish, so Back/forward can never
 * double-import. Finish lands on a board that generates and applies its
 * first schedule by itself.
 */
export function Onboarding({ period, initial }: { period: Period; initial: BoardData }) {
  const navigate = useNavigate()
  const [people, setPeople] = useRosterPeople(initial.people)
  const [teams, setTeams] = useRosterTeams(initial.teams)
  const setShifts = useSetAtom(shiftsAtom)
  const setCoverage = useSetAtom(coverageAtom)
  const setSolveSettings = useSetAtom(solveSettingsAtom)
  const markAutoGenerate = useMarkAutoGenerateOnMount()
  const markWorkspaceOnboarded = useMarkWorkspaceOnboarded()

  const [step, setStep] = useState<Step>('shape')
  const [template, setTemplate] = useState<WorkspaceTemplate | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => parsePastedRoster(pasteText), [pasteText])
  const teamNames = useMemo(() => {
    const names = new Set<string>()
    for (const row of rows) if (row.team) names.add(row.team.toLowerCase())
    return names
  }, [rows])

  function pickShape(tmpl: WorkspaceTemplate) {
    setTemplate(tmpl)
    setShifts(tmpl.shifts)
    setCoverage(tmpl.coverage)
    setSolveSettings(tmpl.solveSettings)
    setStep('people')
  }

  async function handleCsvFile(file: File) {
    const parsed = parseEmployeeCsv(await file.text())
    setCsvErrors(parsed.errors)
    if (parsed.rows.length === 0) return
    const lines = parsed.rows.map((r) => (r.team ? `${r.name}, ${r.team}` : r.name))
    setPasteText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${lines.join('\n')}` : lines.join('\n')))
  }

  function finish(rosterRows: CsvRow[], generate: boolean) {
    const result = applyCsvImport(people, teams, rosterRows)
    setTeams(() => result.teams)
    setPeople(() => result.people)
    if (generate) markAutoGenerate(period.id)
    markWorkspaceOnboarded()
    navigate('/board')
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-base-300 bg-base-100 px-6 py-3">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-4">
            {i > 0 && <div className="h-px w-8 flex-none bg-base-300" />}
            <StepDot n={i + 1} label={s.label} active={step === s.key} done={i < stepIndex} />
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] p-8">
          {step === 'shape' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-base-content">How does your company work?</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  One click fills your shifts, coverage targets, and safe default rules. Everything is editable later in Settings.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {WORKSPACE_TEMPLATES.map((tmpl) => (
                  <ShapeCard key={tmpl.id} tmpl={tmpl} selected={template?.id === tmpl.id} onPick={() => pickShape(tmpl)} />
                ))}
              </div>
            </div>
          )}

          {step === 'people' && template && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-base-content">Add your people</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  One person per line — a name, or <span className="font-mono text-xs">Name, Team</span>. Paste straight from a
                  spreadsheet; every team name becomes a real team.
                </p>
              </div>

              <textarea
                className="textarea textarea-bordered h-52 w-full font-mono text-sm leading-relaxed"
                placeholder={'Anna Bauer, Front desk\nBen Keller, Front desk\nChloe Martin'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                autoFocus
              />

              {csvErrors.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-error">
                  {csvErrors.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-base-content/70">
                  {rows.length === 0 ? (
                    'No people yet.'
                  ) : (
                    <>
                      <span className="font-semibold text-base-content">{rows.length}</span>{' '}
                      {rows.length === 1 ? 'person' : 'people'}
                      {teamNames.size > 0 && (
                        <>
                          {' · '}
                          <span className="font-semibold text-base-content">{teamNames.size}</span>{' '}
                          {teamNames.size === 1 ? 'team' : 'teams'}
                        </>
                      )}
                    </>
                  )}
                </p>
                <label className="btn btn-ghost btn-xs">
                  ⧉ From a CSV file
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleCsvFile(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>

              {rows.length > 0 && rows.length < template.minPeople && template.peopleHint && (
                <p className="text-xs text-warning">◆ {template.peopleHint}</p>
              )}

              <div className="flex items-center gap-3">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('shape')}>
                  Back
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={rows.length === 0} onClick={() => setStep('ready')}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 'ready' && template && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-base-content">Ready to generate</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  Crewdoku builds the first schedule itself. You review it before anything is final.
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-4 text-sm text-base-content/80">
                <div>
                  <span className="font-semibold text-base-content">{template.label}</span>
                  {' — '}
                  {template.shifts.map((s) => s.code).join(', ')}
                </div>
                <div>
                  <span className="font-semibold text-base-content">{rows.length}</span>{' '}
                  {rows.length === 1 ? 'person' : 'people'}
                  {teamNames.size > 0 && (
                    <>
                      {' in '}
                      <span className="font-semibold text-base-content">{teamNames.size}</span>{' '}
                      {teamNames.size === 1 ? 'team' : 'teams'}
                    </>
                  )}
                </div>
                <div className="text-xs text-base-content/50">
                  Change any of this later in Settings, Roster, and Teams.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('people')}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" onClick={() => finish(rows, true)}>
                  Generate my first schedule
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => finish(rows, false)}>
                  Go to the board without generating
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
