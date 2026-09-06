import { getDefaultStore } from 'jotai'
import {
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  type Assignment,
  type Schedule,
  type Workspace,
} from '@crewdoku/domain'
import { IdbWorkspaceStorage, type WorkspaceStorage } from '@crewdoku/persistence'
import type { Overrides } from '../board/editHistory'
import { peopleAtom } from './roster'
import { teamsAtom } from './teams'
import { shiftsAtom } from './shifts'
import { coverageAtom } from './coverageRules'
import { solveSettingsAtom } from './solveSettings'
import { createPeriod, periodsAtom, selectedPeriodIdAtom, type Period } from './shell'
import { scheduleByPeriodAtom, type ScheduleState } from './schedule'
import { overridesByPeriodAtom } from './boardOverrides'

/**
 * The persistence seam (app ticket 02). The jotai atoms are the live source of
 * truth; this module hydrates them from `IdbWorkspaceStorage` on boot and saves
 * the whole `Workspace` back (debounced) whenever a workspace-affecting atom
 * changes.
 *
 * The domain `Workspace` models one flat `Schedule` per period, so the app's
 * two layers — the base schedule and the hand-edit/pin override layer — are
 * merged into that single map on save (overrides win, `Assignment.pinned` is
 * carried through, 8bu's call). A period is written only when it has a schedule,
 * so "present in `workspace.schedules`" encodes `hasSchedule`. On load the merged
 * schedule becomes the base and the override layer starts empty.
 */

type Store = ReturnType<typeof getDefaultStore>

function mergeSchedule(base: Map<string, Assignment>, overrides: Overrides): Schedule {
  const merged = new Map(base)
  for (const [key, value] of overrides) merged.set(key, value)
  return merged
}

/** Reads every workspace-affecting atom into a `Workspace` for persistence. */
export function collectWorkspace(store: Store): Workspace {
  const byPeriod = store.get(scheduleByPeriodAtom)
  const overridesByPeriod = store.get(overridesByPeriodAtom)
  const schedules = new Map<string, Schedule>()
  for (const [periodId, state] of Object.entries(byPeriod)) {
    if (!state.hasSchedule) continue
    schedules.set(periodId, mergeSchedule(state.assignments, overridesByPeriod[periodId] ?? new Map()))
  }
  return {
    people: store.get(peopleAtom) ?? [],
    teams: store.get(teamsAtom) ?? [],
    shifts: store.get(shiftsAtom) ?? DEFAULT_SHIFTS,
    coverage: store.get(coverageAtom) ?? defaultCoverageTable(DEFAULT_SHIFTS, 1),
    settings: store.get(solveSettingsAtom) ?? DEFAULT_SOLVE_SETTINGS,
    periods: store.get(periodsAtom),
    schedules,
  }
}

/** Sets every atom from a loaded `Workspace`. Overrides reset; pins live in the schedule. */
export function hydrate(store: Store, workspace: Workspace): void {
  store.set(peopleAtom, workspace.people)
  store.set(teamsAtom, workspace.teams)
  store.set(shiftsAtom, workspace.shifts)
  store.set(coverageAtom, workspace.coverage)
  store.set(solveSettingsAtom, workspace.settings)

  // The domain `Period` has no `setup`; a loaded period is ready to render.
  const periods: Period[] = workspace.periods.map((period) => ({ ...period, setup: 'ready' }))
  store.set(periodsAtom, periods)
  const first = periods[0]
  if (first) store.set(selectedPeriodIdAtom, first.id)

  const byPeriod: Record<string, ScheduleState> = {}
  for (const [periodId, schedule] of workspace.schedules) {
    byPeriod[periodId] = { assignments: schedule, hasSchedule: true }
  }
  store.set(scheduleByPeriodAtom, byPeriod)
  store.set(overridesByPeriodAtom, {})
}

/**
 * A fresh install's starting point: the default shift catalog and coverage, no
 * roster, and one empty period so the board shell renders and the first-run
 * wizard (ticket 05) has somewhere to land.
 */
export function createStarterWorkspace(): Workspace {
  const today = new Date().toISOString().slice(0, 10)
  return {
    people: [],
    teams: [],
    shifts: DEFAULT_SHIFTS,
    coverage: defaultCoverageTable(DEFAULT_SHIFTS, 1),
    settings: DEFAULT_SOLVE_SETTINGS,
    periods: [createPeriod('Period 1', today, 'month', 'ready')],
    schedules: new Map(),
  }
}

/** Subscribes to workspace-affecting atoms and saves the whole workspace, debounced. */
export function startAutosave(store: Store, storage: WorkspaceStorage, debounceMs = 400): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void storage.save(collectWorkspace(store))
    }, debounceMs)
  }
  const watched = [
    peopleAtom,
    teamsAtom,
    shiftsAtom,
    coverageAtom,
    solveSettingsAtom,
    periodsAtom,
    scheduleByPeriodAtom,
    overridesByPeriodAtom,
  ] as const
  for (const watchedAtom of watched) store.sub(watchedAtom, save)
}

/**
 * Boots the workspace: load from IndexedDB, or seed a starter on a truly empty
 * store, then start autosaving. Runs once before the app renders.
 */
export async function bootWorkspace(storage: WorkspaceStorage = new IdbWorkspaceStorage()): Promise<void> {
  const store = getDefaultStore()
  const loaded = await storage.load()
  if (loaded) {
    hydrate(store, loaded)
  } else {
    const starter = createStarterWorkspace()
    hydrate(store, starter)
    await storage.save(starter)
  }
  startAutosave(store, storage)
}
