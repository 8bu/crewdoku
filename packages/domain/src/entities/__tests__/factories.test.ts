import { describe, it, expect } from 'vitest'
import {
  makeOrg,
  makeShift,
  makeTeam,
  makeEmployee,
  makeCoverage,
  makeRules,
} from '../factories'

describe('factories', () => {
  it('assign nanoid ids and sensible defaults', () => {
    const s = makeShift({
      code: 'NGT',
      name: 'Night',
      startHour: 1,
      endHour: 6,
      isNight: true,
    })
    expect(s.id).toBeTruthy()
    const t = makeTeam({ name: 'QA', shiftIds: [s.id] })
    expect(t.id).toBeTruthy()
    const e = makeEmployee({ name: 'Ada', teamId: t.id, eligibleShiftIds: t.shiftIds })
    expect(e.id).toBeTruthy()
    expect(e.eligibleShiftIds).toEqual([s.id]) // defaults to team's set passed in
    expect(e.contract).toEqual({})
    expect(e.timeOff).toEqual([])
    expect(e.recurring).toEqual([])
    expect(e.prefs.night).toBe('willing')
  })
  it('accepts an explicit id for deterministic tests', () => {
    expect(
      makeShift({
        id: 'fixed',
        code: 'E',
        name: 'Early',
        startHour: 5,
        endHour: 11,
        isNight: false,
      }).id,
    ).toBe('fixed')
  })
  it('makeOrg assigns an id and name', () => {
    const o = makeOrg({ name: 'Acme' })
    expect(o.id).toBeTruthy()
    expect(o.name).toBe('Acme')
  })
  it('makeCoverage defaults byDow to length-7 {min:0,max:0} and empty overrides', () => {
    const c = makeCoverage({ teamId: 'T', shiftId: 'S' })
    expect(c.byDow.length).toBe(7)
    expect(c.byDow.every((d) => d.min === 0 && d.max === 0)).toBe(true)
    expect(c.dateOverrides).toEqual({})
  })
  it('makeRules supplies default caps, all-enabled, and default weights', () => {
    const r = makeRules()
    expect(r.maxHoursPerWeek).toBe(48)
    expect(r.minRestHours).toBe(11)
    expect(r.maxConsecutiveDays).toBe(6)
    expect(Object.values(r.enabled).every(Boolean)).toBe(true)
    expect(r.weights).toEqual({ S1: 8, S2: 6, S3: 4, S4: 5, S5: 3 })
  })
})
