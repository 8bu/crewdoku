/**
 * HiGHS WASM solver adapter for Web Workers.
 *
 * Owns a Web Worker running HiGHS WASM behind a clean Promise interface.
 * Implements lazy worker spawning, a generation counter to drop messages from
 * stale or cancelled runs, and in-flight cancellation.
 */

/// <reference path="./ambient.d.ts" />
import type { ColumnPrimal, HighsOptions, WorkerInMessage, WorkerOutMessage } from './worker'

export type ColumnResult = ColumnPrimal

export interface Solution {
  status: string
  objective: number
  columns: Record<string, ColumnResult>
}

export type { HighsOptions }
export type LogHandler = (line: string, elapsedMs: number) => void

/**
 * The subset of the Worker API the adapter relies on.
 * Declaring it as an interface allows unit tests to inject a fake worker
 * without requiring real browser Worker or WASM environments.
 */
export interface WorkerLike {
  postMessage(message: unknown): void
  addEventListener(
    type: 'message',
    listener: (e: { data: unknown }) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (e: { data: unknown }) => void,
  ): void
  terminate(): void
}

export interface HighsSolverAdapterOptions {
  /** Factory for the worker; defaults to the real WASM worker. Tests inject a fake. */
  workerFactory?: () => WorkerLike
}

export class CancelledError extends Error {
  constructor(message = 'Solve cancelled') {
    super(message)
    this.name = 'CancelledError'
  }
}

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
}

function isWorkerOutMessage(data: unknown): data is WorkerOutMessage {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  if (!('type' in data) || typeof data.type !== 'string') {
    return false
  }
  if (data.type === 'ready') {
    return true
  }
  if (data.type === 'log') {
    return 'line' in data && typeof data.line === 'string'
  }
  if (data.type === 'result') {
    return (
      'status' in data &&
      typeof data.status === 'string' &&
      'objective' in data &&
      typeof data.objective === 'number' &&
      'columns' in data &&
      typeof data.columns === 'object' &&
      data.columns !== null
    )
  }
  if (data.type === 'error') {
    return 'message' in data && typeof data.message === 'string'
  }
  return false
}

/**
 * HighsSolverAdapter owns a Web Worker running the HiGHS WASM solver.
 *
 * CAVEAT OF THE OLD DESIGN AND WHY THIS RETIRES IT:
 * In the legacy adapter, `onLog` was an adapter-level constructor option. When
 * the engine performed multiple solves (e.g. relaxation loops, conflict detection,
 * or user edits), all log lines streamed into the single constructor-provided
 * callback. Log lines from subsequent re-runs would bleed into the stream of
 * earlier solves, and elapsedMs was relative to the adapter creation time rather
 * than the solve start.
 *
 * In this design, `onLog` is passed per `solve(lp, options, onLog)` invocation.
 * Each solve tracks its own `t0` and routes log events strictly to its own
 * callback with `elapsedMs` measured from that solve's start.
 */
export class HighsSolverAdapter {
  private worker: WorkerLike | null = null
  private generation = 0
  private readonly workerFactory: () => WorkerLike
  private activeReject: ((reason: unknown) => void) | null = null

  constructor(options: HighsSolverAdapterOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory
  }

  private spawn(): WorkerLike {
    if (this.worker !== null) {
      return this.worker
    }
    const freshWorker = this.workerFactory()
    this.worker = freshWorker
    return freshWorker
  }

  solve(
    lp: string,
    options?: HighsOptions,
    onLog?: LogHandler,
  ): Promise<Solution> {
    const worker = this.spawn()
    const gen = ++this.generation
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()

    return new Promise<Solution>((resolve, reject) => {
      const cleanup = (): void => {
        worker.removeEventListener('message', handler)
        if (this.activeReject === handleCancel) {
          this.activeReject = null
        }
      }

      const handleCancel = (reason: unknown): void => {
        cleanup()
        reject(reason)
      }

      this.activeReject = handleCancel

      const handler = (e: { data: unknown }): void => {
        if (gen !== this.generation) {
          return // stale solve; ignore
        }
        const msg = e.data
        if (!isWorkerOutMessage(msg)) {
          return
        }

        if (msg.type === 'log') {
          if (onLog !== undefined) {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
            onLog(msg.line, now - t0)
          }
        } else if (msg.type === 'result') {
          cleanup()
          resolve({
            status: msg.status,
            objective: msg.objective,
            columns: msg.columns,
          })
        } else if (msg.type === 'error') {
          cleanup()
          reject(new Error(msg.message))
        }
      }

      worker.addEventListener('message', handler)
      const solveMsg: WorkerInMessage = { type: 'solve', lp, options }
      worker.postMessage(solveMsg)
    })
  }

  /**
   * Cancels any in-flight solve, terminates the underlying worker,
   * bumps the generation counter so queued/stale messages are dropped,
   * and clears worker state so the next solve spawns a fresh worker.
   */
  cancel(): void {
    this.generation++
    const rejectInFlight = this.activeReject
    this.activeReject = null
    if (rejectInFlight !== null) {
      rejectInFlight(new CancelledError())
    }
    if (this.worker !== null) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
