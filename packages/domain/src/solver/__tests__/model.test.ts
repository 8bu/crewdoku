import { describe, it, expect } from 'vitest'
import { buildModel } from '../model'
import {
  makeShift,
  makeTeam,
  makeEmployee,
  makeCoverage,
  makeRules,
} from '../../entities/factories'
import { buildContext } from '../../constraints/context'

function ctxFixture() {
  const e = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
  const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
  const emp = makeEmployee({ id: 'emp1', name: 'A', teamId: 'T', eligibleShiftIds: ['E'] })
  const cov = makeCoverage({ teamId: 'T', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 1 })) })
  return buildContext({ teams: [team], shifts: [e], employees: [emp], coverages: [cov], rules: makeRules() })
}

// 2-team fixture: teams T and U each staff their own copy of shift E; one emp per team.
function twoTeamFixture() {
  const e = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
  const teamT = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
  const teamU = makeTeam({ id: 'U', name: 'U', shiftIds: ['E'] })
  const empT = makeEmployee({ id: 'empT', name: 'T-person', teamId: 'T', eligibleShiftIds: ['E'] })
  const empU = makeEmployee({ id: 'empU', name: 'U-person', teamId: 'U', eligibleShiftIds: ['E'] })
  const covT = makeCoverage({ teamId: 'T', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 1 })) })
  const covU = makeCoverage({ teamId: 'U', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 1 })) })
  return buildContext({ teams: [teamT, teamU], shifts: [e], employees: [empT, empU], coverages: [covT, covU], rules: makeRules() })
}

// Cross-midnight Late shift fixture for H3 across a week boundary (AC-8).
function h3BoundaryFixture() {
  const l = makeShift({ id: 'L', code: 'L', name: 'Late', startHour: 20, endHour: 30, isNight: false }) // ends 06:00 next day
  const ee = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
  const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['L', 'E'] })
  const emp = makeEmployee({ id: 'emp1', name: 'A', teamId: 'T', eligibleShiftIds: ['L', 'E'] })
  return buildContext({ teams: [team], shifts: [l, ee], employees: [emp], coverages: [], rules: makeRules() })
}

describe('buildModel', () => {
  it('returns lp string + meta with bidirectional id<->dense maps', () => {
    const { lp, meta } = buildModel(ctxFixture(), { startDate: '2026-06-15', weeks: 1 })
    expect(lp).toContain('Minimize')
    expect(lp).toContain('Subject To')
    expect(meta.empIndex.get('emp1')).toBe(0)
    expect(meta.empById.get(0)).toBe('emp1')
    expect(meta.dateIndex.get('2026-06-15')).toBe(0)
    expect(meta.varNames.length).toBeGreaterThan(0)
  })
  it('emits H2 one cap row per (employee, ISO-week bucket) for weeks>=2', () => {
    const { lp } = buildModel(ctxFixture(), { startDate: '2026-06-15', weeks: 2 })
    const h2rows = (lp.match(/h2_/g) || []).length
    expect(h2rows).toBe(2) // 1 employee x 2 week buckets
  })
  it('H1 coverage row for team T references only team-T x-vars, excludes team-U vars (AC-9)', () => {
    const { lp, meta } = buildModel(twoTeamFixture(), { startDate: '2026-06-15', weeks: 1 })
    const tI = meta.empIndex.get('empT')
    const uI = meta.empIndex.get('empU')
    const dI = meta.dateIndex.get('2026-06-15')
    const rowRe = new RegExp(`h1_T_E_${dI}:[^\\n]*`)
    const row = (lp.match(rowRe) || [])[0]
    expect(row).toBeTruthy()
    expect(row).toContain(`x_${tI}_${dI}_E`)
    expect(row).not.toContain(`x_${uI}_${dI}_E`)
  })
  it('H3 row references both the boundary-Sunday var and the following-Monday var (AC-8)', () => {
    const { lp, meta } = buildModel(h3BoundaryFixture(), { startDate: '2026-06-15', weeks: 2 })
    const sunI = meta.dateIndex.get('2026-06-21')
    const monI = meta.dateIndex.get('2026-06-22')
    const fromVar = `x_${meta.empIndex.get('emp1')}_${sunI}_L`
    const toVar = `x_${meta.empIndex.get('emp1')}_${monI}_E`
    const h3rows = lp.split('\n').filter((r) => /h3_/.test(r) && r.includes(fromVar) && r.includes(toVar))
    expect(h3rows.length).toBeGreaterThan(0)
  })
  it('bakes H6 into the var set: ineligible shifts get no x-var', () => {
    const e = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
    const n = makeShift({ id: 'N', code: 'N', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E', 'N'] })
    const emp = makeEmployee({ id: 'emp1', name: 'A', teamId: 'T', eligibleShiftIds: ['E'] }) // NOT N
    const ctx = buildContext({ teams: [team], shifts: [e, n], employees: [emp], coverages: [], rules: makeRules() })
    const { meta } = buildModel(ctx, { startDate: '2026-06-15', weeks: 1 })
    expect(meta.varNames.some((v) => v.endsWith('_E'))).toBe(true)
    expect(meta.varNames.some((v) => v.endsWith('_N'))).toBe(false)
  })
  it('toggles: enabled[H3]=false drops all H3 rows', () => {
    const ctx = h3BoundaryFixture()
    ctx.rules.enabled.H3 = false
    const { lp } = buildModel(ctx, { startDate: '2026-06-15', weeks: 2 })
    expect((lp.match(/h3_/g) || []).length).toBe(0)
  })
})
