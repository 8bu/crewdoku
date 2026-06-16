import { describe, it, expect } from 'vitest'
import { scoreTerms } from '../score'
import { makeShift, makeTeam, makeEmployee, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

describe('scoreTerms', () => {
  it('returns weighted breakdown {S1,S2,S3,S4,S5,total} independent of any LP constant', () => {
    const night = makeShift({ id: 'N', code: 'NIGHTLY', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['N'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['N'] })
    const e2 = makeEmployee({ id: 'e2', name: 'B', teamId: 'T', eligibleShiftIds: ['N'] })
    const ctx = buildContext({ teams: [team], shifts: [night], employees: [e1, e2], coverages: [], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'N' })
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: 'N' })
    const period = { startDate: '2026-06-15', weeks: 1 }
    const b = scoreTerms(ctx, s, period)
    expect(b.S1).toBe(16) // 8 (weight) * 2 (raw spread)
    expect(b.total).toBe(b.S1 + b.S2 + b.S3 + b.S4 + b.S5)
  })
})
