import type { Period } from '../state/shell'
import { emptyBoardData, generateBoardData, periodLengthDays, type BoardData } from './mockBoard'

/**
 * Every route that needs a starting `BoardData` for the selected period goes
 * through here (ticket 17): the bootstrap demo period (`seedMock: true`)
 * seeds from mock data the same way it always has; every period a manager
 * creates starts empty, on purpose, so it lands on the onboarding import
 * flow (ticket 14) instead of a pre-filled board. `numDates` always reflects
 * the period's real `start`/`end` range, not a hardcoded 42-day default.
 */
export function seedBoardData(period: Period): BoardData {
  const numDates = periodLengthDays(period.start, period.end)
  return period.seedMock ? generateBoardData(period.start, numDates) : emptyBoardData(period.start, numDates)
}
