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
  checkTagCoverage,
  checkTagRules,
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
  SOFT_GOAL_S6,
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

export type { Assignment, Schedule, ScheduleBoundary } from './schedule'
export {
  activePeople,
  assignmentKey,
  EMPTY_BOUNDARY,
  emptySchedule,
  getAssignment,
  OFF_ASSIGNMENT,
  splitAssignmentKey,
} from './schedule'


export type { ScheduleChange } from './diff'
export { diffSchedules } from './diff'
export {
  DEFAULT_SHIFTS,
  defaultCoverageTable,
  makePeriod,
  makePerson,
  makeTag,
  makeTagGroup,
  makeTagRule,
  makeTeam,
} from './factories'

export type { CellPreference, Tag, TagGroup, TagRule, TagWhen } from './tags'
export {
  basePreference,
  cellPreference,
  normalizeTagIds,
  personTags,
  tagRuleApplies,
  tagWhenMatches,
  togglePersonTag,
} from './tags'

export type { Workspace } from './workspace'
export { emptyWorkspace } from './workspace'

export type { Org, WorkspaceMeta, WorkspaceRegistry } from './org'
export { emptyRegistry, makeOrg, makeWorkspaceMeta } from './org'
