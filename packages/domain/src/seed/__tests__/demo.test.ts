import { describe, it, expect } from 'vitest'
import { buildDemo } from '../demo'
import { buildContext } from '../../constraints/context'
import { runHardChecks } from '../../constraints/registry'
import { makeSchedule } from '../../schedule/schedule'

describe('demo seed', () => {
  it('constructs entities with nanoid ids and a real assignment schedule', () => {
    const d = buildDemo()
    expect(d.org).not.toBeNull()
    expect(d.teams.length).toBeGreaterThan(0)
    expect(d.shifts.length).toBeGreaterThan(0)
    expect(d.employees.length).toBeGreaterThan(0)
    expect(d.employees[0]!.id).toBeTruthy()
    expect(d.assignments.length).toBeGreaterThan(0)
  })

  it('is multi-week (weeks >= 2) and has at least one night shift', () => {
    const d = buildDemo()
    expect(d.period.weeks).toBeGreaterThanOrEqual(2)
    expect(d.shifts.some((s) => s.isNight)).toBe(true)
  })

  it('seeds at least one explicit day off (shiftId: null)', () => {
    const d = buildDemo()
    expect(d.assignments.some((a) => a.shiftId === null)).toBe(true)
  })

  it('seeded schedule has no hard-constraint violations (feasible baseline)', () => {
    const d = buildDemo()
    // AppStateDTO.org is Org | null; the demo always seeds one. buildContext
    // takes Org | undefined, so normalize null -> undefined.
    const ctx = buildContext({ ...d, org: d.org ?? undefined })
    const s = makeSchedule(d.assignments)
    expect(runHardChecks(ctx, s, d.period)).toEqual([])
  })
})
