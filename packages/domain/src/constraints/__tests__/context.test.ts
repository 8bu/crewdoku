import { describe, it, expect } from 'vitest'
import { makeShift, makeTeam, makeEmployee, makeCoverage } from '../../entities/factories'
import { buildContext } from '../context'

describe('SolveContext', () => {
  it('indexes shifts by id and exposes shiftHours', () => {
    const n = makeShift({ code: 'N', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    const ctx = buildContext({ shifts: [n], teams: [], employees: [], coverages: [], rules: undefined })
    expect(ctx.shiftById.get(n.id)).toBe(n)
    expect(ctx.shiftHours(n.id)).toBe(5)
  })

  it('shiftHours handles cross-midnight (endHour > 24)', () => {
    const late = makeShift({ code: 'L', name: 'Late', startHour: 20, endHour: 30, isNight: false })
    const ctx = buildContext({ shifts: [late], teams: [], employees: [], coverages: [], rules: undefined })
    expect(ctx.shiftHours(late.id)).toBe(10)
  })

  it('indexes teams and employees by id', () => {
    const t = makeTeam({ id: 'T', name: 'T', shiftIds: [] })
    const e = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: [] })
    const ctx = buildContext({ teams: [t], shifts: [], employees: [e], coverages: [], rules: undefined })
    expect(ctx.teamById.get('T')).toBe(t)
    expect(ctx.employeeById.get('e1')).toBe(e)
  })

  it('effectiveCoverage: dateOverride precedes byDow, else byDow[dow], else {min:0,max:0}', () => {
    const cov = makeCoverage({
      teamId: 'T',
      shiftId: 'E',
      byDow: Array.from({ length: 7 }, (_, i) => ({ min: i, max: i + 1 })),
      dateOverrides: { '2026-06-15': { min: 9, max: 9 } }, // Mon (dow 0)
    })
    const ctx = buildContext({ teams: [], shifts: [], employees: [], coverages: [cov], rules: undefined })
    // override wins on its date
    expect(ctx.effectiveCoverage('T', 'E', '2026-06-15')).toEqual({ min: 9, max: 9 })
    // byDow fallback: 2026-06-16 is Tue (dow 1) -> { min:1, max:2 }
    expect(ctx.effectiveCoverage('T', 'E', '2026-06-16')).toEqual({ min: 1, max: 2 })
    // unknown coverage -> {min:0,max:0}
    expect(ctx.effectiveCoverage('NOPE', 'E', '2026-06-16')).toEqual({ min: 0, max: 0 })
  })

  it('defaults rules to makeRules() when undefined', () => {
    const ctx = buildContext({ shifts: [], teams: [], employees: [], coverages: [], rules: undefined })
    expect(ctx.rules.maxHoursPerWeek).toBe(48)
    expect(ctx.rules.minRestHours).toBe(11)
    expect(ctx.rules.enabled.H1).toBe(true)
  })
})
