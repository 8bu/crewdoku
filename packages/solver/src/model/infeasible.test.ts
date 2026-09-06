import { describe, expect, it } from 'vitest'
import type {
  CoverageTable,
  ISODate,
  Person,
  ShiftDef,
  SolveSettings,
} from '@crewdoku/domain'
import {
  DEFAULT_SOLVE_SETTINGS,
  emptySchedule,
  makePerson,
} from '@crewdoku/domain'
import type { ModelInput } from './model'
import { deriveConflictCore } from './infeasible'

const SHIFTS: ShiftDef[] = [
  { code: 'EARLY', label: 'Early', start: '0600', end: '1400', isNight: false },
  { code: 'LATE', label: 'Late', start: '1400', end: '2200', isNight: false },
  { code: 'NIGHT', label: 'Night', start: '2200', end: '0600', isNight: true },
]

function makeModelInput(params: {
  people: Person[]
  coverage: CoverageTable
  period: { start: ISODate; end: ISODate }
  settings?: SolveSettings
}): ModelInput {
  const settings = params.settings ?? DEFAULT_SOLVE_SETTINGS
  const current = emptySchedule(params.people, params.period.start, params.period.end)
  return {
    people: params.people,
    shifts: SHIFTS,
    coverage: params.coverage,
    settings,
    period: params.period,
    current,
  }
}

