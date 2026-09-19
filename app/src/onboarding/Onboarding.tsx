import { Check, Sparkles, TriangleAlert, Upload } from '../ui/icons'
import { useT } from '../i18n/useT'
import { csvErrorText } from '../i18n/csvErrors'
import { track } from '../analytics'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { activeWorkspaceIdAtom } from '../state/orgStore'
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
import { clearWizardProgress, loadWizardProgress, saveWizardProgress, type WizardProgress } from './wizardProgress'
import { sampleRosterText } from './sampleRoster'
import { useWizardCoach } from './tour/wizardCoach'
import { tourReplayRequestedAtom } from './tour/productTour'

type Step = 'shape' | 'people' | 'ready'

const STEPS: { key: Step; label: string }[] = [
  { key: 'shape', label: 'Company shape' },
  { key: 'people', label: 'People' },
  { key: 'ready', label: 'Generate' },
]

/** People-step rows echoed back to the manager; past this the count carries it. */
const PREVIEW_ROWS = 8

function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    // `aria-current` names the step the wizard is on, so the dot row reads as
    // progress rather than three unrelated labels.
    <div className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
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
      {/* Below `md` only the current step is named: three labels plus their
          dots cannot fit a 360px bar, and the dots alone already say where you
          are. `md:` restores every label exactly as it was. `truncate` lets
          that one label give way (rather than push the Skip setup button off
          the bar) on a phone in a longer locale. */}
      <span
        className={`truncate text-xs font-medium md:text-sm ${
          active ? 'text-base-content' : 'hidden text-base-content/50 md:inline'
        }`}
      >
        {label}
      </span>
    </div>
  )
}

function toClock(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
}

/** The template a saved progress entry points at; null when it names none or
 *  names one this build no longer ships. */
function restoredTemplate(saved: WizardProgress | null): WorkspaceTemplate | null {
  if (!saved?.templateId) return null
  return WORKSPACE_TEMPLATES.find((t) => t.id === saved.templateId) ?? null
}

/**
 * The step to reopen on. The People and Generate steps render only inside
 * `template &&`, so a saved step whose template is missing (an entry from an
 * older build, a cleared template catalog) must fall back to the shape step
 * that can pick one instead of restoring a blank screen.
 */
function restoredStep(saved: WizardProgress | null, template: WorkspaceTemplate | null): Step {
  const match = STEPS.find((s) => s.key === saved?.step)
  if (!match || match.key === 'shape') return 'shape'
  return template ? match.key : 'shape'
}

