import { useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { makeEmployee, makeOrg, makeShift, makeTeam } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Btn, EmptyState, Panel } from '../../ui'

type Step = 'org' | 'teams' | 'shifts' | 'coverage' | 'employees' | 'rules'
const ORDER: Step[] = ['org', 'teams', 'shifts', 'coverage', 'employees', 'rules']

/**
 * Minimal onboarding wizard: org -> teams -> shifts -> coverage -> employees ->
 * rules, plus a Load Demo shortcut. Each step writes valid entities to the store
 * so completing the flow yields a usable state (AC-24). Org/team/shift/employee
 * names are user data and never i18n'd.
 */
export function Onboarding({
  store,
  onDone,
}: {
  store: StoreApi<AppStore>
  onDone: () => void
}) {
  const { t } = useI18n()
  const loadDemo = useStore(store, (s) => s.loadDemo)
  const setOrg = useStore(store, (s) => s.setOrg)
  const upsertTeam = useStore(store, (s) => s.upsertTeam)
  const upsertShift = useStore(store, (s) => s.upsertShift)
  const upsertEmployee = useStore(store, (s) => s.upsertEmployee)
  const teams = useStore(store, (s) => s.teams)
  const shifts = useStore(store, (s) => s.shifts)
  const employees = useStore(store, (s) => s.employees)

  const [stepIdx, setStepIdx] = useState(0)
  const step = ORDER[stepIdx]!

  // draft fields for the "add" forms
  const [orgName, setOrgName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [shiftCode, setShiftCode] = useState('D')
  const [empName, setEmpName] = useState('')

  const next = (): void => setStepIdx((i) => Math.min(i + 1, ORDER.length - 1))
  const back = (): void => setStepIdx((i) => Math.max(i - 1, 0))

  const onNextOrg = (): void => {
    if (orgName.trim()) setOrg(makeOrg({ name: orgName.trim() }))
    next()
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 flex flex-col items-center">
      <div className="w-full max-w-xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('Onboarding')}</h2>
          <Btn onClick={() => { loadDemo(); onDone() }}>{t('Load demo')}</Btn>
        </div>

        <ol className="flex gap-1.5 text-2xs">
          {ORDER.map((s, i) => (
            <li
              key={s}
              aria-current={i === stepIdx ? 'step' : undefined}
              className={
                'flex-1 h-1 rounded-[2px] ' +
                (i <= stepIdx ? 'bg-[var(--sel)]' : 'bg-surface-2')
              }
            />
          ))}
        </ol>

        {step === 'org' && (
          <Panel title={t('Organization')}>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-dim">{t('Organization name')}</span>
              <input
                aria-label={t('Organization name')}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-7 border border-bds rounded-[2px] bg-surface px-2"
              />
            </label>
          </Panel>
        )}

        {step === 'teams' && (
          <Panel title={t('Teams & structure')}>
            <div className="flex items-end gap-2 text-xs">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-dim">{t('Team name')}</span>
                <input
                  aria-label={t('Team name')}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="h-7 border border-bds rounded-[2px] bg-surface px-2"
                />
              </label>
              <Btn
                onClick={() => {
                  if (teamName.trim()) {
                    upsertTeam(makeTeam({ name: teamName.trim(), shiftIds: shifts.map((s) => s.id) }))
                    setTeamName('')
                  }
                }}
              >
                {t('Add team')}
              </Btn>
            </div>
            <ul className="mt-2 text-xs text-dim flex flex-col gap-0.5">
              {teams.map((tm) => (
                <li key={tm.id}>{tm.name}</li>
              ))}
            </ul>
          </Panel>
        )}

        {step === 'shifts' && (
          <Panel title={t('Shift definitions')}>
            <div className="flex items-end gap-2 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-dim">{t('Code')}</span>
                <input
                  aria-label={t('Code')}
                  value={shiftCode}
                  onChange={(e) => setShiftCode(e.target.value)}
                  className="w-16 h-7 border border-bds rounded-[2px] bg-surface px-2 font-mono"
                />
              </label>
              <Btn
                onClick={() => {
                  const code = shiftCode.trim() || 'D'
                  upsertShift(
                    makeShift({ code, name: code, startHour: 9, endHour: 17, isNight: false }),
                  )
                }}
              >
                {t('Add shift')}
              </Btn>
            </div>
            <ul className="mt-2 text-xs text-dim flex flex-col gap-0.5">
              {shifts.map((sh) => (
                <li key={sh.id} className="font-mono">
                  {sh.code} — {sh.name}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {step === 'coverage' && (
          <Panel title={t('Coverage')}>
            <p className="text-xs text-dim leading-relaxed">
              {t('Coverage bands default to 0; refine them later in Configuration.')}
            </p>
          </Panel>
        )}

        {step === 'employees' && (
          <Panel title={t('Employees')}>
            <div className="flex items-end gap-2 text-xs">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-dim">{t('Employee name')}</span>
                <input
                  aria-label={t('Employee name')}
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="h-7 border border-bds rounded-[2px] bg-surface px-2"
                />
              </label>
              <Btn
                disabled={teams.length === 0}
                onClick={() => {
                  if (empName.trim() && teams[0]) {
                    upsertEmployee(
                      makeEmployee({
                        name: empName.trim(),
                        teamId: teams[0].id,
                        eligibleShiftIds: shifts.map((s) => s.id),
                      }),
                    )
                    setEmpName('')
                  }
                }}
              >
                {t('Add employee')}
              </Btn>
            </div>
            <ul className="mt-2 text-xs text-dim flex flex-col gap-0.5">
              {employees.map((e) => (
                <li key={e.id}>{e.name}</li>
              ))}
            </ul>
          </Panel>
        )}

        {step === 'rules' && (
          <Panel title={t('Scheduling rules')}>
            <EmptyState
              glyph="✓"
              title={t('Ready to schedule')}
              body={t('Defaults applied (48h/week, 11h rest). Tune them in Configuration.')}
            />
          </Panel>
        )}

        <div className="flex justify-between">
          <Btn variant="ghost" disabled={stepIdx === 0} onClick={back}>
            {t('Back')}
          </Btn>
          {stepIdx < ORDER.length - 1 ? (
            <Btn variant="primary" onClick={step === 'org' ? onNextOrg : next}>
              {t('Next')}
            </Btn>
          ) : (
            <Btn variant="primary" onClick={onDone}>
              {t('Finish')}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}
