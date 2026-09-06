/* GeneratePanel — 300px right sidebar with solver controls, log, and results */
import { useState } from 'react'
import SF from '../../data/sf'
import {
  cx, Btn, Badge, Seg, Panel, Banner,
} from '../../components/ui'
import SolverLog          from './SolverLog'
import { PenaltyBars, CompactHist } from './Charts'

function PreflightTable({ app }) {
  const pendingSwaps = (app.swaps || []).filter(s => s.status === 'pending').length
  const hardInst     = SF.HARD.reduce((a, h) => a + h.instances, 0)
  const softW        = SF.SOFT.reduce((a, s) => a + s.weight, 0)
  return (
    <table className="w-full text-xs">
      <tbody>
        {[
          ['Horizon',      '7 days · Mon–Sun'],
          ['Staff',        '100 · 5 depts'],
          ['Hard',         '5 families · ' + hardInst.toLocaleString() + ' inst.'],
          ['Soft',         '5 terms · weight ' + softW],
          ['Pinned cells', app.pins.size ? app.pins.size + ' locked' : '—'],
          ['Pending swaps',pendingSwaps || '—'],
        ].map(([k, v]) => (
          <tr key={k} className="border-b border-[var(--grid-line)] last:border-b-0">
            <td className="px-2.5 py-1 text-dim whitespace-nowrap">{k}</td>
            <td className="px-2.5 py-1 font-mono text-right">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function GeneratePanel({ app, dispatch, solverState, setSolverState, outcome, setOutcome, onClose }) {
  const { phase, elapsed, relaxed } = solverState
  const [relax, setRelax] = useState(null)

  const running  = phase === 'queued' || phase === 'solving'
  const done     = phase === 'done'   || phase === 'review'
  const progress = Math.min(elapsed / 3100, 1)

  const start = (relaxedText) => {
    setRelax(null)
    setSolverState({ phase: 'queued', elapsed: 0, relaxed: relaxedText || null })
  }
  const cancel = () => setSolverState({ phase: 'idle', elapsed: 0, relaxed: null })

  const p             = app.diff ? app.diff.proposal : null
  const decided       = app.diff ? app.diff.decided  : new Map()
  const acceptedCount = app.diff ? [...decided.values()].filter(v => v === 'accept').length : 0
  const decidedCount  = app.diff ? [...decided.values()].filter(Boolean).length : 0

  return (
    <div className="flex flex-col min-h-0 shrink-0 border-l border-bd"
      style={{ width: '300px', background: 'var(--raised)' }}
      data-screen-label="Generate panel">

      {/* header */}
      <div className="flex items-center gap-1.5 px-2.5 h-9 border-b border-bd shrink-0">
        {running ? (
          <>
            <span className="sf-spinner shrink-0" style={{ display: 'inline-block' }}></span>
            <span className="text-xs font-semibold flex-1">{phase === 'queued' ? 'Queued…' : 'Solving…'}</span>
            <span className="font-mono text-xs text-dim tabular-nums">{(elapsed / 1000).toFixed(1)}s</span>
            <Btn variant="ghost" onClick={cancel}>Cancel</Btn>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold flex-1">Generate</span>
            {app.diff && <Badge tone="prop">◆ {p.changes.length} proposed</Badge>}
          </>
        )}
        <button type="button" onClick={onClose}
          className="ml-0.5 w-6 h-6 flex items-center justify-center rounded-[2px] text-faint hover:text-ink hover:bg-[var(--surface-2)] text-xs leading-none">
          ✕
        </button>
      </div>

      {/* progress strip */}
      <div className="h-[2px] bg-[var(--surface-2)] shrink-0 overflow-hidden">
        <div className="h-full transition-[width] duration-100"
          style={{
            width:   running ? (progress * 100) + '%' : (app.diff || done) ? '100%' : '0%',
            background: 'var(--st-prop)',
            opacity: (running || app.diff || done) ? 1 : 0,
          }} />
      </div>

      {/* body */}
      <div className="flex-1 overflow-auto p-2.5 space-y-2.5">

        <Panel title="Pre-flight · Jun 15 week" pad={false}>
          <PreflightTable app={app} />
        </Panel>

        <Panel title="Hard constraints" pad={false}>
          {SF.HARD.map(h => (
            <div key={h.id} className="flex items-center gap-2 px-2.5 h-7 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
              <Badge>{h.id}</Badge>
              <span className="flex-1 truncate" title={h.desc}>{h.name}</span>
              <span className="font-mono text-2xs text-faint">{h.instances.toLocaleString()}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Demo scenario" tone="sel">
          <div className="space-y-1.5">
            <Seg value={outcome} onChange={setOutcome} className="w-full"
              options={[{ v: 'optimal', label: 'Optimal' }, { v: 'infeasible', label: 'Infeasible' }]} />
            <p className="text-2xs text-faint leading-snug">Prototype-only toggle to preview both solver outcomes.</p>
          </div>
        </Panel>

        <Btn variant="primary" size="lg" className="w-full justify-center"
          disabled={running}
          onClick={() => start(solverState.relaxed)}>
          {running ? '…Running' : '▸ Run solver'}
        </Btn>

        {running && (
          <Panel title="Solver log · CP-SAT" pad={false}>
            <div className="p-1.5">
              <SolverLog phase={phase} elapsed={elapsed} relaxed={relaxed} />
            </div>
          </Panel>
        )}

        {done && p && (
          <>
            <Banner level="ok" title={'Optimal · Proposal ' + p.id}>
              All hard constraints satisfied. {p.changes.length} cells changed.
            </Banner>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Fairness', value: p.fairness,       delta: '+' + (p.fairness - p.prevFairness), tone: 'ok' },
                { label: 'Penalty',  value: p.penalty,        delta: String(p.penalty - p.prevPenalty),   tone: 'ok' },
                { label: 'Changes',  value: p.changes.length, delta: 'of 700',                            tone: null },
              ].map(s => (
                <div key={s.label} className="border border-bd bg-surface rounded-[2px] px-2 py-1.5 text-center">
                  <p className="text-2xs text-dim">{s.label}</p>
                  <p className="font-mono text-sm font-semibold leading-tight mt-0.5">{s.value}</p>
                  {s.tone && <Badge tone={s.tone} className="mt-0.5">{s.delta}</Badge>}
                </div>
              ))}
            </div>

            <Panel title="Penalty breakdown">
              <PenaltyBars rows={p.breakdown.map(b => ({ label: b.id + ' · ' + b.name, value: b.now, prev: b.prev }))} />
            </Panel>

            <Panel title="Workload · hrs/person this week">
              <CompactHist buckets={SF.workloadHistogram(0)} />
            </Panel>
          </>
        )}

        {app.diff && (
          <Panel title="Review proposal">
            <div className="space-y-2">
              <p className="text-2xs text-dim leading-snug">Click violet cells on the board to decide individually, or use bulk actions.</p>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-[var(--surface-2)] rounded-[1px] overflow-hidden">
                  <div className="h-full rounded-[1px] transition-all duration-300"
                    style={{ width: (decidedCount / p.changes.length * 100) + '%', background: 'var(--st-prop)' }} />
                </div>
                <span className="font-mono text-2xs text-dim tabular-nums shrink-0">{decidedCount}/{p.changes.length}</span>
              </div>
              <div className="flex gap-1.5">
                <Btn className="flex-1 justify-center" onClick={() => dispatch({ type: 'DIFF_ALL', decision: 'accept' })}>Accept all</Btn>
                <Btn className="flex-1 justify-center" onClick={() => dispatch({ type: 'DIFF_ALL', decision: 'reject' })}>Reject all</Btn>
              </div>
              <div className="flex gap-1.5">
                <Btn variant="primary" className="flex-1 justify-center"
                  disabled={acceptedCount === 0 && decidedCount === 0}
                  onClick={() => dispatch({ type: 'DIFF_APPLY' })}>
                  Apply {acceptedCount} accepted
                </Btn>
                <Btn variant="ghost" onClick={() => dispatch({ type: 'DIFF_DISCARD' })}>Discard</Btn>
              </div>
            </div>
          </Panel>
        )}

        {phase === 'infeasible' && (
          <>
            <Banner level="crit" title="No feasible schedule">{SF.INFEASIBLE.summary}</Banner>
            <Panel title="Conflict core" tone="crit" pad={false}>
              {SF.INFEASIBLE.core.map(c => (
                <div key={c.cid} className="flex items-start gap-2 px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
                  <Badge tone="crit">{c.cid}</Badge>
                  <span className="leading-snug">{c.text}</span>
                </div>
              ))}
            </Panel>
            <Panel title="Suggested relaxations" pad={false}>
              {SF.INFEASIBLE.relaxations.map(r => (
                <label key={r.id} className={cx('flex items-start gap-2.5 px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0 cursor-pointer text-xs', relax === r.id && 'bg-[var(--sel-bg)]')}>
                  <input type="radio" name="gen-relax" checked={relax === r.id} onChange={() => setRelax(r.id)} className="mt-0.5 shrink-0" />
                  <span className="leading-snug">
                    <b className="font-medium">{r.text}</b>
                    <span className="block text-2xs text-dim mt-0.5">{r.detail}</span>
                  </span>
                </label>
              ))}
            </Panel>
            <Btn variant="primary" size="lg" className="w-full justify-center"
              disabled={!relax}
              onClick={() => {
                const r = SF.INFEASIBLE.relaxations.find(x => x.id === relax)
                setOutcome('optimal')
                start(r ? r.text : null)
              }}>
              ↻ Re-run with relaxation
            </Btn>
          </>
        )}

        {phase === 'idle' && !app.diff && (
          <div className="text-center py-6">
            <div className="font-mono text-2xl text-faint">▸</div>
            <p className="text-xs text-dim mt-2">Ready to generate</p>
            <p className="text-2xs text-faint mt-1 font-mono">{app.pins.size} pinned · est. 2–8s</p>
          </div>
        )}
      </div>
    </div>
  )
}
