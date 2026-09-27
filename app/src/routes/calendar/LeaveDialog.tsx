/**
 * The calendar's book/edit dialog. Like `AioImportModal` it is the whole job in
 * one place — it owns the pending dates and the person picker, and reports the
 * finished range upward, where the one call into `replacePersonLeave` happens.
 * Any date is valid (the roster is workspace-global), so the only gate is a
 * chosen person and a start date — the day count is the app's `Stepper`, which
 * holds itself inside 1..`MAX_LEAVE_DAYS`. The end date is derived rather than
 * typed, which is what makes a range that crosses months or years just work.
 * Mounted only while open, so its fields start from `request` every time.
 */
import { useEffect, useRef, useState } from 'react'
import type { Person, Team } from '@crewdoku/domain'
import { useT } from '../../i18n/useT'
import { addDaysISO } from '../../state/shell'
import { Input } from '../../ui/Input'
import { PersonCombobox } from '../../ui/PersonCombobox'
import { Stepper } from '../../ui/Stepper'
import { Trash2, X } from '../../ui/icons'
import { rangeLength, type LeaveRange } from './leaveRanges'

/** What the dialog is doing: booking new leave, or editing one range of it. */
export type LeaveDialogRequest = {
  mode: 'book' | 'edit'
  personId: string
  from: string
  to: string
  /** Edit mode only: the range replaced on save (removed, then the new days added). */
  original: LeaveRange | null
}

const fieldLabel = 'text-2xs font-semibold uppercase tracking-wide text-base-content/50'

/** The longest stretch the dialog will book: a year, its leap day included. */
const MAX_LEAVE_DAYS = 366

/** An ISO date as a person reads it ("Mon, Sep 28") — the raw ISO stays the key. */
export function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function LeaveDialog({
  request,
  people,
  teams,
  onClose,
  onSubmit,
  onRemove,
}: {
  request: LeaveDialogRequest
  people: Person[]
  teams: Team[]
  onClose: () => void
  /** Reports the chosen person with the finished range — the picker lives in here, not in the request. */
  onSubmit: (personId: string, range: LeaveRange) => void
  onRemove: () => void
}) {
  const t = useT()
  const editing = request.mode === 'edit'
  const [personId, setPersonId] = useState(request.personId)
  const [from, setFrom] = useState(request.from)
  const [count, setCount] = useState(() =>
    request.from !== '' && request.to !== '' ? rangeLength({ start: request.from, end: request.to }) : 1,
  )
  const panelRef = useRef<HTMLDivElement>(null)
  const person = people.find((p) => p.id === personId)
  /** The edit line's second half: the person's team, unknown and unassigned alike. */
  const personTeam = person === undefined ? '' : (teams.find((team) => team.id === person.teamId)?.name ?? '')
  /** The range's last day, inclusive: `count` days on from `from`. */
  const to = from !== '' ? addDaysISO(from, count - 1) : null
  const canSubmit = person !== undefined && to !== null

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      // An open combobox panel consumes its own Escape and marks the event, so
      // the first press closes that panel and the next one closes the dialog.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function submit() {
    if (person === undefined || to === null) return
    onSubmit(personId, { start: from, end: to })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[1px] md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-dialog-title"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-2xl border border-x-0 border-b-0 border-base-300 bg-base-100 px-4 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] shadow-lg md:max-h-none md:max-w-[440px] md:overflow-visible md:rounded-lg md:border-x md:border-b md:p-5"
      >
        <div className="flex items-start justify-between gap-3 border-b border-base-300/80 pb-3">
          <h2 id="leave-dialog-title" className="m-0 text-base font-semibold tracking-tight text-base-content">
            {t(editing ? 'cal.dialog.edit' : 'cal.bookLeave')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('rtc.common.cancel')}
            className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className={fieldLabel}>{t('cal.person')}</span>
            {editing ? (
              // Whose leave is being edited is fixed by the chip that was
              // right-clicked; only the dates are up for change.
              <div className="cd-field flex items-baseline justify-between gap-2 px-2 py-1 text-sm text-base-content/70">
                <span className="truncate">
                  {person === undefined
                    ? ''
                    : person.name.trim() === ''
                      ? t('rtc.roster.namePlaceholder')
                      : person.name}
                </span>
                {person !== undefined && (
                  <span className="shrink-0 text-xs text-[color:var(--text-dim)]">
                    {personTeam === '' ? t('rtc.common.unassigned') : personTeam}
                  </span>
                )}
              </div>
            ) : (
              <PersonCombobox
                people={people}
                teams={teams}
                value={personId}
                onChange={setPersonId}
                ariaLabel={t('cal.person')}
                autoFocus={personId === ''}
                className="w-full"
              />
            )}
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className={fieldLabel}>{t('cal.from')}</span>
              <Input type="date" className="w-full" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            {/* A div, not a label: a label forwards clicks to its first labelable
                child, which here is the stepper's − button. */}
            <div className="flex flex-1 flex-col gap-1">
              <span className={fieldLabel}>{t('cal.dayCount')}</span>
              <Stepper
                value={count}
                emptyValue={1}
                min={1}
                max={MAX_LEAVE_DAYS}
                ariaLabel={t('cal.dayCount')}
                onCommit={setCount}
                className="w-full justify-between py-1"
              />
            </div>
          </div>

          {to !== null && (
            <p className="m-0 text-xs text-[color:var(--text-dim)]">{t('cal.lastDay', { date: dateLabel(to) })}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-base-300/80 pt-3">
          {editing && (
            <button type="button" onClick={onRemove} className="btn btn-error btn-outline btn-sm mr-auto gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              {t('cal.remove')}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            {t('rtc.common.cancel')}
          </button>
          <button type="button" disabled={!canSubmit} onClick={submit} className="btn btn-primary btn-sm">
            {t(editing ? 'cal.save' : 'cal.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
