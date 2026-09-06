import { describe, expect, it } from 'vitest'
import highsLoader from 'highs'
import { handleSolve, toHighsSolve } from './worker'
import type { WorkerOutMessage } from './worker'

describe('HiGHS WASM solver integration (real WASM in node)', () => {
  it('solves a small known LP to optimality via handleSolve', async () => {
    const highs = await highsLoader()
    const messages: WorkerOutMessage[] = []
    const lp = `Maximize
 obj: x + y
Subject To
 c1: x <= 2
 c2: y <= 3
End`

    await handleSolve(
      { type: 'solve', lp },
      {
        highs: toHighsSolve(highs),
        post: (msg): void => {
          messages.push(msg)
        },
      },
    )

    let resultMessage: Extract<WorkerOutMessage, { type: 'result' }> | undefined
    for (const msg of messages) {
      if (msg.type === 'result') {
        resultMessage = msg
      }
    }

    expect(resultMessage).toBeDefined()
    if (resultMessage !== undefined) {
      expect(resultMessage.status).toBe('Optimal')
      expect(resultMessage.objective).toBe(5)
      const xCol = resultMessage.columns['x']
      const yCol = resultMessage.columns['y']
      expect(xCol).toBeDefined()
      expect(yCol).toBeDefined()
      if (xCol !== undefined) {
        const xPrimal = xCol.Primal ?? xCol.primal
        expect(xPrimal).toBe(2)
      }
      if (yCol !== undefined) {
        const yPrimal = yCol.Primal ?? yCol.primal
        expect(yPrimal).toBe(3)
      }
    }
  })
})
