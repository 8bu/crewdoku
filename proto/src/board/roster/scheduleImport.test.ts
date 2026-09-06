import { describe, expect, it } from 'vitest'
import { applyScheduleImport, parseScheduleCsv, type ScheduleCsvRow } from './scheduleImport'
import { addPerson, setPersonName } from './rosterOps'
import { DEFAULT_SHIFTS, UNASSIGNED_TEAM_ID, assignmentKey } from '../mockBoard'

const DATES = ['2024-01-01', '2024-01-02', '2024-01-03']

describe('parseScheduleCsv', () => {
  it('parses name/date rows with no team column', () => {
    const result = parseScheduleCsv('name,2024-01-01,2024-01-02\nAlice,EARLY,OFF\n')
    expect(result.errors).toEqual([])
    expect(result.dates).toEqual(['2024-01-01', '2024-01-02'])
    expect(result.rows).toEqual([
      // An explicit OFF cell survives parsing verbatim (only blanks are
      // dropped) — apply treats it as a day off, and an out-of-period OFF
      // still counts toward the skipped-cells warning.
      { name: 'Alice', team: '', codesByDate: { '2024-01-01': 'EARLY', '2024-01-02': 'OFF' } },
    ])
  })

  it('parses name/team/date rows', () => {
    const result = parseScheduleCsv('name,team,2024-01-01\nAlice,Frontline,LATE\n')
    expect(result.rows).toEqual([{ name: 'Alice', team: 'Frontline', codesByDate: { '2024-01-01': 'LATE' } }])
  })

  it('rejects a header with no name column', () => {
    const result = parseScheduleCsv('team,2024-01-01\nFrontline,EARLY\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/first column must be a header named "name"/)
  })

  it('rejects a header date cell that fails a real calendar round trip', () => {
    const result = parseScheduleCsv('name,2024-02-30\nAlice,EARLY\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/2024-02-30.*not a valid date/)
  })

  it('rejects a header with no date columns at all', () => {
    const result = parseScheduleCsv('name,team\nAlice,Frontline\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/at least one date column/)
  })

  it('rejects a repeated date column', () => {
    const result = parseScheduleCsv('name,2024-01-01,2024-01-01\nAlice,EARLY,LATE\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/repeats date 2024-01-01/)
  })

  it('skips a row with no name and reports why', () => {
    const result = parseScheduleCsv('name,2024-01-01\n,EARLY\nBob,LATE\n')
    expect(result.rows).toEqual([{ name: 'Bob', team: '', codesByDate: { '2024-01-01': 'LATE' } }])
    expect(result.errors[0]).toMatch(/missing a name/)
  })

  it('rejects the whole file on a duplicate person name', () => {
    const result = parseScheduleCsv('name,2024-01-01\nAlice,EARLY\nalice,LATE\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatch(/"alice" appears more than once/)
  })

  it('leaves blank cells out of codesByDate rather than storing empty strings', () => {
    const result = parseScheduleCsv('name,2024-01-01,2024-01-02\nAlice,EARLY,\n')
    expect(result.rows).toEqual([{ name: 'Alice', team: '', codesByDate: { '2024-01-01': 'EARLY' } }])
  })
})

describe('applyScheduleImport', () => {
  it('creates people/teams from rows and fills a complete person x date matrix with OFF', () => {
    const rows: ScheduleCsvRow[] = [
      { name: 'Alice', team: 'Frontline', codesByDate: { '2024-01-01': 'EARLY', '2024-01-02': 'LATE' } },
      { name: 'Bob', team: '', codesByDate: {} },
    ]
    const result = applyScheduleImport(rows, [], [], DEFAULT_SHIFTS, DATES)
    expect(result.errors).toEqual([])
    expect(result.people.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(result.teams.map((t) => t.name)).toEqual(['Frontline'])

    const alice = result.people.find((p) => p.name === 'Alice')!
    const bob = result.people.find((p) => p.name === 'Bob')!
    expect(alice.teamId).toBe(result.teams[0]!.id)
    expect(bob.teamId).toBe(UNASSIGNED_TEAM_ID)

    // Every person x every period date has an entry — including Bob, who
    // had no cells at all, and Alice's uncovered third date.
    for (const person of [alice, bob]) {
      for (const date of DATES) {
        expect(result.assignments.has(assignmentKey(person.id, date))).toBe(true)
      }
    }
    expect(result.assignments.get(assignmentKey(alice.id, '2024-01-03'))!.code).toBe('OFF')
    expect(result.assignments.get(assignmentKey(bob.id, '2024-01-01'))!.code).toBe('OFF')
  })

  it('maps an imported code to the shift catalog start/end times', () => {
    const rows = [{ name: 'Alice', team: '', codesByDate: { '2024-01-01': 'night' } }]
    const result = applyScheduleImport(rows, [], [], DEFAULT_SHIFTS, DATES)
    const alice = result.people[0]!
    const cell = result.assignments.get(assignmentKey(alice.id, '2024-01-01'))!
    expect(cell.code).toBe('NIGHT')
    expect(cell.start).toBe('2200')
    expect(cell.end).toBe('0600')
    expect(cell.pinned).toBe(false)
    expect(cell.ineligible).toBe(false)

    const off = result.assignments.get(assignmentKey(alice.id, '2024-01-02'))!
    expect(off.start).toBeNull()
    expect(off.end).toBeNull()
  })

  it('reconciles a row case-insensitively onto an existing person instead of duplicating them', () => {
    let people = addPerson([])
    people = setPersonName(people, people[0]!.id, 'Alice')
    const existingId = people[0]!.id

    const rows = [{ name: 'ALICE', team: '', codesByDate: { '2024-01-01': 'EARLY' } }]
    const result = applyScheduleImport(rows, people, [], DEFAULT_SHIFTS, DATES)
    expect(result.people).toHaveLength(1)
    expect(result.people[0]!.id).toBe(existingId)
    expect(result.assignments.get(assignmentKey(existingId, '2024-01-01'))!.code).toBe('EARLY')
  })

  it('creates a new team once for two rows naming it, not once per row', () => {
    const rows = [
      { name: 'Alice', team: 'Nightwatch', codesByDate: {} },
      { name: 'Bob', team: 'NIGHTWATCH', codesByDate: {} },
    ]
    const result = applyScheduleImport(rows, [], [], DEFAULT_SHIFTS, DATES)
    expect(result.teams).toHaveLength(1)
    const alice = result.people.find((p) => p.name === 'Alice')!
    const bob = result.people.find((p) => p.name === 'Bob')!
    expect(alice.teamId).toBe(bob.teamId)
  })

  it('warns and drops cells outside the period instead of erroring', () => {
    const rows = [{ name: 'Alice', team: '', codesByDate: { '2024-01-01': 'EARLY', '2099-01-01': 'LATE' } }]
    const result = applyScheduleImport(rows, [], [], DEFAULT_SHIFTS, DATES)
    expect(result.errors).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/1 cell.*outside the period/)
    const alice = result.people[0]!
    expect(result.assignments.get(assignmentKey(alice.id, '2024-01-01'))!.code).toBe('EARLY')
  })

  it('rejects an unknown shift code and leaves the original roster untouched', () => {
    const rows = [{ name: 'Alice', team: 'Frontline', codesByDate: { '2024-01-01': 'GRAVEYARD' } }]
    const result = applyScheduleImport(rows, [], [], DEFAULT_SHIFTS, DATES)
    expect(result.people).toEqual([])
    expect(result.teams).toEqual([])
    expect(result.assignments.size).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/GRAVEYARD/)
    expect(result.errors[0]).toMatch(/Settings → Shifts/)
  })
})
