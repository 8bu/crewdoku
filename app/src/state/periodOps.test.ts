import { describe, expect, it } from 'vitest'
import { createStore } from 'jotai'
import { deletePeriodAtom, updatePeriodAtom } from './periodOps'
import { periodsAtom, selectedPeriodIdAtom, type Period } from './shell'
import { scheduleByPeriodAtom } from './schedule'
import { overridesByPeriodAtom } from './boardOverrides'
import { dirtyByPeriodAtom } from './settingsDirty'
import { autoGenerateOnMountAtom, onboardedPeriodsAtom } from './onboarding'
import { peopleAtom } from './roster'
import { teamsAtom } from './teams'
import { shiftsAtom } from './shifts'
import { coverageAtom } from './coverageRules'
import { solveSettingsAtom } from './solveSettings'
import {
  assignmentKey,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  type Assignment,
  type Person,
  type ShiftDef,
  type Team,
} from '@crewdoku/domain'

const PERIOD: Period = {
  id: 'px',
  label: 'October',
  start: '2026-10-05',
  end: '2026-10-08',
  setup: 'ready',
}

const PERSON: Person = {
  id: 'alice',
  name: 'Alice',
  teamId: 't1',
  ineligible: [],
  wants: [],
  avoids: [],
}

function assignment(code: string): Assignment {
  return { code: code as Assignment['code'], start: null, end: null, pinned: false, ineligible: false }
}

function seededStore() {
  const store = createStore()
  store.set(periodsAtom, [PERIOD])
  store.set(peopleAtom, [PERSON])
  const assignments = new Map<string, Assignment>()
  for (const iso of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) {
    assignments.set(assignmentKey('alice', iso), assignment(iso === '2026-10-06' ? 'EARLY' : 'OFF'))
  }
  store.set(scheduleByPeriodAtom, { px: { assignments, hasSchedule: true } })
  return store
}

describe('updatePeriodAtom', () => {
  it('updates label, start, and end in place', () => {
    const store = seededStore()
    store.set(updatePeriodAtom, { id: 'px', label: 'Oct v2', start: '2026-10-06', end: '2026-10-07' })
    expect(store.get(periodsAtom)[0]).toMatchObject({ label: 'Oct v2', start: '2026-10-06', end: '2026-10-07' })
  })

  it('a blank label keeps the existing one while dates still apply', () => {
    const store = seededStore()
    store.set(updatePeriodAtom, { id: 'px', label: '   ', start: '2026-10-06', end: '2026-10-08' })
    expect(store.get(periodsAtom)[0]).toMatchObject({ label: 'October', start: '2026-10-06', end: '2026-10-08' })
  })

  it('ignores inverted and empty date ranges instead of half-applying', () => {
    const store = seededStore()
    store.set(updatePeriodAtom, { id: 'px', label: 'Oct', start: '2026-10-08', end: '2026-10-05' })
    store.set(updatePeriodAtom, { id: 'px', label: 'Oct', start: '', end: '2026-10-08' })
    expect(store.get(periodsAtom)[0]).toMatchObject({ label: 'October', start: '2026-10-05', end: '2026-10-08' })
  })

  it('shrinking the range drops assignments for dates that left it', () => {
    const store = seededStore()
    store.set(updatePeriodAtom, { id: 'px', label: 'Oct', start: '2026-10-06', end: '2026-10-07' })
    const { assignments } = store.get(scheduleByPeriodAtom).px!
    expect(assignments.size).toBe(2)
    expect(assignments.get(assignmentKey('alice', '2026-10-06'))?.code).toBe('EARLY')
    expect(assignments.has(assignmentKey('alice', '2026-10-05'))).toBe(false)
  })

  it('growing the range fills newly covered dates with OFF, keeping existing cells', () => {
    const store = seededStore()
    store.set(updatePeriodAtom, { id: 'px', label: 'Oct', start: '2026-10-04', end: '2026-10-09' })
    const { assignments } = store.get(scheduleByPeriodAtom).px!
    expect(assignments.size).toBe(6)
    expect(assignments.get(assignmentKey('alice', '2026-10-04'))?.code).toBe('OFF')
    expect(assignments.get(assignmentKey('alice', '2026-10-06'))?.code).toBe('EARLY')
  })

  it('prunes hand-edit overrides that fall outside the new range', () => {
    const store = seededStore()
    store.set(overridesByPeriodAtom, {
      px: new Map([
        [assignmentKey('alice', '2026-10-05'), assignment('LATE')],
        [assignmentKey('alice', '2026-10-06'), assignment('LATE')],
      ]),
    })
    store.set(updatePeriodAtom, { id: 'px', label: 'Oct', start: '2026-10-06', end: '2026-10-08' })
    const overrides = store.get(overridesByPeriodAtom).px!
    expect(overrides.has(assignmentKey('alice', '2026-10-05'))).toBe(false)
    expect(overrides.has(assignmentKey('alice', '2026-10-06'))).toBe(true)
  })

  it('a pure rename leaves the schedule untouched', () => {
    const store = seededStore()
    const before = store.get(scheduleByPeriodAtom).px!.assignments
    store.set(updatePeriodAtom, { id: 'px', label: 'Renamed', start: PERIOD.start, end: PERIOD.end })
    expect(store.get(scheduleByPeriodAtom).px!.assignments).toBe(before)
  })
})

