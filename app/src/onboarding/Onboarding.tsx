import { Check, TriangleAlert, Upload } from '../ui/icons'
import { useT } from '../i18n/useT'
import { csvErrorText } from '../i18n/csvErrors'
import { track } from '../analytics'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import type { Period } from '../state/shell'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { shiftsAtom } from '../state/shifts'
import { coverageAtom } from '../state/coverageRules'
import { solveSettingsAtom } from '../state/solveSettings'
import { useMarkAutoGenerateOnMount, useMarkWorkspaceOnboarded } from '../state/onboarding'
import { applyCsvImport, parsePastedRoster, employeeRowsToLines, type CsvRow } from '../board/roster/csvImport'
import { readEmployeeFile } from '../board/roster/xlsxImport'
import type { BoardData } from '../board/mockBoard'
import { WORKSPACE_TEMPLATES, type WorkspaceTemplate } from './templates'

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
        {done ? <Check className="h-3 w-3" /> : n}
      </span>
      <span className={`text-sm font-medium ${active ? 'text-base-content' : 'text-base-content/50'}`}>{label}</span>
    </div>
  )
}

function toClock(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
}

function ShapeCard({ tmpl, selected, onPick }: { tmpl: WorkspaceTemplate; selected: boolean; onPick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex flex-col gap-2.5 rounded-lg border p-4 text-left transition-colors duration-150 ${
        selected ? 'border-primary bg-primary/5' : 'border-base-300 bg-base-100 hover:border-primary/50'
      }`}
    >
      <div>
        <div className="text-sm font-semibold text-base-content">{t(`onbex.template.${tmpl.id}.label`)}</div>
        <div className="mt-0.5 text-xs leading-snug text-base-content/60">{t(`onbex.template.${tmpl.id}.tagline`)}</div>
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
 * shape, paste your people, generate. Only ever reached on an empty-workspace
 * boot (`Board.tsx`'s onboarding gate). Picking a shape seeds the
 * workspace-global shift catalog,
 * coverage table, and solve settings from a template; the People step is
 * paste-first (one name per line) with a CSV file as the fallback; the
 * roster itself is written once, at finish, so Back/forward can never
 * double-import. Finish lands on a board that generates and applies its
 * first schedule by itself.
 */
export function Onboarding({ period, initial }: { period: Period; initial: BoardData }) {
  const navigate = useNavigate()
  const t = useT()
  const [people, setPeople] = useRosterPeople(initial.people)
  const [teams, setTeams] = useRosterTeams(initial.teams)
  const setShifts = useSetAtom(shiftsAtom)
  const shifts = useAtomValue(shiftsAtom)
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
    // The id, never the label: the four ids are the stable part of a template,
    // while the label is copy that can be renamed or translated.
    track('onboarding_template_selected', { template: tmpl.id })
    setTemplate(tmpl)
    setShifts(tmpl.shifts)
    setCoverage(tmpl.coverage)
    setSolveSettings(tmpl.solveSettings)
    setStep('people')
  }

  async function handleImportFile(file: File) {
    try {
      const parsed = await readEmployeeFile(file)
      setCsvErrors(parsed.errors.map((e) => csvErrorText(t, e)))
      if (parsed.rows.length === 0) return
      const lines = employeeRowsToLines(parsed.rows)
      setPasteText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${lines.join('\n')}` : lines.join('\n')))
    } catch {
      setCsvErrors([t('rtc.import.fileError.unreadable')])
    }
  }

  function finish(rosterRows: CsvRow[], generate: boolean) {
    const result = applyCsvImport(people, teams, rosterRows)
    setTeams(() => result.teams)
    setPeople(() => result.people)
    if (generate) markAutoGenerate(period.id)
    markWorkspaceOnboarded()
    // The wizard's only exit, so both "generate my first schedule" and "go to
    // the board" reach it — their difference is reported by the solve events.
    // Counts are the post-apply roster, not the rows just pasted: rows merge
    // into whatever the workspace already had.
    track('onboarding_completed', {
      people: result.people.length,
      teams: result.teams.length,
      shifts: shifts?.length ?? 0,
    })
    navigate('/board')
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-4 border-b border-base-300 bg-base-100 px-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-4">
            {i > 0 && <div className="h-px w-8 flex-none bg-base-300" />}
            <StepDot n={i + 1} label={t(`onbex.step.${s.key}`)} active={step === s.key} done={i < stepIndex} />
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] p-8">
          {step === 'shape' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-base-content">{t('onbex.shape.title')}</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  {t('onbex.shape.subtitle')}
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
                <h2 className="text-lg font-semibold tracking-tight text-base-content">{t('onbex.people.title')}</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  {t('onbex.people.subtitlePrefix')} <span className="font-mono text-xs">Name, Team</span>
                  {t('onbex.people.subtitleSuffix')}
                </p>
              </div>

              <textarea
                className="textarea textarea-bordered h-52 w-full font-mono text-sm leading-relaxed"
                placeholder={t('onbex.people.placeholder')}
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
                    t('onbex.people.empty')
                  ) : (
                    <>
                      <span className="font-semibold text-base-content">{rows.length}</span>{' '}
                      {rows.length === 1 ? t('onbex.people.person') : t('onbex.people.people')}
                      {teamNames.size > 0 && (
                        <>
                          {' · '}
                          <span className="font-semibold text-base-content">{teamNames.size}</span>{' '}
                          {teamNames.size === 1 ? t('onbex.people.team') : t('onbex.people.teams')}
                        </>
                      )}
                    </>
                  )}
                </p>
                <label className="btn btn-ghost btn-xs gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  {t('onbex.people.fromFile')}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleImportFile(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>

              {rows.length > 0 && rows.length < template.minPeople && template.peopleHint && (
                <p className="flex items-start gap-1.5 text-xs text-warning"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t(`onbex.template.${template.id}.hint`)}</span></p>
              )}

              <div className="flex items-center gap-3">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('shape')}>
                  {t('onbex.btn.back')}
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={rows.length === 0} onClick={() => setStep('ready')}>
                  {t('onbex.btn.continue')}
                </button>
              </div>
            </div>
          )}

          {step === 'ready' && template && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-base-content">{t('onbex.ready.title')}</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  {t('onbex.ready.subtitle')}
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-4 text-sm text-base-content/80">
                <div>
                  <span className="font-semibold text-base-content">{t(`onbex.template.${template.id}.label`)}</span>
                  {' — '}
                  {template.shifts.map((s) => s.code).join(', ')}
                </div>
                <div>
                  <span className="font-semibold text-base-content">{rows.length}</span>{' '}
                  {rows.length === 1 ? t('onbex.people.person') : t('onbex.people.people')}
                  {teamNames.size > 0 && (
                    <>
                      {t('onbex.ready.inTeamPrefix')}
                      <span className="font-semibold text-base-content">{teamNames.size}</span>{' '}
                      {teamNames.size === 1 ? t('onbex.people.team') : t('onbex.people.teams')}
                    </>
                  )}
                </div>
                <div className="text-xs text-base-content/50">
                  {t('onbex.ready.note')}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('people')}>
                  {t('onbex.btn.back')}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => finish(rows, true)}>
                  {t('onbex.ready.generate')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => finish(rows, false)}>
                  {t('onbex.ready.skip')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
