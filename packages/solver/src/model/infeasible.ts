import type {
  CoverageBand,
  CoverageRow,
  CoverageTable,
  HardRuleId,
  ISODate,
  Person,
  ShiftCode,
  ShiftDef,
} from '@crewdoku/domain'
import {
  activePeople,
  coverageBandFor,
  eachDate,
  getAssignment,
  restHoursBetween,
  paidHours,
  weekdayOf,
  weekIndexOf,
} from '@crewdoku/domain'
import type { ModelInput } from './model'

export interface ConflictCoreItem {
  id: string
  ruleIds: HardRuleId[]
  message: string
  /** Structured cause for locale-aware rendering; `message` is the English fallback. */
  kind: string
  params: Record<string, string | number>
}

export interface Relaxation {
  id: string
  label: string
  description: string
  /** Structured fix for locale-aware rendering; `label` is the English fallback. */
  kind: string
  params: Record<string, string | number>
  apply(input: ModelInput): ModelInput
}

export interface ConflictResult {
  conflictCore: ConflictCoreItem[]
  relaxations: Relaxation[]
}

const WEEKDAY_NAMES: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const WEEKDAY_PLURALS: readonly string[] = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
]

function cloneCoverage(coverage: CoverageTable): CoverageTable {
  const byDow: Record<number, CoverageRow> = {}
  for (const [dowStr, row] of Object.entries(coverage.byDow)) {
    const dowNum = Number(dowStr)
    const newRow: CoverageRow = {}
    for (const [code, band] of Object.entries(row)) {
      newRow[code] = { min: band.min, max: band.max }
    }
    byDow[dowNum] = newRow
  }
  const dateOverrides: Record<ISODate, CoverageRow> = {}
  for (const [iso, row] of Object.entries(coverage.dateOverrides)) {
    const newRow: CoverageRow = {}
    for (const [code, band] of Object.entries(row)) {
      newRow[code] = { min: band.min, max: band.max }
    }
    dateOverrides[iso] = newRow
  }
  return { byDow, dateOverrides }
}

function adjustCoverageBand(
  coverage: CoverageTable,
  shiftCode: ShiftCode,
  date: ISODate,
  dow: number,
  targetDateOverride: boolean,
  newMin: number,
): CoverageTable {
  const cloned = cloneCoverage(coverage)
  if (targetDateOverride) {
    const existingDateRow = cloned.dateOverrides[date] ?? {}
    const existingBand = coverageBandFor(coverage, shiftCode, date, dow)
    const updatedBand: CoverageBand = {
      min: newMin,
      max: Math.max(newMin, existingBand.max),
    }
    cloned.dateOverrides[date] = {
      ...existingDateRow,
      [shiftCode]: updatedBand,
    }
  } else {
    const existingDowRow = cloned.byDow[dow] ?? {}
    const existingBand = coverageBandFor(coverage, shiftCode, date, dow)
    const updatedBand: CoverageBand = {
      min: newMin,
      max: Math.max(newMin, existingBand.max),
    }
    cloned.byDow[dow] = {
      ...existingDowRow,
      [shiftCode]: updatedBand,
    }
  }
  return cloned
}

interface PersonEligibility {
  canWork: boolean
  blockedByH5: boolean
  blockedByDateSpecificFactor: boolean
}

function evaluatePersonForShift(
  person: Person,
  shiftCode: ShiftCode,
  date: ISODate,
  dow: number,
  input: ModelInput,
): PersonEligibility {
  const pin = getAssignment(input.current, person.id, date)
  if (pin.pinned) {
    if (pin.code === shiftCode) {
      return { canWork: true, blockedByH5: false, blockedByDateSpecificFactor: false }
    }
    return { canWork: false, blockedByH5: false, blockedByDateSpecificFactor: true }
  }

  const isShiftIneligible = person.ineligible.includes(shiftCode)
  if (isShiftIneligible) {
    return { canWork: false, blockedByH5: false, blockedByDateSpecificFactor: false }
  }

  const isH5Enabled = input.settings.hardRules.enabled.H5
  const isTimeOff = person.timeOff !== undefined && person.timeOff.includes(date)
  const isRecurringOff = person.recurringOff !== undefined && person.recurringOff.includes(dow)
  const isH5Blocked = isH5Enabled && (isTimeOff || isRecurringOff)

  if (isH5Blocked) {
    return {
      canWork: false,
      blockedByH5: true,
      blockedByDateSpecificFactor: isTimeOff,
    }
  }

  return { canWork: true, blockedByH5: false, blockedByDateSpecificFactor: false }
}

