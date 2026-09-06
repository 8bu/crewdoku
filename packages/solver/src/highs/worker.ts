/// <reference path="./ambient.d.ts" />

/**
 * Crewdoku solver Web Worker.
 *
 * `handleSolve` is the pure message-handling core, factored out so it can be
 * unit-tested without a real Worker or browser globals. The real-worker wiring
 * at the bottom is guarded by runtime checks (`typeof self`) so importing this
 * module in Node or non-worker environments is completely side-effect free.
 */

import type highsLoader from 'highs'

export type HighsOptions = NonNullable<Parameters<Awaited<ReturnType<typeof highsLoader>>['solve']>[1]>

export interface SolveMeta {
  varCount?: number
  rowCount?: number
}

export interface SolveMessage {
  type: 'solve'
  lp: string
  options?: HighsOptions
  meta?: SolveMeta
}

export interface CancelMessage {
  type: 'cancel'
}

export type WorkerInMessage = SolveMessage | CancelMessage

export interface ColumnPrimal {
  Primal?: number
  primal?: number
}

export interface HighsSolveResult {
  Status: string
  ObjectiveValue?: number
  Columns?: Record<string, ColumnPrimal>
}

export interface HighsSolve {
  solve(
    problem: string,
    options?: HighsOptions,
  ): HighsSolveResult
}

/**
 * The real, fully-typed HiGHS instance the loader resolves. Derived here
 * because the `highs` package exports no type names (only the default
 * loader function); this is the single derivation point — every consumer
 * imports our named seam types (`HighsSolve`, `HighsOptions`) instead.
 */
type HighsInstance = Awaited<ReturnType<typeof highsLoader>>

/**
 * Adapts the real HiGHS instance to the worker's structural seam.
 * A direct assignment does not type-check: the library's infeasible
 * solution variant has columns with no `Primal` at all, which trips
 * TypeScript's weak-type check against `ColumnPrimal`. This explicit
 * mapping is the honest boundary — and the decode never reads columns
 * of an infeasible solution anyway.
 */
export function toHighsSolve(instance: HighsInstance): HighsSolve {
  return {
    solve: (problem, options) => {
      const sol = instance.solve(problem, options)
      const columns: Record<string, ColumnPrimal> = {}
      for (const [name, col] of Object.entries(sol.Columns)) {
        columns[name] = 'Primal' in col ? { Primal: col.Primal } : {}
      }
      return { Status: sol.Status, ObjectiveValue: sol.ObjectiveValue, Columns: columns }
    },
  }
}

export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'log'; line: string }
  | {
      type: 'result'
      status: string
      objective: number
      columns: Record<string, ColumnPrimal>
    }
  | { type: 'error'; message: string }

function isSolveMessage(msg: unknown): msg is SolveMessage {
  if (typeof msg !== 'object' || msg === null) {
    return false
  }
  if (!('type' in msg) || msg.type !== 'solve') {
    return false
  }
  return 'lp' in msg && typeof msg.lp === 'string'
}

/**
 * Core message handler. Solves with the injected `highs` instance and streams
 * log lines, then posts a `result` or `error` message via `post`.
 */
export async function handleSolve(
  msg: unknown,
  ctx: { highs: HighsSolve; post: (m: WorkerOutMessage) => void },
): Promise<void> {
  if (!isSolveMessage(msg)) {
    return
  }

  const { highs, post } = ctx
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  post({ type: 'ready' })

  const meta = msg.meta
  const varCountText = meta?.varCount !== undefined ? String(meta.varCount) : '?'
  const rowCountText = meta?.rowCount !== undefined ? String(meta.rowCount) : '?'

  try {
    post({
      type: 'log',
      line: `building model — ${varCountText} vars, ${rowCountText} rows`,
    })
    post({ type: 'log', line: 'solving…' })
    const sol = highs.solve(msg.lp, msg.options)
    const tEnd = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = (tEnd - t0) / 1000
    const objVal = sol.ObjectiveValue ?? 0
    const formattedObj = Number(objVal).toFixed(2)
    post({ type: 'log', line: `obj ${formattedObj}` })
    post({ type: 'log', line: `status ${sol.Status}` })
    post({ type: 'log', line: `${elapsed.toFixed(2)}s` })

    const rawColumns = sol.Columns
    const columns: Record<string, ColumnPrimal> = {}
    if (rawColumns !== undefined) {
      for (const [colName, colData] of Object.entries(rawColumns)) {
        if (typeof colData === 'object' && colData !== null) {
          const primalVal = 'Primal' in colData && typeof colData.Primal === 'number' ? colData.Primal : undefined
          const lowerPrimalVal = 'primal' in colData && typeof colData.primal === 'number' ? colData.primal : undefined
          columns[colName] = {
            Primal: primalVal,
            primal: lowerPrimalVal,
          }
        }
      }
    }

    post({
      type: 'result',
      status: sol.Status,
      objective: objVal,
      columns,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'error', message })
  }
}

/* ---- Worker wiring (only in an actual worker context) ---- */
if (
  typeof self !== 'undefined' &&
  typeof self.postMessage === 'function' &&
  typeof window === 'undefined'
) {
  const workerScope = self
  let highsPromise: Promise<HighsInstance> | null = null
  workerScope.onmessage = async (e: { data: unknown }): Promise<void> => {
    const data = e.data
    if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'cancel') {
      return
    }
    // Exception: loader.ts imports 'highs/runtime?url' (a Vite-only virtual asset import).
    // Dynamic import ensures importing worker.ts in Node or unit tests is side-effect free.
    const { getHighs } = await import('./loader')
    if (highsPromise === null) {
      highsPromise = getHighs()
    }
    const instance = await highsPromise
    await handleSolve(data, {
      highs: toHighsSolve(instance),
      post: (m: WorkerOutMessage) => {
        workerScope.postMessage(m)
      },
    })
  }
}
