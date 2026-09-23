/**
 * The one-click sample workspace ("see a sample schedule" on the org picker) —
 * a rich, believable fortnight at Harbour Bakehouse that exercises every part
 * of the engine: four shifts across the clock (one overnight), three teams and
 * a floater, certifications, holiday blocks, recurring days off, personal and
 * team preferences, a soft-removed former staff member, weekend peaks, and two
 * one-off trading days.
 *
 * Pure: every date is derived from `today` (the period start), ids are freshly
 * generated on every call, and nothing here reads or writes atoms or storage —
 * the period comes from `state/shell`'s pure `createPeriod`.
 */
import {
  DEFAULT_SOLVE_SETTINGS,
  UNASSIGNED_TEAM_ID,
  addDays,
  makePerson,
  makeTeam,
  type CoverageBand,
  type CoverageRow,
  type CoverageTable,
  type ISODate,
  type Person,
  type ShiftCode,
  type ShiftDef,
  type SoftGoalId,
  type Team,
  type Workspace,
} from '@crewdoku/domain'
import { createPeriod } from '../state/shell'

/** The four shift codes, referenced once each so a row key can never drift. */
const CODE_OPEN: ShiftCode = 'OPEN'
const CODE_MID: ShiftCode = 'MID'
const CODE_CLOSE: ShiftCode = 'CLOSE'
const CODE_BAKE: ShiftCode = 'BAKE'

export type SampleSeed = {
  orgName: string
  workspaceName: string
  /** Exactly one period and no schedules — the board renders and solves it. */
  workspace: Workspace
  /** `workspace.periods[0].id`, for the caller's one-shot auto-generate. */
  periodId: string
}

/** This sample's shift catalog, in board order. Handed out as a fresh copy. */
const SAMPLE_SHIFTS: readonly ShiftDef[] = [
  { code: CODE_OPEN, label: 'Opening', start: '0630', end: '1430', unpaidBreakMinutes: 30, color: 'amber' },
  { code: CODE_MID, label: 'Mid', start: '1100', end: '1900', unpaidBreakMinutes: 30, color: 'teal' },
  { code: CODE_CLOSE, label: 'Closing', start: '1500', end: '2300', unpaidBreakMinutes: 30, color: 'orange' },
  { code: CODE_BAKE, label: 'Night bake', start: '2200', end: '0600', unpaidBreakMinutes: 30, isNight: true, color: 'navy' },
]

type SampleTeamSpec = {
  name: string
  wants: ShiftCode[]
  avoids: ShiftCode[]
}

/** Teams, in workspace order. Every team states a preference; people inherit it. */
const SAMPLE_TEAMS: readonly SampleTeamSpec[] = [
  { name: 'Front of house', wants: [CODE_OPEN, CODE_MID], avoids: [CODE_CLOSE] },
  { name: 'Kitchen', wants: [CODE_MID, CODE_CLOSE], avoids: [CODE_OPEN] },
  { name: 'Bakery', wants: [CODE_BAKE], avoids: [] },
]

export type SamplePersonSpec = {
  name: string
  /** A team in `SAMPLE_TEAMS`, or null for the unassigned floater. */
  teamName: string | null
  /** Shift codes this person cannot work. Omitted means fully trained. */
  ineligible?: ShiftCode[]
  /** Days off as offsets from the period start (0–13), resolved per call. */
  timeOffOffsets?: number[]
  /** Weekdays (0 Sun .. 6 Sat) this person never works. */
  recurringOff?: number[]
  /** Own preferences; only read when `useTeamPreference` is false. */
  wants?: ShiftCode[]
  avoids?: ShiftCode[]
  useTeamPreference?: boolean
  removed?: boolean
}

/**
 * The sample's static people table — eighteen active people plus one
 * soft-removed former staff member, and no ids (the builder mints those).
 *
 * `ineligible` is the certification story: the four Bakery people and the
 * floater are the only ones who can work BAKE, and Amara is a new hire who has
 * not been trained on CLOSE yet.
 */
