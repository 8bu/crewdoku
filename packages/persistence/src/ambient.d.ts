/**
 * Bare ambient declarations for IndexedDB APIs.
 *
 * packages/persistence uses the bare ES2022 compiler lib (no DOM lib).
 * Minimal declarations required for IndexedDB storage operations are declared here.
 */

interface IDBRequestTarget extends EventTarget {
  readonly result: unknown
  readonly error: unknown
}

interface IDBOpenDBRequestTarget extends IDBRequestTarget {
  readonly result: IDBDatabase
}

interface IDBTransactionTarget extends EventTarget {
  readonly error: unknown
}

interface IDBDatabaseTarget extends EventTarget {
  readonly error: unknown
}

interface IDBObjectStoreParameters {
  keyPath?: string | string[]
  autoIncrement?: boolean
}

interface IDBObjectStoreNames {
  contains(name: string): boolean
}

interface IDBObjectStore {
  get(query: string | number): {
    result: unknown
    error: unknown
    onsuccess: ((event: unknown) => void) | null
    onerror: ((event: unknown) => void) | null
  }
  put(value: unknown, key?: string | number): {
    result: unknown
    error: unknown
    onsuccess: ((event: unknown) => void) | null
    onerror: ((event: unknown) => void) | null
  }
  delete(query: string | number): {
    result: unknown
    error: unknown
    onsuccess: ((event: unknown) => void) | null
    onerror: ((event: unknown) => void) | null
  }
}

interface IDBTransaction {
  readonly error: unknown
  oncomplete: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onabort: ((event: unknown) => void) | null
  objectStore(name: string): IDBObjectStore
}

interface IDBDatabase {
  readonly name: string
  readonly version: number
  readonly objectStoreNames: IDBObjectStoreNames
  createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore
  transaction(storeNames: string | string[], mode?: 'readonly' | 'readwrite'): IDBTransaction
  close(): void
}

interface IDBOpenDBRequest {
  result: IDBDatabase
  error: unknown
  onupgradeneeded: ((event: unknown) => void) | null
  onsuccess: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
}

interface IDBFactory {
  open(name: string, version?: number): IDBOpenDBRequest
}

declare const indexedDB: IDBFactory

/**
 * `Promise.withResolvers` shipped in ES2024; this package's lib is bare
 * ES2022 by design. Every target runtime (browsers since 2024, node >= 22)
 * implements it — only the type is missing, declared here.
 */
interface PromiseConstructor {
  withResolvers<T>(): {
    promise: Promise<T>
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: unknown) => void
  }
}
