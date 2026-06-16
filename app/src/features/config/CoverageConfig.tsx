import { useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { makeCoverage, type Coverage } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Btn, Panel, Seg } from '../../ui'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Per team×shift coverage editor — a min/max band for each day-of-week plus
 * ad-hoc date overrides. Edits dispatch upsertCoverage. The selected team×shift
 * pair is chosen via two segmented controls.
 */
export function CoverageConfig({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const teams = useStore(store, (s) => s.teams)
  const shifts = useStore(store, (s) => s.shifts)
  const coverages = useStore(store, (s) => s.coverages)
  const upsertCoverage = useStore(store, (s) => s.upsertCoverage)

  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? '')

  const cov: Coverage =
    coverages.find((c) => c.teamId === teamId && c.shiftId === shiftId) ??
    makeCoverage({ teamId, shiftId })

  const setBand = (dowIdx: number, field: 'min' | 'max', value: number): void => {
    const byDow = cov.byDow.map((b, i) => (i === dowIdx ? { ...b, [field]: value } : b))
    upsertCoverage({ ...cov, byDow })
  }

  const [ovDate, setOvDate] = useState('')
  const [ovMin, setOvMin] = useState(0)
  const [ovMax, setOvMax] = useState(0)
  const addOverride = (): void => {
    if (!ovDate) return
    upsertCoverage({
      ...cov,
      dateOverrides: { ...cov.dateOverrides, [ovDate]: { min: ovMin, max: ovMax } },
    })
    setOvDate('')
  }

  if (teams.length === 0 || shifts.length === 0) {
    return (
      <Panel title={t('Coverage')}>
        <p className="text-xs text-faint">{t('Define teams and shifts first.')}</p>
      </Panel>
    )
  }

  return (
    <Panel title={t('Coverage')}>
      <div className="flex flex-col gap-3 max-w-2xl">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Seg
            ariaLabel={t('Team')}
            value={teamId}
            onChange={setTeamId}
            options={teams.map((tm) => ({ v: tm.id, label: tm.name }))}
          />
          <Seg
            ariaLabel={t('Shift definitions')}
            value={shiftId}
            onChange={setShiftId}
            options={shifts.map((sh) => ({ v: sh.id, label: sh.code }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {DOW.map((d, i) => (
            <div key={d} className="flex items-center gap-2 text-xs">
              <span className="font-mono w-9 text-dim">{d}</span>
              <label className="flex items-center gap-1">
                <span className="text-faint">{t('min')}</span>
                <input
                  type="number"
                  aria-label={`${d} min`}
                  min={0}
                  value={cov.byDow[i]?.min ?? 0}
                  onChange={(e) => setBand(i, 'min', Number(e.target.value))}
                  className="w-16 h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-faint">{t('max')}</span>
                <input
                  type="number"
                  aria-label={`${d} max`}
                  min={0}
                  value={cov.byDow[i]?.max ?? 0}
                  onChange={(e) => setBand(i, 'max', Number(e.target.value))}
                  className="w-16 h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono"
                />
              </label>
            </div>
          ))}
        </div>

        <div className="border-t border-bd pt-2">
          <p className="text-2xs uppercase tracking-wider text-faint mb-1.5">
            {t('Date overrides')}
          </p>
          <div className="flex items-end gap-2 text-xs mb-2">
            <input
              type="date"
              aria-label={t('Override date')}
              value={ovDate}
              onChange={(e) => setOvDate(e.target.value)}
              className="h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono"
            />
            <input
              type="number"
              aria-label={t('Override min')}
              min={0}
              value={ovMin}
              onChange={(e) => setOvMin(Number(e.target.value))}
              className="w-16 h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono"
            />
            <input
              type="number"
              aria-label={t('Override max')}
              min={0}
              value={ovMax}
              onChange={(e) => setOvMax(Number(e.target.value))}
              className="w-16 h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono"
            />
            <Btn onClick={addOverride}>{t('Add override')}</Btn>
          </div>
          <ul className="flex flex-col gap-1">
            {Object.entries(cov.dateOverrides).map(([date, band]) => (
              <li key={date} className="font-mono text-xs text-dim">
                {date}: {band.min}–{band.max}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  )
}
