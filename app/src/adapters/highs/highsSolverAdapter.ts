import type { Solution, SolverPort } from '@crewdoku/domain'

/**
 * The subset of the Worker API the adapter relies on. Declaring it as an
 * interface lets unit tests inject a fake worker (no real Worker/WASM), keeping
 * this adapter the ONLY home of the Worker+wasm runtime (AC-15) while staying
 * fully testable.
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

type WorkerInMessage =
  | { type: 'ready' }
  | { type: 'log'; line: string }
  | {
      type: 'result'
      status: string
      objective: number
      columns: Solution['columns']
    }
  | { type: 'error'; message: string }

export interface HighsSolverAdapterOptions {
  /** Factory for the worker; defaults to the real WASM worker. Tests inject a fake. */
  workerFactory?: () => WorkerLike
  /** Optional streaming-log callback (real HiGHS log lines). */
  onLog?: (line: string, elapsedMs: number) => void
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function defaultWorkerFactory(): WorkerLike {
  // The real worker owns the WASM. `new URL(...)` is resolved by Vite at build
  // time so the worker bundle is emitted separately.
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

/**
 * HighsSolverAdapter implements the domain SolverPort by owning a Web Worker
 * that runs the HiGHS WASM solver. Ported from legacy src/solver/client.js
 * (SolverClient): lazy worker spawn, a monotonic generation counter so a stale
 * solve's messages are ignored, and cancel() that terminates the worker.
 */
export class HighsSolverAdapter implements SolverPort {
  private worker: WorkerLike | null = null
  private generation = 0
  private readonly workerFactory: () => WorkerLike
  private readonly onLog: ((line: string, elapsedMs: number) => void) | undefined

  constructor(options: HighsSolverAdapterOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory
    this.onLog = options.onLog
  }

  private spawn(): WorkerLike {
    if (this.worker) return this.worker
    this.worker = this.workerFactory()
    return this.worker
  }

  solve(lp: string, options?: Record<string, unknown>): Promise<Solution> {
    const worker = this.spawn()
    const gen = ++this.generation
    const t0 = now()
    return new Promise<Solution>((resolve, reject) => {
      const handler = (e: { data: unknown }): void => {
        if (gen !== this.generation) return // stale solve; ignore
        const msg = e.data as WorkerInMessage
        if (msg.type === 'log') {
          this.onLog?.(msg.line, now() - t0)
        } else if (msg.type === 'result') {
          worker.removeEventListener('message', handler)
          resolve({
            status: msg.status,
            objective: msg.objective,
            columns: msg.columns,
          })
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', handler)
          reject(new Error(msg.message))
        }
      }
      worker.addEventListener('message', handler)
      worker.postMessage({ type: 'solve', lp, options })
    })
  }

  /** Cancels any in-flight solve and tears the worker down. */
  cancel(): void {
    this.generation++
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
