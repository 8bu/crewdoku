import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { selectedPeriodAtom } from '../state/shell'
import { useIsOnboarded, useIsWorkspaceOnboarded } from '../state/onboarding'
import { useRosterPeople } from '../state/roster'
import { seedBoardData } from '../board/periodSeed'
import { BoardGrid } from '../board/BoardGrid'
import { Onboarding } from '../onboarding/Onboarding'
import { ScheduleImportScreen } from '../onboarding/ScheduleImport'
import { Stub } from './Stub'

/**
 * Home. The grid, editing, coverage, violations, fairness, proposals.
 *
 * `key={period.id}` forces a fresh `BoardGrid`/`ScheduleImportScreen` mount
 * on every period switch (ticket 17) — both keep transient UI state in
 * local `useState` (the generate/proposal phase, selection, collapsed
 * teams) that's deliberately *not* period-scoped in an atom, the same way
 * `hasSchedule` is. Without the key, React reuses the same component
 * instance across periods and that local state (e.g. an "infeasible"
 * generate result) keeps showing over whichever period is now selected.
 * `Onboarding` has no `key`: the roster wizard it drives is workspace-wide
 * (ticket 25), not per-period, so it shouldn't remount on a period switch.
 *
 * Two gates, checked in order (ticket 25 rework — roster, teams, the shift
 * catalog, coverage rules, and solve settings are all workspace-global
 * now, so the first-run roster wizard is too):
 *
 * 1. The workspace has no people yet and hasn't finished the wizard —
 *    `Onboarding` walks roster-CSV-then-settings once, for the whole
 *    workspace, not per period.
 * 2. This period's own `setup === 'import'` and it hasn't finished that
 *    per-period screen — `ScheduleImportScreen` brings in an old schedule
 *    for just this period. `'ready'` (the bootstrap period, and every
 *    freshly created one) never gates here.
 */
export function Board() {
  const period = useAtomValue(selectedPeriodAtom)
  const initial = useMemo(() => (period ? seedBoardData(period) : null), [period])
  const [people] = useRosterPeople(initial?.people ?? [])
  const wsOnboarded = useIsWorkspaceOnboarded()
  const importDone = useIsOnboarded(period?.id ?? '')
  if (!period || !initial) return <Stub title="Board" tickets="04–13" />
  if (people.length === 0 && !wsOnboarded) return <Onboarding period={period} initial={initial} />
  if (period.setup === 'import' && !importDone) {
    return <ScheduleImportScreen key={period.id} period={period} initial={initial} />
  }
  return <BoardGrid key={period.id} periodId={period.id} initial={initial} />
}
