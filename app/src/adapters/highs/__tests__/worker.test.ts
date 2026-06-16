import { describe, it, expect, vi } from 'vitest'
import { handleSolve } from '../worker'

describe('worker handleSolve (pure core)', () => {
  it('posts a result with status/objective/columns from injected highs', async () => {
    const posts: Array<Record<string, unknown>> = []
    const highs = {
      solve: vi.fn(() => ({
        Status: 'Optimal',
        ObjectiveValue: 0,
        Columns: { x_0_0_E: { Primal: 1 } },
      })),
    }
    await handleSolve(
      { type: 'solve', lp: 'Minimize\n obj: 0\nSubject To\nEnd' },
      { highs, post: (m) => posts.push(m) },
    )
    const result = posts.find((p) => p.type === 'result') as
      | { status: string; objective: number; columns: Record<string, { Primal: number }> }
      | undefined
    expect(result).toBeDefined()
    expect(result!.status).toBe('Optimal')
    expect(result!.objective).toBe(0)
    expect(result!.columns.x_0_0_E!.Primal).toBe(1)
  })

  it('posts an Infeasible result through verbatim (AC-17 path)', async () => {
    const posts: Array<Record<string, unknown>> = []
    const highs = {
      solve: vi.fn(() => ({ Status: 'Infeasible', ObjectiveValue: 0, Columns: {} })),
    }
    await handleSolve(
      { type: 'solve', lp: 'Minimize\n obj: 0\nSubject To\nEnd' },
      { highs, post: (m) => posts.push(m) },
    )
    const result = posts.find((p) => p.type === 'result') as
      | { status: string }
      | undefined
    expect(result!.status).toBe('Infeasible')
  })

  it('posts an error message when the solver throws', async () => {
    const posts: Array<Record<string, unknown>> = []
    const highs = {
      solve: vi.fn(() => {
        throw new Error('boom')
      }),
    }
    await handleSolve(
      { type: 'solve', lp: 'bad' },
      { highs, post: (m) => posts.push(m) },
    )
    const err = posts.find((p) => p.type === 'error') as
      | { message: string }
      | undefined
    expect(err!.message).toBe('boom')
  })

  it('ignores non-solve messages', async () => {
    const posts: Array<Record<string, unknown>> = []
    const highs = { solve: vi.fn() }
    await handleSolve(
      { type: 'cancel', lp: '' },
      { highs, post: (m) => posts.push(m) },
    )
    expect(posts).toEqual([])
    expect(highs.solve).not.toHaveBeenCalled()
  })
})
