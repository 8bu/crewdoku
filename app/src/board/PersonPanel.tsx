import { useT } from '../i18n/useT'
import { useMemo, useState } from 'react'
import type { Person, ShiftCode, ShiftDef, Team } from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'
import type { FairnessRow } from './fairness'

const WEEKDAY_KEYS = [
  'board.person.weekday.sun',
  'board.person.weekday.mon',
  'board.person.weekday.tue',
  'board.person.weekday.wed',
  'board.person.weekday.thu',
  'board.person.weekday.fri',
  'board.person.weekday.sat',
] as const

type PersonPanelProps = {
  person: Person
  team: Team
  shifts: ShiftDef[]
  fairness: FairnessRow
  hoursCap: number
  isMaxHours: boolean
  /** True when this person has an actual H2 (max hours/week) rule break
   * somewhere in the period — `violations.ts`'s real per-week check, not a
   * period-summed-hours-vs-scaled-cap comparison. That comparison used to
   * live here directly and could disagree with the real rule in both
   * directions (evenly-spread hours reading as "over" a summed cap; one
   * genuinely over-cap week hiding inside an otherwise-low period total). */
  hasHoursViolation: boolean
  dates: BoardDate[]
  onClose: () => void
  onUpdate: (patch: Partial<Person>) => void
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}



const heading = 'mb-2 text-2xs font-semibold uppercase tracking-wide text-base-content/50'
const hint = 'mt-1.5 text-2xs text-base-content/50'
const chipsRow = 'flex flex-wrap gap-1.5'
const chipBase =
  'rounded-md border border-base-300 bg-base-100 px-[9px] py-1 text-2xs font-semibold text-base-content cursor-pointer transition-colors duration-150 disabled:cursor-default disabled:opacity-75'

/**
 * The person side panel (ticket 09) — docked right of the board, decided over
 * a floating popover or a full-board modal so there is room for every fact
 * that decides an assignment at once, editable in place, without leaving the
 * board. The clicked row stays visible and highlighted (BoardGrid's job),
 * this component only reads/writes the one `Person` it was opened for.
 */
