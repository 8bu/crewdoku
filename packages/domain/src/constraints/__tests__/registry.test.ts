import { describe, it, expect } from 'vitest'
import { runHardChecks, scoreSoft } from '../registry'
import { makeShift, makeTeam, makeEmployee, makeRules } from '../../entities/factories'
import { buildContext } from '../context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

describe('registry gating', () => {
  it('disabled[H6]=false removes H6 violations', () => {
    const n = makeShift({ id: 'N', code: 'N', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['N'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: [] }) // eligible for nothing
    const rules = makeRules()
    const ctx = buildContext({ teams: [team], shifts: [n], employees: [e1], coverages: [], rules })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'N' })
    const period = { startDate: '2026-06-15', weeks: 1 }
    expect(runHardChecks(ctx, s, period).some((v) => v.rule === 'H6')).toBe(true)
    rules.enabled.H6 = false
    expect(runHardChecks(ctx, s, period).some((v) => v.rule === 'H6')).toBe(false)
  })

  function nightSpreadFixture(rules = makeRules()) {
    const night = makeShift({ id: 'N', code: 'N', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['N'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['N'] })
    const e2 = makeEmployee({ id: 'e2', name: 'B', teamId: 'T', eligibleShiftIds: ['N'] })
    const ctx = buildContext({ teams: [team], shifts: [night], employees: [e1, e2], coverages: [], rules })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'N' })
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: 'N' }) // spread = 2
    return { ctx, s }
  }

  it('scoreSoft applies weights (S1=8 -> 16) and reports per-term + total', () => {
    const { ctx, s } = nightSpreadFixture()
    const out = scoreSoft(ctx, s, { startDate: '2026-06-15', weeks: 1 }, makeSchedule())
    expect(out.S1).toBe(16) // weight 8 * spread 2
    expect(out.total).toBe(out.S1 + out.S2 + out.S3 + out.S4 + out.S5)
  })

  it('scoreSoft drops disabled soft terms (enabled[S1]=false -> 0)', () => {
    const rules = makeRules()
    rules.enabled.S1 = false
    const { ctx, s } = nightSpreadFixture(rules)
    const out = scoreSoft(ctx, s, { startDate: '2026-06-15', weeks: 1 }, makeSchedule())
    expect(out.S1).toBe(0)
  })

  it('scoreSoft uses the weight value (S1=3 -> 6)', () => {
    const rules = makeRules({ weights: { S1: 3, S2: 6, S3: 4, S4: 5, S5: 3 } })
    const { ctx, s } = nightSpreadFixture(rules)
    const out = scoreSoft(ctx, s, { startDate: '2026-06-15', weeks: 1 }, makeSchedule())
    expect(out.S1).toBe(6)
  })
})
