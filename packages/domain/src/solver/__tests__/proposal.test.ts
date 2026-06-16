import { describe, it, expect } from 'vitest'
import { buildProposal } from '../proposal'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

function fx() {
  const e = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
  const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
  const emp = makeEmployee({ id: 'emp1', name: 'A', teamId: 'T', eligibleShiftIds: ['E'] })
  const cov = makeCoverage({ teamId: 'T', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 1 })) })
  const ctx = buildContext({ teams: [team], shifts: [e], employees: [emp], coverages: [cov], rules: makeRules() })
  const current = makeSchedule() // emp1 has no assignment on 2026-06-15
  const solved = [{ employeeId: 'emp1', date: '2026-06-15', shiftId: 'E' as string | null }]
  return { ctx, current, solved, period: { startDate: '2026-06-15', weeks: 1 } }
}

describe('buildProposal', () => {
  it('produces proposal {id,changes[],fairness,prevFairness,penalty,prevPenalty,breakdown[]}', () => {
    const { ctx, current, solved, period } = fx()
    const p = buildProposal(ctx, current, solved, period)
    expect(p).toHaveProperty('id')
    expect(typeof p.id).toBe('string')
    expect(p).toHaveProperty('fairness')
    expect(p).toHaveProperty('prevFairness')
    expect(p).toHaveProperty('penalty')
    expect(p).toHaveProperty('prevPenalty')
    expect(p.changes).toEqual([
      expect.objectContaining({ employeeId: 'emp1', date: '2026-06-15', from: null, to: 'E' }),
    ])
    expect(p.breakdown.map((b) => b.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5'])
  })
  it('a solve that changes nothing (solved == current) yields an empty changes[]', () => {
    const { ctx, period } = fx()
    const cur = makeSchedule()
    setAssignment(cur, { employeeId: 'emp1', date: '2026-06-15', shiftId: 'E' })
    const solved = [{ employeeId: 'emp1', date: '2026-06-15', shiftId: 'E' as string | null }]
    const p = buildProposal(ctx, cur, solved, period)
    expect(p.changes).toEqual([])
  })
  it('surfaces a REMOVAL: a current shift absent from the solve becomes from:X -> to:null', () => {
    const { ctx, period } = fx()
    const cur = makeSchedule()
    setAssignment(cur, { employeeId: 'emp1', date: '2026-06-15', shiftId: 'E' })
    // mapSolution OMITS empty cells -> solved is empty even though current had E.
    const p = buildProposal(ctx, cur, [], period)
    expect(p.changes).toEqual([
      expect.objectContaining({ employeeId: 'emp1', date: '2026-06-15', from: 'E', to: null }),
    ])
  })
  it('breakdown rows carry now/prev numbers', () => {
    const { ctx, current, solved, period } = fx()
    const p = buildProposal(ctx, current, solved, period)
    for (const b of p.breakdown) {
      expect(typeof b.now).toBe('number')
      expect(typeof b.prev).toBe('number')
    }
  })
})
