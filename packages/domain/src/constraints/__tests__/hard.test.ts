import { describe, it, expect } from 'vitest'
import {
  makeShift,
  makeTeam,
  makeEmployee,
  makeCoverage,
  makeRules,
} from '../../entities/factories'
import { buildContext } from '../context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'
import { checkH1, checkH2, checkH3, checkH4, checkH5, checkH6 } from '../hard'

function fixture() {
  const early = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false }) // 8h
  const late = makeShift({ id: 'L', code: 'L', name: 'Late', startHour: 20, endHour: 30, isNight: false }) // ends 06:00 next day, 10h
  const night = makeShift({ id: 'N', code: 'N', name: 'Night', startHour: 1, endHour: 6, isNight: true })
  const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E', 'L', 'N'] })
  const emp = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['E', 'L'] }) // NOT eligible for N
  const cov = makeCoverage({
    teamId: 'T',
    shiftId: 'E',
    byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 2 })),
  })
  const rules = makeRules() // maxHoursPerWeek 48, minRestHours 11
  return {
    ctx: buildContext({ teams: [team], shifts: [early, late, night], employees: [emp], coverages: [cov], rules }),
    emp,
  }
}

describe('hard constraints', () => {
  it('H1: below min flagged as under', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    const v = checkH1(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.some((x) => x.shiftId === 'E' && x.date === '2026-06-15' && x.kind === 'under')).toBe(true)
  })

  it('H1: above max flagged as over', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    // max is 2; assign 3 of this team's employees to Early on the same date
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'E' })
    // add two more team members via a fresh context
    const early = ctx.shiftById.get('E')!
    const late = ctx.shiftById.get('L')!
    const night = ctx.shiftById.get('N')!
    const team = ctx.teamById.get('T')!
    const cov = ctx.coverages[0]!
    const e1 = ctx.employeeById.get('e1')!
    const e2 = makeEmployee({ id: 'e2', name: 'B', teamId: 'T', eligibleShiftIds: ['E'] })
    const e3 = makeEmployee({ id: 'e3', name: 'C', teamId: 'T', eligibleShiftIds: ['E'] })
    const ctx2 = buildContext({ teams: [team], shifts: [early, late, night], employees: [e1, e2, e3], coverages: [cov], rules: makeRules() })
    setAssignment(s, { employeeId: 'e2', date: '2026-06-15', shiftId: 'E' })
    setAssignment(s, { employeeId: 'e3', date: '2026-06-15', shiftId: 'E' })
    const v = checkH1(ctx2, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.some((x) => x.shiftId === 'E' && x.date === '2026-06-15' && x.kind === 'over' && x.count === 3)).toBe(true)
  })

  it('H1: counts ONLY this team employees (per-team, AC-9)', () => {
    const early = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
    const teamA = makeTeam({ id: 'A', name: 'A', shiftIds: ['E'] })
    const teamB = makeTeam({ id: 'B', name: 'B', shiftIds: ['E'] })
    const a1 = makeEmployee({ id: 'a1', name: 'a1', teamId: 'A', eligibleShiftIds: ['E'] })
    const b1 = makeEmployee({ id: 'b1', name: 'b1', teamId: 'B', eligibleShiftIds: ['E'] })
    const b2 = makeEmployee({ id: 'b2', name: 'b2', teamId: 'B', eligibleShiftIds: ['E'] })
    // Team A needs min 1 on Early. Team B has its own coverage min 1 too.
    const covA = makeCoverage({ teamId: 'A', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 1 })) })
    const covB = makeCoverage({ teamId: 'B', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 1, max: 1 })) })
    const ctx = buildContext({ teams: [teamA, teamB], shifts: [early], employees: [a1, b1, b2], coverages: [covA, covB], rules: makeRules() })
    const s = makeSchedule()
    // Only team B employees work Early -> team A is UNDER (its own employees count 0), team B is OVER (2 > max 1)
    setAssignment(s, { employeeId: 'b1', date: '2026-06-15', shiftId: 'E' })
    setAssignment(s, { employeeId: 'b2', date: '2026-06-15', shiftId: 'E' })
    const v = checkH1(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.some((x) => x.teamId === 'A' && x.kind === 'under' && x.count === 0)).toBe(true)
    expect(v.some((x) => x.teamId === 'B' && x.kind === 'over' && x.count === 2)).toBe(true)
  })

  it('H1: dateOverride precedes byDow', () => {
    const early = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
    const e1 = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['E'] })
    const cov = makeCoverage({
      teamId: 'T',
      shiftId: 'E',
      byDow: Array.from({ length: 7 }, () => ({ min: 0, max: 5 })), // byDow would not flag
      dateOverrides: { '2026-06-15': { min: 2, max: 2 } }, // override requires 2
    })
    const ctx = buildContext({ teams: [team], shifts: [early], employees: [e1], coverages: [cov], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'E' }) // count 1 < 2
    const v = checkH1(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.some((x) => x.date === '2026-06-15' && x.kind === 'under' && x.min === 2)).toBe(true)
  })

  it('H2: per ISO-week bucket; full cap on partial weeks (no pro-rating)', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    // Late = 10h; 5 Late shifts Mon..Fri = 50h > 48 in one week bucket
    for (const d of ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'])
      setAssignment(s, { employeeId: 'e1', date: d, shiftId: 'L' })
    const v = checkH2(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.some((x) => x.employeeId === 'e1' && x.weekKey === '2026-06-15')).toBe(true)
  })

  it('H2: non-Monday start + weeks=2 => 3 ISO-week buckets, each at FULL cap (AC-7)', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    const period = { startDate: '2026-06-17', weeks: 2 }
    for (const d of [
      '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', // lead: 5 Late = 50h > 48
      '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', // full: 5 Late = 50h > 48
      '2026-06-29', '2026-06-30', // trail: 2 Late = 20h <= 48
    ])
      setAssignment(s, { employeeId: 'e1', date: d, shiftId: 'L' })
    const v = checkH2(ctx, s, period)
    const buckets = [...new Set(v.filter((x) => x.employeeId === 'e1').map((x) => x.weekKey))].sort()
    expect(buckets).toEqual(['2026-06-15', '2026-06-22'])
    expect(v.every((x) => x.cap === 48)).toBe(true)
  })

  it('H2: respects per-employee contract cap over rules default', () => {
    const early = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 0, endHour: 10, isNight: false }) // 10h
    const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
    const emp = makeEmployee({ id: 'e1', name: 'A', teamId: 'T', eligibleShiftIds: ['E'], contract: { maxHoursPerWeek: 15 } })
    const ctx = buildContext({ teams: [team], shifts: [early], employees: [emp], coverages: [], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'E' })
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: 'E' }) // 20h > 15 cap
    const v = checkH2(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.some((x) => x.employeeId === 'e1' && x.cap === 15 && x.hours === 20)).toBe(true)
  })

  it('H3: flags a Sun->Mon pair under minRestHours across the week boundary (AC-8)', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-21', shiftId: 'L' }) // Sun Late ends 06:00 Mon
    setAssignment(s, { employeeId: 'e1', date: '2026-06-22', shiftId: 'E' }) // Mon Early starts 05:00 -> negative rest
    const v = checkH3(ctx, s, { startDate: '2026-06-15', weeks: 2 })
    expect(v.some((x) => x.employeeId === 'e1' && x.fromDate === '2026-06-21' && x.toDate === '2026-06-22')).toBe(true)
  })

  it('H3: does NOT flag a comfortable gap', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'E' }) // ends 13:00
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: 'E' }) // next day starts 05:00 -> 16h rest
    const v = checkH3(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.length).toBe(0)
  })

  it('H3: only checks CONSECUTIVE calendar dates (gap day skips the pair)', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'L' }) // ends 06:00 next day
    // gap on 16th
    setAssignment(s, { employeeId: 'e1', date: '2026-06-17', shiftId: 'E' }) // 2 days later, plenty of rest
    const v = checkH3(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    expect(v.length).toBe(0)
  })

  it('H4: one shift per day enforced via Map key; checker reports none', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'E' })
    expect(checkH4(ctx, s, { startDate: '2026-06-15', weeks: 1 })).toEqual([])
  })

  it('H5: time-off date assigned a shift is a violation', () => {
    const { ctx, emp } = fixture()
    emp.timeOff.push({ start: '2026-06-16', end: '2026-06-16' })
    const ctx2 = buildContext({ ...ctx, employees: [emp] })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: 'E' })
    expect(checkH5(ctx2, s, { startDate: '2026-06-15', weeks: 1 }).length).toBeGreaterThan(0)
  })

  it('H5: recurring noDow unavailability assigned a shift is a violation', () => {
    const { ctx, emp } = fixture()
    emp.recurring.push({ kind: 'noDow', dow: 0 }) // never Mondays
    const ctx2 = buildContext({ ...ctx, employees: [emp] })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'E' }) // Mon
    expect(checkH5(ctx2, s, { startDate: '2026-06-15', weeks: 1 }).length).toBeGreaterThan(0)
  })

  it('H5: a null (day off) on a time-off date is fine', () => {
    const { ctx, emp } = fixture()
    emp.timeOff.push({ start: '2026-06-16', end: '2026-06-16' })
    const ctx2 = buildContext({ ...ctx, employees: [emp] })
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-16', shiftId: null })
    expect(checkH5(ctx2, s, { startDate: '2026-06-15', weeks: 1 }).length).toBe(0)
  })

  it('H6: assigning an ineligible shift is a violation', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'N' }) // e1 not eligible for N
    expect(checkH6(ctx, s, { startDate: '2026-06-15', weeks: 1 }).length).toBeGreaterThan(0)
  })

  it('H6: eligible shift is fine', () => {
    const { ctx } = fixture()
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'e1', date: '2026-06-15', shiftId: 'E' })
    expect(checkH6(ctx, s, { startDate: '2026-06-15', weeks: 1 }).length).toBe(0)
  })
})
