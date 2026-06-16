import { newId } from '../ids'
import type {
  Coverage,
  Employee,
  ID,
  Org,
  Rules,
  Shift,
  Team,
} from './types'

export function makeOrg(input: { id?: ID; name: string }): Org {
  return { id: input.id ?? newId(), name: input.name }
}

export function makeTeam(input: { id?: ID; name: string; shiftIds: ID[] }): Team {
  return { id: input.id ?? newId(), name: input.name, shiftIds: input.shiftIds }
}

export function makeShift(input: {
  id?: ID
  code: string
  name: string
  startHour: number
  endHour: number
  isNight: boolean
}): Shift {
  return {
    id: input.id ?? newId(),
    code: input.code,
    name: input.name,
    startHour: input.startHour,
    endHour: input.endHour,
    isNight: input.isNight,
  }
}

export function makeEmployee(input: {
  id?: ID
  name: string
  teamId: ID
  eligibleShiftIds: ID[]
  contract?: Employee['contract']
  timeOff?: Employee['timeOff']
  recurring?: Employee['recurring']
  prefs?: Partial<Employee['prefs']>
}): Employee {
  return {
    id: input.id ?? newId(),
    name: input.name,
    teamId: input.teamId,
    eligibleShiftIds: input.eligibleShiftIds,
    contract: input.contract ?? {},
    timeOff: input.timeOff ?? [],
    recurring: input.recurring ?? [],
    prefs: {
      night: input.prefs?.night ?? 'willing',
      weekend: input.prefs?.weekend ?? 'willing',
      ...(input.prefs?.preferredShiftId !== undefined
        ? { preferredShiftId: input.prefs.preferredShiftId }
        : {}),
      notes: input.prefs?.notes ?? '',
    },
  }
}

export function makeCoverage(input: {
  teamId: ID
  shiftId: ID
  byDow?: { min: number; max: number }[]
  dateOverrides?: Coverage['dateOverrides']
}): Coverage {
  return {
    teamId: input.teamId,
    shiftId: input.shiftId,
    byDow: input.byDow ?? Array.from({ length: 7 }, () => ({ min: 0, max: 0 })),
    dateOverrides: input.dateOverrides ?? {},
  }
}

export function makeRules(input?: Partial<Rules>): Rules {
  return {
    maxHoursPerWeek: input?.maxHoursPerWeek ?? 48,
    minRestHours: input?.minRestHours ?? 11,
    maxConsecutiveDays: input?.maxConsecutiveDays ?? 6,
    enabled: input?.enabled ?? {
      H1: true,
      H2: true,
      H3: true,
      H4: true,
      H5: true,
      H6: true,
      S1: true,
      S2: true,
      S3: true,
      S4: true,
      S5: true,
    },
    weights: input?.weights ?? { S1: 8, S2: 6, S3: 4, S4: 5, S5: 3 },
  }
}
