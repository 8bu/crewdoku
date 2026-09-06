# ShiftForge

Constraint-based team scheduling — Vite + React 18 + Zustand.

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:5173** — no build step needed for development.

## Production build

```bash
npm run build     # outputs to dist/
npm run preview   # preview the built output
```

## Project structure

```
src/
├── main.jsx                    # React root
├── App.jsx                     # App shell (DB sync, keyboard shortcuts, layout)
├── index.css                   # Tailwind directives + token imports
├── tokens.css                  # All CSS custom properties (colours, spacing, shifts)
│
├── data/
│   ├── sf.js                   # SF — schedule data, solver simulation, violation checks
│   └── db.js                   # DB — IndexedDB key-value store
│
├── store/
│   ├── reducer.js              # Pure reducer + initialState
│   └── store.js                # Zustand store wrapping the reducer
│
├── components/
│   ├── ui/index.jsx            # Shared UI kit (Btn, Panel, Badge, Modal, …)
│   ├── Sidebar.jsx             # Sidebar nav + role switcher
│   ├── PageHeader.jsx          # Page header bar (used by Admin + Member)
│   └── ExportModal.jsx         # CSV / Print export modal + helpers
│
└── features/
    ├── board/
    │   ├── Board.jsx           # ScheduleBoard — main grid, scan overlay, diff banner
    │   ├── Popovers.jsx        # ContextMenu, EmpActionPopover, DiffPopover
    │   └── CoverageView.jsx    # "By time" pivot (rows = shifts, cells = employee chips)
    │
    ├── generate/
    │   ├── GeneratePanel.jsx   # 300px right sidebar — solver controls, log, results
    │   ├── SolverLog.jsx       # Live scrolling solver log
    │   └── Charts.jsx          # PenaltyBars, CompactHist
    │
    ├── leader/
    │   └── LeaderSurface.jsx   # Combined board + generate panel (solver state lifted here)
    │
    ├── member/
    │   └── MemberSurface.jsx   # My schedule, swaps, preferences
    │
    └── admin/
        └── AdminSurface.jsx    # Shift config, rules, teams, prefs, weights (1700+ lines)
```

## State management

`useAppStore` (Zustand) wraps the existing reducer. Any component can consume state directly:

```jsx
import { useAppStore } from '@store/store'

function MyComponent() {
  const app      = useAppStore(s => s.app)
  const dispatch = useAppStore(s => s.dispatch)
  // ...
}
```

Or receive `(app, dispatch)` as props from a parent — both patterns work.

**Migration path to named actions** — add methods directly to `store.js`:

```js
setRole: (role) => set(s => ({ app: { ...s.app, role, seedMode: false } }))
```

Then call `setRole('admin')` instead of `dispatch({ type: 'SET_ROLE', role: 'admin' })`.

## Replacing the simulated solver

`SF.makeProposal(pinsSet)` in `src/data/sf.js` is the **only** function to swap out.
Replace it with a `fetch()` to your backend. The return shape must be:

```ts
{
  id:           string
  changes:      Array<{ key: string, empIdx: number, absDay: number, from: string|null, to: string|null, note: string }>
  fairness:     number
  prevFairness: number
  penalty:      number
  prevPenalty:  number
  breakdown:    Array<{ id: string, name: string, now: number, prev: number }>
}
```

## Design tokens

All colours, spacing, and shift identity are CSS custom properties in `src/tokens.css`.
Tailwind maps onto them via `tailwind.config.js`. Change a token → it propagates everywhere.

## TypeScript

`tsconfig.json` is configured and ready. Rename any `.jsx` file to `.tsx` and add types
incrementally — no other changes needed.

## Path aliases

| Alias | Maps to |
|---|---|
| `@/*` | `src/*` |
| `@data/*` | `src/data/*` |
| `@store/*` | `src/store/*` |
| `@components/*` | `src/components/*` |
| `@features/*` | `src/features/*` |
