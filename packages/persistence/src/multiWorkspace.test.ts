import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHIFTS,
  DEFAULT_SOLVE_SETTINGS,
  defaultCoverageTable,
  emptyWorkspace,
  makeOrg,
  makePerson,
  makeWorkspaceMeta,
  type Workspace,
  type WorkspaceRegistry,
} from '@crewdoku/domain'
import { IdbMultiWorkspaceStorage } from './multiWorkspace'
import { IdbWorkspaceStorage } from './idbAdapter'

let seq = 0
function freshDbName(): string {
  seq += 1
  return `mw-${Date.now()}-${seq}-${Math.random().toString(36).slice(2)}`
}

function fixtureWorkspace(): Workspace {
  const ws = emptyWorkspace()
  ws.shifts = DEFAULT_SHIFTS
  ws.coverage = defaultCoverageTable(DEFAULT_SHIFTS, 1)
  ws.settings = DEFAULT_SOLVE_SETTINGS
  ws.people = [makePerson({ name: 'Alice' })]
  return ws
}

describe('IdbMultiWorkspaceStorage', () => {
  it('round-trips the registry', async () => {
    const storage = new IdbMultiWorkspaceStorage(freshDbName())
    const org = makeOrg('Acme')
    const meta = makeWorkspaceMeta(org.id, 'Main')
    const registry: WorkspaceRegistry = {
      schemaVersion: 1,
      orgs: [org],
      workspaces: [meta],
      activeWorkspaceId: meta.id,
    }
    await storage.saveRegistry(registry)
    expect(await storage.loadRegistry()).toEqual(registry)
  })

  it('returns null registry on a fresh db', async () => {
    const storage = new IdbMultiWorkspaceStorage(freshDbName())
    expect(await storage.loadRegistry()).toBeNull()
  })

  it('round-trips and deletes a workspace by id', async () => {
    const storage = new IdbMultiWorkspaceStorage(freshDbName())
    await storage.saveWorkspace('w1', fixtureWorkspace())
    const loaded = await storage.loadWorkspace('w1')
    expect(loaded).not.toBeNull()
    expect(loaded?.people.length).toBe(1)
    expect(await storage.loadWorkspace('missing')).toBeNull()

    await storage.deleteWorkspace('w1')
    expect(await storage.loadWorkspace('w1')).toBeNull()
  })

  it('reads then clears a legacy single-workspace blob', async () => {
    const dbName = freshDbName()
    // The legacy adapter writes the workspace under the fixed 'state' key.
    await new IdbWorkspaceStorage(dbName).save(fixtureWorkspace())

    const storage = new IdbMultiWorkspaceStorage(dbName)
    const legacy = await storage.loadLegacyWorkspace()
    expect(legacy).not.toBeNull()
    expect(legacy?.people.length).toBe(1)

    await storage.clearLegacy()
    expect(await storage.loadLegacyWorkspace()).toBeNull()
  })

  it('commits a legacy migration atomically: registry + workspace written, legacy cleared', async () => {
    const dbName = freshDbName()
    await new IdbWorkspaceStorage(dbName).save(fixtureWorkspace())
    const storage = new IdbMultiWorkspaceStorage(dbName)

    const org = makeOrg('Default')
    const meta = makeWorkspaceMeta(org.id, 'Default')
    const registry: WorkspaceRegistry = {
      schemaVersion: 1,
      orgs: [org],
      workspaces: [meta],
      activeWorkspaceId: meta.id,
    }
    const legacy = await storage.loadLegacyWorkspace()
    if (!legacy) throw new Error('expected a legacy workspace')

    await storage.commitLegacyMigration(registry, meta.id, legacy)

    expect(await storage.loadRegistry()).toEqual(registry)
    expect((await storage.loadWorkspace(meta.id))?.people.length).toBe(1)
    expect(await storage.loadLegacyWorkspace()).toBeNull()
  })
})
