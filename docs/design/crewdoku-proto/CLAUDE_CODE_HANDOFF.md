# Claude Code Handoff — ShiftForge

> **Who this is for:** A Claude Code agent (or developer) continuing implementation of ShiftForge in the Vite codebase at `src/`.
>
> **TL;DR:** A hi-fi prototype exists at `ShiftForge.html` — it is the **living spec**. The Vite project at `src/` is the production codebase that should match it exactly and then go further. Start by running both side-by-side.

---

## 1. How to orient yourself

### Run the prototype (reference)
```
Open ShiftForge.html in a browser — no install needed.
```
This is the **single source of truth** for intended UI and behavior. Every interaction, animation, and layout decision is already designed here. When in doubt, match the prototype.

### Run the Vite app (the codebase to work in)
```bash
npm install
npm run dev   # http://localhost:5173
```

The Vite app should be **functionally identical** to the prototype. Today there are minor divergences (see §5). Fix those before adding new features.

---

## 2. Repository map

```
ShiftForge/
├── ShiftForge.html          ← prototype (living spec, always openable)
├── tokens.css               ← design tokens for the prototype
├── *.jsx / *.js             ← CDN prototype source files (do not edit for new features)
│
├── src/                     ← VITE PROJECT — work here
│   ├── main.jsx / App.jsx   ← entry + app shell
│   ├── index.css            ← tailwind + token imports
│   ├── tokens.css           ← design tokens (keep in sync with root tokens.css)
│   ├── data/sf.js           ← schedule data + solver simulation
│   ├── data/db.js           ← IndexedDB key-value store
│   ├── store/reducer.js     ← pure reducer + initialState
│   ├── store/store.js       ← Zustand store
│   ├── components/          ← shared UI (Btn, Panel, Badge, Sidebar, …)
│   └── features/            ← board/, generate/, leader/, member/, admin/
│
├── README.md                ← developer setup guide
├── CLAUDE.md                ← full project context (read this too)
└── REQUIREMENTS.md          ← original product requirements
```

**Path aliases** are configured in `vite.config.js`:
- `@/` → `src/`
- `@features/board/Board` → `src/features/board/Board.jsx`
- `@store/store` → `src/store/store.js`
- etc.

---

## 3. Design system rules (never violate these)

| Rule | Value |
|------|-------|
| Border radius | `rounded-[2px]` everywhere — never `rounded-md`, never pill |
| Typography | IBM Plex Sans (UI), IBM Plex Mono (data/numbers) |
| Colors | Only from CSS custom properties in `tokens.css` |
| Expressive color | Shift colors `--sh-{N\|E\|M\|A\|L}-{bg\|fg\|bd}` + status tones `--st-{ok\|warn\|crit\|prop}` |
| Chrome | Neutral gray — no decorative color in nav, toolbars, backgrounds |
| Icons | Geometric Unicode only: `▸ ▾ ◢ ◆ ⚠ ✓ ✕ ⇄` — no emoji, no icon font |
| Density | Dense desktop-app UI (Linear-like) — not a marketing page |

All tokens live in `src/tokens.css`. Don't invent new color values — use or extend the token system.

---

## 4. State management

State is in Zustand (`src/store/store.js`), wrapping a pure reducer (`src/store/reducer.js`).

```jsx
// In any component:
import { useAppStore } from '@store/store'
const app      = useAppStore(s => s.app)
const dispatch = useAppStore(s => s.dispatch)

// Dispatch an action (existing pattern — keep working):
dispatch({ type: 'SET_ROLE', role: 'admin' })

// Or add a named action to store.js (preferred going forward):
// setRole: (role) => set(s => ({ app: { ...s.app, role, seedMode: false } }))
```

**Migration path:** The reducer actions are all in `src/store/reducer.js`. As you touch components, convert `dispatch({ type: ... })` calls to named Zustand actions — don't do it all at once.

**Persistence:** App state is saved to IndexedDB via `src/data/db.js`. The `App.jsx` loads on mount and debounced-saves on change. `overrides` (Map) and `swaps` are serialised with `DB.mapToObj` / `DB.objToMap`.

---

## 5. Known divergences — fix these first

These exist in the Vite app but are **wrong or incomplete** vs the prototype:

| File | Issue |
|------|-------|
| `src/features/board/Board.jsx` | Uses bare `React.Fragment` without importing `React` — needs `import React from 'react'` or replace with `<>` fragments throughout |
| `src/components/Sidebar.jsx` | Employee picker dropdown may not render correctly — test the Member role switcher |
| `src/features/admin/AdminSurface.jsx` | Auto-converted from CDN IIFE — verify all internal components render, especially `EmployeeModal` and `TeamsConfig` |
| Both | `src/tokens.css` and root `tokens.css` are identical copies — they will drift apart; set up a symlink or shared source |

