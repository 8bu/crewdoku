import { describe, it, expect } from 'vitest'
import { deriveConflictCore } from '../conflict'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule } from '../../schedule/schedule'
import { runHardChecks } from '../../constraints/registry'
import { eachDate } from '../../calendar/calendar'

// Team T needs min 3 on shift E every date but only 1 eligible employee exists
// -> genuinely infeasible (coverage exceeds eligible headcount).
function infeasibleFx() {
  const e = makeShift({ id: 'E', code: 'E', name: 'Early', startHour: 5, endHour: 13, isNight: false })
  const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
  const emp = makeEmployee({ id: 'emp1', name: 'A', teamId: 'T', eligibleShiftIds: ['E'] })
  const cov = makeCoverage({ teamId: 'T', shiftId: 'E', byDow: Array.from({ length: 7 }, () => ({ min: 3, max: 3 })) })
  const ctx = buildContext({ teams: [team], shifts: [e], employees: [emp], coverages: [cov], rules: makeRules() })
  return { ctx, schedule: makeSchedule(), period: { startDate: '2026-06-15', weeks: 1 } }
}

describe('deriveConflictCore', () => {
  it('returns a truthful core + >=1 applicable relaxation for a real infeasible input', () => {
    const { ctx, schedule, period } = infeasibleFx()
    const { core, relaxations } = deriveConflictCore(ctx, schedule, period)
    expect(core.length).toBeGreaterThan(0)
    expect(core.some((c) => c.cid === 'H1')).toBe(true)
    expect(relaxations.length).toBeGreaterThanOrEqual(1)
    const lower = relaxations.find((r) => /coverage|min/i.test(r.text))
    expect(lower).toBeTruthy()
    expect(typeof lower!.apply).toBe('function')
  })

  it('applying a coverage relaxation lowers the team min so re-solve is feasible (count fits)', () => {
    const { ctx, schedule, period } = infeasibleFx()
    const { relaxations } = deriveConflictCore(ctx, schedule, period)
    const lower = relaxations.find((r) => /coverage|min/i.test(r.text))!
    const patched = lower.apply({})
    // The relaxation must yield a coverageMinOverride that drops min to the
    // achievable headcount (1 eligible emp) for the infeasible (team,shift,date).
    expect(patched.coverageMinOverride).toBeTruthy()
    const dates = eachDate(period)
    for (const d of dates) {
      const v = patched.coverageMinOverride!.get(`T|E|${d}`)
      if (v !== undefined) expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('does NOT fabricate a Night core for a non-night infeasible input', () => {
    const { ctx, schedule, period } = infeasibleFx()
    const { core } = deriveConflictCore(ctx, schedule, period)
    expect(core.every((c) => !/night/i.test(c.text))).toBe(true)
  })

  it('the infeasible fixture genuinely fails hard checks (sanity)', () => {
    const { ctx, schedule, period } = infeasibleFx()
    // empty schedule under min-3 coverage -> H1 under violations exist.
    expect(runHardChecks(ctx, schedule, period).some((v) => v.rule === 'H1')).toBe(true)
  })
})
