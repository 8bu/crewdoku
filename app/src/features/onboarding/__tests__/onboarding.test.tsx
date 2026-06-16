import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/I18nProvider'
import { Onboarding } from '../Onboarding'
import { createStore } from '../../../store/store'

function wrap(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe('Onboarding', () => {
  it('Load Demo seeds a usable org (AC-24)', () => {
    const s = createStore()
    wrap(<Onboarding store={s} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /load demo/i }))
    expect(s.getState().employees.length).toBeGreaterThan(0)
    expect(s.getState().shifts.some((sh) => sh.isNight)).toBe(true)
    expect(s.getState().schedule.assignments.size).toBeGreaterThan(0)
  })

  it('manual wizard produces a usable state (org -> teams -> shifts -> coverage -> employees -> rules)', () => {
    const s = createStore()
    let done = 0
    wrap(<Onboarding store={s} onDone={() => (done += 1)} />)

    // org step
    fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Acme' } })
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    // team step
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Floor' } })
    fireEvent.click(screen.getByRole('button', { name: /add team/i }))
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    // shift step
    fireEvent.click(screen.getByRole('button', { name: /add shift/i }))
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    // coverage step (defaults are fine)
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    // employee step
    fireEvent.change(screen.getByLabelText(/employee name/i), { target: { value: 'Sam' } })
    fireEvent.click(screen.getByRole('button', { name: /add employee/i }))
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    // rules step -> finish
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    expect(s.getState().org?.name).toBe('Acme')
    expect(s.getState().teams.length).toBeGreaterThan(0)
    expect(s.getState().shifts.length).toBeGreaterThan(0)
    expect(s.getState().employees.length).toBeGreaterThan(0)
    expect(done).toBe(1)
  })
})
