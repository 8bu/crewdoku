import { describe, it, expect } from 'vitest'
import { buildModel } from '../model'
import { mapSolution } from '../mapSolution'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'

function ctxFixture() {
  const e = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
  const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
  const emp = makeEmployee({ id: 'emp1', name: 'A', teamId: 'T', eligibleShiftIds: ['E'] })
  const cov = makeCoverage({ teamId: 'T', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 1 })) })
  return buildContext({ teams: [team], shifts: [e], employees: [emp], coverages: [cov], rules: makeRules() })
}

describe('mapSolution', () => {
  it('attributes a known HiGHS column set to the correct employeeId + date via shared meta', () => {
    const { meta } = buildModel(ctxFixture(), { startDate: '2026-06-15', weeks: 1 })
    const colName = meta.varNames.find((v: string) => v.endsWith('_E'))!
    const solution = { status: 'optimal', objective: 0, columns: { [colName]: { Primal: 1 } } }
    const assignments = mapSolution(solution, meta)
    expect(assignments).toContainEqual({ employeeId: 'emp1', date: '2026-06-15', shiftId: 'E' })
  })
  it('OMITS unfilled (emp,date) cells: an all-empty solve over N cells yields ZERO assignments, not N day-off rows', () => {
    const { meta } = buildModel(ctxFixture(), { startDate: '2026-06-15', weeks: 2 })
    const empty = { status: 'optimal', objective: 0, columns: {} as Record<string, { Primal: number }> }
    const assignments = mapSolution(empty, meta)
    expect(assignments.length).toBe(0)
  })
  it('tolerates lower-case `primal` and ignores columns at or below 0.5', () => {
    const { meta } = buildModel(ctxFixture(), { startDate: '2026-06-15', weeks: 1 })
    const col = meta.varNames.find((v) => v.endsWith('_E'))!
    const below = mapSolution({ status: 'optimal', objective: 0, columns: { [col]: { Primal: 0.4 } } }, meta)
    expect(below.length).toBe(0)
    const lower = mapSolution({ status: 'optimal', objective: 0, columns: { [col]: { primal: 1 } } }, meta)
    expect(lower).toContainEqual({ employeeId: 'emp1', date: '2026-06-15', shiftId: 'E' })
  })
  it('ignores aux vars (nmax/nmin/wmax/...) that are not x-columns', () => {
    const { meta } = buildModel(ctxFixture(), { startDate: '2026-06-15', weeks: 1 })
    const col = meta.varNames.find((v) => v.endsWith('_E'))!
    const out = mapSolution({ status: 'optimal', objective: 0, columns: { [col]: { Primal: 1 }, nmax: { Primal: 3 } } }, meta)
    expect(out).toEqual([{ employeeId: 'emp1', date: '2026-06-15', shiftId: 'E' }])
  })
})
