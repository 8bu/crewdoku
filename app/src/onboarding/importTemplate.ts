/**
 * The batch-import template (all-in-one workbook): one spreadsheet a manager
 * downloads, fills in, and imports back as a whole roster — people, teams,
 * preferences and dated time off together. `buildImportWorkbook` is pure and
 * apart from the `Onboarding` component, same as `csvImport.ts`/`templates.ts`,
 * so its shape is testable without a DOM; only `downloadImportTemplate` touches
 * the spreadsheet writer.
 *
 * The sheet and header spellings here are half of the reader's contract — the
 * batch-import parser is the other half. Dropdowns point at dynamic named
 * ranges (`buildDefinedNames`), so they grow with the file rather than being
 * pinned to the template's seed rows.
 */
import { OFF_CODE, activePeople, type Person, type ShiftDef, type Team } from '@crewdoku/domain'
import writeXlsxFile, { type CellObject } from 'write-excel-file/browser'

export type ImportWorkbook = { sheets: Array<{ name: string; rows: string[][] }> }

const TEAMS_HEADER = ['name', 'wants', 'avoids']
const PEOPLE_HEADER = ['name', 'team', 'ineligible', 'wants', 'avoids', 'useTeamPreference', 'recurringOff']
/** One row per (person, date): a person's days off are their own rows, not one cell. */
const TIMEOFF_HEADER = ['person', 'date']
/** Reference only — never imported; it exists so a user sees the valid codes. */
const SHIFTS_HEADER = ['code', 'label', 'start', 'end']

/** Indexed by the domain's weekday number (0 = Sunday). */
const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Where an empty workspace lands, so the template always shows the shape. */
const EXAMPLE_TEAM_NAMES = ['Team A', 'Team B']
const EXAMPLE_PERSON_NAMES = ['Person A', 'Person B']

/** Header row styling: a bold, tinted, frozen banner so the table reads as a table. */
const HEADER_BACKGROUND = '#EEF2F7'

/** Per-sheet column widths (character units), in header order — sized so names and code lists are not clipped. */
const TEMPLATE_COLUMN_WIDTHS: Record<string, number[]> = {
  Teams: [22, 16, 16],
  People: [20, 18, 18, 16, 16, 18, 26],
  TimeOff: [20, 14],
  Shifts: [12, 18, 8, 8],
}

/** Bottom row of every dropdown range, so rows a manager adds below the seed data still get the picker. */
const DROPDOWN_LAST_ROW = 1000

/**
 * Joins codes into one cell (the reader splits on whitespace, commas or
 * semicolons). `OFF` is never a legal preference or ineligibility code, so it
 * is dropped rather than written into a template that would warn on import.
 */
function joinCodes(codes: readonly string[] | undefined): string {
  return (codes ?? []).filter((code) => code.length > 0 && code !== OFF_CODE).join(' ')
}

function buildTeamsSheet(teams: readonly Team[], codes: readonly string[]): string[][] {
  if (teams.length > 0) {
    return [TEAMS_HEADER, ...teams.map((team) => [team.name, joinCodes(team.wants), joinCodes(team.avoids)])]
  }
  // An empty workspace still gets a filled-in template: two teams whose
  // preference cells name a real code from the live catalog.
  const firstCode = codes.slice(0, 1)
  return [
    TEAMS_HEADER,
    [EXAMPLE_TEAM_NAMES[0]!, joinCodes(firstCode), ''],
    [EXAMPLE_TEAM_NAMES[1]!, '', joinCodes(firstCode)],
  ]
}

/**
 * Two illustrative people for an empty workspace: the first names a real team
 * and real codes, the second inherits its team's preference and shows the
 * weekday syntax. Everything they reference exists in the other sheets, so an
 * untouched template imports back clean.
 */
function examplePersonRows(teamNames: readonly string[], codes: readonly string[]): string[][] {
  const firstTeam = teamNames[0] ?? ''
  const secondTeam = teamNames[1] ?? firstTeam
  return [
    [EXAMPLE_PERSON_NAMES[0]!, firstTeam, joinCodes(codes.slice(1, 2)), joinCodes(codes.slice(0, 1)), '', 'no', ''],
    [EXAMPLE_PERSON_NAMES[1]!, secondTeam, '', '', '', 'yes', 'Sat Sun'],
  ]
}

