import { describe, expect, it, vi } from 'vitest'
import { handleSolve } from './worker'
import type { HighsSolve, WorkerOutMessage } from './worker'

describe('worker handleSolve (pure core)', () => {
  it('posts message sequence with ready, logs, and result from injected highs', async () => {
    const posts: WorkerOutMessage[] = []
    const highs: HighsSolve = {
      solve: vi.fn(() => ({
        Status: 'Optimal',
        ObjectiveValue: 42,
        Columns: { x_0_0_E: { Primal: 1 } },
      })),
    }

    await handleSolve(
      {
        type: 'solve',
        lp: 'Maximize\n obj: x_0_0_E\nSubject To\nEnd',
        meta: { varCount: 1, rowCount: 0 },
      },
      { highs, post: (m) => posts.push(m) },
    )

    expect(posts.length).toBeGreaterThanOrEqual(6)

    const first = posts[0]
    expect(first).toBeDefined()
    if (first !== undefined) {
      expect(first.type).toBe('ready')
    }

    const logLines: string[] = []
    let resultMessage: Extract<WorkerOutMessage, { type: 'result' }> | undefined

    for (const msg of posts) {
      if (msg.type === 'log') {
        logLines.push(msg.line)
      } else if (msg.type === 'result') {
        resultMessage = msg
      }
    }

    expect(logLines).toContain('building model — 1 vars, 0 rows')
    expect(logLines).toContain('solving…')
    expect(logLines).toContain('obj 42.00')
    expect(logLines).toContain('status Optimal')

    expect(resultMessage).toBeDefined()
    if (resultMessage !== undefined) {
      expect(resultMessage.status).toBe('Optimal')
      expect(resultMessage.objective).toBe(42)
      const col = resultMessage.columns['x_0_0_E']
      expect(col).toBeDefined()
      if (col !== undefined) {
        expect(col.Primal).toBe(1)
      }
    }
  })

  it('posts an Infeasible result through verbatim', async () => {
    const posts: WorkerOutMessage[] = []
    const highs: HighsSolve = {
      solve: vi.fn(() => ({
        Status: 'Infeasible',
        ObjectiveValue: 0,
        Columns: {},
      })),
    }

    await handleSolve(
      { type: 'solve', lp: 'Minimize\n obj: 0\nSubject To\nEnd' },
      { highs, post: (m) => posts.push(m) },
    )

    let resultMessage: Extract<WorkerOutMessage, { type: 'result' }> | undefined
    for (const msg of posts) {
      if (msg.type === 'result') {
        resultMessage = msg
      }
    }

    expect(resultMessage).toBeDefined()
    if (resultMessage !== undefined) {
      expect(resultMessage.status).toBe('Infeasible')
      expect(resultMessage.columns).toEqual({})
    }
  })

  it('posts an error message when the solver throws', async () => {
    const posts: WorkerOutMessage[] = []
    const highs: HighsSolve = {
      solve: vi.fn(() => {
        throw new Error('HiGHS error: infeasible model')
      }),
    }

    await handleSolve(
      { type: 'solve', lp: 'bad lp content' },
      { highs, post: (m) => posts.push(m) },
    )

    let errorMessage: Extract<WorkerOutMessage, { type: 'error' }> | undefined
    for (const msg of posts) {
      if (msg.type === 'error') {
        errorMessage = msg
      }
    }

    expect(errorMessage).toBeDefined()
    if (errorMessage !== undefined) {
      expect(errorMessage.message).toBe('HiGHS error: infeasible model')
    }
  })

  it('ignores non-solve messages', async () => {
    const posts: WorkerOutMessage[] = []
    const highs: HighsSolve = {
      solve: vi.fn(() => ({
        Status: 'Optimal',
        ObjectiveValue: 0,
      })),
    }

    await handleSolve(
      { type: 'cancel' },
      { highs, post: (m) => posts.push(m) },
    )

    expect(posts).toEqual([])
    expect(highs.solve).not.toHaveBeenCalled()
  })
})