export const SAMPLE_PEOPLE: readonly SamplePersonSpec[] = [
  // Front of house — the counter, the floor, the weekend brunch crush.
  {
    name: 'Ava Bennett',
    teamName: 'Front of house',
    ineligible: [CODE_BAKE],
    wants: [CODE_OPEN],
    avoids: [CODE_CLOSE],
    useTeamPreference: false,
  },
  { name: 'Liam Carter', teamName: 'Front of house', ineligible: [CODE_BAKE] },
  // Never Sundays: childcare.
  { name: 'Sofia Delgado', teamName: 'Front of house', ineligible: [CODE_BAKE], recurringOff: [0] },
  { name: 'Noah Fischer', teamName: 'Front of house', ineligible: [CODE_BAKE], timeOffOffsets: [5] },
  { name: 'Mia Okafor', teamName: 'Front of house', ineligible: [CODE_BAKE] },
  { name: 'Ethan Reyes', teamName: 'Front of house', ineligible: [CODE_BAKE] },
  // New hire: trained on the counter, not on the close-down.
  { name: 'Amara Diallo', teamName: 'Front of house', ineligible: [CODE_BAKE, CODE_CLOSE] },

  // Kitchen — prep, service, and the close.
  { name: 'Hana Sato', teamName: 'Kitchen', ineligible: [CODE_BAKE] },
  {
    name: 'Omar Haddad',
    teamName: 'Kitchen',
    ineligible: [CODE_BAKE],
    timeOffOffsets: [9],
    wants: [CODE_MID],
    avoids: [CODE_OPEN],
    useTeamPreference: false,
  },
  // College timetable: no Mondays or Tuesdays.
  { name: 'Lucas Moreau', teamName: 'Kitchen', ineligible: [CODE_BAKE], recurringOff: [1, 2] },
  { name: 'Priya Nair', teamName: 'Kitchen', ineligible: [CODE_BAKE] },
  { name: 'Chloe Martin', teamName: 'Kitchen', ineligible: [CODE_BAKE] },
  { name: 'Diego Alvarez', teamName: 'Kitchen', ineligible: [CODE_BAKE] },

  // Bakery — the overnight bake, and the only certified BAKE crew.
  // Four-day family trip inside the period.
  { name: 'Alice Fontaine', teamName: 'Bakery', timeOffOffsets: [3, 4, 5, 6] },
  { name: 'Nikolai Petrov', teamName: 'Bakery', avoids: [CODE_CLOSE], useTeamPreference: false },
  { name: 'Mateo Silva', teamName: 'Bakery' },
  { name: 'Farida Aziz', teamName: 'Bakery' },

  // The floater: no team, no preferences, works wherever the gap is.
  { name: 'Kwame Mensah', teamName: null },

  // Former staff — soft-removed, so their history would survive a re-solve.
  { name: 'Tomas Novak', teamName: 'Kitchen', ineligible: [CODE_BAKE], removed: true },
]

function band(min: number, max: number): CoverageBand {
  return { min, max }
}

/*
 * Capacity check — hand-checked, and independent of the start weekday: a
 * 14-day period always contains every weekday exactly twice, so both weeks
 * carry the same minimum.
 *
 *   demand, per week   OPEN 14 + MID 15 + CLOSE 16 + BAKE 7 = 52 person-shifts
 *                      = 390 paid hours (7.5 h each: 8 h clock less the break)
 *   supply, per week   18 active people x 5 shifts = 90 person-shifts / 720 h
 *                      H2's 40 h cap allows 5 shifts (37.5 h); a 6th needs 45 h
 *   slack              38 shifts and 330 h spare = 73% / 85%
 *
 * Worst week: both override days (9 the catering event, 12 the short day) land
 * in the second week, which raises CLOSE's weekly floor to 18 and drops MID's
 * to 12 for a net 50-52 against the full ceiling of 90. The first week carries
 * Alice's four-day block at a flat 52 demanded, and four days off costs her two
 * of her five shifts — three days left cannot hold five — so the crew still
 * offers 88. That is the tightest the sample ever gets, 69% spare. Lucas's two
 * college days and Sofia's Sunday never cost anything: each leaves at least
 * five other days in the week, and five is the ceiling anyway (verified by
 * hand for all seven possible start weekdays).
 *
 * BAKE is the scarcest skill, so it gets the widest margin: only the four
 * Bakery people plus the floater are certified, and a night (2200-0600) leaves
 * under the 11 h H3 needs before any other shift the next day (OPEN 0630 is
 * 0.5 h, MID 1100 is 5 h, CLOSE 1500 is 9 h), so a baker's week is nights and
 * rest. Five bakers x up to 5 nights = 25 baker-nights against 7 needed; even
 * in Alice's blocked week the remaining four hold 20, thirteen spare nights —
 * far past the two-night floor.
 */