describe('deletePeriodAtom', () => {
  const PERIOD_A: Period = { id: 'pa', label: 'Period A', start: '2026-10-01', end: '2026-10-14', setup: 'ready' }
  const PERIOD_B: Period = { id: 'pb', label: 'Period B', start: '2026-10-15', end: '2026-10-28', setup: 'ready' }
  const TEAMS: Team[] = [{ id: 't1', name: 'Team 1', wants: [], avoids: [] }]
  const SHIFTS: ShiftDef[] = [{ code: 'EARLY', label: 'Early', start: '0600', end: '1400' }]

  it('deletes the period and drops per-period schedule/overrides/dirty/onboarding entries', () => {
    const store = createStore()
    store.set(periodsAtom, [PERIOD_A, PERIOD_B])
    store.set(selectedPeriodIdAtom, 'pa')
    store.set(scheduleByPeriodAtom, { pa: { assignments: new Map(), hasSchedule: true }, pb: { assignments: new Map(), hasSchedule: true } })
    store.set(overridesByPeriodAtom, { pa: new Map(), pb: new Map() })
    store.set(dirtyByPeriodAtom, { pa: true, pb: false })
    store.set(autoGenerateOnMountAtom, new Set(['pa', 'pb']))
    store.set(onboardedPeriodsAtom, new Set(['pa', 'pb']))

    // Set workspace-global atoms
    store.set(peopleAtom, [PERSON])
    store.set(teamsAtom, TEAMS)
    store.set(shiftsAtom, SHIFTS)
    store.set(coverageAtom, defaultCoverageTable(SHIFTS, 1))
    store.set(solveSettingsAtom, DEFAULT_SOLVE_SETTINGS)

    store.set(deletePeriodAtom, 'pa')

    // Period list updated
    expect(store.get(periodsAtom)).toEqual([PERIOD_B])

    // Per-period records dropped for pa
    expect(store.get(scheduleByPeriodAtom)).not.toHaveProperty('pa')
    expect(store.get(scheduleByPeriodAtom)).toHaveProperty('pb')
    expect(store.get(overridesByPeriodAtom)).not.toHaveProperty('pa')
    expect(store.get(overridesByPeriodAtom)).toHaveProperty('pb')
    expect(store.get(dirtyByPeriodAtom)).not.toHaveProperty('pa')
    expect(store.get(dirtyByPeriodAtom)).toHaveProperty('pb')
    expect(store.get(autoGenerateOnMountAtom).has('pa')).toBe(false)
    expect(store.get(autoGenerateOnMountAtom).has('pb')).toBe(true)
    expect(store.get(onboardedPeriodsAtom).has('pa')).toBe(false)
    expect(store.get(onboardedPeriodsAtom).has('pb')).toBe(true)

    // Workspace-global atoms survive unchanged
    expect(store.get(peopleAtom)).toEqual([PERSON])
    expect(store.get(teamsAtom)).toEqual(TEAMS)
    expect(store.get(shiftsAtom)).toEqual(SHIFTS)
    expect(store.get(coverageAtom)).not.toBeNull()
    expect(store.get(solveSettingsAtom)).toEqual(DEFAULT_SOLVE_SETTINGS)
  })

  it('refuses to delete the last remaining period', () => {
    const store = createStore()
    store.set(periodsAtom, [PERIOD_A])
    store.set(deletePeriodAtom, 'pa')
    expect(store.get(periodsAtom)).toEqual([PERIOD_A])
  })

  it('selects the remaining period that starts latest when deleting selected period', () => {
    const PERIOD_C: Period = { id: 'pc', label: 'Period C', start: '2026-11-01', end: '2026-11-14', setup: 'ready' }
    const store = createStore()
    store.set(periodsAtom, [PERIOD_A, PERIOD_B, PERIOD_C])
    store.set(selectedPeriodIdAtom, 'pa')

    store.set(deletePeriodAtom, 'pa')
    // Latest start among remaining (pb vs pc) is pc ('2026-11-01')
    expect(store.get(selectedPeriodIdAtom)).toBe('pc')
  })
})
