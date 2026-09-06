/* Live scrolling solver log */
import { useEffect, useRef } from 'react'
import SF from '../../data/sf'

export default function SolverLog({ phase, elapsed, relaxed }) {
  const ref     = useRef(null)
  const entries = SF.SOLVER_LOG.filter(l => phase === 'solving' && l.t <= elapsed)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [entries.length])

  return (
    <div ref={ref}
      className="h-28 overflow-auto font-mono text-2xs text-dim leading-relaxed p-2 bg-surface border border-bd">
      {relaxed && <p style={{ color: 'var(--st-warn)' }}>relaxation active: {relaxed}</p>}
      {phase === 'queued' && <p className="text-faint">Position 1 in queue…</p>}
      {entries.map(l => <p key={l.t}>[{(l.t / 1000).toFixed(2)}s] {l.s}</p>)}
      {phase === 'solving' && <p className="sf-blink">▌</p>}
    </div>
  )
}