export function PersonPanel({
  person,
  team,
  shifts,
  fairness,
  hoursCap,
  isMaxHours,
  hasHoursViolation,
  dates,
  onClose,
  onUpdate,
}: PersonPanelProps) {
  const t = useT()

  function dateLabel(iso: string, dateByIsoMap: Map<string, BoardDate>): string {
    const date = dateByIsoMap.get(iso)
    if (!date) return iso
    return `${t(WEEKDAY_KEYS[date.weekday] ?? '')} ${date.monthShort} ${date.dayOfMonth}`
  }

  function prefLabel(wantsList: ShiftCode[], avoidsList: ShiftCode[]): string {
    const parts: string[] = []
    if (wantsList.length > 0) parts.push(t('board.person.prefWants', { shifts: wantsList.join(', ') }))
    if (avoidsList.length > 0) parts.push(t('board.person.prefAvoids', { shifts: avoidsList.join(', ') }))
    return parts.length > 0 ? parts.join(' · ') : t('board.person.prefNone')
  }
  const dateByIso = useMemo(() => new Map(dates.map((d) => [d.iso, d])), [dates])
  const [newTimeOff, setNewTimeOff] = useState('')

  const ineligible = person.ineligible
  const timeOff = person.timeOff ?? []
  const recurringOff = person.recurringOff ?? []
  // Most people never set their own preference — they inherit the team's
  // default until they ask for something different (8bu's call). Defaults to
  // true so a person with no stance recorded reads as "inherits", not "wants
  // and avoids nothing" (a stance of its own that nobody actually chose).
  const useTeamPreference = person.useTeamPreference ?? true
  const ownWants = person.wants ?? []
  const ownAvoids = person.avoids ?? []
  const wants = useTeamPreference ? team.wants : ownWants
  const avoids = useTeamPreference ? team.avoids : ownAvoids

  function toggleEligible(code: Exclude<ShiftCode, 'OFF'>) {
    onUpdate({ ineligible: toggle(ineligible, code) })
  }

  function toggleRecurringOff(weekday: number) {
    onUpdate({ recurringOff: toggle(recurringOff, weekday) })
  }

  function toggleWant(code: Exclude<ShiftCode, 'OFF'>) {
    onUpdate({ wants: toggle(ownWants, code), avoids: ownAvoids.filter((c) => c !== code) })
  }

  function toggleAvoid(code: Exclude<ShiftCode, 'OFF'>) {
    onUpdate({ avoids: toggle(ownAvoids, code), wants: ownWants.filter((c) => c !== code) })
  }

  // Unchecking "inherit" starts the person's own preference from the team's
  // current default, not blank — so switching to "own" never reads as
  // silently clearing a preference the planner didn't touch.
  function setUseTeamPreference(next: boolean) {
    if (!next && ownWants.length === 0 && ownAvoids.length === 0) {
      onUpdate({ useTeamPreference: next, wants: [...team.wants], avoids: [...team.avoids] })
      return
    }
    onUpdate({ useTeamPreference: next })
  }

  function removeTimeOff(iso: string) {
    onUpdate({ timeOff: timeOff.filter((d) => d !== iso) })
  }

  function addTimeOff() {
    if (!newTimeOff || timeOff.includes(newTimeOff)) return
    onUpdate({ timeOff: [...timeOff, newTimeOff].sort() })
    setNewTimeOff('')
  }

  const overCap = hasHoursViolation

  return (
    <div
      className="relative flex h-full w-[var(--panel-w)] flex-none flex-col overflow-y-auto border-l border-[var(--border-strong)] bg-base-100 font-sans shadow-[var(--shadow-pane)]"
      role="dialog"
      aria-label={t('board.person.dialogAria', { name: person.name })}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-base-300 bg-base-100 px-4 py-3.5">
        <div>
          <div className="text-sm font-semibold text-base-content">
            {person.name}
            {person.removed && (
              <span className="badge badge-error badge-outline badge-xs ml-1.5 align-middle">{t('board.person.removedBadge')}</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-base-content/50">{team.name}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-xs btn-circle text-base-content/50" onClick={onClose} aria-label={t('board.person.closeAria')}>
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-[18px] p-4">
        <section>
          <h3 className={heading}>{t('board.person.sectionPeriod')}</h3>
          <div className="flex gap-2.5">
            <div
              className={`flex-1 rounded-lg border bg-base-200 px-2.5 py-2 ${overCap ? 'border-error' : 'border-base-300'}`}
            >
              <span className={`font-mono text-lg font-semibold ${overCap ? 'text-error' : 'text-base-content'}`}>
                {fairness.hours}
              </span>
              <span className="ml-0.5 font-mono text-2xs text-base-content/50">/ {hoursCap}h</span>
              <span className="mt-0.5 block text-2xs text-base-content/50">
                {t('board.person.hours')}{isMaxHours ? t('board.person.mostLoaded') : ''}
              </span>
            </div>
            <div className="flex-1 rounded-lg border border-base-300 bg-base-200 px-2.5 py-2">
              <span className="font-mono text-lg font-semibold text-base-content">{fairness.nights}</span>
              <span className="mt-0.5 block text-2xs text-base-content/50">{t('board.person.nights')}</span>
            </div>
            <div className="flex-1 rounded-lg border border-base-300 bg-base-200 px-2.5 py-2">
              <span className="font-mono text-lg font-semibold text-base-content">{fairness.weekends}</span>
              <span className="mt-0.5 block text-2xs text-base-content/50">{t('board.person.weekends')}</span>
            </div>
          </div>
        </section>

        <section>
          <h3 className={heading}>{t('board.person.sectionEligible')}</h3>
          <div className={chipsRow}>
            {shifts.map(({ code }) => (
              <button
                key={code}
                type="button"
                className={`${chipBase} ${
                  ineligible.includes(code) ? 'border-base-300 bg-base-200 text-base-content/40 line-through' : ''
                }`}
                data-shift={code}
                data-off={ineligible.includes(code) || undefined}
                onClick={() => toggleEligible(code)}
              >
                {code}
              </button>
            ))}
          </div>
          <p className={hint}>{t('board.person.eligibleHint')}</p>
        </section>

        <section>
          <h3 className={heading}>{t('board.person.sectionPreferences')}</h3>
          <label className="mb-1 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-base-content">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={useTeamPreference}
              onChange={(e) => setUseTeamPreference(e.target.checked)}
            />
            {t('board.person.inheritTeam')}
          </label>
          <p className="mb-2.5 mt-1.5 text-2xs text-base-content/50">
            {t('board.person.teamDefault', { pref: prefLabel(team.wants, team.avoids) })}
          </p>
          <div className="mb-2 flex items-center gap-2.5">
            <span className="w-[52px] flex-none text-2xs text-base-content/50">{t('board.person.wants')}</span>
            <div className={chipsRow}>
              {shifts.map(({ code }) => (
                <button
                  key={code}
                  type="button"
                  className={`${chipBase} ${
                    wants.includes(code) ? 'border-success bg-success text-success-content' : ''
                  }`}
                  data-shift={code}
                  data-active={wants.includes(code) || undefined}
                  disabled={useTeamPreference}
                  onClick={() => toggleWant(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-[52px] flex-none text-2xs text-base-content/50">{t('board.person.avoids')}</span>
            <div className={chipsRow}>
              {shifts.map(({ code }) => (
                <button
                  key={code}
                  type="button"
                  className={`${chipBase} ${
                    avoids.includes(code) ? 'border-error bg-error text-error-content' : ''
                  }`}
                  data-shift={code}
                  data-active={avoids.includes(code) || undefined}
                  disabled={useTeamPreference}
                  onClick={() => toggleAvoid(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h3 className={heading}>{t('board.person.sectionRecurring')}</h3>
          <div className={chipsRow}>
            {WEEKDAY_KEYS.map((key, weekday) => (
              <button
                key={key}
                type="button"
                className={`${chipBase} ${
                  recurringOff.includes(weekday) ? 'border-base-content bg-base-content text-base-100' : ''
                }`}
                data-active={recurringOff.includes(weekday) || undefined}
                onClick={() => toggleRecurringOff(weekday)}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <p className={hint}>{t('board.person.recurringHint')}</p>
        </section>

        <section>
          <h3 className={heading}>{t('board.person.sectionTimeOff')}</h3>
          {timeOff.length === 0 ? (
            <p className={hint}>{t('board.person.timeOffNone')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {timeOff.map((iso) => (
                <li
                  key={iso}
                  className="flex items-center justify-between rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs text-base-content"
                >
                  <span>{dateLabel(iso, dateByIso)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-base-content/50 hover:text-error"
                    onClick={() => removeTimeOff(iso)}
                    aria-label={t('board.person.removeTimeOffAria', { date: dateLabel(iso, dateByIso) })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-1.5">
            <input
              type="date"
              className="input input-sm input-bordered flex-1"
              value={newTimeOff}
              min={dates[0]?.iso}
              max={dates.at(-1)?.iso}
              onChange={(e) => setNewTimeOff(e.target.value)}
              aria-label={t('board.person.addTimeOffAria')}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={addTimeOff}
              disabled={!newTimeOff}
            >
              {t('board.person.addTimeOffButton')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
