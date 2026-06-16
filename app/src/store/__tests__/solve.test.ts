import { describe, it, expect } from 'vitest'
import { createStore } from '../store'
import type { ModelMeta } from '@crewdoku/domain'
import type { Proposal } from '@crewdoku/domain'
import { keyOf, type SolverPort, type Solution } from '@crewdoku/domain'

describe('store.solve via injected SolverPort', () => {
  it('builds model, solves, maps solution, produces a proposal; apply writes only accepted cells', async () => {
    const s = createStore()
    s.getState().loadDemo()

    // Clear two cells to empty, then have the fake solver fill them — this
    // guarantees a REAL change (from:null -> to:shift) regardless of seed data.
    const emp = s.getState().employees[0]!
    const targetDate = s.getState().period.startDate
    const targetShift = emp.eligibleShiftIds[0]!
    const cellKey = keyOf(emp.id, targetDate)

    const emp2 = s.getState().employees[1]!
    const otherDate = s.getState().period.startDate
    const otherShift = emp2.eligibleShiftIds[0]!
    const otherKey = keyOf(emp2.id, otherDate)

    // Clear both cells (explicit empty) so the solver's fill is a real change.
    s.getState().setAssignment({ employeeId: emp.id, date: targetDate, shiftId: null })
    s.getState().setAssignment({ employeeId: emp2.id, date: otherDate, shiftId: null })
    const before = s.getState().schedule.assignments.get(cellKey)?.shiftId ?? null
    const otherBefore = s.getState().schedule.assignments.get(otherKey)?.shiftId ?? null

    const fakeSolver: SolverPort = {
      async solve(): Promise<Solution> {
        const meta = s.getState()._lastMeta as ModelMeta
        const empI = meta.empIndex.get(emp.id)
        const dateI = meta.dateIndex.get(targetDate)
        const empI2 = meta.empIndex.get(emp2.id)
        const dateI2 = meta.dateIndex.get(otherDate)
        const cols: Record<string, { Primal: number }> = {
          [`x_${empI}_${dateI}_${targetShift}`]: { Primal: 1 },
          [`x_${empI2}_${dateI2}_${otherShift}`]: { Primal: 1 },
        }
        return { status: 'optimal', objective: 0, columns: cols }
      },
    }

    s.getState().setSolver(fakeSolver)
    await s.getState().solve()

    expect(s.getState().solverPhase).toBe('done')
    expect(s.getState().proposal).not.toBeNull()
    const proposal = s.getState().proposal as Proposal

    const change = proposal.changes.find((c) => keyOf(c.employeeId, c.date) === cellKey)
    expect(change).toBeTruthy()
    expect(change!.to).toBe(targetShift)
    expect(change!.from).toBe(before)

    // Accept ONLY the first cell.
    s.getState().applyProposal([cellKey])

    expect(s.getState().schedule.assignments.get(cellKey)?.shiftId).toBe(targetShift)
    // The other proposed change was NOT accepted -> unchanged.
    expect(s.getState().schedule.assignments.get(otherKey)?.shiftId ?? null).toBe(otherBefore)
    expect(s.getState().proposal).toBeNull()
    expect(s.getState().solverPhase).toBe('idle')
  })

  it('Infeasible solve exposes a conflict core + relaxations whose apply re-runs the model', async () => {
    const s = createStore()
    s.getState().loadDemo()

    let calls = 0
    const infeasibleThenFeasible: SolverPort = {
      async solve(): Promise<Solution> {
        calls += 1
        if (calls === 1) return { status: 'Infeasible', objective: 0, columns: {} }
        return { status: 'optimal', objective: 0, columns: {} }
      },
    }
    s.getState().setSolver(infeasibleThenFeasible)
    await s.getState().solve()

    expect(s.getState().solverPhase).toBe('infeasible')
    expect(s.getState().conflict).not.toBeNull()
    expect(s.getState().conflict!.core.length).toBeGreaterThan(0)

    // Applying a relaxation (if any) re-runs buildModel + solve.
    const relax = s.getState().conflict!.relaxations[0]
    if (relax) {
      await s.getState().applyRelaxation(relax.id)
      // second solve happened
      expect(calls).toBe(2)
    }
  })
})
