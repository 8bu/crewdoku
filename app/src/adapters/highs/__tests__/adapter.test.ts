import { describe, it, expect, vi } from 'vitest'
import { HighsSolverAdapter } from '../highsSolverAdapter'
import type { WorkerLike } from '../highsSolverAdapter'

/**
 * A minimal fake Worker that lets a test script drive the messages the adapter
 * receives, without any real Worker/WASM. Whatever the test enqueues via
 * `reply` is delivered on the next postMessage from the adapter.
 */
function makeFakeWorker(reply: (msg: unknown) => Array<{ type: string } & Record<string, unknown>>) {
  const listeners = new Set<(e: { data: unknown }) => void>()
  const worker: WorkerLike = {
    postMessage: (msg: unknown) => {
      // Deliver replies asynchronously, like a real worker.
      for (const out of reply(msg)) {
        queueMicrotask(() => {
          for (const l of listeners) l({ data: out })
        })
      }
    },
    addEventListener: (_type, l) => {
      listeners.add(l as (e: { data: unknown }) => void)
    },
    removeEventListener: (_type, l) => {
      listeners.delete(l as (e: { data: unknown }) => void)
    },
    terminate: vi.fn(),
  }
  return worker
}

describe('HighsSolverAdapter', () => {
  it('(a) maps an Optimal solve to { status, objective, columns }', async () => {
    const worker = makeFakeWorker(() => [
      { type: 'log', line: 'solving…' },
      {
        type: 'result',
        status: 'Optimal',
        objective: 42,
        columns: { x_0_0_E: { Primal: 1 } },
      },
    ])
    const logs: string[] = []
    const adapter = new HighsSolverAdapter({
      workerFactory: () => worker,
      onLog: (line) => logs.push(line),
    })
    const sol = await adapter.solve('Minimize\n obj: 0\nSubject To\nEnd')
    expect(sol.status).toBe('Optimal')
    expect(sol.objective).toBe(42)
    expect(sol.columns.x_0_0_E!.Primal).toBe(1)
    expect(logs).toContain('solving…')
  })

  it('(b) maps an Infeasible solve to { status:"Infeasible", ... } (AC-17)', async () => {
    const worker = makeFakeWorker(() => [
      { type: 'result', status: 'Infeasible', objective: 0, columns: {} },
    ])
    const adapter = new HighsSolverAdapter({ workerFactory: () => worker })
    const sol = await adapter.solve('Minimize\n obj: 0\nSubject To\nEnd')
    expect(sol.status).toBe('Infeasible')
    expect(sol.columns).toEqual({})
  })

  it('rejects when the worker posts an error', async () => {
    const worker = makeFakeWorker(() => [{ type: 'error', message: 'kaboom' }])
    const adapter = new HighsSolverAdapter({ workerFactory: () => worker })
    await expect(adapter.solve('bad')).rejects.toThrow('kaboom')
  })

  it('cancel() terminates the worker and bumps the generation', async () => {
    const worker = makeFakeWorker(() => [
      { type: 'result', status: 'Optimal', objective: 0, columns: {} },
    ])
    const adapter = new HighsSolverAdapter({ workerFactory: () => worker })
    await adapter.solve('Minimize\n obj: 0\nSubject To\nEnd')
    adapter.cancel()
    expect(worker.terminate).toHaveBeenCalled()
  })
})
