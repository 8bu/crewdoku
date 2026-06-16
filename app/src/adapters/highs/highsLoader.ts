/* HiGHS WASM loader — memoized singleton (ported verbatim from legacy
 * src/solver/highs-loader.js).
 *
 * The `highs` package exposes its wasm asset via the `./runtime` export
 * (mapped to build/highs.wasm); the deeper `highs/build/highs.wasm` path is
 * NOT in the package `exports` map (ERR_PACKAGE_PATH_NOT_EXPORTED), so we
 * import `highs/runtime?url` so Vite fingerprints + serves it and `locateFile`
 * returns that resolved URL. This module is only ever imported inside a real
 * Worker context (see worker.ts), never in unit tests.
 */
import highsLoader from 'highs'
// `highs/runtime?url` is a Vite-only virtual import; declared in vite-env.d.ts.
import wasmUrl from 'highs/runtime?url'

/** The loaded HiGHS WASM instance, as typed by the `highs` package itself. */
export type HighsInstance = Awaited<ReturnType<typeof highsLoader>>

let _highs: HighsInstance | null = null
let _pending: Promise<HighsInstance> | null = null

export async function getHighs(): Promise<HighsInstance> {
  if (_highs) return _highs
  if (!_pending) {
    _pending = highsLoader({ locateFile: () => wasmUrl }).then((h) => {
      _highs = h
      return h
    })
  }
  return _pending
}

export default getHighs