---

## 6. What's simulated — replace these with real implementations

### 6a. The solver (highest priority)

`SF.makeProposal(pinsSet)` in `src/data/sf.js` is **entirely scripted** — it picks 26 random cells and swaps shifts. It does not optimise anything.

**To replace:**
```js
// src/data/sf.js  — swap this function
async function makeProposal(pinsSet) {
  const response = await fetch('/api/solver/generate', {
    method: 'POST',
    body: JSON.stringify({
      horizon:   { start: -14, end: 13 },
      employees: EMPLOYEES,
      shifts:    SHIFTS,
      overrides: [...pinsSet].map(key => ({ key, pinned: true })),
    }),
  })
  return response.json()
  // Must return: { id, changes[], fairness, prevFairness, penalty, prevPenalty, breakdown[] }
}
```

The UI is already wired up to handle the response — scan overlay, proposal review, Accept/Reject/Apply. You only need to replace the function.

### 6b. Employee data

100 hardcoded employees in `src/data/sf.js` (`EMPLOYEES` array, generated via deterministic hash). Replace with an API call or import from your user directory.

### 6c. Local-only persistence

`src/data/db.js` uses **browser IndexedDB** — data is per-device, per-browser, not synced. Replace `DB.get()` / `DB.set()` with API calls to persist to a real backend.

### 6d. Authentication

There is none. The role switcher at the sidebar bottom is UI-only (no auth gate). Add your auth layer in `src/App.jsx` before rendering `<Sidebar>` and surfaces.

---

## 7. Priority task list

Work in this order:

### P0 — Fix divergences (§5)
Get the Vite app pixel-matching the prototype before adding anything new.

### P1 — Solver API
Replace `SF.makeProposal` with a real endpoint. The solver should accept the schedule state and return a proposal diff. See §6a for the contract.

### P2 — Real data layer
Replace hardcoded employees and IndexedDB with API-backed data. Suggested shape:
- `GET /api/employees` → `Employee[]`
- `GET /api/schedule?week=0` → `{ assignments: { [key: string]: string|null } }`
- `POST /api/schedule` → save overrides
- `POST /api/solver/generate` → proposal diff

### P3 — Authentication
Wrap the app in an auth provider. The `role` field in state (`'admin'` | `'member'`) should be derived from the authenticated user's claims, not the UI toggle.

### P4 — Test suite
No tests exist. Add:
- Unit tests for `src/store/reducer.js` (pure function, easy to test)
- Unit tests for `SF.checkViolations` (real constraint logic)
- Component tests for the board interactions (cell click → popover → assign)
- E2E for the solver flow (Generate → Run → Review → Apply)

### P5 — TypeScript
`tsconfig.json` is already configured. Rename files `.jsx` → `.tsx` incrementally, starting with the data layer (`sf.js`, `db.js`) and store.

---

## 8. Key files to read before touching anything

| File | Why |
|------|-----|
| `CLAUDE.md` | Full project context, design decisions, constraint model |
| `src/data/sf.js` | All schedule logic — constraints, solver sim, horizon |
| `src/store/reducer.js` | Every state action — understand this before adding state |
| `src/features/board/Board.jsx` | The main surface — most complex component |
| `src/features/leader/LeaderSurface.jsx` | Solver state is lifted here — understand before touching generate flow |

---

## 9. Hard constraint model (for solver integration)

| ID | Rule | Implementation |
|----|------|----------------|
| H1 | Shift coverage ≥ required headcount | Solver must enforce |
| H2 | Max 48h/week per employee | `SF.checkViolations` checks this live on manual edits |
| H3 | Min 11h rest between shifts | `SF.checkViolations` checks this live |
| H4 | One shift per day | Enforced by UI (only one shift assignable per cell) |
| H5 | Approved absences respected | Solver must honour pinned day-offs |

Soft constraints S1–S5 are weighted in `SF.SOFT` and tunable in the Admin → Schedule priorities screen.

---

## 10. Running in production

```bash
npm run build     # outputs to dist/
npm run preview   # preview built output locally
```

The app is a fully client-side SPA today. Serve `dist/` from any static host. When you add a real backend, point the API base URL via an environment variable — add `VITE_API_BASE_URL` to your `.env` and reference it as `import.meta.env.VITE_API_BASE_URL` in the data layer.
