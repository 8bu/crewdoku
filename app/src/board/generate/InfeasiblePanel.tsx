import type { ConflictCoreItem, RelaxationOption } from '../../engine/types'
import { useT } from '../../i18n/useT'

export type InfeasiblePanelProps = {
  conflictCore: ConflictCoreItem[]
  relaxations: RelaxationOption[]
  onRelax: (option: RelaxationOption) => void
  onDismiss: () => void
}

/**
 * The infeasible screen (ticket 13) — a solve that can't meet coverage,
 * explained in plain sentences, never a silently invented schedule (the
 * map's Principle 4). Docked over the board the same way ticket 12's Ledger
 * is — a flex sibling of `.cd-board-scroll`, board fully visible and
 * unlocked underneath, no navigation away, no dimming. `BoardGrid` unmounts
 * `GenerateControls` while this is up, the same swap it already does for
 * the proposal panel.
 *
 * Dismiss is the only way out (8bu's call, grilled directly): nothing was
 * ever written to the board for an infeasible solve, so "cancel" and
 * "dismiss" are the same action here — closing this panel reverts the
 * planner to exactly the pre-Generate board, same as ticket 11's solving-
 * phase Cancel. A relaxation button rebuilds the rules and re-solves; a
 * feasible result lands in the normal proposal-review flow, never applied
 * straight to the board.
 */
export function InfeasiblePanel({ conflictCore, relaxations, onRelax, onDismiss }: InfeasiblePanelProps) {
  const t = useT()

  const people = (n: number): string =>
    t(n === 1 ? 'panels.noun.person_one' : 'panels.noun.person_other', { n })
  const dowName = (dow: number): string => t(`panels.weekday.${dow}`)
  const dowPlural = (dow: number): string => t(`panels.weekdayPlural.${dow}`)

  const conflictText = (item: ConflictCoreItem): string => {
    const p = item.params
    switch (item.kind) {
      case 'starvation.dow':
        return t('panels.conflict.starvation.dow', {
          shift: p.shift ?? '',
          dow: dowPlural(Number(p.dow)),
          min: people(Number(p.min)),
          avail: people(Number(p.avail)),
        })
      case 'starvation.date':
        return t('panels.conflict.starvation.date', {
          shift: p.shift ?? '',
          date: p.date ?? '',
          min: people(Number(p.min)),
          avail: people(Number(p.avail)),
        })
      case 'dayOvercommit':
        return t('panels.conflict.dayOvercommit', {
          date: p.date ?? '',
          dow: dowName(Number(p.dow)),
          req: people(Number(p.req)),
          avail: people(Number(p.avail)),
        })
      case 'weeklyHours':
        return t('panels.conflict.weeklyHours', {
          week: p.week ?? '',
          demanded: p.demanded ?? '',
          people: people(Number(p.people)),
          maxHours: p.maxHours ?? '',
          supply: p.supply ?? '',
        })
      case 'restLock':
        return t('panels.conflict.restLock', {
          shiftA: p.shiftA ?? '',
          dateA: p.dateA ?? '',
          shiftB: p.shiftB ?? '',
          dateB: p.dateB ?? '',
          gap: p.gap ?? '',
          minRest: p.minRest ?? '',
        })
      default:
        return t('panels.conflict.fallback')
    }
  }

  const relaxText = (option: RelaxationOption): string => {
    const p = option.params
    switch (option.kind) {
      case 'starvation.dow':
        return t('panels.relax.starvation.dow', { shift: p.shift ?? '', dow: dowPlural(Number(p.dow)), to: p.to ?? '' })
      case 'starvation.date':
        return t('panels.relax.starvation.date', { shift: p.shift ?? '', date: p.date ?? '', to: p.to ?? '' })
      case 'dayOvercommit':
        return t('panels.relax.dayOvercommit', { shift: p.shift ?? '', date: p.date ?? '', to: p.to ?? '' })
      case 'weeklyHours':
        return t('panels.relax.weeklyHours', { to: p.to ?? '' })
      case 'restLock':
        return t('panels.relax.restLock', { to: p.to ?? '' })
      case 'fallbackH1':
        return t('panels.relax.fallbackH1')
      case 'fallbackH2':
        return t('panels.relax.fallbackH2', { to: p.to ?? '' })
      case 'fallbackH3':
        return t('panels.relax.fallbackH3', { to: p.to ?? '' })
      default:
        return option.label
    }
  }
  return (
    <div
      className="relative flex h-full w-[var(--proposal-panel-w)] flex-none flex-col overflow-y-auto border-l-2 border-error bg-base-100 shadow-[var(--shadow-pane)]"
      role="dialog"
      aria-label={t('panels.infeasible.aria')}
    >
      <div className="sticky top-0 z-1 flex items-start justify-between gap-3 border-b border-base-300 bg-base-100 px-4 py-3.5">
        <div>
          <div className="text-base font-semibold text-base-content">{t('panels.infeasible.title')}</div>
          <div className="mt-0.5 text-xs text-[color:var(--text-faint)]">{t('panels.infeasible.subtitle')}</div>
        </div>
        <div className="flex flex-none gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
            {t('panels.infeasible.dismiss')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul className="m-0 flex list-none flex-col gap-1.5 border-b border-base-300 px-4 py-3.5 text-sm text-base-content">
          {conflictCore.map((item) => (
            <li key={item.id}>{conflictText(item)}</li>
          ))}
        </ul>

        {relaxations.length > 0 && (
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <div className="text-2xs text-[color:var(--text-faint)]">{t('panels.infeasible.relaxationsPrompt')}</div>
            {relaxations.map((option) => (
              <button
                key={option.id}
                type="button"
                className="btn btn-outline btn-sm justify-start text-left font-normal"
                onClick={() => onRelax(option)}
              >
                {relaxText(option)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
