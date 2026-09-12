import { useState } from 'react'
import { Input } from '../../ui/Input'
import type { CoverageBand, CoverageTable as CoverageTableData, ShiftDef } from '@crewdoku/domain'
import { useT } from '../../i18n/useT'

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon..Sun, for a planner's-week reading order

/**
 * One band cell — a quiet mono text field with a local draft, committed on
 * blur/Enter, never per keystroke (a controlled number committing raw
 * drafts snaps a cleared min to 0 mid-edit, fighting the planner's
 * retype). A headcount is a whole number, so only digit-only drafts commit
 * (`1.5`, `1e2`, `-3` all revert); empty commits `emptyValue` — 0 for min,
 * Infinity (no ceiling) for max. The parent keys this by the committed
 * value, so an outside change remounts a fresh draft.
 */
function BandField({
  value,
  emptyValue,
  placeholder,
  ariaLabel,
  onCommit,
}: {
  value: number
  emptyValue: number
  placeholder?: string
  ariaLabel: string
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState(Number.isFinite(value) ? String(value) : '')

  function commit() {
    const raw = draft.trim()
    if (raw !== '' && !/^\d+$/.test(raw)) {
      setDraft(Number.isFinite(value) ? String(value) : '')
      return
    }
    const parsed = raw === '' ? emptyValue : Number(raw)
    if (parsed === value) {
      setDraft(Number.isFinite(value) ? String(value) : '')
      return
    }
    onCommit(parsed)
  }

  return (
    <Input
      density="compact"
      type="text"
      inputMode="numeric"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-8 text-center font-mono tabular-nums"
    />
  )
}

function BandInputs({ band, onChange }: { band: CoverageBand; onChange: (band: CoverageBand) => void }) {
  const t = useT()
  return (
    <div className="flex items-center justify-center gap-0.5">
      <BandField
        key={`min-${band.min}`}
        value={band.min}
        emptyValue={0}
        ariaLabel={t('settings.coverage.minAria')}
        onCommit={(min) => onChange({ ...band, min })}
      />
      <span className="text-2xs text-base-content/30">–</span>
      <BandField
        key={`max-${band.max}`}
        value={band.max}
        emptyValue={Infinity}
        placeholder="∞"
        ariaLabel={t('settings.coverage.maxAria')}
        onCommit={(max) => onChange({ ...band, max })}
      />
    </div>
  )
}

/**
 * Coverage: min/max headcount per shift, per weekday, with date overrides
 * (ticket 15, Q2) — the real authored table `board/coverage.ts` now reads,
 * replacing the old `teamCount`-derived placeholder.
 */
export function CoverageTable({
  shifts,
  table,
  onSetBand,
  onAddOverride,
  onSetOverrideBand,
  onRemoveOverride,
}: {
  shifts: ShiftDef[]
  table: CoverageTableData
  onSetBand: (weekday: number, code: string, band: CoverageBand) => void
  onAddOverride: (iso: string) => void
  onSetOverrideBand: (iso: string, code: string, band: CoverageBand) => void
  onRemoveOverride: (iso: string) => void
}) {
  const t = useT()
  const [newOverrideDate, setNewOverrideDate] = useState('')
  const overrideDates = Object.keys(table.dateOverrides).sort()

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-sm font-semibold tracking-tight text-base-content">{t('settings.coverage.title')}</h2>
        <p className="m-0 mt-0.5 text-xs text-base-content/60">
          {t('settings.coverage.desc')}
        </p>
      </div>

      <table className="w-max border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-base-300 px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-base-content/40">
              {t('settings.coverage.col.shift')}
            </th>
            {WEEKDAY_ORDER.map((dow) => (
              <th
                key={dow}
                className="border-b border-base-300 px-1.5 py-1.5 text-center text-2xs font-semibold uppercase tracking-wide text-base-content/40"
              >
                {t(`settings.coverage.dow.${dow}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => (
            <tr key={shift.code} className="h-9 border-b border-base-300/60 transition-colors duration-150 hover:bg-base-200/40">
              <td className="px-2 py-1 pr-4 font-mono text-xs font-semibold">{shift.code}</td>
              {WEEKDAY_ORDER.map((dow) => (
                <td key={dow} className="px-1.5 py-1">
                  <BandInputs
                    band={table.byDow[dow]?.[shift.code] ?? { min: 0, max: Infinity }}
                    onChange={(band) => onSetBand(dow, shift.code, band)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.coverage.overridesTitle')}</h3>
        {overrideDates.length === 0 && <p className="text-xs text-base-content/40">{t('settings.coverage.noOverrides')}</p>}
        {overrideDates.map((iso) => (
          <div key={iso} className="flex flex-wrap items-center gap-3 rounded-md border border-base-300 bg-base-200 px-2.5 py-2">
            <span className="w-[92px] flex-none font-mono text-xs font-semibold">{iso}</span>
            <div className="flex flex-1 flex-wrap gap-3">
              {shifts.map((shift) => (
                <div key={shift.code} className="flex items-center gap-1.5">
                  <span className="font-mono text-2xs text-base-content/50">{shift.code}</span>
                  <BandInputs
                    band={table.dateOverrides[iso]?.[shift.code] ?? { min: 0, max: Infinity }}
                    onChange={(band) => onSetOverrideBand(iso, shift.code, band)}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onRemoveOverride(iso)}
              className="cursor-pointer border-none bg-transparent p-0 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-error"
            >
              {t('settings.coverage.removeOverride')}
            </button>
          </div>
        ))}
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.coverage.addOverrideFor')}</label>
            <Input
              type="date"
              value={newOverrideDate}
              onChange={(e) => setNewOverrideDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={!newOverrideDate || !!table.dateOverrides[newOverrideDate]}
            onClick={() => {
              onAddOverride(newOverrideDate)
              setNewOverrideDate('')
            }}
            className="btn btn-outline btn-sm"
          >
            {t('settings.coverage.addOverride')}
          </button>
        </div>
      </div>
    </section>
  )
}
