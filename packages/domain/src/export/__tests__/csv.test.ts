import { describe, it, expect } from 'vitest'
import { exportTeamCSV, exportMemberCSV } from '../csv'
import {
  makeShift,
  makeTeam,
  makeEmployee,
  makeRules,
} from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

function fx() {
  const e = makeShift({
    id: 'E',
    code: 'E',
    name: 'Early',
    startHour: 5,
    endHour: 13,
    isNight: false,
  })
  const team = makeTeam({ id: 'T', name: 'T', shiftIds: ['E'] })
  const a = makeEmployee({
    id: 'a',
    name: 'Ada, Lovelace',
    teamId: 'T',
    eligibleShiftIds: ['E'],
  }) // comma -> quoting
  const ctx = buildContext({
    teams: [team],
    shifts: [e],
    employees: [a],
    coverages: [],
    rules: makeRules(),
  })
  const s = makeSchedule()
  setAssignment(s, { employeeId: 'a', date: '2026-06-15', shiftId: 'E' })
  setAssignment(s, { employeeId: 'a', date: '2026-06-16', shiftId: null })
  return { ctx, s }
}

describe('CSV export', () => {
  it('team grid: rows=employees, cols=dates, shift code per cell, quoted fields', () => {
    const { ctx, s } = fx()
    const csv = exportTeamCSV(ctx, s, { startDate: '2026-06-15', weeks: 1 })
    const lines = csv.split('\n')
    expect(lines[0]).toContain('"2026-06-15"')
    expect(lines[1]).toContain('"Ada, Lovelace"') // comma forces quoting
    expect(lines[1]).toContain('"E"')
  })

  it('member list: one row per scheduled date [date,dow,shiftCode,start,end,hours]', () => {
    const { ctx, s } = fx()
    const csv = exportMemberCSV(ctx, s, 'a', {
      startDate: '2026-06-15',
      weeks: 1,
    })
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('"date","dow","shiftCode","start","end","hours"')
    expect(lines[1]).toBe('"2026-06-15","Mon","E","05:00","13:00","8"')
    // day off (null) is NOT a scheduled date -> excluded
    expect(lines.length).toBe(2)
  })
})
