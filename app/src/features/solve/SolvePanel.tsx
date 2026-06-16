import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { keyOf, type ProposalChange } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Badge, Banner, Btn, Panel } from '../../ui'

/** Penalty/fairness comparison bars (now vs prev) for each soft objective. */
function BreakdownBars({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const proposal = useStore(store, (s) => s.proposal)
  if (!proposal) return null
  const max = Math.max(
    1,
    ...proposal.breakdown.flatMap((b) => [b.now, b.prev]),
  )
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-2xs text-dim">
        <span>{t('Penalty')}</span>
        <span className="font-mono">
          {proposal.prevPenalty} → {proposal.penalty}
        </span>
      </div>
      <div className="flex items-center justify-between text-2xs text-dim">
        <span>{t('Fairness')}</span>
        <span className="font-mono">
          {proposal.prevFairness} → {proposal.fairness}
        </span>
      </div>
      <div className="flex flex-col gap-1 mt-1">
        {proposal.breakdown.map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-2xs">
            <span className="font-mono w-6 text-dim">{b.id}</span>
            <div className="flex-1 h-2 bg-surface-2 rounded-[2px] overflow-hidden">
              <div
                className="h-full"
                style={{ width: `${(b.now / max) * 100}%`, background: 'var(--st-prop)' }}
              />
            </div>
            <span className="font-mono w-12 text-right">
              {b.prev}/{b.now}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Solve panel — collapsible 300px right rail on the board. Hosts the run button,
 * live phase/elapsed, the proposal results (penalty/fairness bars + per-cell
 * accept/reject of the diff), Apply/Discard, and the infeasible state (conflict
 * core + relaxation choices that re-run the solve).
 */
export function SolvePanel({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const solve = useStore(store, (s) => s.solve)
  const applyProposal = useStore(store, (s) => s.applyProposal)
  const discardProposal = useStore(store, (s) => s.discardProposal)
  const applyRelaxation = useStore(store, (s) => s.applyRelaxation)
  const proposal = useStore(store, (s) => s.proposal)
  const conflict = useStore(store, (s) => s.conflict)
  const phase = useStore(store, (s) => s.solverPhase)
  const elapsed = useStore(store, (s) => s.solverElapsed)
  const shifts = useStore(store, (s) => s.shifts)
  const employees = useStore(store, (s) => s.employees)
  const hasSolver = useStore(store, (s) => s._solver !== null)

  const shiftCode = (id: string | null): string =>
    id == null ? '·' : (shifts.find((s) => s.id === id)?.code ?? '?')
  const empName = (id: string): string => employees.find((e) => e.id === id)?.name ?? id

  // local per-cell accept selection; defaults to ALL accepted on a new proposal.
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (proposal) setAccepted(new Set(proposal.changes.map((c) => keyOf(c.employeeId, c.date))))
  }, [proposal])

  const toggle = (c: ProposalChange): void => {
    const k = keyOf(c.employeeId, c.date)
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  return (
    <aside
      aria-label={t('Generate schedule')}
      className="w-[300px] shrink-0 border-l border-bd bg-raised flex flex-col overflow-hidden"
    >
      <div className="px-2.5 py-2 border-b border-bd flex items-center gap-2">
        <Btn
          variant="primary"
          disabled={!hasSolver || phase === 'solving'}
          onClick={() => void solve()}
        >
          {phase === 'solving' ? t('Solving…') : t('Run solver')}
        </Btn>
        <span aria-live="polite" className="text-2xs text-dim font-mono ml-auto">
          {phase === 'done' && `${elapsed}ms`}
          {phase === 'solving' && t('Solving…')}
          {phase === 'infeasible' && (
            <Badge tone="crit">{t('Infeasible')}</Badge>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2.5 flex flex-col gap-3">
        {!hasSolver && (
          <p className="text-2xs text-faint">{t('Solver not available in this environment.')}</p>
        )}

        {phase === 'infeasible' && conflict && (
          <Banner level="crit" title={t('No feasible schedule')}>
            <ul className="flex flex-col gap-1 mt-1">
              {conflict.core.map((c, i) => (
                <li key={i} className="text-2xs">
                  <span className="font-mono font-semibold">{c.cid}</span> {c.text}
                </li>
              ))}
            </ul>
            {conflict.relaxations.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                <p className="text-2xs uppercase tracking-wider text-faint">{t('Relaxations')}</p>
                {conflict.relaxations.map((r) => (
                  <div key={r.id} className="flex flex-col gap-1 border border-bd rounded-[2px] p-1.5">
                    <p className="text-2xs">{r.text}</p>
                    <p className="text-2xs text-faint">{r.detail}</p>
                    <Btn onClick={() => void applyRelaxation(r.id)}>{t('Apply & re-run')}</Btn>
                  </div>
                ))}
              </div>
            )}
          </Banner>
        )}

        {proposal && (
          <>
            <Panel title={t('Proposal')} pad>
              <BreakdownBars store={store} />
            </Panel>

            <div className="flex flex-col gap-1">
              <p className="text-2xs uppercase tracking-wider text-faint">
                {t('Changes')} ({proposal.changes.length})
              </p>
              {proposal.changes.length === 0 && (
                <p className="text-2xs text-faint">{t('No changes proposed.')}</p>
              )}
              <ul className="flex flex-col gap-0.5 max-h-72 overflow-auto">
                {proposal.changes.map((c) => {
                  const k = keyOf(c.employeeId, c.date)
                  const isOn = accepted.has(k)
                  return (
                    <li key={k} className="flex items-center gap-1.5 text-2xs">
                      <input
                        type="checkbox"
                        aria-label={`accept ${empName(c.employeeId)} ${c.date}`}
                        checked={isOn}
                        onChange={() => toggle(c)}
                      />
                      <span className="truncate flex-1">{empName(c.employeeId)}</span>
                      <span className="font-mono text-faint">{c.date.slice(5)}</span>
                      <span className="font-mono">
                        {shiftCode(c.from)}→{shiftCode(c.to)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="flex gap-2">
              <Btn
                variant="primary"
                disabled={accepted.size === 0}
                onClick={() => applyProposal([...accepted])}
              >
                {t('Apply')} ({accepted.size})
              </Btn>
              <Btn variant="ghost" onClick={discardProposal}>
                {t('Discard')}
              </Btn>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
