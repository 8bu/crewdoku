import { beforeEach, describe, expect, it } from 'vitest'
import { getDefaultStore } from 'jotai'
import {
  emptyWorkspace,
  makePerson,
  type Workspace,
  type WorkspaceRegistry,
} from '@crewdoku/domain'
import type { MultiWorkspaceStorage } from '@crewdoku/persistence'
import {
  bootWorkspace,
  createOrg,
  createWorkspace,
  deleteOrg,
  deleteWorkspace,
  leaveOrg,
  selectOrg,
  startSampleWorkspace,
  switchWorkspace,
} from './workspaceStore'
import { activeOrgIdAtom, activeWorkspaceIdAtom, orgsAtom, workspaceMetasAtom } from './orgStore'
import { peopleAtom } from './roster'
import { teamsAtom } from './teams'
import { shiftsAtom } from './shifts'
import { periodsAtom } from './shell'
import { scheduleByPeriodAtom } from './schedule'
import { overridesByPeriodAtom } from './boardOverrides'
import { autoGenerateOnMountAtom, workspaceOnboardedAtom } from './onboarding'

class FakeStorage implements MultiWorkspaceStorage {
  registry: WorkspaceRegistry | null = null
  workspaces = new Map<string, Workspace>()
  legacy: Workspace | null = null

  async loadRegistry() {
    return this.registry
  }
  async saveRegistry(registry: WorkspaceRegistry) {
    this.registry = registry
  }
  async loadWorkspace(id: string) {
    return this.workspaces.get(id) ?? null
  }
  async saveWorkspace(id: string, ws: Workspace) {
    this.workspaces.set(id, ws)
  }
  async deleteWorkspace(id: string) {
    this.workspaces.delete(id)
  }
  async loadLegacyWorkspace() {
    return this.legacy
  }
  async clearLegacy() {
    this.legacy = null
  }
  async commitLegacyMigration(registry: WorkspaceRegistry, id: string, ws: Workspace) {
    this.registry = registry
    this.workspaces.set(id, ws)
    this.legacy = null
  }
}

function peopleWorkspace(name: string): Workspace {
  const ws = emptyWorkspace()
  ws.people = [makePerson({ name })]
  return ws
}

const store = getDefaultStore()

beforeEach(() => {
  store.set(orgsAtom, [])
  store.set(workspaceMetasAtom, [])
  store.set(activeWorkspaceIdAtom, null)
  store.set(activeOrgIdAtom, null)
  store.set(peopleAtom, [])
  store.set(periodsAtom, [])
  store.set(scheduleByPeriodAtom, {})
  store.set(overridesByPeriodAtom, {})
  store.set(teamsAtom, [])
  store.set(shiftsAtom, null)
  store.set(autoGenerateOnMountAtom, new Set<string>())
  store.set(workspaceOnboardedAtom, false)
})

describe('bootWorkspace', () => {
  it('leaves no active workspace on a truly fresh install', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    expect(store.get(activeWorkspaceIdAtom)).toBeNull()
    expect(store.get(orgsAtom)).toEqual([])
    expect(store.get(workspaceMetasAtom)).toEqual([])
    expect(store.get(activeOrgIdAtom)).toBeNull()
  })

  it('migrates a legacy single-workspace blob into a Default org + workspace', async () => {
    const storage = new FakeStorage()
    storage.legacy = peopleWorkspace('Legacy Person')

    await bootWorkspace(storage)

    const orgs = store.get(orgsAtom)
    const metas = store.get(workspaceMetasAtom)
    expect(orgs).toHaveLength(1)
    expect(metas).toHaveLength(1)
    const org0 = orgs[0]
    const meta0 = metas[0]
    if (!org0 || !meta0) throw new Error('expected one org and one workspace')
    expect(org0.name).toBe('Default')
    expect(meta0.orgId).toBe(org0.id)
    expect(store.get(activeWorkspaceIdAtom)).toBe(meta0.id)
    expect(store.get(activeOrgIdAtom)).toBe(org0.id)
    // data hydrated + onboarding marked done (it already had people)
    expect(store.get(peopleAtom)).toHaveLength(1)
    expect(store.get(workspaceOnboardedAtom)).toBe(true)
    // legacy blob consumed, registry + per-workspace data persisted
    expect(storage.legacy).toBeNull()
    expect(storage.registry?.activeWorkspaceId).toBe(meta0.id)
    expect(storage.workspaces.get(meta0.id)?.people).toHaveLength(1)
  })

  it('restores the active workspace from an existing registry', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const org = createOrg('Acme')
    const meta = await createWorkspace(org.id, 'Main')
    store.set(peopleAtom, [makePerson({ name: 'Boot Person' })])
    // simulate a reload: fresh boot against the same storage
    await bootWorkspace(storage)
    expect(store.get(activeWorkspaceIdAtom)).toBe(meta.id)
  })
})