function buildPeopleSheet(
  people: readonly Person[],
  teams: readonly Team[],
  teamNames: readonly string[],
  codes: readonly string[],
): string[][] {
  const active = activePeople(people)
  if (active.length === 0) return [PEOPLE_HEADER, ...examplePersonRows(teamNames, codes)]

  // Team names exactly as the Teams sheet spells them; an unassigned or
  // unknown team id reads as blank, which the reader turns back into the
  // unassigned team.
  const nameById: Record<string, string> = Object.fromEntries(
    teams.map((team): [string, string] => [team.id, team.name]),
  )
  const rows: string[][] = [PEOPLE_HEADER]
  for (const person of active) {
    const days = (person.recurringOff ?? []).filter(
      (day) => Number.isInteger(day) && day >= 0 && day < WEEKDAY_ABBREVIATIONS.length,
    )
    rows.push([
      person.name,
      nameById[person.teamId] ?? '',
      joinCodes(person.ineligible),
      joinCodes(person.wants),
      joinCodes(person.avoids),
      // Same resolution as the person panel: an absent flag reads as "inherit".
      (person.useTeamPreference ?? true) ? 'yes' : 'no',
      days.map((day) => WEEKDAY_ABBREVIATIONS[day]!).join(' '),
    ])
  }
  return rows
}

/**
 * One row per (person, date) across the active people, in `buildPeopleSheet`'s
 * order and each person's own date order. An empty workspace still gets the
 * shape: two illustrative dates for a person the People sheet also names, so an
 * untouched template round-trips clean.
 */
function buildTimeOffSheet(active: readonly Person[]): string[][] {
  if (active.length === 0) {
    return [
      TIMEOFF_HEADER,
      [EXAMPLE_PERSON_NAMES[0]!, '2026-01-01'],
      [EXAMPLE_PERSON_NAMES[0]!, '2026-01-02'],
    ]
  }
  const rows: string[][] = [TIMEOFF_HEADER]
  for (const person of active) {
    for (const date of person.timeOff ?? []) rows.push([person.name, date])
  }
  return rows
}

/**
 * Builds the whole template: `Teams`, `People`, `TimeOff` and a reference-only
 * `Shifts` sheet, in that order. Deterministic — same workspace in, same
 * workbook out. The People sheet points at team names exactly as the Teams
 * sheet spells them, and at nothing the reader would warn about, so a round
 * trip is clean.
 */
export function buildImportWorkbook(input: { shifts: ShiftDef[]; teams: Team[]; people: Person[] }): ImportWorkbook {
  const codes = input.shifts.map((shift) => shift.code)
  const teamRows = buildTeamsSheet(input.teams, codes)
  const teamNames = teamRows.slice(1).map((row) => row[0] ?? '')
  const people = activePeople(input.people)
  return {
    sheets: [
      { name: 'Teams', rows: teamRows },
      { name: 'People', rows: buildPeopleSheet(input.people, input.teams, teamNames, codes) },
      { name: 'TimeOff', rows: buildTimeOffSheet(people) },
      {
        name: 'Shifts',
        rows: [SHIFTS_HEADER, ...input.shifts.map((shift) => [shift.code, shift.label, shift.start, shift.end])],
      },
    ],
  }
}

/**
 * The workbook-scoped dynamic named ranges the dropdowns point at. Each is an
 * `OFFSET`/`COUNTA` over its column, so it auto-sizes to the live row count —
 * a shift code, team or person a manager adds below the seed rows appears in
 * the pickers with no template change. Returns the inner XML of
 * `<definedNames>`; the writer splices it into `xl/workbook.xml`. Pure.
 */
export function buildDefinedNames(): string {
  return [
    '<definedName name="ShiftCodes">OFFSET(Shifts!$A$2,0,0,MAX(1,COUNTA(Shifts!$A:$A)-1),1)</definedName>',
    '<definedName name="TeamNames">OFFSET(Teams!$A$2,0,0,MAX(1,COUNTA(Teams!$A:$A)-1),1)</definedName>',
    '<definedName name="PersonNames">OFFSET(People!$A$2,0,0,MAX(1,COUNTA(People!$A:$A)-1),1)</definedName>',
  ].join('')
}

