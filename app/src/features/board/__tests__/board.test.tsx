import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Board } from '../Board'
import { createStore } from '../../../store/store'
import { eachDate, keyOf } from '@crewdoku/domain'

describe('Board', () => {
  it('renders a grid of employee rows x date columns from the domain schedule', () => {
    const s = createStore()
    s.getState().loadDemo()
    render(<Board store={s} />)
    expect(screen.getByRole('grid')).toBeTruthy()
    // one header section + at least one employee row
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
  })

  it('shows a row header with each employee name (user data, never translated)', () => {
    const s = createStore()
    s.getState().loadDemo()
    const empName = s.getState().employees[0]!.name
    render(<Board store={s} />)
    // exact-match the accessible name to avoid substring collisions (e.g. "Sam 1" in "Sam 10")
    expect(
      screen.getByRole('rowheader', { name: new RegExp(`^${empName}$`) }),
    ).toBeTruthy()
  })

  it('renders one column per period date', () => {
    const s = createStore()
    s.getState().loadDemo()
    const dates = eachDate(s.getState().period)
    render(<Board store={s} />)
    // gridcells = employees * dates; columnheaders include the day-of-week row
    const dayHeaders = screen.getAllByRole('columnheader')
    // at least one day-of-week header per date (week headers also count, so >=)
    expect(dayHeaders.length).toBeGreaterThanOrEqual(dates.length)
  })

  it('a cell with a seeded assignment shows the shift code', () => {
    const s = createStore()
    s.getState().loadDemo()
    const emp = s.getState().employees[0]!
    const date = s.getState().period.startDate
    const assigned = s.getState().schedule.assignments.get(keyOf(emp.id, date))
    // demo seeds Mon..Fri; startDate is a Monday, so emp[0] has a shift here
    expect(assigned?.shiftId).toBeTruthy()
    const shift = s.getState().shifts.find((sh) => sh.id === assigned!.shiftId)!
    render(<Board store={s} />)
    // exact accessible-name match: "Sam 1, 2026-06-15, Day"
    const cell = screen.getByRole('gridcell', {
      name: `${emp.name}, ${date}, ${shift.name}`,
    })
    expect(within(cell).getByText(shift.code)).toBeTruthy()
  })

  it('cells are keyboard-operable (focusable gridcells)', () => {
    const s = createStore()
    s.getState().loadDemo()
    render(<Board store={s} />)
    const cells = screen.getAllByRole('gridcell')
    expect(cells.length).toBeGreaterThan(0)
    // every gridcell is in the tab/focus order
    expect(cells.every((c) => c.getAttribute('tabindex') !== null)).toBe(true)
  })
})
