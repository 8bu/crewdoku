import { X, Plus } from '../../ui/icons'
import { useState } from 'react'
import { Input } from '../../ui/Input'
import { formatHours, paidHours, type ShiftDef } from '@crewdoku/domain'
import { isCodeTaken } from '../../board/roster/shiftOps'
import { swatchBg, type ShiftColorId } from '../../board/shiftColors'
import { DeleteShiftPopover } from './DeleteShiftPopover'
import { ShiftColorPopover } from './ShiftColorPopover'
import { ShiftTimelineBar } from './ShiftTimelineBar'
import { useT } from '../../i18n/useT'
function toClock(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
}

/** `"6:00"`/`"0600"`/`"06:00"` → `"0600"`; anything not a real clock time → null. */
function parseClock(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):?([0-5]\d)$/)
  if (!m) return null
  const h = Number(m[1])
  if (h > 23) return null
  return `${String(h).padStart(2, '0')}${m[2]}`
}

/**
 * A quiet mono `HH:MM` text field — not `type="time"` (the native widget
 * renders locale AM/PM plus a picker icon, which both clipped and read as a
 * form, not a console). Commits on blur/Enter like the code field; an
 * unparseable draft reverts. The parent keys this by the committed value,
 * so an outside change (or a commit) remounts it with a fresh draft.
 */
function TimeInput({ value, ariaLabel, onCommit }: { value: string; ariaLabel: string; onCommit: (hhmm: string) => void }) {
  const [draft, setDraft] = useState(toClock(value))

  function commit() {
    const parsed = parseClock(draft)
    if (!parsed || parsed === value) {
      setDraft(toClock(value))
      return
    }
    onCommit(parsed)
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-[56px] font-mono tabular-nums"
    />
  )
}

function BreakInput({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number | undefined
  ariaLabel: string
  onCommit: (minutes: number) => void
}) {
  const [draft, setDraft] = useState(value != null && value > 0 ? String(value) : '0')

  function commit() {
    const parsed = parseInt(draft.trim(), 10)
    const minutes = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
    setDraft(String(minutes))
    onCommit(minutes)
  }

  return (
    <div className="flex items-center gap-1 font-mono text-sm">
      <Input
        type="text"
        inputMode="numeric"
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="w-[44px] text-right tabular-nums"
      />
      <span className="text-2xs text-base-content/40">m</span>
    </div>
  )
}

/**
 * The shift catalog table (ticket 15, Q1) — code is a real key, editable
 * like everything else, but committed on blur/Enter rather than every
 * keystroke so a half-typed code never trips the uniqueness check or fires
 * a rename cascade mid-edit. Add starts at a safe default (0800–1600); the
 * planner adjusts from there.
 */
