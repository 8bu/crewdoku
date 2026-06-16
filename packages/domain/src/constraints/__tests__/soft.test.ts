import { describe, it, expect } from 'vitest'
import { scoreS1, scoreS2, scoreS3, scoreS4, scoreS5 } from '../soft'
import { makeShift, makeTeam, makeEmployee, makeRules } from '../../entities/factories'
import { buildContext } from '../context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

describe('soft scorers', () => {
  it('S1 night fairness = min-max spread of per-employee night counts, keyed by isNight (AC-12)', () => {
    const night = makeShift({ id: 'N', code: 'NIGHTLY', name: 'Night', startHour: 1, endHour: 6, isNight: true }) // non-"N" code
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['N'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['N'] })
    const e2 = makeEmployee({ id: 'e2', name: 'B', teamId: 'T', eligibleShiftIds: ['N'] })
    const ctx = buildContext({ teams: [team], shifts: [night], employees: [e1, e2], coverages: [], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'N' })
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: 'N' }) // e1=2 nights, e2=0
    expect(scoreS1(ctx, s, { startDate: '2026-06-15', weeks: 1 })).toBe(2)
  })

  it('S1 = 0 when org has no night shift', () => {
    const day = makeShift({ id: 'D', code: 'D', name: 'Day', startHour: 9, endHour: 17, isNight: false })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['D'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['D'] })
    const e2 = makeEmployee({ id: 'e2', name: 'B', teamId: 'T', eligibleShiftIds: ['D'] })
    const ctx = buildContext({ teams: [team], shifts: [day], employees: [e1, e2], coverages: [], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'D' })
    expect(scoreS1(ctx, s, { startDate: '2026-06-15', weeks: 1 })).toBe(0)
  })

  it('S2 counts preference violations: avoid night worked, prefer preferredShift not worked, avoid weekend worked', () => {
    const day = makeShift({ id: 'D', code: 'D', name: 'Day', startHour: 9, endHour: 17, isNight: false })
    const night = makeShift({ id: 'N', code: 'N', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['D', 'N'] })
    // e1 avoids night, but works a night -> +1
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['D', 'N'], prefs: { night: 'avoid' } })
    // e2 prefers shift D and works it (no violation), but avoids weekends and works Sat -> +1
    const e2 = makeEmployee({ id: 'e2', name: 'B', teamId: 'T', eligibleShiftIds: ['D', 'N'], prefs: { weekend: 'avoid', preferredShiftId: 'D' } })
    const ctx = buildContext({ teams: [team], shifts: [day, night], employees: [e1, e2], coverages: [], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'N' }) // avoid night violated
    setAssignment(s, { employeeId: 'e2', date: '2026-06-15', shiftId: 'D' }) // preferred shift honored (Mon)
    setAssignment(s, { employeeId: 'e2', date: '2026-06-20', shiftId: 'D' }) // Sat -> avoid weekend violated
    expect(scoreS2(ctx, s, { startDate: '2026-06-15', weeks: 1 })).toBe(2)
  })

  it('S3 stability counts cells changed vs a baseline schedule', () => {
    const day = makeShift({ id: 'D', code: 'D', name: 'Day', startHour: 9, endHour: 17, isNight: false })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['D'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['D'] })
    const ctx = buildContext({ teams: [team], shifts: [day], employees: [e1], coverages: [], rules: makeRules() })
    const base = makeSchedule()
    setAssignment(base, { employeeId: 'e1', date: '2026-06-15', shiftId: 'D' })
    const next = makeSchedule()
    setAssignment(next, { employeeId: 'e1', date: '2026-06-15', shiftId: null })
    expect(scoreS3(ctx, next, { startDate: '2026-06-15', weeks: 1 }, base)).toBe(1)
  })

  it('S3 = 0 when next matches baseline (incl. matching nulls/absent)', () => {
    const day = makeShift({ id: 'D', code: 'D', name: 'Day', startHour: 9, endHour: 17, isNight: false })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['D'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['D'] })
    const ctx = buildContext({ teams: [team], shifts: [day], employees: [e1], coverages: [], rules: makeRules() })
    const base = makeSchedule()
    setAssignment(base, { employeeId: 'e1', date: '2026-06-15', shiftId: 'D' })
    const next = makeSchedule()
    setAssignment(next, { employeeId: 'e1', date: '2026-06-15', shiftId: 'D' })
    expect(scoreS3(ctx, next, { startDate: '2026-06-15', weeks: 1 }, base)).toBe(0)
  })

  it('S4 weekend fairness = min-max spread of per-employee weekend-shift counts', () => {
    const day = makeShift({ id: 'D', code: 'D', name: 'Day', startHour: 9, endHour: 17, isNight: false })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['D'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['D'] })
    const e2 = makeEmployee({ id: 'e2', name: 'B', teamId: 'T', eligibleShiftIds: ['D'] })
    const ctx = buildContext({ teams: [team], shifts: [day], employees: [e1, e2], coverages: [], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-20', shiftId: 'D' }) // Sat
    setAssignment(s, { employeeId: 'e1', date: '2026-06-21', shiftId: 'D' }) // Sun -> e1=2 weekend, e2=0
    expect(scoreS4(ctx, s, { startDate: '2026-06-15', weeks: 1 })).toBe(2)
  })

  it('S5 counts incompatible consecutive-day pairs (rest < minRest across the day boundary)', () => {
    const late = makeShift({ id: 'L', code: 'L', name: 'Late', startHour: 20, endHour: 30, isNight: false }) // ends 06:00
    const early = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['L', 'E'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['L', 'E'] })
    const ctx = buildContext({ teams: [team], shifts: [late, early], employees: [e1], coverages: [], rules: makeRules() })
    const s = makeSchedule()
    // Late then Early next day: rest = (1*24+5) - (0*24+30) = -1 < 11 -> incompatible
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'L' })
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: 'E' })
    expect(scoreS5(ctx, s, { startDate: '2026-06-15', weeks: 1 })).toBe(1)
  })
})
