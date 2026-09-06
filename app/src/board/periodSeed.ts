import { periodLengthDays } from '@crewdoku/domain'
import type { Period } from '../state/shell'
import { emptyBoardData, type BoardData } from './mockBoard'

/**
 * The starting `BoardData` for a period: real calendar dates over the period's
 * range, no teams/people/assignments. The roster is workspace-global (seeded by
 * onboarding, hydrated from persistence); a period's own schedule is filled by
 * Generate or a per-period import, never mock data.
 */
export function seedBoardData(period: Period): BoardData {
  const numDates = periodLengthDays(period.start, period.end)
  return emptyBoardData(period.start, numDates)
}