function evaluatePersonAvailableOnDate(
  person: Person,
  date: ISODate,
  dow: number,
  shifts: readonly ShiftDef[],
  input: ModelInput,
): { available: boolean; blockedByH5: boolean } {
  const pin = getAssignment(input.current, person.id, date)
  if (pin.pinned) {
    return { available: pin.code !== 'OFF', blockedByH5: false }
  }

  const isH5Enabled = input.settings.hardRules.enabled.H5
  const isTimeOff = person.timeOff !== undefined && person.timeOff.includes(date)
  const isRecurringOff = person.recurringOff !== undefined && person.recurringOff.includes(dow)
  const isH5Blocked = isH5Enabled && (isTimeOff || isRecurringOff)

  if (isH5Blocked) {
    return { available: false, blockedByH5: true }
  }

  // Person must be eligible for at least one shift
  const canWorkAnyShift = shifts.some((s) => !person.ineligible.includes(s.code))
  return { available: canWorkAnyShift, blockedByH5: false }
}

/**
 * Derives a truthful conflict core and applicable relaxations through static screening.
 */
export function deriveConflictCore(input: ModelInput): ConflictResult {
  const conflictCore: ConflictCoreItem[] = []
  const relaxations: Relaxation[] = []

  const dates = eachDate(input.period.start, input.period.end)
  const active = activePeople(input.people)
  const shifts = input.shifts
  const hardRules = input.settings.hardRules

  // Map dates by dow
  const datesByDow = new Map<number, ISODate[]>()
  for (const d of dates) {
    const dow = weekdayOf(d)
    const list = datesByDow.get(dow) ?? []
    list.push(d)
    datesByDow.set(dow, list)
  }

  // =========================================================================
  // a. PER-SHIFT-DATE STARVATION
  // =========================================================================
  if (hardRules.enabled.H1) {
    const seenWeekdayStarvations = new Set<string>()

    for (const d of dates) {
      const dow = weekdayOf(d)
      for (const shift of shifts) {
        const band = coverageBandFor(input.coverage, shift.code, d, dow)
        if (band.min <= 0) continue

        let availableCount = 0
        let h5BlockCount = 0
        let dateSpecificBlockCount = 0

        for (const person of active) {
          const evalResult = evaluatePersonForShift(person, shift.code, d, dow, input)
          if (evalResult.canWork) {
            availableCount++
          } else {
            if (evalResult.blockedByH5) {
              h5BlockCount++
            }
            if (evalResult.blockedByDateSpecificFactor) {
              dateSpecificBlockCount++
            }
          }
        }

        if (availableCount < band.min) {
          const h5Contributed = h5BlockCount > 0
          const ruleIds: HardRuleId[] = h5Contributed ? ['H1', 'H5'] : ['H1']

          const hasExplicitDateOverride = input.coverage.dateOverrides[d]?.[shift.code] !== undefined
          const isDateSpecific = hasExplicitDateOverride || dateSpecificBlockCount > 0

          const dowPlural = WEEKDAY_PLURALS[dow] ?? 'days'
          const targetLabel = isDateSpecific ? `on ${d}` : `on ${dowPlural}`
          const minNoun = band.min === 1 ? '1 person' : `${band.min} people`
          const availNoun = availableCount === 1 ? '1 person' : `${availableCount} people`

          if (!isDateSpecific) {
            const weekdayKey = `${dow}|${shift.code}`
            if (seenWeekdayStarvations.has(weekdayKey)) {
              continue
            }
            seenWeekdayStarvations.add(weekdayKey)
          }

          const message = `${shift.code} ${targetLabel} needs at least ${minNoun}, but only ${availNoun} can work it.`
          const label = `Lower ${shift.code} minimum ${targetLabel} to ${availableCount}`
          const description = `Lower ${shift.code} minimum required headcount ${targetLabel} from ${band.min} to ${availableCount}.`

          const coreId = isDateSpecific
            ? `starvation-${shift.code}-${d}`
            : `starvation-${shift.code}-${dowPlural}`
          const relaxationId = isDateSpecific
            ? `relax-starvation-${shift.code}-${d}`
            : `relax-starvation-${shift.code}-${dowPlural}`

          conflictCore.push({
            id: coreId,
            ruleIds,
            message,
            kind: isDateSpecific ? 'starvation.date' : 'starvation.dow',
            params: isDateSpecific
              ? { shift: shift.code, date: d, min: band.min, avail: availableCount }
              : { shift: shift.code, dow, min: band.min, avail: availableCount },
          })

          relaxations.push({
            id: relaxationId,
            label,
            description,
            kind: isDateSpecific ? 'starvation.date' : 'starvation.dow',
            params: isDateSpecific
              ? { shift: shift.code, date: d, from: band.min, to: availableCount }
              : { shift: shift.code, dow, from: band.min, to: availableCount },
            apply(oldInput: ModelInput): ModelInput {
              const updatedCoverage = adjustCoverageBand(
                oldInput.coverage,
                shift.code,
                d,
                dow,
                isDateSpecific,
                availableCount,
              )
              return {
                ...oldInput,
                coverage: updatedCoverage,
              }
            },
          })
        }
      }
    }
  }

  // =========================================================================
  // b. DAY TOTAL OVERCOMMIT
  // =========================================================================
  if (hardRules.enabled.H1) {
    for (const d of dates) {
      const dow = weekdayOf(d)
      let dayMinSum = 0
      let largestShift: ShiftDef | null = null
      let largestMin = -1

      for (const shift of shifts) {
        const band = coverageBandFor(input.coverage, shift.code, d, dow)
        if (band.min > 0) {
          dayMinSum += band.min
          if (band.min > largestMin) {
            largestMin = band.min
            largestShift = shift
          }
        }
      }

      let availablePeopleCount = 0
      let h5BlockCount = 0
      for (const person of active) {
        const avail = evaluatePersonAvailableOnDate(person, d, dow, shifts, input)
        if (avail.available) {
          availablePeopleCount++
        } else if (avail.blockedByH5) {
          h5BlockCount++
        }
      }

      if (dayMinSum > availablePeopleCount && largestShift !== null && largestMin > 0) {
        const overshoot = dayMinSum - availablePeopleCount
        const ruleIds: HardRuleId[] = h5BlockCount > 0 ? ['H1', 'H5'] : ['H1']

        const coreId = `day-overcommit-${d}`
        const dowName = WEEKDAY_NAMES[dow] ?? 'day'
        const reqNoun = dayMinSum === 1 ? '1 person' : `${dayMinSum} people`
        const availNoun = availablePeopleCount === 1 ? '1 person' : `${availablePeopleCount} people`
        const message = `Total shift requirements on ${d} (${dowName}) need ${reqNoun}, but only ${availNoun} are available.`

        const newMin = Math.max(0, largestMin - overshoot)
        const relaxationId = `relax-day-overcommit-${d}`
        const label = `Lower ${largestShift.code} minimum on ${d} to ${newMin}`
        const description = `Lower ${largestShift.code} minimum on ${d} from ${largestMin} to ${newMin} to resolve the daily overcommit of ${overshoot}.`

        conflictCore.push({
          id: coreId,
          ruleIds,
          message,
          kind: 'dayOvercommit',
          params: { date: d, dow, req: dayMinSum, avail: availablePeopleCount },
        })

        const chosenShift = largestShift
        relaxations.push({
          id: relaxationId,
          label,
          description,
          kind: 'dayOvercommit',
          params: { shift: chosenShift.code, date: d, from: largestMin, to: newMin, overshoot },
          apply(oldInput: ModelInput): ModelInput {
            const updatedCoverage = adjustCoverageBand(
              oldInput.coverage,
              chosenShift.code,
              d,
              dow,
              true,
              newMin,
            )
            return {
              ...oldInput,
              coverage: updatedCoverage,
            }
          },
        })
      }
    }
  }

  // =========================================================================
  // c. WEEKLY-HOURS CAPACITY
  // =========================================================================
  if (hardRules.enabled.H1 && hardRules.enabled.H2) {
    const weekBuckets = new Map<number, ISODate[]>()
    for (const d of dates) {
      const w = weekIndexOf(input.period.start, d)
      const list = weekBuckets.get(w) ?? []
      list.push(d)
      weekBuckets.set(w, list)
    }

    const maxHours = hardRules.maxHoursPerWeek
    const totalCapacity = active.length * maxHours

    for (const [w, weekDates] of weekBuckets) {
      let demandedHours = 0
      for (const d of weekDates) {
        const dow = weekdayOf(d)
        for (const shift of shifts) {
          const band = coverageBandFor(input.coverage, shift.code, d, dow)
          if (band.min > 0) {
            const dur = paidHours(shifts, shift.code)
            demandedHours += band.min * dur
          }
        }
      }

      if (demandedHours > totalCapacity) {
        const neededPerPerson = active.length > 0 ? Math.ceil(demandedHours / active.length) : demandedHours
        const coreId = `weekly-hours-week-${w}`
        const peopleNoun = active.length === 1 ? '1 person' : `${active.length} people`
        const message = `Week ${w + 1} demands ${demandedHours} hours of coverage, but ${peopleNoun} at ${maxHours} hours per week can only supply ${totalCapacity} hours.`

        const label = `Raise weekly hours cap to ${neededPerPerson} hours`
        const description = `Raise maximum hours per week from ${maxHours} hours to ${neededPerPerson} hours.`

        conflictCore.push({
          id: coreId,
          ruleIds: ['H1', 'H2'],
          message,
          kind: 'weeklyHours',
          params: { week: w + 1, demanded: demandedHours, people: active.length, maxHours, supply: totalCapacity },
        })

        relaxations.push({
          id: `relax-weekly-hours-week-${w}`,
          label,
          description,
          kind: 'weeklyHours',
          params: { from: maxHours, to: neededPerPerson },
          apply(oldInput: ModelInput): ModelInput {
            return {
              ...oldInput,
              settings: {
                ...oldInput.settings,
                hardRules: {
                  ...oldInput.settings.hardRules,
                  maxHoursPerWeek: neededPerPerson,
                },
              },
            }
          },
        })
      }
    }
  }

  // =========================================================================
  // d. REST-PAIR LOCK
  // =========================================================================
  if (hardRules.enabled.H1 && hardRules.enabled.H3) {
    const minRest = hardRules.minRestHours

    for (let i = 0; i + 1 < dates.length; i++) {
      const d1 = dates[i]
      const d2 = dates[i + 1]
      if (d1 === undefined || d2 === undefined) continue

      const dow1 = weekdayOf(d1)
      const dow2 = weekdayOf(d2)

      for (const sA of shifts) {
        const bandA = coverageBandFor(input.coverage, sA.code, d1, dow1)
        if (bandA.min < 1) continue

        for (const sB of shifts) {
          const bandB = coverageBandFor(input.coverage, sB.code, d2, dow2)
          if (bandB.min < 1) continue

          const gap = restHoursBetween(shifts, sA.code, sB.code)
          if (gap === null || gap >= minRest) continue

          // shifts sA and sB on consecutive dates d1 and d2 are rest-incompatible!
          // Check who can work shift sA on d1 and shift sB on d2
          const poolA = new Set<string>()
          const poolB = new Set<string>()

          for (const person of active) {
            const resA = evaluatePersonForShift(person, sA.code, d1, dow1, input)
            if (resA.canWork) poolA.add(person.id)

            const resB = evaluatePersonForShift(person, sB.code, d2, dow2, input)
            if (resB.canWork) poolB.add(person.id)
          }

          // Total distinct available people for either shift
          const combinedAvailable = new Set([...poolA, ...poolB])
          const minSum = bandA.min + bandB.min

          // Provable lock: if total available people for both shifts < min sum,
          // by pigeonhole principle at least (minSum - combinedAvailable.size) people
          // MUST work both sA on d1 and sB on d2, which is rest-incompatible.
          if (combinedAvailable.size < minSum && poolA.size >= bandA.min && poolB.size >= bandB.min) {
            const coreId = `rest-lock-${sA.code}-${d1}-${sB.code}-${d2}`
            const message = `${sA.code} on ${d1} followed by ${sB.code} on ${d2} gives only ${gap} hours of rest, but minimum rest is ${minRest} hours.`

            const label = `Lower minimum rest to ${gap} hours`
            const description = `Lower minimum rest between shifts from ${minRest} hours to ${gap} hours.`

            conflictCore.push({
              id: coreId,
              ruleIds: ['H1', 'H3'],
              message,
              kind: 'restLock',
              params: { shiftA: sA.code, dateA: d1, shiftB: sB.code, dateB: d2, gap, minRest },
            })

            relaxations.push({
              id: `relax-rest-lock-${sA.code}-${d1}-${sB.code}-${d2}`,
              label,
              description,
              kind: 'restLock',
              params: { from: minRest, to: gap },
              apply(oldInput: ModelInput): ModelInput {
                return {
                  ...oldInput,
                  settings: {
                    ...oldInput.settings,
                    hardRules: {
                      ...oldInput.settings.hardRules,
                      minRestHours: gap,
                    },
                  },
                }
              },
            })
          }
        }
      }
    }
  }

  // =========================================================================
  // Fallback if screening finds nothing
  // =========================================================================
  if (conflictCore.length === 0) {
    const enabledRuleIds: HardRuleId[] = []
    if (hardRules.enabled.H1) enabledRuleIds.push('H1')
    if (hardRules.enabled.H2) enabledRuleIds.push('H2')
    if (hardRules.enabled.H3) enabledRuleIds.push('H3')
    if (hardRules.enabled.H5) enabledRuleIds.push('H5')

    conflictCore.push({
      id: 'fallback',
      ruleIds: enabledRuleIds,
      message: 'The rules conflict in a way the analyzer cannot name.',
      kind: 'fallback',
      params: {},
    })

    if (hardRules.enabled.H1) {
      relaxations.push({
        id: 'fallback-relax-h1',
        label: 'Lower all coverage minimums by 1',
        description: 'Lower all positive shift minimums across all days by 1.',
        kind: 'fallbackH1',
        params: {},
        apply(oldInput: ModelInput): ModelInput {
          const cloned = cloneCoverage(oldInput.coverage)
          for (const row of Object.values(cloned.byDow)) {
            for (const band of Object.values(row)) {
              if (band.min > 0) {
                band.min -= 1
              }
            }
          }
          for (const row of Object.values(cloned.dateOverrides)) {
            for (const band of Object.values(row)) {
              if (band.min > 0) {
                band.min -= 1
              }
            }
          }
          return {
            ...oldInput,
            coverage: cloned,
          }
        },
      })
    }

    if (hardRules.enabled.H2) {
      const oldMax = hardRules.maxHoursPerWeek
      const newMax = oldMax + 8
      relaxations.push({
        id: 'fallback-relax-h2',
        label: `Raise weekly hours cap to ${newMax} hours`,
        description: `Raise maximum hours per week from ${oldMax} hours to ${newMax} hours.`,
        kind: 'fallbackH2',
        params: { from: oldMax, to: newMax },
        apply(oldInput: ModelInput): ModelInput {
          return {
            ...oldInput,
            settings: {
              ...oldInput.settings,
              hardRules: {
                ...oldInput.settings.hardRules,
                maxHoursPerWeek: newMax,
              },
            },
          }
        },
      })
    }

    if (hardRules.enabled.H3) {
      const oldRest = hardRules.minRestHours
      const newRest = Math.max(0, oldRest - 2)
      relaxations.push({
        id: 'fallback-relax-h3',
        label: `Lower minimum rest to ${newRest} hours`,
        description: `Lower minimum rest between shifts from ${oldRest} hours to ${newRest} hours.`,
        kind: 'fallbackH3',
        params: { from: oldRest, to: newRest },
        apply(oldInput: ModelInput): ModelInput {
          return {
            ...oldInput,
            settings: {
              ...oldInput.settings,
              hardRules: {
                ...oldInput.settings.hardRules,
                minRestHours: newRest,
              },
            },
          }
        },
      })
    }
  }

  return {
    conflictCore,
    relaxations,
  }
}
