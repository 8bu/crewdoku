import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/I18nProvider'
import { RulesConfig } from '../RulesConfig'
import { ShiftsConfig } from '../ShiftsConfig'
import { createStore } from '../../../store/store'

function wrap(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe('RulesConfig', () => {
  it('toggling a constraint updates rules.enabled in the store (AC-11)', () => {
    const s = createStore()
    s.getState().loadDemo()
    wrap(<RulesConfig store={s} />)
    const h6 = screen.getByLabelText(/H6/i) as HTMLInputElement
    expect(s.getState().rules.enabled.H6).toBe(true)
    fireEvent.click(h6)
    expect(s.getState().rules.enabled.H6).toBe(false)
  })

  it('changing a soft weight updates rules.weights (flows into next solve)', () => {
    const s = createStore()
    s.getState().loadDemo()
    wrap(<RulesConfig store={s} />)
    const s1 = screen.getByLabelText(/S1 weight/i) as HTMLInputElement
    fireEvent.change(s1, { target: { value: '2' } })
    expect(s.getState().rules.weights.S1).toBe(2)
  })

  it('editing a hard limit updates rules', () => {
    const s = createStore()
    s.getState().loadDemo()
    wrap(<RulesConfig store={s} />)
    const maxHours = screen.getByLabelText(/Max hours \/ week/i) as HTMLInputElement
    fireEvent.change(maxHours, { target: { value: '40' } })
    expect(s.getState().rules.maxHoursPerWeek).toBe(40)
  })
})

describe('ShiftsConfig', () => {
  it('toggling isNight updates the shift (AC-12)', () => {
    const s = createStore()
    s.getState().loadDemo()
    wrap(<ShiftsConfig store={s} />)
    const first = s.getState().shifts[0]!
    const cb = screen.getByLabelText(new RegExp(`night.*${first.code}|${first.code}.*night`, 'i'), {
      selector: 'input',
    }) as HTMLInputElement
    const beforeVal = first.isNight
    fireEvent.click(cb)
    expect(s.getState().shifts.find((sh) => sh.id === first.id)!.isNight).toBe(!beforeVal)
  })
})
