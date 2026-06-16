import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.stubGlobal('__APP_VERSION__', '0.1.0')
import { App } from '../App'
import { createStore } from '../store/store'

describe('App shell', () => {
  it('renders landmarks: a banner/nav sidebar, main content, and a status bar', () => {
    const s = createStore()
    s.getState().loadDemo()
    render(<App store={s} />)
    expect(screen.getByRole('navigation')).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('shows the version badge synced to the injected version (AC-21)', () => {
    const s = createStore()
    s.getState().loadDemo()
    render(<App store={s} />)
    expect(screen.getByText('v0.1.0')).toBeTruthy()
  })

  it('renders the board with demo data by default (boots)', () => {
    const s = createStore()
    s.getState().loadDemo()
    render(<App store={s} />)
    expect(screen.getByRole('grid', { name: /schedule/i })).toBeTruthy()
  })

  it('has an aria-live region for solver status', () => {
    const s = createStore()
    s.getState().loadDemo()
    render(<App store={s} />)
    const live = document.querySelector('[aria-live]')
    expect(live).not.toBeNull()
  })

  it('locale switcher flips chrome strings to VI without touching user data', () => {
    const s = createStore()
    s.getState().loadDemo()
    const empName = s.getState().employees[0]!.name
    render(<App store={s} />)
    const nav = screen.getByRole('navigation')
    // EN chrome present
    expect(within(nav).getByRole('button', { name: 'Board' })).toBeTruthy()
    // switch to VI
    fireEvent.click(screen.getByRole('tab', { name: 'VI' }))
    // chrome translated
    expect(within(nav).getByRole('button', { name: 'Bảng' })).toBeTruthy()
    // user data (employee name) is NOT translated — still present verbatim
    expect(screen.getByRole('rowheader', { name: new RegExp(`^${empName}$`) })).toBeTruthy()
  })

  it('switching to Configuration swaps the main surface to the config screens', () => {
    const s = createStore()
    s.getState().loadDemo()
    render(<App store={s} />)
    const nav = screen.getByRole('navigation')
    fireEvent.click(within(nav).getByRole('button', { name: /Configuration/i }))
    // the real config surface renders its section rail (Shift definitions, etc.)
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getAllByText(/Shift definitions/i).length).toBeGreaterThan(0)
  })
})
