import { useAtomValue } from 'jotai'
import { selectedPeriodAtom } from '../state/shell'
import { CoverageGrid } from '../coverage/CoverageGrid'
import { Stub } from './Stub'

/** Shift × day headcount vs the authored band — the period-wide gap audit (ticket 21). */
export function Coverage() {
  const period = useAtomValue(selectedPeriodAtom)
  if (!period) return <Stub title="Coverage" tickets="21" />
  return <CoverageGrid key={period.id} period={period} />
}
