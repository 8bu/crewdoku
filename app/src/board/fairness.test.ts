import { describe, expect, it } from 'vitest'
import { computeFairness } from './fairness'
import { DEFAULT_SHIFTS, type Assignment, type Person } from '@crewdoku/domain'
import type { BoardDate } from './mockBoard'

function person(id: string): Person {
  return { id, name: id, teamId: 't1', ineligible: [] }
}

function date(iso: string, weekday: number): BoardDate {
  return {
    iso,
    weekday,
    dayOfMonth: 7,
    monthShort: 'Jan',
    isWeekend: weekday === 0 || weekday === 6,
    isMonday: weekday === 1,
    weekIndex: 0,
    holidayName: null,
  }
}

function assignment(code: Assignment['code']): Assignment {
  const times: Record<string, [string, string] | [null, null]> = {
    EARLY: ['0600', '1400'],
    MID: ['1000', '1800'],
    LATE: ['1400', '2200'],
    NIGHT: ['2200', '0600'],
    OFF: [null, null],
  }
  const [start, end] = times[code]!
  return { code, start, end, pinned: false, ineligible: false }
}

function board(assignments: Record<string, Assignment>) {
  return (personId: string, dateIso: string) => assignments[`${personId}|${dateIso}`] ?? assignment('OFF')
}

describe('computeFairness', () => {
  // Mon..Sun, one full week.
  const dates = [1, 2, 3, 4, 5, 6, 0].map((weekday, i) => date(`2026-01-0${i + 5}`, weekday))

  it('totals hours as 8 per non-OFF shift, and counts nights and weekends separately', () => {
    const p = person('p1')
    const get = board({
      [`p1|${dates[0]!.iso}`]: assignment('EARLY'),
      [`p1|${dates[1]!.iso}`]: assignment('NIGHT'),
      [`p1|${dates[2]!.iso}`]: assignment('OFF'),
      [`p1|${dates[3]!.iso}`]: assignment('LATE'),
      [`p1|${dates[4]!.iso}`]: assignment('NIGHT'),
      [`p1|${dates[5]!.iso}`]: assignment('NIGHT'), // Saturday
      [`p1|${dates[6]!.iso}`]: assignment('OFF'), // Sunday
    })
    const totals = computeFairness([p], dates, get, DEFAULT_SHIFTS, 40)
    const row = totals.byPerson.get('p1')!
    expect(row.hours).toBe(5 * 8)
    expect(row.nights).toBe(3)
    expect(row.weekends).toBe(1) // only Saturday was worked, Sunday was OFF
  })

  it('sets the cap at 40h per week in the period', () => {
    const totals = computeFairness([person('p1')], dates, board({}), DEFAULT_SHIFTS, 40)
    expect(totals.hoursCap).toBe(40) // one week
  })

  it('reports the highest total as maxHours, ties included', () => {
    const [a, b, c] = [person('a'), person('b'), person('c')]
    const get = board({
      [`a|${dates[0]!.iso}`]: assignment('EARLY'),
      [`b|${dates[0]!.iso}`]: assignment('EARLY'),
      [`b|${dates[1]!.iso}`]: assignment('EARLY'),
      [`c|${dates[0]!.iso}`]: assignment('OFF'),
    })
    const totals = computeFairness([a, b, c], dates, get, DEFAULT_SHIFTS, 40)
    expect(totals.maxHours).toBe(16)
    expect(totals.byPerson.get('a')!.hours).toBe(8)
    expect(totals.byPerson.get('c')!.hours).toBe(0)
  })
})
