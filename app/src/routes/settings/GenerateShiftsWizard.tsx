import { useEffect, useMemo, useRef, useState } from 'react'
import { formatHours, paidHours, type CoverageTable, type ShiftDef } from '@crewdoku/domain'
import { swatchBg } from '../../board/shiftColors'
import { useT } from '../../i18n/useT'
import { durationMinutes, setDurationOne } from './shiftEditing'
import { generateShifts } from './shiftGenerator'
import { ShiftTimelineBar } from './ShiftTimelineBar'
import { Input } from '../../ui/Input'

function toClock(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
}

function parseClock(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 3 || digits.length === 4) {
    const padded = digits.padStart(4, '0')
    const h = Number(padded.slice(0, 2))
    const m = Number(padded.slice(2))
    if (h === 24 && m === 0) return '2400'
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return padded
  }
  return null
}

function WizardTimeInput({
  value,
  ariaLabel,
  onCommit,
}: {
  value: string
  ariaLabel: string
  onCommit: (hhmm: string) => void
}) {
  const [draft, setDraft] = useState(toClock(value))

  function commit() {
    const parsed = parseClock(draft)
    if (parsed) {
      setDraft(toClock(parsed))
      onCommit(parsed)
    } else {
      setDraft(toClock(value))
    }
  }

  return (
    <Input
      type="text"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-[72px] font-mono tabular-nums"
    />
  )
}

