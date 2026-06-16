import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/I18nProvider'
import { SolvePanel } from '../SolvePanel'
import { createStore } from '../../../store/store'
import { keyOf, type ModelMeta, type Solution, type SolverPort } from '@crewdoku/domain'

function wrap(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe('SolvePanel', () => {
  it('runs the solver, shows a proposal, and applies an accepted cell', async () => {
    const s = createStore()
    s.getState().loadDemo()
    const emp = s.getState().employees[0]!
    const date = s.getState().period.startDate
    const shiftId = emp.eligibleShiftIds[0]!
    // clear the cell so the fill is a real change
    s.getState().setAssignment({ employeeId: emp.id, date, shiftId: null })
    const cellKey = keyOf(emp.id, date)

    const fake: SolverPort = {
      async solve(): Promise<Solution> {
        const m = s.getState()._lastMeta as ModelMeta
        return {
          status: 'optimal',
          objective: 0,
          columns: { [`x_${m.empIndex.get(emp.id)}_${m.dateIndex.get(date)}_${shiftId}`]: { Primal: 1 } },
        }
      },
    }
    s.getState().setSolver(fake)

    wrap(<SolvePanel store={s} />)
    fireEvent.click(screen.getByRole('button', { name: /run solver/i }))

    await waitFor(() => expect(s.getState().proposal).not.toBeNull())
    // proposal has at least one change for our cell
    const change = s.getState().proposal!.changes.find((c) => keyOf(c.employeeId, c.date) === cellKey)
    expect(change).toBeTruthy()

    // Apply writes the accepted change.
    fireEvent.click(screen.getByRole('button', { name: /^apply/i }))
    expect(s.getState().schedule.assignments.get(cellKey)?.shiftId).toBe(shiftId)
  })
})