function buildCoverage(today: ISODate): CoverageTable {
  const weekday: CoverageRow = {
    [CODE_OPEN]: band(2, 4),
    [CODE_MID]: band(2, 3),
    [CODE_CLOSE]: band(2, 4),
    [CODE_BAKE]: band(1, 2),
  }

  // 0 Sun .. 6 Sat. Monday is quiet; the weekend is brunch and late nights.
  const byDow: Record<number, CoverageRow> = {
    0: { ...weekday, [CODE_MID]: band(3, 4) },
    1: { ...weekday, [CODE_MID]: band(1, 2) },
    2: { ...weekday },
    3: { ...weekday },
    4: { ...weekday },
    5: { ...weekday, [CODE_CLOSE]: band(3, 5) },
    6: { ...weekday, [CODE_MID]: band(3, 5), [CODE_CLOSE]: band(3, 5) },
  }

  // Unlisted shifts on an override day fall back to the weekday row.
  const dateOverrides: Record<ISODate, CoverageRow> = {}
  dateOverrides[addDays(today, 9)] = { [CODE_CLOSE]: band(4, 6) }
  dateOverrides[addDays(today, 12)] = { [CODE_MID]: band(0, 0) }

  return { byDow, dateOverrides }
}

/**
 * Every soft goal, ranked: preferences first, then nights and weekends, then
 * stability and smooth transitions.
 */
const SAMPLE_SOFT_GOAL_ORDER: SoftGoalId[] = ['S2', 'S1', 'S4', 'S5', 'S3']

function buildPerson(spec: SamplePersonSpec, today: ISODate, teams: readonly Team[]): Person {
  // Matched by name, the same way `applyCsvImport` resolves a row's team.
  const teamName = spec.teamName
  const team = teamName === null ? undefined : teams.find((candidate) => candidate.name === teamName)
  const init: Partial<Person> & { name: string } = {
    name: spec.name,
    teamId: team?.id ?? UNASSIGNED_TEAM_ID,
    ineligible: [...(spec.ineligible ?? [])],
    useTeamPreference: spec.useTeamPreference ?? true,
  }
  if (spec.timeOffOffsets) init.timeOff = spec.timeOffOffsets.map((offset) => addDays(today, offset))
  if (spec.recurringOff) init.recurringOff = [...spec.recurringOff]
  if (spec.wants) init.wants = [...spec.wants]
  if (spec.avoids) init.avoids = [...spec.avoids]
  if (spec.removed) init.removed = true
  return makePerson(init)
}

/**
 * Builds the demo workspace for a period starting on `today`: two weeks of
 * Harbour Bakehouse, sized so the engine solves it comfortably from any start
 * weekday. Every id is new on every call.
 */
export function buildSampleWorkspace(today: ISODate): SampleSeed {
  const teams: Team[] = SAMPLE_TEAMS.map((spec) =>
    makeTeam({ name: spec.name, wants: [...spec.wants], avoids: [...spec.avoids] }),
  )
  const people = SAMPLE_PEOPLE.map((spec) => buildPerson(spec, today, teams))
  const period = createPeriod('Sample fortnight', today, 'biweek', 'ready')

  const workspace: Workspace = {
    people,
    teams,
    shifts: SAMPLE_SHIFTS.map((shift) => ({ ...shift })),
    coverage: buildCoverage(today),
    settings: { ...DEFAULT_SOLVE_SETTINGS, softGoalOrder: [...SAMPLE_SOFT_GOAL_ORDER] },
    periods: [period],
    schedules: new Map(),
  }

  return {
    orgName: 'Harbour & Co.',
    workspaceName: 'Harbour Bakehouse',
    workspace,
    periodId: period.id,
  }
}
