import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  UNASSIGNED_TEAM_ID,
  addDays,
  assignmentKey,
  type Assignment,
  type Person,
  type Team,
} from '@crewdoku/domain'
import { applyPatch, type Overrides } from '../board/editHistory'
import type { ScheduleState } from '../state/schedule'
import type { ScheduleFilters } from '../state/scheduleFilters'
import type { Period } from '../state/shell'
import {
  buildDayStacks,
  buildShiftChangePatches,
  buildSwapPatches,
  type CalendarSource,
} from './calendarModel'

const NO_FILTERS: ScheduleFilters = { query: '', teamIds: [], shiftCodes: [], showLeave: true }

const TEAMS: Team[] = [
  { id: 't1', name: 'Bar', wants: [], avoids: [] },
  { id: 't2', name: 'Kitchen', wants: [], avoids: [] },
]

/** 2026-01-05 is a Monday; the periods below are contiguous and week-aligned. */
function period(id: string, start: string, end: string): Period {
  return { id, label: id, start, end, setup: 'ready' }
}
const P1_PERIOD = period('p1', '2026-01-05', '2026-01-11')
const P2_PERIOD = period('p2', '2026-01-12', '2026-01-18')
const P3_PERIOD = period('p3', '2026-01-19', '2026-01-25')

function person(id: string, name: string, teamId = 't1', extra: Partial<Person> = {}): Person {
  return { id, name, teamId, ineligible: [], ...extra }
}

function assignment(code: string): Assignment {
  const times: Record<string, [string | null, string | null]> = {
    EARLY: ['0600', '1400'],
    MID: ['1000', '1800'],
    LATE: ['1400', '2200'],
    NIGHT: ['2200', '0600'],
    OFF: [null, null],
  }
  const [start, end] = times[code]!
  return { code, start, end, pinned: false, ineligible: false }
}

/** A solved period: `personId|iso -> code`, every other cell off. */
function solved(p: Period, people: Person[], codes: Record<string, string>): ScheduleState {
  const assignments = new Map<string, Assignment>()
  for (const person of people) {
    for (let iso = p.start; iso <= p.end; iso = addDays(iso, 1)) {
      assignments.set(assignmentKey(person.id, iso), assignment(codes[assignmentKey(person.id, iso)] ?? 'OFF'))
    }
  }
  return { assignments, hasSchedule: true }
}

function source(init: Partial<CalendarSource> = {}): CalendarSource {
  return {
    periods: [],
    schedules: {},
    overrides: {},
    people: [],
    teams: [],
    shifts: DEFAULT_SHIFTS,
    settings: DEFAULT_SOLVE_SETTINGS,
    ...init,
  }
}

/** Applies a patch to a period's overrides, the way an edit or an undo does. */
function patched(overrides: Overrides | undefined, patch: Map<string, Assignment | undefined>): Overrides {
  return applyPatch(overrides ?? new Map(), patch)
}