describe('createWorkspace', () => {
  it('creates an empty workspace, activates it, and gates onboarding', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const org = createOrg('Acme')
    const meta = await createWorkspace(org.id, 'Main')

    expect(store.get(activeWorkspaceIdAtom)).toBe(meta.id)
    expect(store.get(activeOrgIdAtom)).toBe(org.id)
    expect(store.get(workspaceMetasAtom)).toHaveLength(1)
    expect(store.get(peopleAtom)).toEqual([])
    expect(store.get(workspaceOnboardedAtom)).toBe(false)
    expect(storage.workspaces.has(meta.id)).toBe(true)
  })
})

describe('switchWorkspace', () => {
  it('flushes the current workspace data and hydrates the target', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const org = createOrg('Acme')
    const a = await createWorkspace(org.id, 'A')
    store.set(peopleAtom, [makePerson({ name: 'Alice' })])
    const b = await createWorkspace(org.id, 'B')
    // B is a fresh empty workspace
    expect(store.get(peopleAtom)).toEqual([])

    await switchWorkspace(a.id)
    expect(store.get(activeWorkspaceIdAtom)).toBe(a.id)
    expect(store.get(peopleAtom)).toHaveLength(1)

    await switchWorkspace(b.id)
    expect(store.get(activeWorkspaceIdAtom)).toBe(b.id)
    expect(store.get(peopleAtom)).toEqual([])
  })
})

describe('deleteWorkspace', () => {
  it('falls back to a remaining workspace when the active one is deleted', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const org = createOrg('Acme')
    const a = await createWorkspace(org.id, 'A')
    const b = await createWorkspace(org.id, 'B')
    expect(store.get(activeWorkspaceIdAtom)).toBe(b.id)

    await deleteWorkspace(b.id)
    expect(store.get(workspaceMetasAtom).map((m) => m.id)).toEqual([a.id])
    expect(store.get(activeWorkspaceIdAtom)).toBe(a.id)
    expect(storage.workspaces.has(b.id)).toBe(false)
  })

  it('clears the active id when the last workspace is deleted', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const org = createOrg('Acme')
    const only = await createWorkspace(org.id, 'Only')

    await deleteWorkspace(only.id)
    expect(store.get(workspaceMetasAtom)).toEqual([])
    expect(store.get(activeWorkspaceIdAtom)).toBeNull()
  })
})

