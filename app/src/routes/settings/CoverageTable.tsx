import { Plus } from '../../ui/icons'
import { useState } from 'react'
import { Input } from '../../ui/Input'
import { Stepper } from '../../ui/Stepper'
import { swatchBg } from '../../board/shiftColors'
import { UNCONSTRAINED_BAND, type CoverageBand, type CoverageTable as CoverageTableData, type ShiftDef } from '@crewdoku/domain'
import { useT } from '../../i18n/useT'

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon..Sun, a planner's-week reading order
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [6, 0]
const ALL_DAYS = WEEKDAY_ORDER

/**
 * One editable band, `need N up to M`, as a pair of steppers — each complete
 * by mouse (±) or keyboard (Tab + ↑/↓ or typed digits). `stacked` puts min
 * over max for the narrow per-day cells; the default sits them inline with
 * their labels.
 */
function BandControl({
  band,
  onChange,
  stacked = false,
}: {
  band: CoverageBand
  onChange: (band: CoverageBand) => void
  stacked?: boolean
}) {
  const t = useT()
  const min = (
    <Stepper
      value={band.min}
      emptyValue={0}
      ariaLabel={t('settings.coverage.minAria')}
      onCommit={(m) => onChange({ ...band, min: m })}
    />
  )
  const max = (
    <Stepper
      value={band.max}
      emptyValue={Infinity}
      min={band.min}
      placeholder="∞"
      ariaLabel={t('settings.coverage.maxAria')}
      onCommit={(m) => onChange({ ...band, max: m })}
    />
  )
  if (stacked) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        {min}
        {max}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-2xs text-base-content/50">{t('settings.coverage.need')}</span>
      {min}
      <span className="text-2xs text-base-content/50">{t('settings.coverage.upTo')}</span>
      {max}
    </div>
  )
}

type Mode = 'every' | 'weekend' | 'perDay'
const MODES: Mode[] = ['every', 'weekend', 'perDay']

const eqBand = (a: CoverageBand, b: CoverageBand) => a.min === b.min && a.max === b.max
const allEq = (bands: CoverageBand[]) => bands.every((b) => eqBand(b, bands[0]!))

function Dot({ shift }: { shift: ShiftDef }) {
  return <span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: swatchBg(shift.color) }} />
}

/**
 * Coverage: how many people each shift needs, per weekday, with date
 * overrides (ticket 15, Q2) — the real authored table `board/coverage.ts`
 * reads. One compact row per shift instead of a 56-cell matrix: the common
 * "same every day" case is a single band, and a shift only shows its seven
 * days when the planner asks (the `Every day / Weekend / Per day` switch).
 */
export function CoverageTable({
  shifts,
  table,
  onSetBandDays,
  onAddOverride,
  onSetOverrideBand,
  onRemoveOverride,
}: {
  shifts: ShiftDef[]
  table: CoverageTableData
  onSetBandDays: (weekdays: number[], code: string, band: CoverageBand) => void
  onAddOverride: (iso: string) => void
  onSetOverrideBand: (iso: string, code: string, band: CoverageBand) => void
  onRemoveOverride: (iso: string) => void
}) {
  const t = useT()
  const [newOverrideDate, setNewOverrideDate] = useState('')
  const [modes, setModes] = useState<Record<string, Mode>>({})
  const overrideDates = Object.keys(table.dateOverrides).sort()

  const bandOf = (code: string, dow: number): CoverageBand => table.byDow[dow]?.[code] ?? UNCONSTRAINED_BAND

  /** The mode the data implies, unless the planner has explicitly opened a wider one. */
  function derivedMode(code: string): Mode {
    if (allEq(ALL_DAYS.map((d) => bandOf(code, d)))) return 'every'
    if (allEq(WEEKDAYS.map((d) => bandOf(code, d))) && allEq(WEEKEND.map((d) => bandOf(code, d)))) return 'weekend'
    return 'perDay'
  }
  const modeOf = (code: string): Mode => modes[code] ?? derivedMode(code)

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-sm font-semibold tracking-tight text-base-content">{t('settings.coverage.title')}</h2>
        <p className="m-0 mt-0.5 text-xs text-base-content/60">{t('settings.coverage.desc')}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-base-300">
        {shifts.map((shift, i) => {
          const mode = modeOf(shift.code)
          return (
            <div key={shift.code} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 ${i > 0 ? 'border-t border-base-300/60' : ''}`}>
              <div className="flex w-24 flex-none items-center gap-2">
                <Dot shift={shift} />
                <span className="font-mono text-sm font-semibold">{shift.code}</span>
              </div>

              {mode === 'every' && (
                <BandControl band={bandOf(shift.code, 1)} onChange={(b) => onSetBandDays(ALL_DAYS, shift.code, b)} />
              )}

              {mode === 'weekend' && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-11 text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.coverage.weekdays')}</span>
                    <BandControl band={bandOf(shift.code, 1)} onChange={(b) => onSetBandDays(WEEKDAYS, shift.code, b)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-11 text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.coverage.weekend')}</span>
                    <BandControl band={bandOf(shift.code, 6)} onChange={(b) => onSetBandDays(WEEKEND, shift.code, b)} />
                  </div>
                </div>
              )}

              {mode === 'perDay' && (
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_ORDER.map((dow) => (
                    <div key={dow} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold uppercase text-base-content/40">{t(`settings.coverage.dow.${dow}`)}</span>
                      <BandControl stacked band={bandOf(shift.code, dow)} onChange={(b) => onSetBandDays([dow], shift.code, b)} />
                    </div>
                  ))}
                </div>
              )}

              <div className="ml-auto flex overflow-hidden rounded-md border border-base-300 text-2xs">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModes((x) => ({ ...x, [shift.code]: m }))}
                    className={`px-2.5 py-1 font-medium transition-colors ${mode === m ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:bg-base-200'}`}
                  >
                    {t(`settings.coverage.mode.${m}`)}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.coverage.overridesTitle')}</h3>
        {overrideDates.length === 0 && <p className="text-xs text-base-content/40">{t('settings.coverage.noOverrides')}</p>}
        {overrideDates.map((iso) => (
          <div key={iso} className="flex flex-wrap items-center gap-3 rounded-md border border-base-300 bg-base-200/40 px-2.5 py-2">
            <span className="w-[92px] flex-none font-mono text-xs font-semibold">{iso}</span>
            <div className="flex flex-1 flex-wrap gap-3">
              {shifts.map((shift) => (
                <div key={shift.code} className="flex items-center gap-1.5">
                  <span className="font-mono text-2xs text-base-content/50">{shift.code}</span>
                  <BandControl
                    band={table.dateOverrides[iso]?.[shift.code] ?? UNCONSTRAINED_BAND}
                    onChange={(b) => onSetOverrideBand(iso, shift.code, b)}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onRemoveOverride(iso)}
              className="cursor-pointer border-none bg-transparent p-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors hover:text-error"
            >
              {t('settings.coverage.removeOverride')}
            </button>
          </div>
        ))}
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.coverage.addOverrideFor')}</label>
            <Input type="date" value={newOverrideDate} onChange={(e) => setNewOverrideDate(e.target.value)} />
          </div>
          <button
            type="button"
            disabled={!newOverrideDate || !!table.dateOverrides[newOverrideDate]}
            onClick={() => {
              onAddOverride(newOverrideDate)
              setNewOverrideDate('')
            }}
            className="btn btn-outline btn-sm gap-1.5"
          >
            <Plus className="h-4 w-4" />
            {t('settings.coverage.addOverride')}
          </button>
        </div>
      </div>
    </section>
  )
}
