import { describe, expect, it } from 'vitest'
import { createStore } from 'jotai'
import {
  addPeriodAtom,
  createPeriod,
  findOverlap,
  findOverlappingPeriodIds,
  periodsAtom,
  selectedPeriodIdAtom,
  type Period,
} from './shell'

const PERIOD_A: Period = { id: 'pa', label: 'Period A', start: '2026-10-01', end: '2026-10-14', setup: 'ready' }
const PERIOD_B: Period = { id: 'pb', label: 'Period B', start: '2026-10-15', end: '2026-10-28', setup: 'ready' }

describe('createPeriod', () => {
  it('resolves a 1-week length to a 7-day inclusive range across a month boundary', () => {
    const period = createPeriod('October', '2026-09-28', 'week', 'ready')
    expect(period.start).toBe('2026-09-28')
    expect(period.end).toBe('2026-10-04')
  })

  it('resolves a 1-month length to a 28-day inclusive range', () => {
    const period = createPeriod('October', '2026-09-28', 'month', 'ready')
    expect(period.end).toBe('2026-10-25')
  })
})

describe('findOverlap', () => {
  const periods = [PERIOD_A, PERIOD_B]

  it('treats a shared day at either end as an overlap', () => {
    // 2026-10-14 is A's last day and 2026-10-15 is B's first.
    expect(findOverlap([PERIOD_A], { start: '2026-10-14', end: '2026-10-20' })).toBe(PERIOD_A)
    expect(findOverlap([PERIOD_B], { start: '2026-10-10', end: '2026-10-15' })).toBe(PERIOD_B)
  })

  it('treats a range swallowed by another period as an overlap', () => {
    expect(findOverlap(periods, { start: '2026-10-03', end: '2026-10-04' })).toBe(PERIOD_A)
  })

  it('treats adjacent and far-away ranges as no overlap', () => {
    expect(findOverlap(periods, { start: '2026-10-29', end: '2026-11-11' })).toBeNull()
    expect(findOverlap(periods, { start: '2026-09-01', end: '2026-09-30' })).toBeNull()
  })

  it('ignores the period being edited, so an existing overlap can be fixed', () => {
    const overlapping = [PERIOD_A, { ...PERIOD_B, start: '2026-10-10' }]
    expect(findOverlap(overlapping, { start: '2026-10-14', end: '2026-10-28' }, 'pb')).toBe(PERIOD_A)
    // pb moved clear of pa: its own old range must not count against it.
    expect(findOverlap(overlapping, { start: '2026-10-15', end: '2026-10-28' }, 'pb')).toBeNull()
  })
})

describe('findOverlappingPeriodIds', () => {
  it('marks every period caught in a pair, leaving adjacent ones out', () => {
    const tangled: Period[] = [
      PERIOD_A,
      PERIOD_B,
      { id: 'pc', label: 'Period C', start: '2026-10-20', end: '2026-11-02', setup: 'ready' },
    ]
    expect([...findOverlappingPeriodIds(tangled)].sort()).toEqual(['pb', 'pc'])
    expect(findOverlappingPeriodIds([PERIOD_A, PERIOD_B]).size).toBe(0)
  })
})

describe('addPeriodAtom', () => {
  function storeWith(periods: Period[]) {
    const store = createStore()
    store.set(periodsAtom, periods)
    store.set(selectedPeriodIdAtom, 'pa')
    return store
  }

  it('refuses a period that shares a day with an existing one', () => {
    const store = storeWith([PERIOD_A])
    store.set(addPeriodAtom, { id: 'pb', label: 'Period B', start: '2026-10-10', end: '2026-10-23', setup: 'ready' })
    expect(store.get(periodsAtom)).toEqual([PERIOD_A])
    expect(store.get(selectedPeriodIdAtom)).toBe('pa')
  })
})
