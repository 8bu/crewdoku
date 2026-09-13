/**
 * @crewdoku/domain — entities, calendar math, and the schedule shape.
 * Pure TypeScript; depends on nothing. Constraint checks land with engine
 * ticket 03; port types with ticket 11.
 */

export type { ISODate } from './calendar'
export { addDays, eachDate, isWeekend, periodLengthDays, weekdayOf, weekIndexOf } from './calendar'

export type {
  SoftGoalDefinition,
  Violation,
  ViolationRuleId,
  WorkspaceSlice,
} from './constraints'
export {
  checkEligibility,
  checkH1Coverage,
  checkH2WeeklyHours,
  checkH3Rest,
  checkH5TimeOff,
  checkSchedule,
  formatHours,
  formatIsoDate,
  H4_STRUCTURAL_NOTE,
  paidHours,
  restHoursBetween,
  shiftDurationHours,
  shiftSpan,
  SOFT_GOAL_DEFINITIONS,
  SOFT_GOAL_S1,
  SOFT_GOAL_S2,
  SOFT_GOAL_S3,
  SOFT_GOAL_S4,
  SOFT_GOAL_S5,
  violationCellKey,
  violationsByCell,
} from './constraints'

export type {
  CoverageBand,
  CoverageRow,
  CoverageTable,
  HardRuleId,
  HardRuleSettings,
  Period,
  Person,
  ShiftCode,
  ShiftDef,
  SoftGoalId,
  SolveSettings,
  Team,
} from './entities'
export {
  coverageBandFor,
  DEFAULT_SOLVE_SETTINGS,
  HARD_RULE_IDS,
  OFF_CODE,
  SOFT_GOAL_IDS,
  UNASSIGNED_TEAM_ID,
  UNCONSTRAINED_BAND,
} from './entities'

export type { Assignment, Schedule } from './schedule'
export {
  activePeople,
  assignmentKey,
  emptySchedule,
  getAssignment,
  OFF_ASSIGNMENT,
  splitAssignmentKey,
} from './schedule'


export type { ScheduleChange } from './diff'
export { diffSchedules } from './diff'
export { DEFAULT_SHIFTS, defaultCoverageTable, makePeriod, makePerson, makeTeam } from './factories'

export type { Workspace } from './workspace'
export { emptyWorkspace } from './workspace'

export type { Org, WorkspaceMeta, WorkspaceRegistry } from './org'
export { emptyRegistry, makeOrg, makeWorkspaceMeta } from './org'
