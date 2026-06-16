import { useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { makeEmployee, type Employee, type Pref } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Btn, Panel, Seg } from '../../ui'

const PREFS: Pref[] = ['prefer', 'willing', 'avoid']

/**
 * Employees editor — team, shift eligibility, contract caps, time-off,
 * recurring days-off, and preferences (night/weekend/preferred shift + notes).
 * One employee expanded at a time; edits dispatch upsertEmployee. Employee
 * names and notes are user data (never i18n'd).
 */
export function EmployeesConfig({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const employees = useStore(store, (s) => s.employees)
  const teams = useStore(store, (s) => s.teams)
  const shifts = useStore(store, (s) => s.shifts)
  const upsertEmployee = useStore(store, (s) => s.upsertEmployee)
  const removeEmployee = useStore(store, (s) => s.removeEmployee)

  const [openId, setOpenId] = useState<string | null>(null)

  const patch = (e: Employee, p: Partial<Employee>): void => upsertEmployee({ ...e, ...p })

  const addEmp = (): void => {
    const teamId = teams[0]?.id ?? ''
    const emp = makeEmployee({ name: 'New employee', teamId, eligibleShiftIds: [] })
    upsertEmployee(emp)
    setOpenId(emp.id)
  }

  return (
    <Panel title={t('Employees')} actions={<Btn onClick={addEmp}>{t('Add employee')}</Btn>}>
      <div className="flex flex-col gap-1.5 max-w-3xl">
        {employees.map((e) => {
          const open = openId === e.id
          const team = teams.find((tm) => tm.id === e.teamId)
          return (
            <div key={e.id} className="border border-bd rounded-[2px]">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : e.id)}
                aria-expanded={open}
                className="w-full flex items-center gap-2 px-2 h-8 text-left text-xs hover:bg-surface-2"
              >
                <span aria-hidden="true" className="text-faint">
                  {open ? '▾' : '▸'}
                </span>
                <span className="font-medium">{e.name}</span>
                <span className="text-faint ml-auto">{team?.name ?? '—'}</span>
              </button>
              {open && (
                <div className="p-2 flex flex-col gap-2 border-t border-bd text-xs">
                  <label className="flex items-center gap-2">
                    <span className="text-dim w-24">{t('Name')}</span>
                    <input
                      aria-label={`name ${e.id}`}
                      value={e.name}
                      onChange={(ev) => patch(e, { name: ev.target.value })}
                      className="flex-1 h-7 border border-bds rounded-[2px] bg-surface px-2"
                    />
                  </label>

                  <label className="flex items-center gap-2">
                    <span className="text-dim w-24">{t('Team')}</span>
                    <select
                      aria-label={`team ${e.id}`}
                      value={e.teamId}
                      onChange={(ev) => patch(e, { teamId: ev.target.value })}
                      className="flex-1 h-7 border border-bds rounded-[2px] bg-surface px-2"
                    >
                      {teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-start gap-2">
                    <span className="text-dim w-24 pt-1">{t('Eligible shifts')}</span>
                    <div className="flex flex-wrap gap-2 flex-1">
                      {shifts.map((sh) => (
                        <label key={sh.id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            aria-label={`${e.name} eligible ${sh.code}`}
                            checked={e.eligibleShiftIds.includes(sh.id)}
                            onChange={() =>
                              patch(e, {
                                eligibleShiftIds: e.eligibleShiftIds.includes(sh.id)
                                  ? e.eligibleShiftIds.filter((id) => id !== sh.id)
                                  : [...e.eligibleShiftIds, sh.id],
                              })
                            }
                          />
                          <span className="font-mono">{sh.code}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2">
                    <span className="text-dim w-24">{t('Max hours / week')}</span>
                    <input
                      type="number"
                      aria-label={`max hours ${e.id}`}
                      min={0}
                      value={e.contract.maxHoursPerWeek ?? ''}
                      placeholder={t('default')}
                      onChange={(ev) =>
                        patch(e, {
                          contract: {
                            ...e.contract,
                            maxHoursPerWeek: ev.target.value ? Number(ev.target.value) : undefined,
                          },
                        })
                      }
                      className="w-24 h-7 border border-bds rounded-[2px] bg-surface px-2 font-mono"
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-dim w-24">{t('Night pref')}</span>
                    <Seg
                      ariaLabel={`night pref ${e.id}`}
                      value={e.prefs.night}
                      onChange={(v) => patch(e, { prefs: { ...e.prefs, night: v as Pref } })}
                      options={PREFS.map((p) => ({ v: p, label: p }))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-dim w-24">{t('Weekend pref')}</span>
                    <Seg
                      ariaLabel={`weekend pref ${e.id}`}
                      value={e.prefs.weekend}
                      onChange={(v) => patch(e, { prefs: { ...e.prefs, weekend: v as Pref } })}
                      options={PREFS.map((p) => ({ v: p, label: p }))}
                    />
                  </div>

                  <label className="flex items-start gap-2">
                    <span className="text-dim w-24 pt-1">{t('Notes')}</span>
                    <textarea
                      aria-label={`notes ${e.id}`}
                      value={e.prefs.notes}
                      onChange={(ev) => patch(e, { prefs: { ...e.prefs, notes: ev.target.value } })}
                      className="flex-1 border border-bds rounded-[2px] bg-surface px-2 py-1 min-h-[3rem]"
                    />
                  </label>

                  <div className="flex justify-end">
                    <Btn variant="danger" onClick={() => removeEmployee(e.id)}>
                      {t('Remove employee')}
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {employees.length === 0 && <p className="text-xs text-faint">{t('No employees yet.')}</p>}
      </div>
    </Panel>
  )
}
