import type { AppStateDTO, StoragePort } from '@crewdoku/domain'

/**
 * IdbStorageAdapter persists the whole app state as a single JSON blob in one
 * IndexedDB object store under a fixed key. It is the app-side implementation
 * of the domain StoragePort and holds NO domain schema knowledge: it stores and
 * loads plain JSON (AppStateDTO). The domain owns Map<->Assignment[] conversion,
 * so the lossy Map/Set -> {} degradation can never happen here — only arrays and
 * primitives ever touch IndexedDB.
 */
const STORE_NAME = 'crewdoku'
const STATE_KEY = 'state'

export class IdbStorageAdapter implements StoragePort {
  private readonly dbName: string

  constructor(dbName = 'crewdoku') {
    this.dbName = dbName
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async save(state: AppStateDTO): Promise<void> {
    const db = await this.openDb()
    try {
      // Serialize to plain JSON so nothing structured (Map/Set/Date) is stored.
      const json = JSON.stringify(state)
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(json, STATE_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }

  async load(): Promise<AppStateDTO | null> {
    const db = await this.openDb()
    try {
      const json = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(STATE_KEY)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      if (typeof json !== 'string') return null
      return JSON.parse(json) as AppStateDTO
    } finally {
      db.close()
    }
  }
}
