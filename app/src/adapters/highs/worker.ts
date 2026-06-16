/* Crewdoku solver Web Worker (ported from legacy src/solver/worker.js).
 *
 * `handleSolve` is the pure message-handling core, factored out so it can be
 * unit-tested without a real Worker/`self` (the only WASM/Worker home lives in
 * this adapter — AC-15; the domain stays pure). The real-worker wiring block at
 * the bottom is guarded by `typeof self` so importing this module in node/jsdom
 * is side-effect free.
 */

export interface SolveMessage {
  type: string
  lp: string
  options?: Record<string, unknown>
  meta?: { varCount?: number; rowCount?: number }
}

export interface HighsSolve {
  solve(
    lp: string,
    options?: Record<string, unknown>,
  ): {
    Status: string
    ObjectiveValue: number
    Columns?: Record<string, { Primal?: number; primal?: number }>
  }
}

export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'log'; line: string }
  | {
      type: 'result'
      status: string
      objective: number
      columns: Record<string, { Primal?: number; primal?: number }>
    }
  | { type: 'error'; message: string }

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * Core message handler. Solves with the injected `highs` and streams real log
 * lines, then posts a `result` or `error` via `post`.
 */
export async function handleSolve(
  msg: SolveMessage,
  ctx: { highs: HighsSolve; post: (m: WorkerOutMessage) => void },
): Promise<void> {
  if (!msg || msg.type !== 'solve') return
  const { highs, post } = ctx
  const t0 = now()
  post({ type: 'ready' })
  const meta = msg.meta || {}
  try {
    post({
      type: 'log',
      line: `building model — ${meta.varCount ?? '?'} vars, ${meta.rowCount ?? '?'} rows`,
    })
    post({ type: 'log', line: 'solving…' })
    const sol = highs.solve(msg.lp, msg.options || {})
    const elapsed = (now() - t0) / 1000
    post({ type: 'log', line: `obj ${Number(sol.ObjectiveValue ?? 0).toFixed(2)}` })
    post({ type: 'log', line: `status ${sol.Status}` })
    post({ type: 'log', line: `${elapsed.toFixed(2)}s` })
    post({
      type: 'result',
      status: sol.Status,
      objective: sol.ObjectiveValue,
      columns: sol.Columns || {},
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'error', message })
  }
}

/* ---- Worker wiring (only in an actual worker context) ---- */
/* istanbul ignore next */
declare const self:
  | (Worker & { onmessage: ((e: { data: unknown }) => void) | null })
  | undefined
if (
  typeof self !== 'undefined' &&
  typeof self.postMessage === 'function' &&
  typeof window === 'undefined'
) {
  // Lazily import the WASM loader only in a real worker; never in unit tests.
  let highsPromise: Promise<HighsSolve> | null = null
  self.onmessage = async (e: { data: unknown }) => {
    const msg = e.data as SolveMessage | { type: string }
    if (msg && msg.type === 'cancel') return // best-effort; main thread terminates
    const { getHighs } = await import('./highsLoader')
    if (!highsPromise) highsPromise = getHighs() as Promise<HighsSolve>
    const highs = await highsPromise
    await handleSolve(msg as SolveMessage, {
      highs,
      post: (m) => (self as Worker).postMessage(m),
    })
  }
}

export default { handleSolve }
