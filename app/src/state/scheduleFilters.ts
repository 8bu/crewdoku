import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Person, ShiftCode } from '@crewdoku/domain'
import { searchPeople } from '../ui/personSearch'

/**
 * The filters the Board and the Calendar share. They live in the URL
 * (`?q=&team=a,b&shift=EARLY,NIGHT&leave=0`), so switching between the two
 * pages keeps them, a reload keeps them, and a copied link carries them.
 * An empty team or shift list means "all"; leave is shown unless `leave=0`.
 */
export type ScheduleFilters = {
  query: string
  teamIds: readonly string[]
  shiftCodes: readonly ShiftCode[]
  showLeave: boolean
}

const PARAM = { query: 'q', team: 'team', shift: 'shift', leave: 'leave' } as const

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key)
  return raw ? raw.split(',').filter(Boolean) : []
}

export function readScheduleFilters(params: URLSearchParams): ScheduleFilters {
  return {
    query: params.get(PARAM.query) ?? '',
    teamIds: readList(params, PARAM.team),
    shiftCodes: readList(params, PARAM.shift),
    showLeave: params.get(PARAM.leave) !== '0',
  }
}

/** Writes `patch` over `params` in place; default values drop their param. */
export function writeScheduleFilters(params: URLSearchParams, patch: Partial<ScheduleFilters>): void {
  const setOrDelete = (key: string, value: string) => (value ? params.set(key, value) : params.delete(key))
  if (patch.query !== undefined) setOrDelete(PARAM.query, patch.query)
  if (patch.teamIds !== undefined) setOrDelete(PARAM.team, patch.teamIds.join(','))
  if (patch.shiftCodes !== undefined) setOrDelete(PARAM.shift, patch.shiftCodes.join(','))
  if (patch.showLeave !== undefined) setOrDelete(PARAM.leave, patch.showLeave ? '' : '0')
}

/** Whether any filter narrows the view — drives a "Clear filters" affordance. */
export function hasActiveFilters(filters: ScheduleFilters): boolean {
  return filters.query.trim() !== '' || filters.teamIds.length > 0 || filters.shiftCodes.length > 0 || !filters.showLeave
}

/**
 * The people the search and team filters keep, in their original order (the
 * board's team grouping and the calendar's stacks both own their ordering;
 * search here only decides membership, not rank).
 */
export function filterPeople<T extends Person>(people: readonly T[], filters: ScheduleFilters): T[] {
  const teamOk = filters.teamIds.length === 0 ? null : new Set(filters.teamIds)
  const byTeam = teamOk ? people.filter((p) => teamOk.has(p.teamId)) : [...people]
  if (filters.query.trim() === '') return byTeam
  const hits = new Set(searchPeople(byTeam, filters.query))
  return byTeam.filter((p) => hits.has(p))
}

/** Whether a worked shift passes the shift filter (an empty filter keeps every shift). */
export function matchesShiftFilter(filters: ScheduleFilters, code: ShiftCode): boolean {
  return filters.shiftCodes.length === 0 || filters.shiftCodes.includes(code)
}

/** The live filters and a setter that patches them into the URL (history-replacing, so filters don't pile up Back entries). */
export function useScheduleFilters(): [ScheduleFilters, (patch: Partial<ScheduleFilters>) => void] {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readScheduleFilters(params), [params])
  const setFilters = useCallback(
    (patch: Partial<ScheduleFilters>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          writeScheduleFilters(next, patch)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  return [filters, setFilters]
}