describe('buildDayStacks', () => {
  const people = [
    person('p1', 'Zed'),
    person('p2', 'Anna'),
    person('p3', 'Chloe', 't2'),
    person('p4', 'Dan'),
    person('p5', 'Eve', UNASSIGNED_TEAM_ID),
  ]
  const codes = {
    'p1|2026-01-05': 'MID',
    'p2|2026-01-05': 'MID',
    'p3|2026-01-05': 'EARLY',
    'p4|2026-01-05': 'NIGHT',
  }
  const base = source({
    periods: [P1_PERIOD],
    schedules: { p1: solved(P1_PERIOD, people, codes) },
    people,
    teams: TEAMS,
  })

  it('groups by catalog shift code in catalog order, chips in roster order', () => {
    const stack = buildDayStacks(base, ['2026-01-05'], NO_FILTERS).get('2026-01-05')!

    expect(stack.groups.map((g) => g.code)).toEqual(['EARLY', 'MID', 'NIGHT'])
    expect(stack.groups.map((g) => g.label)).toEqual(['Early', 'Mid', 'Night'])
    expect(stack.groups.map((g) => g.color)).toEqual(['amber', 'teal', 'navy'])
    expect(stack.groups[1]!.chips.map((c) => c.name)).toEqual(['Zed', 'Anna'])
    expect(stack.periodId).toBe('p1')
    expect(stack.editable).toBe(true)
  })

  it('never lists OFF, and drops removed people', () => {
    const withRemoved = source({
      ...base,
      people: [...people.slice(0, 4), { ...person('p6', 'Rex'), removed: true }],
      schedules: { p1: solved(P1_PERIOD, [...people, person('p6', 'Rex')], { ...codes, 'p6|2026-01-05': 'LATE' }) },
    })
    const stack = buildDayStacks(withRemoved, ['2026-01-05'], NO_FILTERS).get('2026-01-05')!

    const names = stack.groups.flatMap((g) => g.chips.map((c) => c.name))
    expect(names).toEqual(['Chloe', 'Zed', 'Anna', 'Dan'])
    expect(stack.groups.some((g) => g.code === 'OFF')).toBe(false)
    expect(stack.groups.some((g) => g.code === 'LATE')).toBe(false)
  })

  it('lists leave only while the leave filter is on, and keeps it off the shift lines', () => {
    const withLeave = source({
      ...base,
      people: people.map((p) => (p.id === 'p2' ? { ...p, timeOff: ['2026-01-05'] } : p)),
    })
    const shown = buildDayStacks(withLeave, ['2026-01-05'], NO_FILTERS).get('2026-01-05')!
    expect(shown.leave.map((c) => c.name)).toEqual(['Anna'])
    expect(shown.groups.flatMap((g) => g.chips.map((c) => c.name))).toContain('Anna')

    const hidden = buildDayStacks(withLeave, ['2026-01-05'], { ...NO_FILTERS, showLeave: false }).get('2026-01-05')!
    expect(hidden.leave).toEqual([])
    expect(hidden.groups.flatMap((g) => g.chips.map((c) => c.name))).toContain('Anna')
  })

  it('narrows people by search and team, and shift lines by code', () => {
    const withLeave = source({
      ...base,
      people: people.map((p) => (p.id === 'p1' ? { ...p, timeOff: ['2026-01-05'] } : p)),
    })

    const searched = buildDayStacks(withLeave, ['2026-01-05'], { ...NO_FILTERS, query: 'ann' }).get('2026-01-05')!
    expect(searched.groups.map((g) => g.code)).toEqual(['MID'])
    expect(searched.groups[0]!.chips.map((c) => c.name)).toEqual(['Anna'])
    expect(searched.leave).toEqual([])

    const team = buildDayStacks(withLeave, ['2026-01-05'], { ...NO_FILTERS, teamIds: ['t2'] }).get('2026-01-05')!
    expect(team.groups.flatMap((g) => g.chips.map((c) => c.name))).toEqual(['Chloe'])

    const shift = buildDayStacks(withLeave, ['2026-01-05'], { ...NO_FILTERS, shiftCodes: ['MID'] }).get('2026-01-05')!
    expect(shift.groups.map((g) => g.code)).toEqual(['MID'])
    expect(shift.groups[0]!.chips.map((c) => c.name)).toEqual(['Zed', 'Anna'])
  })

  it('leaves days with no period, and days in an unsolved period, empty but still bookable', () => {
    const away = person('p2', 'Anna', 't1', { timeOff: ['2026-01-04', '2026-01-19'] })
    const stacks = buildDayStacks(
      source({ ...base, periods: [P1_PERIOD, P3_PERIOD], people: [people[0]!, away, people[2]!, people[3]!, people[4]!] }),
      ['2026-01-04', '2026-01-19'],
      NO_FILTERS,
    )

    const uncovered = stacks.get('2026-01-04')!
    expect(uncovered.periodId).toBeNull()
    expect(uncovered.editable).toBe(false)
    expect(uncovered.groups).toEqual([])
    expect(uncovered.leave.map((c) => c.name)).toEqual(['Anna'])

    const unsolved = stacks.get('2026-01-19')!
    expect(unsolved.periodId).toBe('p3')
    expect(unsolved.editable).toBe(false)
    expect(unsolved.groups).toEqual([])
    expect(unsolved.leave.map((c) => c.name)).toEqual(['Anna'])
  })
})

