/**
 * Ambient type declarations for @crewdoku/solver Web Worker and Vite environment.
 *
 * The compiler library configuration is bare ES2022 (no DOM or WebWorker lib)
 * to keep this package environment-neutral. Minimal ambient globals required
 * for Web Worker execution and bundler asset resolution are declared here.
 */

declare module 'highs/runtime?url' {
  const wasmUrl: string
  export default wasmUrl
}

declare const performance: { now(): number } | undefined

declare const window: unknown

interface ImportMeta {
  readonly url: string
}

declare class URL {
  constructor(path: string, base: string)
}

interface WorkerGlobalScopeMinimal {
  readonly postMessage: (message: unknown) => void
  onmessage: ((e: { data: unknown }) => void) | null
}

declare const self: WorkerGlobalScopeMinimal | undefined

declare class Worker {
  constructor(scriptURL: unknown, options?: { type?: string })
  postMessage(message: unknown): void
  addEventListener(
    type: 'message',
    listener: (e: { data: unknown }) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (e: { data: unknown }) => void,
  ): void
  terminate(): void
}