/** One `<dataValidation>` list rule over `sqref`. `quoted` picks an inline literal list; otherwise `source` is a workbook-scoped named range (e.g. `ShiftCodes`). Errors are never shown, so a code column can still hold several space-separated codes — the dropdown is a picker, never a gate. */
function listRule(sqref: string, source: string, quoted = false): string {
  const formula1 = quoted ? `&quot;${source}&quot;` : source
  return `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${sqref}"><formula1>${formula1}</formula1></dataValidation>`
}

function validationsElement(rules: string[]): string {
  return rules.length === 0 ? '' : `<dataValidations count="${rules.length}">${rules.join('')}</dataValidations>`
}

function column(letter: string): string {
  return `${letter}2:${letter}${DROPDOWN_LAST_ROW}`
}

/**
 * The list-dropdown XML per sheet, keyed by sheet name, as raw OOXML injected
 * into each worksheet (write-excel-file has no data-validation API, only this
 * XML seam). The code/team/person columns point at the always-defined
 * workbook-scoped dynamic named ranges (`buildDefinedNames`), so the pickers
 * pick up rows a manager adds; `yes/no` and the weekdays are short inline
 * literals; the reference-only `Shifts` sheet gets no entry. The workbook is no
 * longer consulted — the named ranges always exist — but the parameter stays so
 * `downloadImportTemplate`'s call shape is unchanged. Pure and deterministic, so
 * it is unit-tested without a DOM.
 */
export function buildTemplateValidations(_wb: ImportWorkbook): Record<string, string> {
  return {
    // Teams: wants (B) and avoids (C) are shift-code columns.
    Teams: validationsElement([listRule(column('B'), 'ShiftCodes'), listRule(column('C'), 'ShiftCodes')]),
    // People: team (B) from the team list; ineligible/wants/avoids (C/D/E) from
    // the shift codes; useTeamPreference (F) and recurringOff (G) inline.
    People: validationsElement([
      listRule(column('B'), 'TeamNames'),
      listRule(column('C'), 'ShiftCodes'),
      listRule(column('D'), 'ShiftCodes'),
      listRule(column('E'), 'ShiftCodes'),
      listRule(column('F'), 'yes,no', true),
      listRule(column('G'), WEEKDAY_ABBREVIATIONS.join(','), true),
    ]),
    // TimeOff: the person (A) column only; the date (B) column is free text.
    TimeOff: validationsElement([listRule(column('A'), 'PersonNames')]),
  }
}

/** The header row as a bold, tinted banner so the table reads as a table. */
function headerBanner(cells: readonly string[]): CellObject[] {
  return cells.map((value) => ({ value, fontWeight: 'bold', backgroundColor: HEADER_BACKGROUND, align: 'left' }))
}

/**
 * Writes the workbook out as a real `.xlsx` download. The one impure piece —
 * kept apart from the builder so the builder stays DOM-free. Each sheet gets a
 * frozen, bold header banner, sized columns, and shift/team/enum dropdowns
 * injected through write-excel-file's raw-XML feature seam. The dropdown names
 * themselves are defined here too: the workbook is written with an empty
 * `<definedNames/>` at the schema-correct spot, so replacing that placeholder
 * keeps the element order valid.
 */
export async function downloadImportTemplate(fileName: string, wb: ImportWorkbook): Promise<void> {
  const validations = buildTemplateValidations(wb)
  const sheets = wb.sheets.map((sheet) => ({
    data: [headerBanner(sheet.rows[0] ?? []), ...sheet.rows.slice(1)],
    sheet: sheet.name,
    stickyRowsCount: 1,
    columns: (TEMPLATE_COLUMN_WIDTHS[sheet.name] ?? []).map((width) => ({ width })),
  }))
  await writeXlsxFile(sheets, {
    features: [
      {
        files: {
          transform: {
            'xl/worksheets/sheet{id}.xml': {
              insert: (options) => validations[options.sheet ?? ''],
            },
            'xl/workbook.xml': {
              transform: (content) =>
                content.replace('<definedNames/>', `<definedNames>${buildDefinedNames()}</definedNames>`),
            },
          },
        },
      },
    ],
  }).toFile(fileName)
}
