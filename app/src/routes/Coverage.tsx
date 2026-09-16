import { useT } from '../i18n/useT'
import { useAtomValue } from 'jotai'
import { selectedPeriodAtom } from '../state/shell'
import { CoverageGrid } from '../coverage/CoverageGrid'
import { usePageView } from '../analytics'
import { Stub } from './Stub'

/** Shift × day headcount vs the authored band — the period-wide gap audit (ticket 21). */
export function Coverage() {
  usePageView('/coverage')
  const t = useT()
  const period = useAtomValue(selectedPeriodAtom)
  if (!period) return <Stub title={t('rtc.coverage.title')} tickets="21" />
  return <CoverageGrid key={period.id} period={period} />
}
