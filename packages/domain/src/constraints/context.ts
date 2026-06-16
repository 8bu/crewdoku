import { dow } from '../calendar/calendar'
import { makeRules } from '../entities/factories'
import type {
  Coverage,
  Employee,
  ID,
  ISODate,
  Org,
  Rules,
  Shift,
  Team,
} from '../entities/types'

export interface SolveContextInput {
  org?: Org
  teams: Team[]
  shifts: Shift[]
  employees: Employee[]
  coverages: Coverage[]
  rules?: Rules
}

export interface SolveContext {
  org?: Org
  teams: Team[]
  shifts: Shift[]
  employees: Employee[]
  coverages: Coverage[]
  rules: Rules
  shiftById: Map<ID, Shift>
  teamById: Map<ID, Team>
  employeeById: Map<ID, Employee>
  coverageByTeamShift: Map<string, Coverage>
  /** endHour - startHour (endHour may exceed 24 for cross-midnight shifts). */
  shiftHours(shiftId: ID): number
  /** dateOverrides[date] ?? byDow[dow(date)] ?? {min:0,max:0}. */
  effectiveCoverage(
    teamId: ID,
    shiftId: ID,
    date: ISODate,
  ): { min: number; max: number }
}

export function coverageKey(teamId: ID, shiftId: ID): string {
  return `${teamId}|${shiftId}`
}

export function buildContext(input: SolveContextInput): SolveContext {
  const { org, teams, shifts, employees, coverages } = input
  const rules = input.rules ?? makeRules()

  const shiftById = new Map<ID, Shift>(shifts.map((s) => [s.id, s]))
  const teamById = new Map<ID, Team>(teams.map((t) => [t.id, t]))
  const employeeById = new Map<ID, Employee>(employees.map((e) => [e.id, e]))
  const coverageByTeamShift = new Map<string, Coverage>(
    coverages.map((c) => [coverageKey(c.teamId, c.shiftId), c]),
  )

  function shiftHours(shiftId: ID): number {
    const s = shiftById.get(shiftId)
    if (!s) return 0
    return s.endHour - s.startHour
  }

  function effectiveCoverage(
    teamId: ID,
    shiftId: ID,
    date: ISODate,
  ): { min: number; max: number } {
    const cov = coverageByTeamShift.get(coverageKey(teamId, shiftId))
    if (!cov) return { min: 0, max: 0 }
    const override = cov.dateOverrides[date]
    if (override) return override
    const byDow = cov.byDow[dow(date)]
    if (byDow) return byDow
    return { min: 0, max: 0 }
  }

  return {
    ...(org !== undefined ? { org } : {}),
    teams,
    shifts,
    employees,
    coverages,
    rules,
    shiftById,
    teamById,
    employeeById,
    coverageByTeamShift,
    shiftHours,
    effectiveCoverage,
  }
}
