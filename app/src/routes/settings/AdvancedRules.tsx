import { ChevronUp, ChevronDown } from '../../ui/icons'
import { useState } from 'react'
import { Input } from '../../ui/Input'
import type { DragEvent } from 'react'
import { HARD_RULES } from '../../state/solveSettings'
import type { HardRuleSettings, SoftGoalId } from '@crewdoku/domain'
import { useT } from '../../i18n/useT'

/**
 * The Advanced door (ticket 15) — hard rules and soft-goal ranking, closed
 * by default behind a native `<details>` so a planner never has to see this
 * to get a good schedule (the map's "easy by default, robust on demand").
 * Soft goals rank by drag order, not a weight number (ticket 15, Q4, 8bu's
 * pick over segmented levels/dot scale) — up/down buttons give the same
 * reorder without a mouse.
 */
export function AdvancedRules({
  hardRules,
  softGoalOrder,
  softGoalEnabled,
  onToggleHardRule,
  onSetMaxHoursPerWeek,
  onSetMinRestHours,
  onReorderSoftGoals,
  onToggleSoftGoal,
}: {
  hardRules: HardRuleSettings
  softGoalOrder: SoftGoalId[]
  softGoalEnabled: Record<SoftGoalId, boolean>
  onToggleHardRule: (id: (typeof HARD_RULES)[number]['id']) => void
  onSetMaxHoursPerWeek: (n: number) => void
  onSetMinRestHours: (n: number) => void
  onReorderSoftGoals: (order: SoftGoalId[]) => void
  onToggleSoftGoal: (id: SoftGoalId) => void
}) {
  const t = useT()
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function move(index: number, delta: number) {
    const next = [...softGoalOrder]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    onReorderSoftGoals(next)
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) return
    const next = [...softGoalOrder]
    const [item] = next.splice(dragIndex, 1)
    next.splice(index, 0, item!)
    onReorderSoftGoals(next)
    setDragIndex(null)
  }

  return (
    <details className="group overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <summary className="flex list-none cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold text-base-content transition-colors duration-150 hover:bg-base-200 [&::-webkit-details-marker]:hidden">
        <span>{t('settings.advanced.title')}</span>
        <span
          className="text-base-content/40 transition-transform duration-150 group-open:rotate-90"
          aria-hidden="true"
        >
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-5 border-t border-base-300 p-4">
        <div>
          <h3 className="m-0 mb-2 text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.advanced.hardRules')}</h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {HARD_RULES.map((rule) => (
              <li key={rule.id} className="flex items-start gap-2.5 rounded-md border border-base-300 bg-base-100 px-2.5 py-2">
                <input
                  type="checkbox"
                  id={`hard-${rule.id}`}
                  className="checkbox checkbox-primary mt-0.5"
                  checked={rule.id === 'H4' ? true : hardRules.enabled[rule.id]}
                  disabled={rule.locked}
                  onChange={() => onToggleHardRule(rule.id)}
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`hard-${rule.id}`} className={`flex w-fit items-center gap-2 text-sm font-semibold text-base-content ${rule.locked ? 'cursor-default' : 'cursor-pointer'}`}>
                    {rule.id} — {t(`settings.rule.${rule.id}.label`)}
                    {rule.locked && <span className="text-2xs font-normal text-base-content/40">{t('settings.advanced.alwaysOn')}</span>}
                  </label>
                  <p className="mt-0.5 text-xs text-base-content/60">{t(`settings.rule.${rule.id}.desc`)}</p>
                  {rule.id === 'H2' && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-base-content/70">
                      {t('settings.advanced.cap')}
                      <Input
                        type="number"
                        min={0}
                        value={hardRules.maxHoursPerWeek}
                        onChange={(e) => onSetMaxHoursPerWeek(Math.max(0, Number(e.target.value)))}
                        className="w-[64px]"
                      />
                      {t('settings.advanced.hPerWeek')}
                    </label>
                  )}
                  {rule.id === 'H3' && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-base-content/70">
                      {t('settings.advanced.minimum')}
                      <Input
                        type="number"
                        min={0}
                        value={hardRules.minRestHours}
                        onChange={(e) => onSetMinRestHours(Math.max(0, Number(e.target.value)))}
                        className="w-[64px]"
                      />
                      {t('settings.advanced.hRest')}
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="m-0 mb-2 text-2xs font-semibold uppercase tracking-wide text-base-content/40">
            {t('settings.advanced.softGoals')}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {softGoalOrder.map((id, i) => {
              const goalLabel = t(`settings.goal.${id}.label`)
              const goalDesc = t(`settings.goal.${id}.desc`)
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => handleDrop(i)}
                  className="flex cursor-grab items-center gap-2.5 rounded-md border border-base-300 bg-base-100 px-2.5 py-2 transition-colors duration-150 hover:bg-base-200 active:cursor-grabbing"
                >
                  <span className="w-4 flex-none text-center text-xs text-base-content/30" aria-hidden="true">
                    ≡
                  </span>
                  <span className="w-5 flex-none font-mono text-xs text-base-content/40">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-base-content">
                      {id} — {goalLabel}
                    </div>
                    <p className="mt-0.5 text-xs text-base-content/60">{goalDesc}</p>
                  </div>
                  <div className="flex flex-none flex-col">
                    <button
                      type="button"
                      aria-label={t('settings.advanced.moveUp', { name: goalLabel })}
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="cursor-pointer border-none bg-transparent px-1 text-xs text-base-content/50 transition-colors duration-150 hover:text-base-content disabled:cursor-not-allowed disabled:text-base-300"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('settings.advanced.moveDown', { name: goalLabel })}
                      onClick={() => move(i, 1)}
                      disabled={i === softGoalOrder.length - 1}
                      className="cursor-pointer border-none bg-transparent px-1 text-xs text-base-content/50 transition-colors duration-150 hover:text-base-content disabled:cursor-not-allowed disabled:text-base-300"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <label className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary"
                      checked={softGoalEnabled[id]}
                      onChange={() => onToggleSoftGoal(id)}
                      aria-label={t('settings.advanced.goalOn', { name: goalLabel })}
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </details>
  )
}
