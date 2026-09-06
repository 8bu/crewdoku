/// <reference path="./ambient.d.ts" />

/**
 * Storage port and IndexedDB adapter for the Workspace aggregate.
 *
 * Persists the entire workspace state as a versioned JSON string in one
 * IndexedDB object store under a single fixed key ('state').
 *
 * Coalescing / debounce note:
 * This adapter performs immediate saves on call. The caller owns coalescing /
 * debouncing if mutations happen frequently.
 */

import type { Workspace } from '@crewdoku/domain'
import { fromWorkspaceDTO, migrate, toWorkspaceDTO } from './dto'

export interface WorkspaceStorage {
  load(): Promise<Workspace | null>
  save(workspace: Workspace): Promise<void>
}

const STORE_NAME = 'crewdoku'
const STATE_KEY = 'state'

export class IdbWorkspaceStorage implements WorkspaceStorage {
  private readonly dbName: string

  constructor(dbName = 'crewdoku') {
    this.dbName = dbName
  }

  private openDb(): Promise<IDBDatabase> {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
    const req = indexedDB.open(this.dbName, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    return promise
  }

  async save(workspace: Workspace): Promise<void> {
    const db = await this.openDb()
    try {
      const dto = toWorkspaceDTO(workspace)
      const json = JSON.stringify(dto)
      const { promise, resolve, reject } = Promise.withResolvers<void>()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(json, STATE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
      await promise
    } finally {
      db.close()
    }
  }

  async load(): Promise<Workspace | null> {
    const db = await this.openDb()
    try {
      const { promise, resolve, reject } = Promise.withResolvers<unknown>()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(STATE_KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      const raw = await promise
      if (typeof raw !== 'string') {
        return null
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }

      const dto = migrate(parsed)
      if (dto === null) {
        return null
      }

      return fromWorkspaceDTO(dto)
    } finally {
      db.close()
    }
  }
}
