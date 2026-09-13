import type {
  Assignment,
  CoverageRow,
  CoverageTable,
  ISODate,
  Period,
  Person,
  Schedule,
  ShiftDef,
  SolveSettings,
  Team,
  Workspace,
  Org,
  WorkspaceMeta,
  WorkspaceRegistry,
} from '@crewdoku/domain'
import { assignmentKey, splitAssignmentKey } from '@crewdoku/domain'

export type CoverageBandDTO = {
  min: number
  max: number | null
}

export type CoverageRowDTO = Record<string, CoverageBandDTO>

export type CoverageTableDTO = {
  byDow: Record<number, CoverageRowDTO>
  dateOverrides: Record<ISODate, CoverageRowDTO>
}

export type ScheduleCellDTO = {
  personId: string
  iso: ISODate
  assignment: Assignment
}

export type ScheduleDTO = {
  periodId: string
  cells: ScheduleCellDTO[]
}

export type WorkspaceDTO = {
  schemaVersion: 1
  people: Person[]
  teams: Team[]
  shifts: ShiftDef[]
  coverage: CoverageTableDTO
  settings: SolveSettings
  periods: Period[]
  schedules: ScheduleDTO[]
}

function coverageRowToDTO(row: CoverageRow): CoverageRowDTO {
  const result: CoverageRowDTO = {}
  for (const [shiftCode, band] of Object.entries(row)) {
    result[shiftCode] = {
      min: band.min,
      max: Number.isFinite(band.max) ? band.max : null,
    }
  }
  return result
}

function coverageRowFromDTO(dto: CoverageRowDTO): CoverageRow {
  const result: CoverageRow = {}
  for (const [shiftCode, bandDTO] of Object.entries(dto)) {
    result[shiftCode] = {
      min: bandDTO.min,
      max: bandDTO.max === null ? Infinity : bandDTO.max,
    }
  }
  return result
}

function coverageTableToDTO(coverage: CoverageTable): CoverageTableDTO {
  const byDow: Record<number, CoverageRowDTO> = {}
  for (const [dowStr, row] of Object.entries(coverage.byDow)) {
    const dow = Number(dowStr)
    byDow[dow] = coverageRowToDTO(row)
  }

  const dateOverrides: Record<ISODate, CoverageRowDTO> = {}
  for (const [iso, row] of Object.entries(coverage.dateOverrides)) {
    dateOverrides[iso] = coverageRowToDTO(row)
  }

  return { byDow, dateOverrides }
}

function coverageTableFromDTO(dto: CoverageTableDTO): CoverageTable {
  const byDow: Record<number, CoverageRow> = {}
  for (const [dowStr, rowDTO] of Object.entries(dto.byDow)) {
    const dow = Number(dowStr)
    byDow[dow] = coverageRowFromDTO(rowDTO)
  }

  const dateOverrides: Record<ISODate, CoverageRow> = {}
  for (const [iso, rowDTO] of Object.entries(dto.dateOverrides)) {
    dateOverrides[iso] = coverageRowFromDTO(rowDTO)
  }

  return { byDow, dateOverrides }
}

function scheduleToDTO(periodId: string, schedule: Schedule): ScheduleDTO {
  const cells: ScheduleCellDTO[] = []
  for (const [key, assignment] of schedule.entries()) {
    const { personId, iso } = splitAssignmentKey(key)
    cells.push({ personId, iso, assignment })
  }
  return { periodId, cells }
}

function scheduleFromDTO(dto: ScheduleDTO): Schedule {
  const schedule: Schedule = new Map()
  for (const cell of dto.cells) {
    schedule.set(assignmentKey(cell.personId, cell.iso), cell.assignment)
  }
  return schedule
}

export function toWorkspaceDTO(workspace: Workspace): WorkspaceDTO {
  const schedulesDTO: ScheduleDTO[] = []
  for (const [periodId, schedule] of workspace.schedules.entries()) {
    schedulesDTO.push(scheduleToDTO(periodId, schedule))
  }

  return {
    schemaVersion: 1,
    people: workspace.people,
    teams: workspace.teams,
    shifts: workspace.shifts,
    coverage: coverageTableToDTO(workspace.coverage),
    settings: workspace.settings,
    periods: workspace.periods,
    schedules: schedulesDTO,
  }
}

export function fromWorkspaceDTO(dto: WorkspaceDTO): Workspace {
  const schedules = new Map<string, Schedule>()
  for (const sDto of dto.schedules) {
    schedules.set(sDto.periodId, scheduleFromDTO(sDto))
  }

  return {
    people: dto.people,
    teams: dto.teams,
    shifts: dto.shifts,
    coverage: coverageTableFromDTO(dto.coverage),
    settings: dto.settings,
    periods: dto.periods,
    schedules,
  }
}

/**
 * Parses and validates schemaVersion on raw unknown input.
 * Version 1 passes through when structurally valid.
 * Unknown or newer versions return null today (seam for version 2+).
 */
export function migrate(raw: unknown): WorkspaceDTO | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const obj: Record<string, unknown> = raw as Record<string, unknown>
  const version = obj['schemaVersion']
  if (version !== 1) {
    return null
  }

  const people = obj['people']
  const teams = obj['teams']
  const shifts = obj['shifts']
  const coverage = obj['coverage']
  const settings = obj['settings']
  const periods = obj['periods']
  const schedules = obj['schedules']

  if (
    !Array.isArray(people) ||
    !Array.isArray(teams) ||
    !Array.isArray(shifts) ||
    typeof coverage !== 'object' ||
    coverage === null ||
    typeof settings !== 'object' ||
    settings === null ||
    !Array.isArray(periods) ||
    !Array.isArray(schedules)
  ) {
    return null
  }

  return {
    schemaVersion: 1,
    people: people as Person[],
    teams: teams as Team[],
    shifts: shifts as ShiftDef[],
    coverage: coverage as CoverageTableDTO,
    settings: settings as SolveSettings,
    periods: periods as Period[],
    schedules: schedules as ScheduleDTO[],
  }
}

/**
 * Parses and validates a WorkspaceRegistry on raw unknown input.
 * schemaVersion 1 with array orgs/workspaces and string|null activeWorkspaceId
 * passes through; anything else returns null (seam for version 2+).
 */
export function migrateRegistry(raw: unknown): WorkspaceRegistry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (obj['schemaVersion'] !== 1) return null
  const orgs = obj['orgs']
  const workspaces = obj['workspaces']
  const active = obj['activeWorkspaceId']
  if (!Array.isArray(orgs) || !Array.isArray(workspaces)) return null
  if (active !== null && typeof active !== 'string') return null
  return {
    schemaVersion: 1,
    orgs: orgs as Org[],
    workspaces: workspaces as WorkspaceMeta[],
    activeWorkspaceId: active,
  }
}
