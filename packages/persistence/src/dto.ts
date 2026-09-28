import type {
  Assignment,
  CoverageRow,
  CoverageTable,
  HardRuleId,
  ISODate,
  Period,
  Person,
  Schedule,
  ShiftDef,
  SoftGoalId,
  SolveSettings,
  Tag,
  TagGroup,
  Team,
  Workspace,
  Org,
  WorkspaceMeta,
  WorkspaceRegistry,
} from '@crewdoku/domain'
import {
  assignmentKey,
  DEFAULT_SOLVE_SETTINGS,
  HARD_RULE_IDS,
  SOFT_GOAL_IDS,
  splitAssignmentKey,
} from '@crewdoku/domain'

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
  /** Absent in blobs written before tags existed; readers treat it as `[]`. */
  tagGroups?: TagGroup[]
  /** Absent in blobs written before tags existed; readers treat it as `[]`. */
  tags?: Tag[]
  shifts: ShiftDef[]
  coverage: CoverageTableDTO
  /** Per-tag coverage bands (H7), keyed by `Tag.id`; absent means `{}`. */
  tagCoverage?: Record<string, CoverageTableDTO>
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

/** Per-tag tables share the coverage converters; only the keying differs. */
function tagCoverageToDTO(tagCoverage: Record<string, CoverageTable>): Record<string, CoverageTableDTO> {
  const result: Record<string, CoverageTableDTO> = {}
  for (const [tagId, table] of Object.entries(tagCoverage)) {
    result[tagId] = coverageTableToDTO(table)
  }
  return result
}

function tagCoverageFromDTO(dto: Record<string, CoverageTableDTO>): Record<string, CoverageTable> {
  const result: Record<string, CoverageTable> = {}
  for (const [tagId, tableDTO] of Object.entries(dto)) {
    result[tagId] = coverageTableFromDTO(tableDTO)
  }
  return result
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
    tagGroups: workspace.tagGroups,
    tags: workspace.tags,
    shifts: workspace.shifts,
    coverage: coverageTableToDTO(workspace.coverage),
    tagCoverage: tagCoverageToDTO(workspace.tagCoverage),
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
    tagGroups: dto.tagGroups ?? [],
    tags: dto.tags ?? [],
    shifts: dto.shifts,
    coverage: coverageTableFromDTO(dto.coverage),
    tagCoverage: tagCoverageFromDTO(dto.tagCoverage ?? {}),
    settings: dto.settings,
    periods: dto.periods,
    schedules,
  }
}

/** True for `{ byDow, dateOverrides }` — the shape every coverage table shares. */
function isCoverageTableDTO(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const { byDow, dateOverrides } = value as { byDow?: unknown; dateOverrides?: unknown }
  return (
    typeof byDow === 'object' && byDow !== null && typeof dateOverrides === 'object' && dateOverrides !== null
  )
}

function isTagGroup(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const { id, name } = value as { id?: unknown; name?: unknown }
  return typeof id === 'string' && typeof name === 'string'
}

function isTag(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const { id, rules } = value as { id?: unknown; rules?: unknown }
  return typeof id === 'string' && Array.isArray(rules)
}

function isTagCoverage(raw: unknown): raw is Record<string, CoverageTableDTO> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false
  return Object.values(raw).every(isCoverageTableDTO)
}

/**
 * Brings stored settings up to the current rule set. A blob written before
 * H6/H7 or S6 existed gets them with their defaults: both hard rules on, S6
 * enabled and ranked immediately above S2 (the end of the list when S2 is
 * gone). Complete settings pass through unchanged, so this is idempotent.
 */
function migrateSettings(settings: SolveSettings): SolveSettings {
  // Read through a loose view: stored blobs may predate these keys entirely.
  const raw = settings as unknown as {
    hardRules?: {
      enabled?: Record<string, boolean>
      maxHoursPerWeek?: number
      minRestHours?: number
    }
    softGoalOrder?: SoftGoalId[]
    softGoalEnabled?: Record<string, boolean>
  }
  const storedEnabled = raw.hardRules?.enabled ?? {}
  const storedGoals = raw.softGoalEnabled ?? {}

  const enabled = Object.fromEntries(
    HARD_RULE_IDS.map((id) => [id, storedEnabled[id] ?? DEFAULT_SOLVE_SETTINGS.hardRules.enabled[id]]),
  ) as Record<HardRuleId, boolean>

  const order: SoftGoalId[] = [...(raw.softGoalOrder ?? DEFAULT_SOLVE_SETTINGS.softGoalOrder)]
  if (!order.includes('S6')) {
    const s2 = order.indexOf('S2')
    if (s2 === -1) order.push('S6')
    else order.splice(s2, 0, 'S6')
  }

  const softGoalEnabled = Object.fromEntries(
    SOFT_GOAL_IDS.map((id) => [id, storedGoals[id] ?? DEFAULT_SOLVE_SETTINGS.softGoalEnabled[id]]),
  ) as Record<SoftGoalId, boolean>

  return {
    hardRules: {
      enabled,
      maxHoursPerWeek: raw.hardRules?.maxHoursPerWeek ?? DEFAULT_SOLVE_SETTINGS.hardRules.maxHoursPerWeek,
      minRestHours: raw.hardRules?.minRestHours ?? DEFAULT_SOLVE_SETTINGS.hardRules.minRestHours,
    },
    softGoalOrder: order,
    softGoalEnabled,
  }
}

/**
 * Parses and validates schemaVersion on raw unknown input.
 * Version 1 passes through when structurally valid; a blob written before tags
 * existed gains empty tag collections. Unknown or newer versions return null
 * today (seam for version 2+).
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
  const tagGroups = obj['tagGroups']
  const tags = obj['tags']
  const shifts = obj['shifts']
  const coverage = obj['coverage']
  const tagCoverage = obj['tagCoverage']
  const settings = obj['settings']
  const periods = obj['periods']
  const schedules = obj['schedules']

  if (
    !Array.isArray(people) ||
    !Array.isArray(teams) ||
    (tagGroups !== undefined && (!Array.isArray(tagGroups) || !tagGroups.every(isTagGroup))) ||
    (tags !== undefined && (!Array.isArray(tags) || !tags.every(isTag))) ||
    !Array.isArray(shifts) ||
    typeof coverage !== 'object' ||
    coverage === null ||
    (tagCoverage !== undefined && !isTagCoverage(tagCoverage)) ||
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
    tagGroups: (tagGroups as TagGroup[] | undefined) ?? [],
    tags: (tags as Tag[] | undefined) ?? [],
    shifts: shifts as ShiftDef[],
    coverage: coverage as CoverageTableDTO,
    tagCoverage: tagCoverage ?? {},
    settings: migrateSettings(settings as SolveSettings),
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
