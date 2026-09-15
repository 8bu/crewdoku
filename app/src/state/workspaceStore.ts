import { getDefaultStore } from 'jotai'
import {
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  emptyRegistry,
  makeOrg,
  makeWorkspaceMeta,
  type Assignment,
  type Org,
  type Schedule,
  type Workspace,
  type WorkspaceMeta,
  type WorkspaceRegistry,
} from '@crewdoku/domain'
import { IdbMultiWorkspaceStorage, type MultiWorkspaceStorage } from '@crewdoku/persistence'
import type { Overrides } from '../board/editHistory'
import { peopleAtom } from './roster'
import { teamsAtom } from './teams'
import { shiftsAtom } from './shifts'
import { coverageAtom } from './coverageRules'
import { solveSettingsAtom } from './solveSettings'
import { createPeriod, periodsAtom, selectedPeriodIdAtom, type Period } from './shell'
import { scheduleByPeriodAtom, type ScheduleState } from './schedule'
import { overridesByPeriodAtom } from './boardOverrides'
import { orgsAtom, workspaceMetasAtom, activeOrgIdAtom, activeWorkspaceIdAtom } from './orgStore'
import { autoGenerateOnMountAtom, onboardedPeriodsAtom, workspaceOnboardedAtom } from './onboarding'
import { applyCsvImport, type CsvRow } from '../board/roster/csvImport'
import { WORKSPACE_TEMPLATES } from '../onboarding/templates'

/**
 * The persistence seam (app ticket 02, extended for multi-workspace). The jotai
 * atoms are the live source of truth; this module hydrates them from
 * `IdbMultiWorkspaceStorage` on boot and saves the active workspace back
 * (debounced) whenever a workspace-affecting atom changes.
 *
 * Two layers of state now persist: a `WorkspaceRegistry` (orgs + workspace
 * metadata + which workspace is active) and, per workspace, one `Workspace`
 * data aggregate keyed by workspace id. Switching workspaces flushes the
 * current data, loads the target, and re-hydrates the atoms.
 *
 * The domain `Workspace` models one flat `Schedule` per period, so the app's
 * two layers — the base schedule and the hand-edit/pin override layer — are
 * merged into that single map on save (overrides win, `Assignment.pinned` is
 * carried through). A period is written only when it has a schedule, so
 * "present in `workspace.schedules`" encodes `hasSchedule`. On load the merged
 * schedule becomes the base and the override layer starts empty.
 */

type Store = ReturnType<typeof getDefaultStore>

/** Module-owned storage handle so the workspace ops can persist without threading it through the UI. */
let storageRef: MultiWorkspaceStorage = new IdbMultiWorkspaceStorage()
let stopAutosave: (() => void) | null = null

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
  store.set(selectedPeriodIdAtom, first ? first.id : '')

  const byPeriod: Record<string, ScheduleState> = {}
  for (const [periodId, schedule] of workspace.schedules) {
    byPeriod[periodId] = { assignments: schedule, hasSchedule: true }
  }
  store.set(scheduleByPeriodAtom, byPeriod)
  store.set(overridesByPeriodAtom, {})
}

/**
 * A fresh workspace's starting point: the default shift catalog and coverage,
 * no roster, and one empty period so the board shell renders and the first-run
 * wizard has somewhere to land.
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

/** Snapshot the registry atoms into a `WorkspaceRegistry`. */
function readRegistry(store: Store): WorkspaceRegistry {
  return {
    schemaVersion: 1,
    orgs: store.get(orgsAtom),
    workspaces: store.get(workspaceMetasAtom),
    activeWorkspaceId: store.get(activeWorkspaceIdAtom),
  }
}

/** Push a `WorkspaceRegistry` into the registry atoms. */
function setRegistry(store: Store, registry: WorkspaceRegistry): void {
  store.set(orgsAtom, registry.orgs)
  store.set(workspaceMetasAtom, registry.workspaces)
  store.set(activeWorkspaceIdAtom, registry.activeWorkspaceId)
}

/** Persist the registry (fire-and-forget; the atoms are the source of truth). */
function persistRegistry(store: Store): void {
  void storageRef.saveRegistry(readRegistry(store))
}

/** Bump the active workspace's `updatedAt` so "recent" ordering and future sync stay honest. */
function touchActive(store: Store): void {
  const id = store.get(activeWorkspaceIdAtom)
  if (!id) return
  const now = new Date().toISOString()
  store.set(
    workspaceMetasAtom,
    store.get(workspaceMetasAtom).map((m) => (m.id === id ? { ...m, updatedAt: now } : m)),
  )
}

