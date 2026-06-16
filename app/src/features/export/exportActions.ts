import { buildContext, exportMemberCSV, exportTeamCSV } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'

/** Build a SolveContext from a store snapshot (no solver dependency). */
function ctxOf(st: AppStore) {
  return buildContext({
    ...(st.org ? { org: st.org } : {}),
    teams: st.teams,
    shifts: st.shifts,
    employees: st.employees,
    coverages: st.coverages,
    rules: st.rules,
  })
}

/**
 * Team grid CSV string for the current schedule/period. Pure — DOM download is
 * handled by the modal, not here, so this stays unit-testable in Node.
 */
export function buildTeamCsvForDownload(st: AppStore): string {
  return exportTeamCSV(ctxOf(st), st.schedule, st.period)
}

/** Single-member CSV string for the given employee over the current period. */
export function buildMemberCsvForDownload(st: AppStore, employeeId: string): string {
  return exportMemberCSV(ctxOf(st), st.schedule, employeeId, st.period)
}