describe('deriveConflictCore static screening', () => {
  describe('Cause a: Per-shift-date starvation', () => {
    it('detects date-specific coverage starvation and offers relaxation targeting dateOverride', () => {
      const people = [
        makePerson({ id: 'p1', name: 'Alice' }),
        makePerson({ id: 'p2', name: 'Bob' }),
      ]
      const period = { start: '2026-08-17', end: '2026-08-19' } // Mon-Wed
      const coverage: CoverageTable = {
        byDow: {
          1: { EARLY: { min: 1, max: 2 } }, // Mon
          2: { EARLY: { min: 1, max: 2 } },
          3: { EARLY: { min: 1, max: 2 } },
        },
        dateOverrides: {
          '2026-08-17': { EARLY: { min: 3, max: 3 } }, // Needs 3 on Mon, but only 2 people exist
        },
      }

      const input = makeModelInput({ people, coverage, period })
      const originalInputCopy = JSON.parse(JSON.stringify(input)) as typeof input

      const { conflictCore, relaxations } = deriveConflictCore(input)

      expect(conflictCore.length).toBeGreaterThan(0)
      const item = conflictCore.find((c) => c.id.includes('starvation-EARLY-2026-08-17'))
      expect(item).toBeDefined()
      if (item !== undefined) {
        expect(item.ruleIds).toEqual(['H1'])
        expect(item.message).toBe(
          'EARLY on 2026-08-17 needs at least 3 people, but only 2 people can work it.',
        )
      }

      const relax = relaxations.find((r) => r.id.includes('relax-starvation-EARLY-2026-08-17'))
      expect(relax).toBeDefined()
      if (relax !== undefined) {
        expect(relax.label).toBe('Lower EARLY minimum on 2026-08-17 to 2')
        expect(relax.description).toBe(
          'Lower EARLY minimum required headcount on 2026-08-17 from 3 to 2.',
        )

        const relaxedInput = relax.apply(input)
        expect(relaxedInput.coverage.dateOverrides['2026-08-17']?.['EARLY']?.min).toBe(2)
        // Verify purity: original input not mutated
        expect(input.coverage.dateOverrides['2026-08-17']?.['EARLY']?.min).toBe(3)
        expect(JSON.stringify(input)).toEqual(JSON.stringify(originalInputCopy))
      }
    })

    it('detects weekday starvation with H5 contributing when recurringOff reduces headcount', () => {
      const people = [
        makePerson({ id: 'p1', name: 'Alice' }),
        makePerson({ id: 'p2', name: 'Bob', recurringOff: [1] }), // Bob off on Mondays (dow 1)
      ]
      const period = { start: '2026-08-17', end: '2026-08-17' } // Monday
      const coverage: CoverageTable = {
        byDow: {
          1: { EARLY: { min: 2, max: 2 } }, // Needs 2, but Bob is off on Mondays -> only 1 available
        },
        dateOverrides: {},
      }

      const input = makeModelInput({ people, coverage, period })
      const { conflictCore, relaxations } = deriveConflictCore(input)

      const item = conflictCore.find((c) => c.id.includes('starvation-EARLY'))
      expect(item).toBeDefined()
      if (item !== undefined) {
        expect(item.ruleIds).toContain('H1')
        expect(item.ruleIds).toContain('H5')
        expect(item.message).toBe(
          'EARLY on Mondays needs at least 2 people, but only 1 person can work it.',
        )
      }

      const relax = relaxations.find((r) => r.id.includes('relax-starvation-EARLY'))
      expect(relax).toBeDefined()
      if (relax !== undefined) {
        expect(relax.label).toBe('Lower EARLY minimum on Mondays to 1')
        const relaxedInput = relax.apply(input)
        expect(relaxedInput.coverage.byDow[1]?.['EARLY']?.min).toBe(1)
      }
    })
  })

  describe('Cause b: Day total overcommit (H4 structural)', () => {
    it('detects when sum of shift mins exceeds available headcount on a date', () => {
      const people = [
        makePerson({ id: 'p1', name: 'Alice' }),
        makePerson({ id: 'p2', name: 'Bob' }),
        makePerson({ id: 'p3', name: 'Charlie' }),
      ]
      const period = { start: '2026-08-17', end: '2026-08-17' } // 1 day (Monday)
      // EARLY min 2, LATE min 2 -> total 4 mins, but only 3 people exist
      const coverage: CoverageTable = {
        byDow: {
          1: {
            EARLY: { min: 2, max: 2 },
            LATE: { min: 2, max: 2 },
          },
        },
        dateOverrides: {},
      }

      const input = makeModelInput({ people, coverage, period })
      const { conflictCore, relaxations } = deriveConflictCore(input)

      const overcommit = conflictCore.find((c) => c.id.includes('day-overcommit-2026-08-17'))
      expect(overcommit).toBeDefined()
      if (overcommit !== undefined) {
        expect(overcommit.ruleIds).toEqual(['H1'])
        expect(overcommit.message).toBe(
          'Total shift requirements on 2026-08-17 (Monday) need 4 people, but only 3 people are available.',
        )
      }

      const relax = relaxations.find((r) => r.id.includes('relax-day-overcommit-2026-08-17'))
      expect(relax).toBeDefined()
      if (relax !== undefined) {
        // Largest min was 2, overshoot was 4 - 3 = 1 -> new min is 1
        expect(relax.label).toMatch(/Lower (EARLY|LATE) minimum on 2026-08-17 to 1/)
        const relaxedInput = relax.apply(input)
        const dateOverrideRow = relaxedInput.coverage.dateOverrides['2026-08-17']
        expect(dateOverrideRow).toBeDefined()
      }
    })
  })

  describe('Cause c: Weekly-hours capacity (H2)', () => {
    it('detects when demanded weekly hours exceed available capacity and raises maxHoursPerWeek', () => {
      const people = [
        makePerson({ id: 'p1', name: 'Alice' }),
      ]
      // 3 days in week 0: Mon, Tue, Wed. Each has EARLY (8 hours), min 1.
      // Total demanded hours = 3 * 8 = 24 hours.
      // Cap is 20 hours per week -> 1 * 20 = 20 < 24.
      const period = { start: '2026-08-17', end: '2026-08-19' }
      const coverage: CoverageTable = {
        byDow: {
          1: { EARLY: { min: 1, max: 1 } },
          2: { EARLY: { min: 1, max: 1 } },
          3: { EARLY: { min: 1, max: 1 } },
        },
        dateOverrides: {},
      }
      const settings: SolveSettings = {
        ...DEFAULT_SOLVE_SETTINGS,
        hardRules: {
          ...DEFAULT_SOLVE_SETTINGS.hardRules,
          maxHoursPerWeek: 20,
        },
      }

      const input = makeModelInput({ people, coverage, period, settings })
      const { conflictCore, relaxations } = deriveConflictCore(input)

      const item = conflictCore.find((c) => c.id === 'weekly-hours-week-0')
      expect(item).toBeDefined()
      if (item !== undefined) {
        expect(item.ruleIds).toEqual(['H1', 'H2'])
        expect(item.message).toBe(
          'Week 1 demands 24 hours of coverage, but 1 person at 20 hours per week can only supply 20 hours.',
        )
      }

      const relax = relaxations.find((r) => r.id === 'relax-weekly-hours-week-0')
      expect(relax).toBeDefined()
      if (relax !== undefined) {
        expect(relax.label).toBe('Raise weekly hours cap to 24 hours')
        expect(relax.description).toBe(
          'Raise maximum hours per week from 20 hours to 24 hours.',
        )

        const relaxedInput = relax.apply(input)
        expect(relaxedInput.settings.hardRules.maxHoursPerWeek).toBe(24)
        expect(input.settings.hardRules.maxHoursPerWeek).toBe(20) // original unchanged
      }
    })
  })

  describe('Cause d: Rest-pair lock (H3)', () => {
    it('detects when consecutive shifts with < minRest force the same person to work both', () => {
      // Alice is the only person.
      // Day 1 (Mon): LATE (14:00 - 22:00), min 1.
      // Day 2 (Tue): EARLY (06:00 - 14:00), min 1.
      // Rest between LATE and EARLY is 8h. minRestHours is 11h.
      // Headcount = 1. Both shifts need 1 person -> Alice must work both -> violates H3.
      const people = [
        makePerson({ id: 'p1', name: 'Alice' }),
      ]
      const period = { start: '2026-08-17', end: '2026-08-18' }
      const coverage: CoverageTable = {
        byDow: {
          1: { LATE: { min: 1, max: 1 } },
          2: { EARLY: { min: 1, max: 1 } },
        },
        dateOverrides: {},
      }
      const settings: SolveSettings = {
        ...DEFAULT_SOLVE_SETTINGS,
        hardRules: {
          ...DEFAULT_SOLVE_SETTINGS.hardRules,
          minRestHours: 11,
        },
      }

      const input = makeModelInput({ people, coverage, period, settings })
      const { conflictCore, relaxations } = deriveConflictCore(input)

      const item = conflictCore.find((c) =>
        c.id.includes('rest-lock-LATE-2026-08-17-EARLY-2026-08-18'),
      )
      expect(item).toBeDefined()
      if (item !== undefined) {
        expect(item.ruleIds).toEqual(['H1', 'H3'])
        expect(item.message).toBe(
          'LATE on 2026-08-17 followed by EARLY on 2026-08-18 gives only 8 hours of rest, but minimum rest is 11 hours.',
        )
      }

      const relax = relaxations.find((r) =>
        r.id.includes('relax-rest-lock-LATE-2026-08-17-EARLY-2026-08-18'),
      )
      expect(relax).toBeDefined()
      if (relax !== undefined) {
        expect(relax.label).toBe('Lower minimum rest to 8 hours')
        expect(relax.description).toBe(
          'Lower minimum rest between shifts from 11 hours to 8 hours.',
        )

        const relaxedInput = relax.apply(input)
        expect(relaxedInput.settings.hardRules.minRestHours).toBe(8)
        expect(input.settings.hardRules.minRestHours).toBe(11) // unchanged
      }
    })
  })

  describe('Fallback', () => {
    it('returns honest fallback when static screening finds no provable cause', () => {
      const people = [makePerson({ id: 'p1', name: 'Alice' })]
      const period = { start: '2026-08-17', end: '2026-08-17' }
      const coverage: CoverageTable = {
        byDow: {},
        dateOverrides: {},
      }
      const input = makeModelInput({ people, coverage, period })
      const { conflictCore, relaxations } = deriveConflictCore(input)

      expect(conflictCore).toHaveLength(1)
      const firstCore = conflictCore[0]
      expect(firstCore).toBeDefined()
      if (firstCore !== undefined) {
        expect(firstCore.id).toBe('fallback')
        expect(firstCore.message).toBe(
          'The rules conflict in a way the analyzer cannot name.',
        )
      }
      expect(relaxations.length).toBeGreaterThan(0)
    })
  })
})
