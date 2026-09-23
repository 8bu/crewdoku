import { describe, expect, it } from 'vitest'
import { CancelledError, HighsSolverAdapter } from './adapter'
import type { WorkerLike } from './adapter'

type MessageListener = (e: { data: unknown }) => void

interface FakeWorker extends WorkerLike {
  emit(data: unknown): void
  terminateCallCount(): number
}

function makeFakeWorker(): FakeWorker {
  const listeners = new Set<MessageListener>()
  let terminateCalls = 0

  return {
    postMessage(): void {},
    addEventListener(_type: 'message', listener: MessageListener): void {
      listeners.add(listener)
    },
    removeEventListener(_type: 'message', listener: MessageListener): void {
      listeners.delete(listener)
    },
    terminate(): void {
      terminateCalls++
    },
    emit(data: unknown): void {
      for (const listener of listeners) {
        listener({ data })
      }
    },
    terminateCallCount(): number {
      return terminateCalls
    },
  }
}

describe('HighsSolverAdapter', () => {
  it('does not spawn worker until solve() is called', () => {
    let factoryCalls = 0
    new HighsSolverAdapter({
      workerFactory: () => {
        factoryCalls++
        return makeFakeWorker()
      },
    })
    expect(factoryCalls).toBe(0)
  })

  it('rejects on error message from worker', async () => {
    const fake = makeFakeWorker()
    const adapter = new HighsSolverAdapter({
      workerFactory: () => fake,
    })
    const solvePromise = adapter.solve('invalid lp')
    fake.emit({
      type: 'error',
      message: 'Syntax error in LP',
    })
    await expect(solvePromise).rejects.toThrow('Syntax error in LP')
  })

  it('routes log events strictly to each solve per-solve onLog with elapsedMs from its t0', async () => {
    const fake = makeFakeWorker()
    const adapter = new HighsSolverAdapter({
      workerFactory: () => fake,
    })

    const logsSolve1: string[] = []
    const elapsedSolve1: number[] = []
    const solve1Promise = adapter.solve(
      'model 1',
      {},
      (line, elapsed) => {
        logsSolve1.push(line)
        elapsedSolve1.push(elapsed)
      },
    )
    fake.emit({ type: 'log', line: 'solve 1 - step a' })
    fake.emit({ type: 'log', line: 'solve 1 - step b' })
    fake.emit({ type: 'result', status: 'Optimal', objective: 1, columns: {} })
    await solve1Promise

    const logsSolve2: string[] = []
    const elapsedSolve2: number[] = []
    const solve2Promise = adapter.solve(
      'model 2',
      {},
      (line, elapsed) => {
        logsSolve2.push(line)
        elapsedSolve2.push(elapsed)
      },
    )
    fake.emit({ type: 'log', line: 'solve 2 - step only' })
    fake.emit({ type: 'result', status: 'Optimal', objective: 2, columns: {} })
    await solve2Promise

    expect(logsSolve1).toEqual(['solve 1 - step a', 'solve 1 - step b'])
    expect(logsSolve2).toEqual(['solve 2 - step only'])
    expect(elapsedSolve1.length).toBe(2)
    const firstElapsed = elapsedSolve1[0]
    expect(firstElapsed).toBeDefined()
    if (firstElapsed !== undefined) {
      expect(firstElapsed).toBeGreaterThanOrEqual(0)
    }
    const secondElapsed = elapsedSolve2[0]
    expect(secondElapsed).toBeDefined()
    if (secondElapsed !== undefined) {
      expect(secondElapsed).toBeGreaterThanOrEqual(0)
    }
  })

  it('cancel() mid-solve rejects in-flight solve with CancelledError and terminates worker', async () => {
    const fake = makeFakeWorker()
    const adapter = new HighsSolverAdapter({
      workerFactory: () => fake,
    })
    const solvePromise = adapter.solve('model in-flight')
    adapter.cancel()
    await expect(solvePromise).rejects.toBeInstanceOf(CancelledError)
    expect(fake.terminateCallCount()).toBe(1)
  })

  it('drops stale messages arriving after cancel()', async () => {
    const fake = makeFakeWorker()
    const adapter = new HighsSolverAdapter({
      workerFactory: () => fake,
    })
    const solveLogs: string[] = []
    const solvePromise = adapter.solve('model cancelled', {}, (line) => {
      solveLogs.push(line)
    })
    adapter.cancel()

    fake.emit({ type: 'log', line: 'stale log' })
    fake.emit({ type: 'result', status: 'Optimal', objective: 99, columns: {} })
    fake.emit({ type: 'error', message: 'stale error' })

    await expect(solvePromise).rejects.toBeInstanceOf(CancelledError)
    expect(solveLogs).toEqual([])
  })

  it('is reusable after cancel, spawning a fresh worker for subsequent solve', async () => {
    let spawnCount = 0
    let currentWorker: FakeWorker | undefined

    const adapter = new HighsSolverAdapter({
      workerFactory: () => {
        spawnCount++
        const w = makeFakeWorker()
        currentWorker = w
        return w
      },
    })

    // Solve 1 and cancel
    const solve1 = adapter.solve('first model')
    expect(spawnCount).toBe(1)
    const firstWorker = currentWorker
    adapter.cancel()
    await expect(solve1).rejects.toBeInstanceOf(CancelledError)
    expect(firstWorker?.terminateCallCount()).toBe(1)

    // Solve 2 should spawn a fresh worker
    const solve2 = adapter.solve('second model')
    expect(spawnCount).toBe(2)
    const secondWorker = currentWorker
    expect(secondWorker).not.toBe(firstWorker)

    secondWorker?.emit({
      type: 'result',
      status: 'Optimal',
      objective: 7,
      columns: {},
    })

    const sol = await solve2
    expect(sol.status).toBe('Optimal')
    expect(sol.objective).toBe(7)
  })
})
