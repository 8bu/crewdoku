import { create } from 'zustand'
import { reducer, initialState } from './reducer'

/**
 * useAppStore — Zustand store wrapping the app reducer.
 *
 * Usage in any component (no prop drilling needed):
 *   const app      = useAppStore(s => s.app)
 *   const dispatch = useAppStore(s => s.dispatch)
 *
 * For components that still receive (app, dispatch) as props,
 * keep the signature — the store feeds them from App.jsx.
 *
 * Migration path → named actions:
 *   Add methods directly to this store, e.g.
 *   setRole: (role) => set(s => ({ app: { ...s.app, role, seedMode: false } }))
 *   Then swap call sites from dispatch({ type: 'SET_ROLE', role }) → setRole(role).
 */
export const useAppStore = create((set) => ({
  app: initialState,

  dispatch: (action) =>
    set((store) => ({ app: reducer(store.app, action) })),
}))
