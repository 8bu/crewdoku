import { useState } from 'react'
import { formatHours, paidHours, type ShiftDef } from '@crewdoku/domain'
import { isCodeTaken } from '../../board/roster/shiftOps'
import { swatchBg, type ShiftColorId } from '../../board/shiftColors'
import { DeleteShiftPopover } from './DeleteShiftPopover'
import { ShiftColorPopover } from './ShiftColorPopover'
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
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-[56px] rounded-md border border-transparent bg-transparent px-1.5 py-1 font-mono text-sm tabular-nums outline-none transition-colors duration-150 hover:border-base-300 focus:border-base-content/40"
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
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="w-[44px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right tabular-nums outline-none transition-colors duration-150 hover:border-base-300 focus:border-base-content/40"
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
      <div className="flex max-w-[880px] items-center justify-between">
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
            className="btn btn-ghost btn-sm text-xs font-medium text-primary hover:bg-primary/10"
          >
            {t('settings.shifts.generate')}
          </button>
        )}
      </div>

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

      <div className="flex max-w-[640px] items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.shifts.newCode')}</label>
          <input
            type="text"
            value={newCode}
            onChange={(e) => {
              setNewCode(e.target.value)
              setAddError(null)
            }}
            placeholder={t('settings.shifts.newCodePlaceholder')}
            className="input input-sm w-[120px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.shifts.newLabel')}</label>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('settings.shifts.newLabelPlaceholder')}
            className="input input-sm w-[160px]"
          />
        </div>
        <button type="button" onClick={handleAdd} disabled={!newCode.trim()} className="btn btn-primary btn-sm">
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
          className="block h-3 w-3 flex-none cursor-pointer rounded-sm border-0 p-0 transition-transform duration-150 hover:scale-125"
          style={{ background: swatchBg(shift.color) }}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="text"
          value={codeDraft}
          onChange={(e) => setCodeDraft(e.target.value)}
          onBlur={commitCode}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className={`w-[90px] rounded-md border bg-transparent px-1.5 py-1 font-mono text-sm outline-none transition-colors duration-150 ${codeError ? 'border-error' : 'border-transparent hover:border-base-300 focus:border-base-content/40'}`}
          aria-invalid={!!codeError}
        />
        {codeError && <div className="text-2xs text-error">{codeError}</div>}
      </td>
      <td className="px-2 py-1">
        <input
          type="text"
          value={shift.label}
          onChange={(e) => onSetLabel(e.target.value)}
          className="w-[130px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none transition-colors duration-150 hover:border-base-300 focus:border-base-content/40"
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
        <input type="checkbox" className="checkbox checkbox-sm" checked={!!shift.isNight} onChange={onToggleNight} />
      </td>
      <td className="w-10 px-2 py-1 text-right">
        <button
          type="button"
          onClick={onDeleteClick}
          disabled={deleteDisabled}
          aria-label={t('settings.shifts.deleteShift', { code: shift.code })}
          title={deleteDisabled ? t('settings.shifts.cantDeleteLast') : undefined}
          className="btn btn-ghost btn-xs btn-square text-base-content/40 transition-colors duration-150 hover:text-error disabled:cursor-not-allowed"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}
