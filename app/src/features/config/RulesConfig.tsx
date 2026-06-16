import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import type { ConstraintId, SoftId } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Panel } from '../../ui'

const HARD: ConstraintId[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
const SOFT: SoftId[] = ['S1', 'S2', 'S3', 'S4', 'S5']

const CONSTRAINT_DESC: Record<ConstraintId, string> = {
  H1: 'Coverage — required headcount per shift/day',
  H2: 'Max hours per week',
  H3: 'Minimum rest between shifts',
  H4: 'One shift per day',
  H5: 'Respect approved absences',
  H6: 'Eligibility — only assignable shifts',
  S1: 'Night-shift fairness',
  S2: 'Preference satisfaction',
  S3: 'Minimal changes',
  S4: 'Weekend rotation',
  S5: 'Sequence consistency',
}

/**
 * Scheduling rules editor — hard limits (maxHours/minRest/maxConsecutive),
 * per-constraint enable toggles (H1..S5) and per-soft weight sliders. Every edit
 * dispatches a store action that updates `rules`, so the next solve picks it up
 * (AC-11). Inputs are labeled for a11y.
 */
export function RulesConfig({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const rules = useStore(store, (s) => s.rules)
  const updateRules = useStore(store, (s) => s.updateRules)
  const toggleConstraint = useStore(store, (s) => s.toggleConstraint)
  const setWeight = useStore(store, (s) => s.setWeight)

  const numField = (label: string, value: number, onChange: (n: number) => void) => (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-dim">{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 h-7 border border-bds rounded-[2px] bg-surface px-2 font-mono text-xs"
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <Panel title={t('Hard limits')}>
        <div className="flex flex-col gap-2">
          {numField(t('Max hours / week'), rules.maxHoursPerWeek, (n) =>
            updateRules({ maxHoursPerWeek: n }),
          )}
          {numField(t('Min rest hours'), rules.minRestHours, (n) =>
            updateRules({ minRestHours: n }),
          )}
          {numField(t('Max consecutive days'), rules.maxConsecutiveDays, (n) =>
            updateRules({ maxConsecutiveDays: n }),
          )}
        </div>
      </Panel>

      <Panel title={t('Constraints')}>
        <div className="flex flex-col gap-1.5">
          {HARD.map((id) => (
            <label key={id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                aria-label={`${id} — ${CONSTRAINT_DESC[id]}`}
                checked={rules.enabled[id]}
                onChange={() => toggleConstraint(id)}
              />
              <span className="font-mono font-semibold w-7">{id}</span>
              <span className="text-dim">{CONSTRAINT_DESC[id]}</span>
            </label>
          ))}
        </div>
      </Panel>

      <Panel title={t('Soft objectives')}>
        <div className="flex flex-col gap-2">
          {SOFT.map((id) => (
            <div key={id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                aria-label={`${id} enabled — ${CONSTRAINT_DESC[id]}`}
                checked={rules.enabled[id]}
                onChange={() => toggleConstraint(id)}
              />
              <span className="font-mono font-semibold w-7">{id}</span>
              <span className="text-dim flex-1 truncate">{CONSTRAINT_DESC[id]}</span>
              <input
                type="range"
                aria-label={`${id} weight`}
                min={0}
                max={20}
                value={rules.weights[id]}
                disabled={!rules.enabled[id]}
                onChange={(e) => setWeight(id, Number(e.target.value))}
                className="w-32"
              />
              <span className="font-mono w-6 text-right">{rules.weights[id]}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