describe('buildDayStacks rule flags', () => {
  const anna = person('p1', 'Anna')
  const people = [anna]

  it('flags a short rest inside a period, on the chip of the later day', () => {
    const schedule = solved(P1_PERIOD, people, {
      'p1|2026-01-05': 'NIGHT',
      'p1|2026-01-06': 'EARLY',
    })
    const stacks = buildDayStacks(source({ periods: [P1_PERIOD], schedules: { p1: schedule }, people }), [
      '2026-01-05',
      '2026-01-06',
    ], NO_FILTERS)

    expect(stacks.get('2026-01-05')!.groups[0]!.chips[0]!.flags).toEqual([])
    const flagged = stacks.get('2026-01-06')!.groups[0]!.chips[0]!
    expect(flagged.flags.map((f) => f.kind)).toEqual(['rest'])
    expect(flagged.flags[0]!.message).toContain('rest')
  })

  it('flags a short rest across a period edge, on the in-period day of each side', () => {
    const before = solved(P1_PERIOD, people, { 'p1|2026-01-11': 'NIGHT' })
    const after = solved(P2_PERIOD, people, { 'p1|2026-01-12': 'EARLY' })
    const stacks = buildDayStacks(
      source({
        periods: [P1_PERIOD, P2_PERIOD],
        schedules: { p1: before, p2: after },
        people,
      }),
      ['2026-01-11', '2026-01-12'],
      NO_FILTERS,
    )

    // Night (the last day) into an early (the next period's first day) is no
    // rest at all, so each side describes the same break from its own day.
    expect(stacks.get('2026-01-11')!.groups[0]!.chips[0]!.flags.map((f) => f.kind)).toEqual(['rest'])
    expect(stacks.get('2026-01-12')!.groups[0]!.chips[0]!.flags.map((f) => f.kind)).toEqual(['rest'])
  })

  it('flags someone scheduled on a booked day off', () => {
    const scheduled = person('p1', 'Anna', 't1', { timeOff: ['2026-01-05'] })
    const schedule = solved(P1_PERIOD, [scheduled], { 'p1|2026-01-05': 'EARLY' })
    const stack = buildDayStacks(
      source({ periods: [P1_PERIOD], schedules: { p1: schedule }, people: [scheduled] }),
      ['2026-01-05'],
      NO_FILTERS,
    ).get('2026-01-05')!

    expect(stack.groups[0]!.chips[0]!.flags.map((f) => f.kind)).toEqual(['unavailable'])
    expect(stack.leave[0]!.flags.map((f) => f.kind)).toEqual(['unavailable'])
  })

  it('flags on the calendar a pin the board would flag the same way', () => {
    const ineligible = person('p1', 'Anna', 't1', { ineligible: ['EARLY'] })
    const stack = buildDayStacks(
      source({
        periods: [P1_PERIOD],
        schedules: { p1: solved(P1_PERIOD, [ineligible], {}) },
        people: [ineligible],
        overrides: {
          p1: new Map([[assignmentKey('p1', '2026-01-05'), { ...assignment('EARLY'), pinned: true, ineligible: true }]]),
        },
      }),
      ['2026-01-05'],
      NO_FILTERS,
    ).get('2026-01-05')!

    expect(stack.groups[0]!.code).toBe('EARLY')
    expect(stack.groups[0]!.chips[0]!.flags.map((f) => f.kind)).toEqual(['ineligible'])
  })
})

