import { useEffect, useMemo, useRef, useState } from 'react'
import { formatHours, paidHours, shiftSpan, type CoverageTable, type ShiftDef } from '@crewdoku/domain'
import { swatchBg } from '../../board/shiftColors'
import { useT } from '../../i18n/useT'
import { generateShifts } from './shiftGenerator'

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
    <input
      type="text"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-[72px] rounded-md border border-base-300 bg-base-200/50 px-2 py-1 font-mono text-sm tabular-nums outline-none transition-colors duration-150 focus:border-primary"
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
  const [windowEnd, setWindowEnd] = useState('2200')
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
  const effectiveEnd = aroundTheClock ? '0000' : windowEnd

  const preview = useMemo(() => {
    return generateShifts({
      windowStart: effectiveStart,
      windowEnd: effectiveEnd,
      shiftCount,
      breakMinutes,
      overlapMinutes,
    })
  }, [effectiveStart, effectiveEnd, shiftCount, breakMinutes, overlapMinutes])

  function handleApply() {
    onApply(preview.shifts, preview.coverage)
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
        className="cd-generate-shifts-wizard flex w-full max-w-[540px] flex-col gap-4 rounded-xl border border-base-300 bg-base-100 p-5 shadow-2xl"
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
              <span className="text-xs text-base-content/30">→</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-base-content/60">{t('settings.wizard.end')}</span>
                <WizardTimeInput
                  value={windowEnd}
                  ariaLabel={t('settings.wizard.end')}
                  onCommit={setWindowEnd}
                />
              </div>
            </div>
          )}
        </div>

        {/* Shift count, Break, Overlap */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.shiftCount')}
            </label>
            <input
              type="number"
              min={1}
              max={8}
              value={shiftCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val) && val >= 1 && val <= 8) setShiftCount(val)
              }}
              className="input input-sm border-base-300 bg-base-200/50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.breakMinutes')}
            </label>
            <input
              type="number"
              min={0}
              step={5}
              value={breakMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val) && val >= 0) setBreakMinutes(val)
              }}
              className="input input-sm border-base-300 bg-base-200/50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/50">
              {t('settings.wizard.overlapMinutes')}
            </label>
            <input
              type="number"
              min={0}
              step={5}
              value={overlapMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val) && val >= 0) setOverlapMinutes(val)
              }}
              className="input input-sm border-base-300 bg-base-200/50"
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

          {/* 24-hour horizontal timeline bar */}
          <div className="flex flex-col gap-1">
            <div className="relative h-6 w-full overflow-hidden rounded bg-base-300/60">
              {preview.shifts.map((shift) => {
                const span = shiftSpan(preview.shifts, shift.code)
                if (!span) return null
                const startMin = span.start
                const endMin = span.end
                const duration = endMin - startMin

                // If within a single 24h cycle
                if (endMin <= 1440) {
                  const leftPct = (startMin / 1440) * 100
                  const widthPct = (duration / 1440) * 100
                  return (
                    <div
                      key={shift.code}
                      className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-base-100/40 text-[10px] font-bold text-white shadow-sm"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: swatchBg(shift.color),
                      }}
                      title={`${shift.code}: ${toClock(shift.start)}–${toClock(shift.end)}`}
                    >
                      <span className="truncate px-1 drop-shadow-sm">{shift.code}</span>
                    </div>
                  )
                }

                // Crosses midnight: split into two parts for day 0 and day 1
                const part1Left = (startMin / 1440) * 100
                const part1Width = ((1440 - startMin) / 1440) * 100
                const part2Width = ((endMin - 1440) / 1440) * 100

                return (
                  <div key={shift.code}>
                    <div
                      className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-base-100/40 text-[10px] font-bold text-white shadow-sm"
                      style={{
                        left: `${part1Left}%`,
                        width: `${part1Width}%`,
                        backgroundColor: swatchBg(shift.color),
                      }}
                      title={`${shift.code}: ${toClock(shift.start)}–${toClock(shift.end)}`}
                    >
                      <span className="truncate px-1 drop-shadow-sm">{shift.code}</span>
                    </div>
                    <div
                      className="absolute inset-y-0 left-0 flex items-center justify-center overflow-hidden border-r border-base-100/40 text-[10px] font-bold text-white shadow-sm"
                      style={{
                        width: `${part2Width}%`,
                        backgroundColor: swatchBg(shift.color),
                      }}
                      title={`${shift.code}: ${toClock(shift.start)}–${toClock(shift.end)}`}
                    >
                      <span className="truncate px-1 drop-shadow-sm">{shift.code}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between px-0.5 text-[10px] font-mono tabular-nums text-base-content/40">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
          </div>

          {/* Resulting rows preview list */}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-base-300 text-2xs uppercase text-base-content/40">
                <th className="w-5 py-1"></th>
                <th className="py-1 text-left">{t('settings.wizard.preview.code')}</th>
                <th className="py-1 text-left">{t('settings.wizard.preview.hours')}</th>
                <th className="py-1 text-right">{t('settings.wizard.preview.paid')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.shifts.map((shift) => (
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
                  <td className="py-1 font-mono tabular-nums text-base-content/80">
                    {toClock(shift.start)} – {toClock(shift.end)}
                  </td>
                  <td className="py-1 text-right font-mono font-medium tabular-nums text-base-content">
                    {formatHours(paidHours(preview.shifts, shift.code))}
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