describe('deleteOrg', () => {
  it('removes the org, its workspaces, and their data; clears the active org when it was entered', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const acme = createOrg('Acme')
    const a = await createWorkspace(acme.id, 'A')
    const globex = createOrg('Globex')
    const g1 = await createWorkspace(globex.id, 'G1')
    const g2 = await createWorkspace(globex.id, 'G2')
    // createWorkspace entered Globex, so it is the active org.

    await deleteOrg(globex.id)

    expect(store.get(orgsAtom).map((o) => o.id)).toEqual([acme.id])
    expect(store.get(workspaceMetasAtom).map((m) => m.id)).toEqual([a.id])
    expect(storage.workspaces.has(g1.id)).toBe(false)
    expect(storage.workspaces.has(g2.id)).toBe(false)
    expect(storage.workspaces.has(a.id)).toBe(true)
    expect(store.get(activeOrgIdAtom)).toBeNull()
    expect(store.get(activeWorkspaceIdAtom)).toBeNull()
  })

  it('deleting the last org empties the registry (fresh state)', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const only = createOrg('Only Co')
    await createWorkspace(only.id, 'W')

    await deleteOrg(only.id)

    expect(store.get(orgsAtom)).toEqual([])
    expect(store.get(workspaceMetasAtom)).toEqual([])
    expect(store.get(activeOrgIdAtom)).toBeNull()
    expect((await storage.loadRegistry())?.orgs).toEqual([])
  })
})

describe('selectOrg / leaveOrg', () => {
  it('enters an org and lands on its most recent workspace', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const org = createOrg('Acme')
    const a = await createWorkspace(org.id, 'A')

    await leaveOrg()
    expect(store.get(activeOrgIdAtom)).toBeNull()
    expect(store.get(activeWorkspaceIdAtom)).toBeNull()

    await selectOrg(org.id)
    expect(store.get(activeOrgIdAtom)).toBe(org.id)
    expect(store.get(activeWorkspaceIdAtom)).toBe(a.id)
  })

  it('enters an empty org with no active workspace', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)
    const org = createOrg('Empty Co')
    await selectOrg(org.id)
    expect(store.get(activeOrgIdAtom)).toBe(org.id)
    expect(store.get(activeWorkspaceIdAtom)).toBeNull()
  })
})

describe('startSampleWorkspace', () => {
  it('seeds a populated org+workspace, arms auto-generate, and persists it', async () => {
    const storage = new FakeStorage()
    await bootWorkspace(storage)

    await startSampleWorkspace()

    // A new org + workspace exists and is the active selection.
    const orgs = store.get(orgsAtom)
    const metas = store.get(workspaceMetasAtom)
    expect(orgs).toHaveLength(1)
    expect(metas).toHaveLength(1)
    const meta = metas[0]
    if (!meta) throw new Error('expected one workspace')
    expect(store.get(activeOrgIdAtom)).toBe(meta.orgId)
    expect(store.get(activeWorkspaceIdAtom)).toBe(meta.id)

    // The rich sample lands: three teams, the four-shift café-bakery catalog,
    // and a roster that carries certifications, time off and preferences, so
    // the board renders the engine's full range rather than an empty starter.
    const people = store.get(peopleAtom) ?? []
    expect(people.length).toBeGreaterThan(12)
    expect(people.some((p) => (p.timeOff ?? []).length > 0)).toBe(true)
    expect(people.some((p) => p.ineligible.length > 0)).toBe(true)
    expect((store.get(teamsAtom) ?? []).map((t) => t.name)).toEqual(['Front of house', 'Kitchen', 'Bakery'])
    expect((store.get(shiftsAtom) ?? []).map((s) => s.code)).toEqual(['OPEN', 'MID', 'CLOSE', 'BAKE'])

    // The wizard stays shut (roster present) and the one seeded period is armed
    // to auto-solve once on the board's next mount.
    expect(store.get(workspaceOnboardedAtom)).toBe(true)
    const periods = store.get(periodsAtom)
    const period = periods[0]
    if (!period) throw new Error('expected one seeded period')
    expect(periods).toHaveLength(1)
    expect(store.get(autoGenerateOnMountAtom).has(period.id)).toBe(true)

    // The seeded aggregate is persisted so a reload restores the sample.
    expect(storage.registry?.activeWorkspaceId).toBe(meta.id)
    expect(storage.workspaces.get(meta.id)?.people.length).toBe((store.get(peopleAtom) ?? []).length)
  })
})