function ShapeCard({ tmpl, selected, onPick }: { tmpl: WorkspaceTemplate; selected: boolean; onPick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex flex-col gap-2.5 rounded-lg border p-3 text-left transition-colors duration-150 md:p-4 ${
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
  const requestTour = useSetAtom(tourReplayRequestedAtom)

  const wsId = useAtomValue(activeWorkspaceIdAtom)

  // Restore the resumable progress once, on mount: a later render must never
  // re-read it over the manager's own edits. Each piece of state then lazily
  // restores from that one snapshot, so the three values can never disagree.
  const [savedProgress] = useState(() => loadWizardProgress(wsId))
  const [template, setTemplate] = useState<WorkspaceTemplate | null>(() => restoredTemplate(savedProgress))
  const [step, setStep] = useState<Step>(() => restoredStep(savedProgress, template))
  const [pasteText, setPasteText] = useState(() => savedProgress?.pasteText ?? '')
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Every change is remembered, so a reload mid-setup reopens this exact
  // screen. Three short strings per workspace: cheap enough to write on each
  // keystroke. `finish` clears it again when the wizard is done with.
  useEffect(() => {
    saveWizardProgress(wsId, { step, templateId: template?.id ?? null, pasteText })
  }, [wsId, step, template, pasteText])

  // A step is a page: moving focus to its heading is what tells a screen
  // reader which page it landed on.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  // The wizard's own coach-marks (driver.js), one popover per step, once per
  // device; the coach repositions itself as `step` advances.
  useWizardCoach(step)

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

  function handleUseSample() {
    // Append, same as the file import, so it adds to anything already typed
    // rather than clobbering it; the parser reads the merged text.
    setPasteText((prev) => {
      const sample = sampleRosterText()
      return prev.trim() ? `${prev.trimEnd()}\n${sample}` : sample
    })
  }

  function finish(rosterRows: CsvRow[], generate: boolean) {
    const result = applyCsvImport(people, teams, rosterRows)
    setTeams(() => result.teams)
    setPeople(() => result.people)
    if (generate) {
      markAutoGenerate(period.id)
      // Launch the board's product tour once they land on their freshly
      // generated board. Requested outright, not gated on hasSeenTour: the
      // tour's own first-visit trigger is usually already spent by the org
      // picker's sample board, so a real onboarding would otherwise finish
      // with no guide at all. Settings can still replay it later.
      requestTour(true)
    }
    markWorkspaceOnboarded()
    // The wizard's single exit, reached by all three endings - generate, skip
    // at the last step, and Skip setup from any step - so forgetting the saved
    // progress here covers them all: a finished wizard can never be replayed
    // by a later reload. The difference between those endings is reported by
    // the solve events, and the counts are the post-apply roster, not the rows
    // just pasted: rows merge into whatever the workspace already had.
    clearWizardProgress(wsId)
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
      <div
        className="flex h-12 items-center gap-2 border-b border-base-300 bg-base-100 px-4 md:gap-4 md:px-6"
        role="group"
        aria-label={t('onbex.nav.aria')}
      >
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex min-w-0 items-center gap-2 md:gap-4">
            {i > 0 && <div className="h-px w-4 flex-none bg-base-300 md:w-8" />}
            <StepDot n={i + 1} label={t(`onbex.step.${s.key}`)} active={step === s.key} done={i < stepIndex} />
          </div>
        ))}
        {/* Skippable from every step, not only the last one: a manager who
            wants to look around first lands on an empty board with the
            workspace's default shifts and can fill in Roster, Teams, and
            Settings whenever they like. */}
        <button
          type="button"
          data-tour="wizard-skip"
          className="btn btn-ghost btn-xs ml-auto min-h-11 shrink-0 md:min-h-0"
          onClick={() => finish([], false)}
        >
          {t('onbex.btn.skipSetup')}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] p-4 md:p-8">
          {step === 'shape' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold tracking-tight text-base-content focus:outline-none"
                >
                  {t('onbex.shape.title')}
                </h2>
                <p className="mt-1 text-sm text-base-content/60">
                  {t('onbex.shape.subtitle')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3" data-tour="wizard-shapes">
                {WORKSPACE_TEMPLATES.map((tmpl) => (
                  <ShapeCard key={tmpl.id} tmpl={tmpl} selected={template?.id === tmpl.id} onPick={() => pickShape(tmpl)} />
                ))}
              </div>
            </div>
          )}

          {step === 'people' && template && (
            <div className="flex flex-col gap-5" data-tour="wizard-people">
              <div>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold tracking-tight text-base-content focus:outline-none"
                >
                  {t('onbex.people.title')}
                </h2>
                <p className="mt-1 text-sm text-base-content/60">
                  {t('onbex.people.subtitlePrefix')} <span className="font-mono text-xs">Name, Team</span>
                  {t('onbex.people.subtitleSuffix')}
                </p>
              </div>

              {/* No `autoFocus`: the step heading takes focus instead, so a
                  screen reader announces the step and a phone does not open
                  its keyboard before the manager has read what to paste. */}
              <textarea
                className="textarea textarea-bordered h-52 w-full font-mono text-[16px] leading-relaxed md:text-sm"
                placeholder={t('onbex.people.placeholder')}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />

              {csvErrors.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-error">
                  {csvErrors.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between">
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
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs min-h-11 gap-1.5 md:min-h-0"
                      onClick={handleUseSample}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="truncate">{t('onbex.people.useSample')}</span>
                    </button>
                    <label className="btn btn-ghost btn-xs min-h-11 gap-1.5 md:min-h-0">
                      <Upload className="h-3.5 w-3.5" />
                      <span className="truncate">{t('onbex.people.fromFile')}</span>
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
                </div>

                {/* What the parser actually read, so a paste that dropped its
                    team column, kept a header row, or split a name is visible
                    here rather than on a board full of strangers. Capped: the
                    count above already says how many there are. */}
                {rows.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs text-base-content/60">
                    {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                      <li key={i} className="truncate">
                        {row.team ? `${row.name} - ${row.team}` : row.name}
                      </li>
                    ))}
                    {rows.length > PREVIEW_ROWS && (
                      <li className="text-base-content/50">
                        {t('onbex.people.previewMore', { count: rows.length - PREVIEW_ROWS })}
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {rows.length > 0 && rows.length < template.minPeople && template.peopleHint && (
                <p className="flex items-start gap-1.5 text-xs text-warning"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t(`onbex.template.${template.id}.hint`)}</span></p>
              )}

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
                  onClick={() => setStep('shape')}
                >
                  {t('onbex.btn.back')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
                  disabled={rows.length === 0}
                  onClick={() => setStep('ready')}
                >
                  {t('onbex.btn.continue')}
                </button>
              </div>
            </div>
          )}

          {step === 'ready' && template && (
            <div className="flex flex-col gap-5" data-tour="wizard-generate">
              <div>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold tracking-tight text-base-content focus:outline-none"
                >
                  {t('onbex.ready.title')}
                </h2>
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

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
                  onClick={() => setStep('people')}
                >
                  {t('onbex.btn.back')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary min-h-11 w-full md:min-h-0 md:w-auto"
                  onClick={() => finish(rows, true)}
                >
                  {t('onbex.ready.generate')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
                  onClick={() => finish(rows, false)}
                >
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
