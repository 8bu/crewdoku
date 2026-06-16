import { describe, it, expect } from 'vitest'
import type { SolverPort, Solution } from '../ports'

const fakeSolver: SolverPort = {
  async solve() {
    return { status: 'optimal', columns: {}, objective: 0 } as Solution
  },
}
describe('ports', () => {
  it('SolverPort.solve resolves a Solution', async () => {
    const r = await fakeSolver.solve('Minimize\n obj: 0\nSubject To\nEnd')
    expect(r.status).toBe('optimal')
  })
})