export function ShiftsTable({
  shifts,
  onAdd,
  onRename,
  onSetLabel,
  onSetTimes,
  onEditShifts,
  onSetBreak,
  onSetColor,
  onToggleNight,
  onDelete,
  onOpenWizard,
}: {
  shifts: ShiftDef[]
  onAdd: (code: string, label: string) => void
  onRename: (oldCode: string, newCode: string) => void
  onSetLabel: (code: string, label: string) => void
  onSetTimes: (code: string, start: string, end: string) => void
  onEditShifts: (next: ShiftDef[]) => void
  onSetBreak: (code: string, minutes: number) => void
  onSetColor: (code: string, color: ShiftColorId) => void
  onToggleNight: (code: string) => void
  onDelete: (code: string, reassignToCode: string) => void
  onOpenWizard?: () => void
}) {
  const t = useT()
  const [newCode, setNewCode] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ code: string; rect: { left: number; bottom: number } } | null>(null)
  const [pendingColorPick, setPendingColorPick] = useState<{ code: string; rect: { left: number; bottom: number } } | null>(
    null,
  )
  const [reassignToCode, setReassignToCode] = useState('')

  const codes = shifts.map((s) => s.code)

  function handleAdd() {
    const code = newCode.trim().toUpperCase()
    if (!code) return
    if (code === 'OFF' || isCodeTaken(shifts, code)) {
      setAddError(t('settings.shifts.codeTaken', { code }))
      return
    }
    onAdd(code, newLabel)
    setNewCode('')
    setNewLabel('')
    setAddError(null)
  }

  function startDelete(code: string, anchor: HTMLElement) {
    const others = shifts.filter((s) => s.code !== code)
    if (others.length === 0) return
    setPendingDelete({ code, rect: anchor.getBoundingClientRect() })
    setReassignToCode(others[0]!.code)
  }

  function startColorPick(code: string, anchor: HTMLElement) {
    setPendingColorPick({ code, rect: anchor.getBoundingClientRect() })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex max-w-[880px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="m-0 text-sm font-semibold tracking-tight text-base-content">{t('settings.shifts.title')}</h2>
          <p className="m-0 mt-0.5 text-xs text-base-content/60">
            {t('settings.shifts.desc')}
          </p>
        </div>
        {onOpenWizard && (
          <button
            type="button"
            onClick={onOpenWizard}
            className="btn btn-ghost btn-sm min-h-11 shrink-0 self-end text-xs font-medium text-primary hover:bg-primary/10 md:min-h-8 md:self-auto"
          >
            {t('settings.shifts.generate')}
          </button>
        )}
      </div>

      <div className="max-w-[880px]">
        <ShiftTimelineBar
          shifts={shifts}
          onChange={onEditShifts}
          overlapLabel={t('settings.wizard.preview.overlap')}
        />
      </div>

      {/* A phone has no hover, so the abbreviated Break/Paid/Night headers
          would keep their meaning inside a `title` nobody can read: the same
          copy is spelled out here as a legend, mobile only. */}
      <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-base-content/50 md:hidden">
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="font-semibold uppercase tracking-wide text-base-content/70">{t('settings.shifts.col.break')}</dt>
          <dd className="m-0">{t('settings.shifts.col.breakTitle')}</dd>
        </div>
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="font-semibold uppercase tracking-wide text-base-content/70">{t('settings.shifts.col.paid')}</dt>
          <dd className="m-0">{t('settings.shifts.col.paidTitle')}</dd>
        </div>
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="font-semibold uppercase tracking-wide text-base-content/70">{t('settings.shifts.col.night')}</dt>
          <dd className="m-0">{t('settings.shifts.col.nightTitle')}</dd>
        </div>
      </dl>

      {/* Nine fixed columns never fit a phone: the table keeps its shape and
          scrolls sideways instead of clipping (`overscroll-x-contain` keeps a
          horizontal swipe from also moving the page behind it). */}
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-6 border-b border-base-300 px-2 py-1.5"></th>
              <th className="border-b border-base-300 px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-base-content/40">
                {t('settings.shifts.col.code')}
              </th>
              <th className="border-b border-base-300 px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-base-content/40">
                {t('settings.shifts.col.label')}
              </th>
              <th className="border-b border-base-300 px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-base-content/40">
                {t('settings.shifts.col.start')}
              </th>
              <th className="border-b border-base-300 px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-base-content/40">
                {t('settings.shifts.col.end')}
              </th>
              <th
                className="border-b border-base-300 px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-base-content/40"
                title={t('settings.shifts.col.breakTitle')}
              >
                {t('settings.shifts.col.break')}
              </th>
              <th
                className="border-b border-base-300 px-2 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-base-content/40"
                title={t('settings.shifts.col.paidTitle')}
              >
                {t('settings.shifts.col.paid')}
              </th>
              <th
                className="border-b border-base-300 px-2 py-1.5 text-center text-2xs font-semibold uppercase tracking-wide text-base-content/40"
                title={t('settings.shifts.col.nightTitle')}
              >
                {t('settings.shifts.col.night')}
              </th>
              <th className="w-10 border-b border-base-300 px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <ShiftRow
                key={shift.code}
                shift={shift}
                shifts={shifts}
                otherCodes={codes.filter((c) => c !== shift.code)}
                onRename={(next) => onRename(shift.code, next)}
                onSetLabel={(label) => onSetLabel(shift.code, label)}
                onSetTimes={(start, end) => onSetTimes(shift.code, start, end)}
                onSetBreak={(minutes) => onSetBreak(shift.code, minutes)}
                onColorSwatchClick={(e) => startColorPick(shift.code, e.currentTarget)}
                onToggleNight={() => onToggleNight(shift.code)}
                onDeleteClick={(e) => startDelete(shift.code, e.currentTarget)}
                deleteDisabled={shifts.length <= 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex max-w-[640px] flex-col gap-3 md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.shifts.newCode')}</label>
          <Input
            type="text"
            value={newCode}
            onChange={(e) => {
              setNewCode(e.target.value)
              setAddError(null)
            }}
            placeholder={t('settings.shifts.newCodePlaceholder')}
            className="w-full md:w-[120px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.shifts.newLabel')}</label>
          <Input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('settings.shifts.newLabelPlaceholder')}
            className="w-full md:w-[160px]"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newCode.trim()}
          className="btn btn-primary btn-sm min-h-11 gap-1.5 md:min-h-8"
        >
          <Plus className="h-4 w-4" />
          {t('settings.shifts.addShift')}
        </button>
      </div>
      {addError && <p className="text-xs text-error">{addError}</p>}

      {pendingDelete && (
        <DeleteShiftPopover
          rect={pendingDelete.rect}
          shiftCode={pendingDelete.code}
          otherShifts={shifts.filter((s) => s.code !== pendingDelete.code)}
          reassignToCode={reassignToCode}
          onReassignChange={setReassignToCode}
          onConfirm={() => {
            onDelete(pendingDelete.code, reassignToCode)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingColorPick && (
        <ShiftColorPopover
          rect={pendingColorPick.rect}
          shiftCode={pendingColorPick.code}
          selected={shifts.find((s) => s.code === pendingColorPick.code)?.color}
          onSelect={(color) => onSetColor(pendingColorPick.code, color)}
          onClose={() => setPendingColorPick(null)}
        />
      )}
    </section>
  )
}

function ShiftRow({
  shift,
  shifts,
  otherCodes,
  onRename,
  onSetLabel,
  onSetTimes,
  onSetBreak,
  onColorSwatchClick,
  onToggleNight,
  onDeleteClick,
  deleteDisabled,
}: {
  shift: ShiftDef
  shifts: ShiftDef[]
  otherCodes: string[]
  onRename: (next: string) => void
  onSetLabel: (label: string) => void
  onSetTimes: (start: string, end: string) => void
  onSetBreak: (minutes: number) => void
  onColorSwatchClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onToggleNight: () => void
  onDeleteClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  deleteDisabled: boolean
}) {
  const t = useT()
  const [codeDraft, setCodeDraft] = useState(shift.code)
  const [codeError, setCodeError] = useState<string | null>(null)

  function commitCode() {
    const next = codeDraft.trim().toUpperCase()
    if (!next || next === shift.code) {
      setCodeDraft(shift.code)
      setCodeError(null)
      return
    }
    if (next === 'OFF' || otherCodes.includes(next)) {
      setCodeError(t('settings.shifts.codeTaken', { code: next }))
      setCodeDraft(shift.code)
      return
    }
    setCodeError(null)
    onRename(next)
  }

  return (
    <tr className="h-10 border-b border-base-300/60 transition-colors duration-150 hover:bg-base-200/40">
      <td className="w-6 px-2 py-1">
        <button
          type="button"
          title={t('settings.shifts.colorTitle', { code: shift.code })}
          aria-label={t('settings.shifts.changeColor', { code: shift.code })}
          onClick={onColorSwatchClick}
          className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 transition-transform duration-150 md:h-3 md:w-3 md:rounded-sm md:hover:scale-125"
        >
          <span className="block h-3 w-3 rounded-sm" style={{ background: swatchBg(shift.color) }} />
        </button>
      </td>
      <td className="px-2 py-1">
        <Input
          type="text"
          value={codeDraft}
          onChange={(e) => setCodeDraft(e.target.value)}
          onBlur={commitCode}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="w-[90px] font-mono"
          aria-invalid={!!codeError}
        />
        {codeError && <div className="text-2xs text-error">{codeError}</div>}
      </td>
      <td className="px-2 py-1">
        <Input
          type="text"
          value={shift.label}
          onChange={(e) => onSetLabel(e.target.value)}
          className="w-[130px]"
        />
      </td>
      <td className="px-2 py-1">
        <TimeInput
          key={`start-${shift.start}`}
          value={shift.start}
          ariaLabel={t('settings.shifts.startTime', { code: shift.code })}
          onCommit={(hhmm) => onSetTimes(hhmm, shift.end)}
        />
      </td>
      <td className="px-2 py-1">
        <TimeInput
          key={`end-${shift.end}`}
          value={shift.end}
          ariaLabel={t('settings.shifts.endTime', { code: shift.code })}
          onCommit={(hhmm) => onSetTimes(shift.start, hhmm)}
        />
      </td>
      <td className="px-2 py-1">
        <BreakInput
          key={`break-${shift.code}-${shift.unpaidBreakMinutes ?? 0}`}
          value={shift.unpaidBreakMinutes}
          ariaLabel={t('settings.shifts.breakTime', { code: shift.code })}
          onCommit={onSetBreak}
        />
      </td>
      <td className="px-2 py-1 text-right font-mono text-sm tabular-nums text-base-content/70">
        {formatHours(paidHours(shifts, shift.code))}
      </td>
      <td className="px-2 py-1 text-center">
        <label className="mx-auto flex h-11 w-11 cursor-pointer items-center justify-center md:h-8 md:w-8">
          <input type="checkbox" className="checkbox checkbox-primary" checked={!!shift.isNight} onChange={onToggleNight} aria-label={t('settings.shifts.col.night')} />
        </label>
      </td>
      <td className="w-10 px-2 py-1 text-right">
        <button
          type="button"
          onClick={onDeleteClick}
          disabled={deleteDisabled}
          aria-label={t('settings.shifts.deleteShift', { code: shift.code })}
          title={deleteDisabled ? t('settings.shifts.cantDeleteLast') : undefined}
          className="btn btn-ghost btn-xs btn-square min-h-11 min-w-11 text-base-content/40 transition-colors duration-150 hover:text-error disabled:cursor-not-allowed md:min-h-6 md:min-w-6"
        >
          <X className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}