describe('buildSwapPatches', () => {
  const people = [person('p1', 'Anna')]
  const twoPeriods = source({
    periods: [P1_PERIOD, P2_PERIOD],
    schedules: {
      p1: solved(P1_PERIOD, people, { 'p1|2026-01-05': 'EARLY', 'p1|2026-01-06': 'MID', 'p1|2026-01-11': 'EARLY' }),
      p2: solved(P2_PERIOD, people, { 'p1|2026-01-12': 'MID' }),
    },
    people,
  })

  it('trades the two days inside one period as a single patch, and undo restores the base', () => {
    const patches = buildSwapPatches(twoPeriods, 'p1', '2026-01-05', '2026-01-06')!
    expect(patches.map((p) => p.periodId)).toEqual(['p1'])

    const patch = patches[0]!
    expect(patch.forward.get(assignmentKey('p1', '2026-01-05'))!.code).toBe('MID')
    expect(patch.forward.get(assignmentKey('p1', '2026-01-06'))!.code).toBe('EARLY')
    expect(patch.forward.get(assignmentKey('p1', '2026-01-05'))!.pinned).toBe(true)

    const applied = patched(twoPeriods.overrides['p1'], patch.forward)
    expect(applied.get(assignmentKey('p1', '2026-01-05'))!.code).toBe('MID')
    expect(applied.has(assignmentKey('p1', '2026-01-06'))).toBe(true)

    const undone = patched(applied, patch.backward)
    expect(undone.has(assignmentKey('p1', '2026-01-05'))).toBe(false)
    expect(undone.has(assignmentKey('p1', '2026-01-06'))).toBe(false)
  })

  it('keeps an earlier pin on the day it belonged to, and restores it on undo', () => {
    const pinned: Overrides = new Map([[assignmentKey('p1', '2026-01-05'), { ...assignment('NIGHT'), pinned: true }]])
    const withPin = source({ ...twoPeriods, overrides: { p1: pinned } })

    const patch = buildSwapPatches(withPin, 'p1', '2026-01-05', '2026-01-06')![0]!
    expect(patch.forward.get(assignmentKey('p1', '2026-01-05'))!.code).toBe('MID')
    expect(patch.forward.get(assignmentKey('p1', '2026-01-06'))!.code).toBe('NIGHT')

    const undone = patched(patched(pinned, patch.forward), patch.backward)
    expect(undone.get(assignmentKey('p1', '2026-01-05'))).toEqual({ ...assignment('NIGHT'), pinned: true })
    expect(undone.has(assignmentKey('p1', '2026-01-06'))).toBe(false)
  })

  it('patches both periods when the swap crosses a period edge', () => {
    const patches = buildSwapPatches(twoPeriods, 'p1', '2026-01-11', '2026-01-12')!
    expect(patches.map((p) => p.periodId)).toEqual(['p1', 'p2'])
    expect(patches[0]!.forward.get(assignmentKey('p1', '2026-01-11'))!.code).toBe('MID')
    expect(patches[1]!.forward.get(assignmentKey('p1', '2026-01-12'))!.code).toBe('EARLY')

    let overrides: Record<string, Overrides> = {}
    for (const patch of patches) overrides = { ...overrides, [patch.periodId]: patched(overrides[patch.periodId], patch.forward) }
    expect(overrides.p1!.get(assignmentKey('p1', '2026-01-11'))!.code).toBe('MID')
    expect(overrides.p2!.get(assignmentKey('p1', '2026-01-12'))!.code).toBe('EARLY')

    for (const patch of patches) overrides = { ...overrides, [patch.periodId]: patched(overrides[patch.periodId], patch.backward) }
    expect(overrides.p1!.has(assignmentKey('p1', '2026-01-11'))).toBe(false)
    expect(overrides.p2!.has(assignmentKey('p1', '2026-01-12'))).toBe(false)
  })

  it('refuses a drop it cannot honour', () => {
    const unsolved = source({ ...twoPeriods, schedules: { p1: twoPeriods.schedules.p1! } })
    const sameCode = source({
      ...twoPeriods,
      schedules: {
        ...twoPeriods.schedules,
        p1: solved(P1_PERIOD, people, { 'p1|2026-01-05': 'EARLY', 'p1|2026-01-06': 'EARLY' }),
      },
    })

    expect(buildSwapPatches(twoPeriods, 'p1', '2026-01-05', '2026-01-05')).toBeNull()
    expect(buildSwapPatches(twoPeriods, 'p1', '2026-01-05', '2026-02-01')).toBeNull()
    expect(buildSwapPatches(unsolved, 'p1', '2026-01-05', '2026-01-12')).toBeNull()
    expect(buildSwapPatches(sameCode, 'p1', '2026-01-05', '2026-01-06')).toBeNull()
    expect(buildSwapPatches(twoPeriods, 'nobody', '2026-01-05', '2026-01-06')).toBeNull()
  })

  it('trades a shift for a day off, in either direction', () => {
    const off = source({ ...twoPeriods, schedules: { p1: solved(P1_PERIOD, people, { 'p1|2026-01-05': 'EARLY' }) } })
    const patch = buildSwapPatches(off, 'p1', '2026-01-05', '2026-01-06')![0]!
    expect(patch.forward.get(assignmentKey('p1', '2026-01-05'))!.code).toBe('OFF')
    expect(patch.forward.get(assignmentKey('p1', '2026-01-06'))!.code).toBe('EARLY')

    const reversed = buildSwapPatches(off, 'p1', '2026-01-06', '2026-01-05')![0]!
    expect(reversed.forward.get(assignmentKey('p1', '2026-01-06'))!.code).toBe('EARLY')
    expect(reversed.forward.get(assignmentKey('p1', '2026-01-05'))!.code).toBe('OFF')
  })
})

