import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { DEFAULT_SHIFTS, DEFAULT_SOLVE_SETTINGS } from '@crewdoku/domain'
import { overridesByPeriodAtom } from '../state/boardOverrides'
import { peopleAtom } from '../state/roster'
import { scheduleByPeriodAtom } from '../state/schedule'
import { solveSettingsAtom } from '../state/solveSettings'
import { shiftsAtom } from '../state/shifts'
import { teamsAtom } from '../state/teams'
import { periodsAtom } from '../state/shell'
import type { CalendarSource } from './calendarModel'

/**
 * Everything the calendar reads, live. Every period's solved matrix and hand
 * edits are loaded at boot, which is what lets one month render several periods
 * without the shell switching its selected one.
 *
 * The workspace-global atoms read as their empty/default value until something
 * seeds them (onboarding, or an imported workspace), the same as every other
 * read of them.
 */
export function useCalendarSource(): CalendarSource {
  const periods = useAtomValue(periodsAtom)
  const schedules = useAtomValue(scheduleByPeriodAtom)
  const overrides = useAtomValue(overridesByPeriodAtom)
  const people = useAtomValue(peopleAtom)
  const teams = useAtomValue(teamsAtom)
  const shifts = useAtomValue(shiftsAtom)
  const settings = useAtomValue(solveSettingsAtom)
  return useMemo(
    () => ({
      periods,
      schedules,
      overrides,
      people: people ?? [],
      teams: teams ?? [],
      shifts: shifts ?? DEFAULT_SHIFTS,
      settings: settings ?? DEFAULT_SOLVE_SETTINGS,
    }),
    [periods, schedules, overrides, people, teams, shifts, settings],
  )
}
