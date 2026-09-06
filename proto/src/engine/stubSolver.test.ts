import { describe, expect, it, vi } from 'vitest'
import { assignmentKey, DEFAULT_SHIFTS, generateBoardData, type Assignment } from '../board/mockBoard'
import { isEligible } from '../board/eligibility'
import { defaultCoverageTable } from '../state/coverageRules'
import { DEFAULT_SOLVE_SETTINGS } from '../state/solveSettings'
import { stubSolve } from './stubSolver'
import type { SolveRequest, SolveRules } from './types'

function rulesWithCoverageMin(min: number): SolveRules {
  const table = defaultCoverageTable(DEFAULT_SHIFTS, 0)
  const band = { min, max: 999 }
  for (const dow of Object.keys(table.byDow)) {
    for (const code of Object.keys(table.byDow[Number(dow)]!)) table.byDow[Number(dow)]![code] = { ...band }
  }
  return {
    coverage: table,
    minRestHours: 11,
    maxHoursPerWeek: DEFAULT_SOLVE_SETTINGS.hardRules.maxHoursPerWeek,
    enabled: DEFAULT_SOLVE_SETTINGS.hardRules.enabled,
  }
}

function requestFor(overrides: Partial<SolveRequest> = {}): SolveRequest {
  const board = generateBoardData('2026-01-05', 30, 12)
  return {
    org: { teams: board.teams, people: board.people, shifts: DEFAULT_SHIFTS },
    // min 0 keeps coverage out of the way for the structural tests below —
    // the dedicated "infeasible" tests set their own, stricter rules.
    rules: rulesWithCoverageMin(0),
    period: { dates: board.dates },
    schedule: board.assignments,
    options: { delayMs: 0 },
    ...overrides,
  }
}

describe('stubSolve', () => {
  it('is deterministic: the same request produces the same schedule', async () => {
    const a = await stubSolve(requestFor())
    const b = await stubSolve(requestFor())
    expect(a.status).toBe('solved')
    expect(b.status).toBe('solved')
    if (a.status !== 'solved' || b.status !== 'solved') return
    expect([...a.schedule.entries()]).toEqual([...b.schedule.entries()])
  })

  it('never moves a pinned cell', async () => {
    const request = requestFor()
    const [somePerson] = request.org.people
    const pinnedKey = assignmentKey(somePerson!.id, request.period.dates[0]!.iso)
    const pinned: Assignment = { code: 'NIGHT', start: '2200', end: '0600', pinned: true, ineligible: false }
    request.schedule.set(pinnedKey, pinned)

    const result = await stubSolve(request)
    expect(result.status).toBe('solved')
    if (result.status !== 'solved') return
    expect(result.schedule.get(pinnedKey)).toEqual(pinned)
  })

  it('never assigns a code a person is ineligible for', async () => {
    const result = await stubSolve(requestFor())
    expect(result.status).toBe('solved')
    if (result.status !== 'solved') return
    const request = requestFor()
    for (const person of request.org.people) {
      for (const date of request.period.dates) {
        const assignment = result.schedule.get(assignmentKey(person.id, date.iso))!
        expect(isEligible(person, assignment.code)).toBe(true)
      }
    }
  })

  it('respects time off and recurring days off', async () => {
    const request = requestFor()
    const person = request.org.people.find((p) => (p.timeOff?.length ?? 0) > 0)
    if (!person) throw new Error('fixture expected at least one person with time off')
    const result = await stubSolve(request)
    expect(result.status).toBe('solved')
    if (result.status !== 'solved') return
    for (const iso of person.timeOff!) {
      expect(result.schedule.get(assignmentKey(person.id, iso))?.code).toBe('OFF')
    }
  })

  it('leaves holidays off for everyone', async () => {
    const request = requestFor()
    const holiday = request.period.dates.find((d) => d.holidayName)
    if (!holiday) throw new Error('fixture expected a holiday in range')
    const result = await stubSolve(request)
    expect(result.status).toBe('solved')
    if (result.status !== 'solved') return
    for (const person of request.org.people) {
      expect(result.schedule.get(assignmentKey(person.id, holiday.iso))?.code).toBe('OFF')
    }
  })

  it('fails on demand with a conflict core and relaxation options', async () => {
    const result = await stubSolve(requestFor({ options: { delayMs: 0, forceInfeasible: true } }))
    expect(result.status).toBe('infeasible')
    if (result.status !== 'infeasible') return
    expect(result.conflictCore.length).toBeGreaterThan(0)
    expect(result.relaxations.length).toBeGreaterThan(0)
  })

  it('reports infeasible with a plain-word conflict core when coverage cannot be met', async () => {
    const result = await stubSolve(requestFor({ rules: rulesWithCoverageMin(99) }))
    expect(result.status).toBe('infeasible')
    if (result.status !== 'infeasible') return
    expect(result.conflictCore.length).toBeGreaterThan(0)
    expect(result.conflictCore[0]!.message).toMatch(/needs 99 people/)
  })

  it('relaxation options actually loosen the rules', async () => {
    const rules = rulesWithCoverageMin(99)
    const result = await stubSolve(requestFor({ rules }))
    expect(result.status).toBe('infeasible')
    if (result.status !== 'infeasible') return
    const lowerMin = result.relaxations.find((r) => r.id === 'lower-min')!
    const relaxed = lowerMin.relax(rules)
    const anyBand = Object.values(relaxed.coverage.byDow[1]!)[0]!
    expect(anyBand.min).toBe(98)
  })

  it('never reports coverage shortfalls when H1 is disabled', async () => {
    const rules = { ...rulesWithCoverageMin(99), enabled: { ...DEFAULT_SOLVE_SETTINGS.hardRules.enabled, H1: false } }
    const result = await stubSolve(requestFor({ rules }))
    expect(result.status).toBe('solved')
  })

  it('never staffs a shift whose coverage max is 0 that day (a closed day)', async () => {
    const rules = rulesWithCoverageMin(0)
    for (const dow of [0, 6]) {
      for (const code of Object.keys(rules.coverage.byDow[dow]!)) {
        rules.coverage.byDow[dow]![code] = { min: 0, max: 0 }
      }
    }
    const request = requestFor({ rules })
    const result = await stubSolve(request)
    expect(result.status).toBe('solved')
    if (result.status !== 'solved') return
    for (const date of request.period.dates) {
      if (!date.isWeekend) continue
      for (const person of request.org.people) {
        const assignment = result.schedule.get(assignmentKey(person.id, date.iso))
        expect(assignment?.code ?? 'OFF').toBe('OFF')
      }
    }
  })

  it('waits the requested delay before resolving', async () => {
    vi.useFakeTimers()
    try {
      const promise = stubSolve(requestFor({ options: { delayMs: 5000 } }))
      let settled = false
      promise.then(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(1000)
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(4000)
      await promise
      expect(settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
