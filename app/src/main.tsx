import { createRoot } from 'react-dom/client'
import { createStore } from './store/store'
import { IdbStorageAdapter } from './adapters/storage/idbStorageAdapter'
import { HighsSolverAdapter } from './adapters/highs/highsSolverAdapter'
import { App } from './App'
import './index.css'

// Singleton store wired to the real persistence + solver adapters. The HiGHS
// adapter owns a Web Worker that loads the WASM lazily on first solve, so
// constructing it here does not block boot.
const store = createStore({
  storage: new IdbStorageAdapter(),
  solver: new HighsSolverAdapter(),
})

// Hydrate persisted state; if none exists, seed the demo so the board boots
// populated (and so the first run is immediately useful).
void store
  .getState()
  .hydrate()
  .then(() => {
    if (store.getState().employees.length === 0) store.getState().loadDemo()
  })

// Dev-only test seam: expose the store so end-to-end browser tests can drive
// and assert domain state directly. Tree-shaken out of production builds.
if (import.meta.env.DEV) {
  ;(window as unknown as { __store?: typeof store }).__store = store
}

createRoot(document.getElementById('root')!).render(<App store={store} />)