/** Reset the transient onboarding atoms to match a freshly loaded workspace. */
function resetOnboardingFor(store: Store, workspace: Workspace): void {
  store.set(workspaceOnboardedAtom, workspace.people.length > 0)
  store.set(onboardedPeriodsAtom, new Set<string>())
  store.set(autoGenerateOnMountAtom, new Set<string>())
}

/** The most-recently-updated workspace in a list, or null when empty. */
function mostRecent(metas: WorkspaceMeta[]): WorkspaceMeta | null {
  if (metas.length === 0) return null
  return [...metas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

/**
 * Subscribes to workspace-affecting atoms and saves the active workspace,
 * debounced. Returns a cleanup that cancels the pending save and unsubscribes,
 * so a re-boot never leaves an old session writing under a stale storage/id.
 */
export function startAutosave(store: Store, debounceMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const id = store.get(activeWorkspaceIdAtom)
      if (!id) return
      touchActive(store)
      void storageRef.saveWorkspace(id, collectWorkspace(store))
      void storageRef.saveRegistry(readRegistry(store))
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
  const unsubscribers = watched.map((watchedAtom) => store.sub(watchedAtom, save))
  return () => {
    clearTimeout(timer)
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}

/**
 * Boots the workspace layer, in order:
 *  1. Load the registry. If present, select the active workspace (or the first,
 *     or none) and hydrate it.
 *  2. No registry but a legacy single-workspace blob exists -> migrate it into a
 *     "Default" org + workspace, then hydrate.
 *  3. Truly fresh install -> an empty registry; the app shows the create form.
 * Runs once before the app renders.
 */
export async function bootWorkspace(
  storage: MultiWorkspaceStorage = new IdbMultiWorkspaceStorage(),
): Promise<void> {
  storageRef = storage
  const store = getDefaultStore()
  let registry = await storage.loadRegistry()

  if (!registry) {
    const legacy = await storage.loadLegacyWorkspace()
    if (legacy) {
      const org = makeOrg('Default')
      const meta = makeWorkspaceMeta(org.id, 'Default')
      registry = { schemaVersion: 1, orgs: [org], workspaces: [meta], activeWorkspaceId: meta.id }
      await storage.commitLegacyMigration(registry, meta.id, legacy)
      setRegistry(store, registry)
      hydrate(store, legacy)
      store.set(workspaceOnboardedAtom, legacy.people.length > 0)
      store.set(activeOrgIdAtom, org.id)
    } else {
      setRegistry(store, emptyRegistry())
      store.set(activeOrgIdAtom, null)
    }
  } else {
    let activeId = registry.activeWorkspaceId
    if (activeId && !registry.workspaces.some((w) => w.id === activeId)) activeId = null

    // Which org to enter: the active workspace's org, or the only org there is.
    let orgId: string | null = null
    if (activeId) {
      orgId = registry.workspaces.find((w) => w.id === activeId)?.orgId ?? null
    } else if (registry.orgs.length === 1) {
      orgId = registry.orgs[0]?.id ?? null
    }
    // Entered an org with no remembered workspace: land on its most recent one.
    if (orgId && !activeId) {
      activeId = mostRecent(registry.workspaces.filter((w) => w.orgId === orgId))?.id ?? null
    }
    registry = { ...registry, activeWorkspaceId: activeId }
    setRegistry(store, registry)
    store.set(activeOrgIdAtom, orgId)
    if (activeId) {
      const ws = await storage.loadWorkspace(activeId)
      if (ws) {
        hydrate(store, ws)
        store.set(workspaceOnboardedAtom, ws.people.length > 0)
      } else {
        store.set(activeWorkspaceIdAtom, null)
      }
    }
  }

  stopAutosave?.()
  stopAutosave = startAutosave(store)
}

/** Creates a new org and persists it. Does not change the active workspace. */
export function createOrg(name: string): Org {
  const store = getDefaultStore()
  const org = makeOrg(name)
  store.set(orgsAtom, [...store.get(orgsAtom), org])
  persistRegistry(store)
  return org
}

/** Renames an org in place. */
export function renameOrg(id: string, name: string): void {
  const store = getDefaultStore()
  store.set(
    orgsAtom,
    store.get(orgsAtom).map((o) => (o.id === id ? { ...o, name } : o)),
  )
  persistRegistry(store)
}

/**
 * Deletes an org, all its workspaces, and their data. If the deleted org was
 * the entered one, returns to the org picker (clearing the active workspace);
 * deleting the last org lands on the fresh create-first screen.
 */
export async function deleteOrg(orgId: string): Promise<void> {
  const store = getDefaultStore()
  const doomed = store.get(workspaceMetasAtom).filter((m) => m.orgId === orgId)

  store.set(
    orgsAtom,
    store.get(orgsAtom).filter((o) => o.id !== orgId),
  )
  store.set(
    workspaceMetasAtom,
    store.get(workspaceMetasAtom).filter((m) => m.orgId !== orgId),
  )
  if (store.get(activeOrgIdAtom) === orgId) {
    store.set(activeOrgIdAtom, null)
    store.set(activeWorkspaceIdAtom, null)
  }
  // Registry first: a crash after this leaves only harmless orphan blobs, never
  // a listed workspace whose data is gone.
  await storageRef.saveRegistry(readRegistry(store))
  for (const m of doomed) await storageRef.deleteWorkspace(m.id)
}

/**
 * Creates a workspace under `orgId`, seeds a starter aggregate, switches to it,
 * and hydrates the atoms. Flushes the previously active workspace first.
 */
export async function createWorkspace(orgId: string, name: string): Promise<WorkspaceMeta> {
  const store = getDefaultStore()
  const currentId = store.get(activeWorkspaceIdAtom)
  if (currentId) await storageRef.saveWorkspace(currentId, collectWorkspace(store))

  const meta = makeWorkspaceMeta(orgId, name)
  const starter = createStarterWorkspace()
  await storageRef.saveWorkspace(meta.id, starter)

  store.set(workspaceMetasAtom, [...store.get(workspaceMetasAtom), meta])
  store.set(activeWorkspaceIdAtom, meta.id)
  store.set(activeOrgIdAtom, orgId)
  hydrate(store, starter)
  resetOnboardingFor(store, starter)
  await storageRef.saveRegistry(readRegistry(store))
  return meta
}

/** A small, believable sample roster for the one-click demo workspace. */
const SAMPLE_ROWS: CsvRow[] = [
  { name: 'Ava Bennett', team: 'Front of house' },
  { name: 'Liam Carter', team: 'Front of house' },
  { name: 'Sofia Delgado', team: 'Front of house' },
  { name: 'Noah Fischer', team: 'Front of house' },
  { name: 'Mia Okafor', team: 'Front of house' },
  { name: 'Ethan Reyes', team: 'Front of house' },
  { name: 'Hana Sato', team: 'Kitchen' },
  { name: 'Omar Haddad', team: 'Kitchen' },
  { name: 'Lucas Moreau', team: 'Kitchen' },
  { name: 'Priya Nair', team: 'Kitchen' },
  { name: 'Chloe Martin', team: 'Kitchen' },
  { name: 'Diego Alvarez', team: 'Kitchen' },
]

/**
 * One-click sample (org picker "see a sample schedule"): a fully seeded org +
 * workspace — a retail shape plus a small roster — that lands straight on the
 * board and auto-solves once, so a first-time visitor sees a real, fair,
 * rule-legal schedule with zero setup. It is an ordinary org (deletable from
 * the picker), not a special mode; the one-shot auto-generate reuses the exact
 * path the first-run wizard uses.
 */
export async function startSampleWorkspace(): Promise<void> {
  const store = getDefaultStore()
  const currentId = store.get(activeWorkspaceIdAtom)
  if (currentId) await storageRef.saveWorkspace(currentId, collectWorkspace(store))

  const template = WORKSPACE_TEMPLATES.find((t) => t.id === 'retail')
  if (!template) throw new Error('startSampleWorkspace: retail template is missing')
  const { people, teams } = applyCsvImport([], [], SAMPLE_ROWS)
  const today = new Date().toISOString().slice(0, 10)
  const period = createPeriod('Sample fortnight', today, 'biweek', 'ready')
  const sample: Workspace = {
    people,
    teams,
    shifts: template.shifts,
    coverage: template.coverage,
    settings: template.solveSettings,
    periods: [period],
    schedules: new Map(),
  }

  const org = makeOrg('Sample team')
  const meta = makeWorkspaceMeta(org.id, 'Downtown store')
  await storageRef.saveWorkspace(meta.id, sample)

  store.set(orgsAtom, [...store.get(orgsAtom), org])
  store.set(workspaceMetasAtom, [...store.get(workspaceMetasAtom), meta])
  hydrate(store, sample)
  // Seed the onboarding gates directly — not resetOnboardingFor, which would
  // clear the auto-generate flag. The roster is present so the wizard stays
  // shut, and the board auto-solves this one period on mount.
  store.set(workspaceOnboardedAtom, true)
  store.set(onboardedPeriodsAtom, new Set<string>())
  store.set(autoGenerateOnMountAtom, new Set<string>([period.id]))
  store.set(activeOrgIdAtom, org.id)
  store.set(activeWorkspaceIdAtom, meta.id)
  await storageRef.saveRegistry(readRegistry(store))
}

/** Switches the active workspace: flush current, load target, re-hydrate. */
export async function switchWorkspace(id: string): Promise<void> {
  const store = getDefaultStore()
  const currentId = store.get(activeWorkspaceIdAtom)
  if (currentId === id) return
  if (currentId) await storageRef.saveWorkspace(currentId, collectWorkspace(store))

  const ws = (await storageRef.loadWorkspace(id)) ?? createStarterWorkspace()
  store.set(activeWorkspaceIdAtom, id)
  const meta = store.get(workspaceMetasAtom).find((m) => m.id === id)
  if (meta) store.set(activeOrgIdAtom, meta.orgId)
  hydrate(store, ws)
  resetOnboardingFor(store, ws)
  await storageRef.saveRegistry(readRegistry(store))
}

/** Renames a workspace and bumps its `updatedAt`. */
export function renameWorkspace(id: string, name: string): void {
  const store = getDefaultStore()
  const now = new Date().toISOString()
  store.set(
    workspaceMetasAtom,
    store.get(workspaceMetasAtom).map((m) => (m.id === id ? { ...m, name, updatedAt: now } : m)),
  )
  persistRegistry(store)
}

/**
 * Deletes a workspace and its data. If it was active, falls back to the first
 * remaining workspace (re-hydrating it) or clears the active id — which sends
 * the app back to the create form.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  const store = getDefaultStore()
  await storageRef.deleteWorkspace(id)
  const remaining = store.get(workspaceMetasAtom).filter((m) => m.id !== id)
  store.set(workspaceMetasAtom, remaining)

  if (store.get(activeWorkspaceIdAtom) === id) {
    const orgId = store.get(activeOrgIdAtom)
    const next = remaining.find((m) => m.orgId === orgId) ?? null
    if (next) {
      const ws = (await storageRef.loadWorkspace(next.id)) ?? createStarterWorkspace()
      store.set(activeWorkspaceIdAtom, next.id)
      hydrate(store, ws)
      resetOnboardingFor(store, ws)
    } else {
      store.set(activeWorkspaceIdAtom, null)
    }
  }
  await storageRef.saveRegistry(readRegistry(store))
}

/**
 * Enters an org (from the full-page picker). Flushes the current workspace, then
 * lands on that org's most recent workspace, or leaves the workspace unset when
 * the org is empty — the app then shows the create-workspace screen.
 */
export async function selectOrg(orgId: string): Promise<void> {
  const store = getDefaultStore()
  const currentId = store.get(activeWorkspaceIdAtom)
  if (currentId) await storageRef.saveWorkspace(currentId, collectWorkspace(store))

  store.set(activeOrgIdAtom, orgId)
  const target = mostRecent(store.get(workspaceMetasAtom).filter((m) => m.orgId === orgId))
  if (target) {
    const ws = (await storageRef.loadWorkspace(target.id)) ?? createStarterWorkspace()
    store.set(activeWorkspaceIdAtom, target.id)
    hydrate(store, ws)
    resetOnboardingFor(store, ws)
  } else {
    store.set(activeWorkspaceIdAtom, null)
  }
  await storageRef.saveRegistry(readRegistry(store))
}

/** Leaves the current org and returns to the full-page org picker. */
export async function leaveOrg(): Promise<void> {
  const store = getDefaultStore()
  const currentId = store.get(activeWorkspaceIdAtom)
  if (currentId) await storageRef.saveWorkspace(currentId, collectWorkspace(store))
  store.set(activeWorkspaceIdAtom, null)
  store.set(activeOrgIdAtom, null)
  await storageRef.saveRegistry(readRegistry(store))
}
