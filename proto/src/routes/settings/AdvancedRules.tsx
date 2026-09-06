import { useState } from 'react'
import type { DragEvent } from 'react'
import { HARD_RULES, SOFT_GOALS, type HardRuleSettings, type SoftGoalId } from '../../state/solveSettings'

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
    <details className="group max-w-[640px] overflow-hidden border border-base-300 bg-base-100">
      <summary className="flex list-none cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold text-base-content transition-colors duration-150 hover:bg-base-200 [&::-webkit-details-marker]:hidden">
        <span>Advanced</span>
        <span
          className="text-base-content/40 transition-transform duration-150 group-open:rotate-90"
          aria-hidden="true"
        >
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-5 border-t border-base-300 p-4">
        <div>
          <h3 className="m-0 mb-2 text-2xs font-semibold uppercase tracking-wide text-base-content/40">Hard rules</h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {HARD_RULES.map((rule) => (
              <li key={rule.id} className="flex items-start gap-2.5 rounded-md border border-base-300 bg-base-100 px-2.5 py-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm mt-0.5"
                  checked={hardRules.enabled[rule.id]}
                  disabled={rule.locked}
                  onChange={() => onToggleHardRule(rule.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-base-content">
                    {rule.id} — {rule.label}
                    {rule.locked && <span className="text-2xs font-normal text-base-content/40">always on</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-base-content/60">{rule.description}</p>
                  {rule.id === 'H2' && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-base-content/70">
                      Cap:
                      <input
                        type="number"
                        min={0}
                        value={hardRules.maxHoursPerWeek}
                        onChange={(e) => onSetMaxHoursPerWeek(Math.max(0, Number(e.target.value)))}
                        className="input input-xs w-[64px]"
                      />
                      h/week
                    </label>
                  )}
                  {rule.id === 'H3' && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-base-content/70">
                      Minimum:
                      <input
                        type="number"
                        min={0}
                        value={hardRules.minRestHours}
                        onChange={(e) => onSetMinRestHours(Math.max(0, Number(e.target.value)))}
                        className="input input-xs w-[64px]"
                      />
                      h rest
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="m-0 mb-2 text-2xs font-semibold uppercase tracking-wide text-base-content/40">
            Soft goals — priority order
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {softGoalOrder.map((id, i) => {
              const goal = SOFT_GOALS.find((g) => g.id === id)!
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
                      {id} — {goal.label}
                    </div>
                    <p className="mt-0.5 text-xs text-base-content/60">{goal.description}</p>
                  </div>
                  <div className="flex flex-none flex-col">
                    <button
                      type="button"
                      aria-label={`Move ${goal.label} up`}
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="cursor-pointer border-none bg-transparent px-1 text-xs text-base-content/50 transition-colors duration-150 hover:text-base-content disabled:cursor-not-allowed disabled:text-base-300"
                    >
                      ▴
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${goal.label} down`}
                      onClick={() => move(i, 1)}
                      disabled={i === softGoalOrder.length - 1}
                      className="cursor-pointer border-none bg-transparent px-1 text-xs text-base-content/50 transition-colors duration-150 hover:text-base-content disabled:cursor-not-allowed disabled:text-base-300"
                    >
                      ▾
                    </button>
                  </div>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm flex-none"
                    checked={softGoalEnabled[id]}
                    onChange={() => onToggleSoftGoal(id)}
                    aria-label={`${goal.label} on`}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </details>
  )
}