export function GenerateShiftsWizard({
  currentShiftsCount,
  onApply,
  onCancel,
}: {
  currentShiftsCount: number
  onApply: (shifts: ShiftDef[], coverage: CoverageTable) => void
  onCancel: () => void
}) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)

  const [aroundTheClock, setAroundTheClock] = useState(true)
  const [windowStart, setWindowStart] = useState('0600')
  const [shiftDurationMin, setShiftDurationMin] = useState(480)
  const [shiftCount, setShiftCount] = useState(3)
  const [breakMinutes, setBreakMinutes] = useState(30)
  const [overlapMinutes, setOverlapMinutes] = useState(0)

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  const effectiveStart = aroundTheClock ? '0000' : windowStart

  const [shifts, setShifts] = useState<ShiftDef[]>(() => {
    return generateShifts({
      windowStart: effectiveStart,
      shiftCount,
      shiftDurationMinutes: shiftDurationMin,
      breakMinutes,
      overlapMinutes,
    }).shifts
  })

  const [coverage, setCoverage] = useState<CoverageTable>(() => {
    return generateShifts({
      windowStart: effectiveStart,
      shiftCount,
      shiftDurationMinutes: shiftDurationMin,
      breakMinutes,
      overlapMinutes,
    }).coverage
  })

  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    const next = generateShifts({
      windowStart: effectiveStart,
      shiftCount,
      shiftDurationMinutes: shiftDurationMin,
      breakMinutes,
      overlapMinutes,
    })
    setShifts(next.shifts)
    setCoverage(next.coverage)
  }, [effectiveStart, shiftCount, shiftDurationMin, breakMinutes, overlapMinutes])

  const uniformDurationHours = useMemo(() => {
    if (shifts.length === 0) return ''
    const first = durationMinutes(shifts[0]!)
    const allSame = shifts.every((s) => durationMinutes(s) === first)
    return allSame ? first / 60 : ''
  }, [shifts])

  function handleApply() {
    onApply(shifts, coverage)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      onMouseDown={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onCancel()
        }
      }}
    >
      <div
        ref={modalRef}
        className="cd-generate-shifts-wizard flex w-full max-w-[540px] flex-col gap-4 rounded-lg border border-base-300 bg-base-100 p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-base-300/80 pb-3">
          <div>
            <h2 id="wizard-title" className="m-0 text-base font-semibold tracking-tight text-base-content">
              {t('settings.wizard.title')}
            </h2>
            <p className="m-0 mt-0.5 text-xs text-base-content/60">{t('settings.wizard.desc')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('settings.wizard.cancel')}
            className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          >
            ✕
          </button>
        </div>

        {/* Operating Window */}
        <div className="flex flex-col gap-2">
          <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/50">
            {t('settings.wizard.window')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="wizard-24h"
              checked={aroundTheClock}
              onChange={(e) => setAroundTheClock(e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <label htmlFor="wizard-24h" className="cursor-pointer text-sm text-base-content">
              {t('settings.wizard.aroundTheClock')}
            </label>
          </div>

          {!aroundTheClock && (
            <div className="mt-1 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-base-content/60">{t('settings.wizard.start')}</span>
                <WizardTimeInput
                  value={windowStart}
                  ariaLabel={t('settings.wizard.start')}
                  onCommit={setWindowStart}
                />
              </div>
            </div>
          )}
        </div>

        {/* Shift count, Duration, Break, Overlap */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
          <div className="grid grid-rows-subgrid row-span-2 gap-y-1">
            <label className="self-end text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.shiftCount')}
            </label>
            <Input
              type="number"
              min={1}
              max={8}
              value={shiftCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val) && val >= 1 && val <= 8) setShiftCount(val)
              }}
            />
          </div>

          <div className="grid grid-rows-subgrid row-span-2 gap-y-1">
            <label className="self-end text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.duration')}
            </label>
            <Input
              type="number"
              min={0.25}
              step={0.25}
              value={uniformDurationHours}
              placeholder="—"
              onChange={(e) => {
                const hours = parseFloat(e.target.value)
                if (!Number.isNaN(hours) && hours >= 0.25) {
                  const nextDuration = Math.round(hours * 60)
                  setShiftDurationMin(nextDuration)
                  // Overlap can never reach the shift length; keep it < duration.
                  setOverlapMinutes((prev) => Math.max(0, Math.min(prev, nextDuration - 15)))
                }
              }}
            />
          </div>

          <div className="grid grid-rows-subgrid row-span-2 gap-y-1">
            <label className="self-end text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.breakMinutes')}
            </label>
            <Input
              type="number"
              min={0}
              step={5}
              value={breakMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val) && val >= 0) setBreakMinutes(val)
              }}
            />
          </div>

          <div className="grid grid-rows-subgrid row-span-2 gap-y-1">
            <label className="self-end text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.overlapMinutes')}
            </label>
            <Input
              type="number"
              min={0}
              max={Math.max(0, shiftDurationMin - 15)}
              step={5}
              value={overlapMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val) && val >= 0) {
                  setOverlapMinutes(Math.max(0, Math.min(val, shiftDurationMin - 15)))
                }
              }}
            />
          </div>
        </div>

        {/* Preview Section */}
        <div className="flex flex-col gap-2 rounded-lg border border-base-300/80 bg-base-200/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.preview')}
            </span>
          </div>

          {/* Editable 24-hour timeline bar */}
          <ShiftTimelineBar
            shifts={shifts}
            onChange={setShifts}
            overlapLabel={t('settings.wizard.preview.overlap')}
          />

          {/* Resulting rows preview list */}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-base-300 text-2xs uppercase text-base-content/40">
                <th className="w-5 py-1"></th>
                <th className="py-1 text-left">{t('settings.wizard.preview.code')}</th>
                <th className="py-1 text-left">{t('settings.wizard.preview.duration')}</th>
                <th className="py-1 text-left">{t('settings.wizard.preview.hours')}</th>
                <th className="py-1 text-right">{t('settings.wizard.preview.paid')}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift, idx) => (
                <tr key={shift.code} className="border-b border-base-300/40">
                  <td className="py-1">
                    <span
                      className="block h-2.5 w-2.5 rounded-sm"
                      style={{ background: swatchBg(shift.color) }}
                    />
                  </td>
                  <td className="py-1 font-medium text-base-content">
                    {shift.code} <span className="font-normal text-base-content/60">({shift.label})</span>
                    {shift.isNight && (
                      <span className="ml-1.5 rounded bg-navy/20 px-1 py-0.2 text-[10px] font-semibold text-navy">
                        {t('settings.wizard.preview.night')}
                      </span>
                    )}
                  </td>
                  <td className="py-1">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0.25}
                        step={0.25}
                        value={durationMinutes(shift) / 60}
                        aria-label={`${shift.code} ${t('settings.wizard.preview.duration')}`}
                        onChange={(e) => {
                          const hours = parseFloat(e.target.value)
                          if (!Number.isNaN(hours) && hours >= 0.25) {
                            setShifts(setDurationOne(shifts, idx, Math.round(hours * 60)))
                          }
                        }}
                        className="w-14 font-mono tabular-nums"
                      />
                      <span className="text-2xs text-base-content/40">h</span>
                    </div>
                  </td>
                  <td className="py-1 font-mono tabular-nums text-base-content/80">
                    {toClock(shift.start)} – {toClock(shift.end)}
                  </td>
                  <td className="py-1 text-right font-mono font-medium tabular-nums text-base-content">
                    {formatHours(paidHours(shifts, shift.code))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Warning if current catalog is non-empty */}
        {currentShiftsCount > 0 && (
          <p className="m-0 text-xs text-warning/90">
            {t('settings.wizard.confirmReplace', { count: currentShiftsCount })}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-base-300/80 pt-3">
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
            {t('settings.wizard.cancel')}
          </button>
          <button type="button" onClick={handleApply} className="btn btn-primary btn-sm">
            {t('settings.wizard.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
