/// <reference path="./ambient.d.ts" />

/**
 * Multi-workspace IndexedDB storage. One DB/object store holds a `registry`
 * key (the Org + WorkspaceMeta index) plus one `ws:<id>` key per workspace's
 * data blob. The legacy single-workspace `state` key is read-only here, for a
 * one-time migration performed by the state layer.
 */

import type { Workspace, WorkspaceRegistry } from '@crewdoku/domain'
import { fromWorkspaceDTO, migrate, migrateRegistry, toWorkspaceDTO } from './dto'

export interface MultiWorkspaceStorage {
  loadRegistry(): Promise<WorkspaceRegistry | null>
  saveRegistry(registry: WorkspaceRegistry): Promise<void>
  loadWorkspace(id: string): Promise<Workspace | null>
  saveWorkspace(id: string, workspace: Workspace): Promise<void>
  deleteWorkspace(id: string): Promise<void>
  loadLegacyWorkspace(): Promise<Workspace | null>
  clearLegacy(): Promise<void>
  /**
   * One readwrite transaction: write the registry + the workspace payload and
   * delete the legacy `state` key together, so a crash can't leave an orphan
   * blob or an uncleared legacy key behind.
   */
  commitLegacyMigration(
    registry: WorkspaceRegistry,
    workspaceId: string,
    workspace: Workspace,
  ): Promise<void>
}

const STORE_NAME = 'crewdoku'
const REGISTRY_KEY = 'registry'
const LEGACY_KEY = 'state'
function wsKey(id: string): string {
  return `ws:${id}`
}

export class IdbMultiWorkspaceStorage implements MultiWorkspaceStorage {
  private readonly dbName: string

  constructor(dbName = 'crewdoku') {
    this.dbName = dbName
  }

  private openDb(): Promise<IDBDatabase> {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
    const req = indexedDB.open(this.dbName, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    return promise
  }

  private async getRaw(key: string): Promise<unknown> {
    const db = await this.openDb()
    try {
      const { promise, resolve, reject } = Promise.withResolvers<unknown>()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      return await promise
    } finally {
      db.close()
    }
  }

  private async putRaw(key: string, value: string): Promise<void> {
    const db = await this.openDb()
    try {
      const { promise, resolve, reject } = Promise.withResolvers<void>()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
      await promise
    } finally {
      db.close()
    }
  }

  private async deleteRaw(key: string): Promise<void> {
    const db = await this.openDb()
    try {
      const { promise, resolve, reject } = Promise.withResolvers<void>()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
      await promise
    } finally {
      db.close()
    }
  }

  private parseWorkspace(raw: unknown): Workspace | null {
    if (typeof raw !== 'string') return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    const dto = migrate(parsed)
    return dto === null ? null : fromWorkspaceDTO(dto)
  }

  async loadRegistry(): Promise<WorkspaceRegistry | null> {
    const raw = await this.getRaw(REGISTRY_KEY)
    if (typeof raw !== 'string') return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    return migrateRegistry(parsed)
  }

  async saveRegistry(registry: WorkspaceRegistry): Promise<void> {
    await this.putRaw(REGISTRY_KEY, JSON.stringify(registry))
  }

  async loadWorkspace(id: string): Promise<Workspace | null> {
    return this.parseWorkspace(await this.getRaw(wsKey(id)))
  }

  async saveWorkspace(id: string, workspace: Workspace): Promise<void> {
    await this.putRaw(wsKey(id), JSON.stringify(toWorkspaceDTO(workspace)))
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.deleteRaw(wsKey(id))
  }

  async loadLegacyWorkspace(): Promise<Workspace | null> {
    return this.parseWorkspace(await this.getRaw(LEGACY_KEY))
  }

  async clearLegacy(): Promise<void> {
    await this.deleteRaw(LEGACY_KEY)
  }

  async commitLegacyMigration(
    registry: WorkspaceRegistry,
    workspaceId: string,
    workspace: Workspace,
  ): Promise<void> {
    const db = await this.openDb()
    try {
      const { promise, resolve, reject } = Promise.withResolvers<void>()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const os = tx.objectStore(STORE_NAME)
      os.put(JSON.stringify(registry), REGISTRY_KEY)
      os.put(JSON.stringify(toWorkspaceDTO(workspace)), wsKey(workspaceId))
      os.delete(LEGACY_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
      await promise
    } finally {
      db.close()
    }
  }
}