describe('buildShiftChangePatches', () => {
  const ineligible = person('p1', 'Anna', 't1', { ineligible: ['NIGHT'] })
  const base = source({
    periods: [P1_PERIOD],
    schedules: { p1: solved(P1_PERIOD, [ineligible], { 'p1|2026-01-05': 'EARLY' }) },
    people: [ineligible],
  })

  it('writes a pinned hand-edit, flagged when the person cannot work the code', () => {
    const patch = buildShiftChangePatches(base, 'p1', '2026-01-05', 'NIGHT')![0]!
    expect(patch.periodId).toBe('p1')
    expect(patch.forward.get(assignmentKey('p1', '2026-01-05'))).toEqual({
      code: 'NIGHT',
      start: '2200',
      end: '0600',
      pinned: true,
      ineligible: true,
    })

    const undone = patched(patched(base.overrides.p1, patch.forward), patch.backward)
    expect(undone.has(assignmentKey('p1', '2026-01-05'))).toBe(false)
  })

  it('accepts off, and a change onto a day nobody was scheduled', () => {
    const off = buildShiftChangePatches(base, 'p1', '2026-01-05', 'OFF')![0]!
    expect(off.forward.get(assignmentKey('p1', '2026-01-05'))!.code).toBe('OFF')

    const onto = buildShiftChangePatches(base, 'p1', '2026-01-07', 'MID')![0]!
    expect(onto.forward.get(assignmentKey('p1', '2026-01-07'))!.code).toBe('MID')
  })

  it('refuses an unchanged code and a day that cannot be edited', () => {
    const unsolved = source({ ...base, schedules: {} })

    expect(buildShiftChangePatches(base, 'p1', '2026-01-05', 'EARLY')).toBeNull()
    expect(buildShiftChangePatches(base, 'p1', '2026-02-01', 'MID')).toBeNull()
    expect(buildShiftChangePatches(unsolved, 'p1', '2026-01-05', 'MID')).toBeNull()
    expect(buildShiftChangePatches(base, 'nobody', '2026-01-05', 'MID')).toBeNull()
  })
})
