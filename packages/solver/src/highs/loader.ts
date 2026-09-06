/// <reference path="./ambient.d.ts" />

/**
 * HiGHS WASM loader — memoized single-flight instance.
 *
 * The `highs` package exports map exposes its WASM binary via `./runtime`.
 * In browser/worker builds, Vite resolves `highs/runtime?url` to the asset URL,
 * which is supplied to `locateFile` so the Emscripten runtime fetches the WASM
 * module. In Node, `highs` resolves the binary directly from disk.
 *
 * This module is worker-internal and lazy-loaded only when the worker handles
 * its first solve request.
 */
import highsLoader from 'highs'
import wasmUrl from 'highs/runtime?url'

export type HighsInstance = Awaited<ReturnType<typeof highsLoader>>

let highsInstance: HighsInstance | null = null
let pendingPromise: Promise<HighsInstance> | null = null

export async function getHighs(): Promise<HighsInstance> {
  if (highsInstance !== null) {
    return highsInstance
  }
  if (pendingPromise !== null) {
    return pendingPromise
  }
  pendingPromise = highsLoader({ locateFile: () => wasmUrl }).then((instance) => {
    highsInstance = instance
    return instance
  })
  return pendingPromise
}

export default getHighs
