# Crewdoku — Project Context for Claude

You are continuing work on **Crewdoku**, a constraint-based team scheduling web app prototype. Read this entire file before doing anything. Do not re-ask questions already answered here.

---

## What is Crewdoku

An **offline-first, single-user web app** for one planner to build and manage a multi-week team work schedule. One person uses it on their own machine. It auto-solves the schedule with an optimization engine and exports to CSV.

It is an **app, not a platform**. There are explicitly **no**:
- User accounts, login, roles, or permissions
- Approval / consent / request / swap workflows between people
- Multi-tenant or collaboration features
- Network/server dependency — everything runs and saves locally

A planner edits the schedule directly. A "swap" is just the planner editing two cells.

---

## What has been built

Two parallel forms of the same app:

| Form | Entry point | Stack | Use |
|------|-------------|-------|-----|
| **CDN prototype** | `Crewdoku.html` | React 18 CDN + Babel + Tailwind CDN | In-browser preview, no tooling |
| **Vite project** | `index.html` → `src/main.jsx` | Vite + React 18 + Zustand + Tailwind PostCSS | Production-ready codebase |

`ShiftForge.html` is a legacy entry point — use `Crewdoku.html` going forward.

---

## Vite project — file structure

```
src/
├── main.jsx                    # React root
├── App.jsx                     # App shell (DB sync, keyboard shortcuts, layout)
├── index.css                   # Tailwind directives + token imports
├── tokens.css                  # All CSS custom properties
│
├── data/
│   ├── sf.js                   # SF — schedule data, solver sim, violation checks
│   └── db.js                   # DB — IndexedDB key-value store
│
├── store/
│   ├── reducer.js              # Pure reducer + initialState
│   └── store.js                # Zustand store wrapping the reducer
│
├── components/
│   ├── ui/index.jsx            # Shared UI kit (Btn, Panel, Badge, Modal, …)
│   ├── Sidebar.jsx             # Sidebar nav + locale switcher
│   ├── PageHeader.jsx          # Page header bar
│   └── ExportModal.jsx         # CSV / Print export modal + helpers
│
└── features/
    ├── board/
    │   ├── Board.jsx           # ScheduleBoard — main grid, scan overlay, diff banner
    │   ├── Popovers.jsx        # ContextMenu, EmpActionPopover, DiffPopover
    │   └── CoverageView.jsx    # "By time" pivot
    ├── generate/
    │   ├── GeneratePanel.jsx   # 300px right sidebar — solver controls, log, results
    │   ├── SolverLog.jsx       # Live scrolling solver log
    │   └── Charts.jsx          # PenaltyBars, CompactHist
    ├── leader/
    │   └── LeaderSurface.jsx   # Combined board + generate panel (solver state here)
    └── admin/
        └── AdminSurface.jsx    # Shift config, rules, teams, prefs, weights
```

**Config files:** `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `.gitignore`, `README.md`

---

## CDN prototype — file structure

| File | Purpose |
|------|---------|
| `Crewdoku.html` | Entry point — loads all scripts in order (no member.jsx) |
| `tokens.css` | All CSS vars + animation keyframes |
| `data.js` | `window.SF` — schedule data + solver simulation |
| `db.js` | `window.DB` — IndexedDB key-value store |
| `ui.jsx` | Shared component kit → `window.*` |
| `board.jsx` | `window.ScheduleBoard` — main grid |
| `leader.jsx` | `window.LeaderSurface` — combined board + generate panel |
| `admin.jsx` | `window.AdminSurface` — shift config, rules, teams, prefs, weights |
| `generate.jsx` | `window.GeneratePanel` — right sidebar solver controls |
| `app.jsx` | Root `App`, `Sidebar`, reducer, keyboard shortcuts |
| `tweaks-panel.jsx` | Tweaks starter component (do not modify) |

`member.jsx` exists in the repo but is **not loaded** — the planner-only model has no employee self-service surface.

---

## App shell

**Layout:** [Sidebar 192px | Content flex-1] → StatusBar (24px)

**Single user — no roles.** The sidebar has no role switcher. There is one surface: the planner's board + config.

**State** (CDN): single `useReducer` in `App`. Key fields:

| Field | Type | Purpose |
|-------|------|---------|
| `adminView` | `"board" \| "generate" \| "config"` | Which surface is showing |
| `adminSection` | string | Active config sub-section |
| `weekOffset` | number | Current week (0 = current week) |
| `seedMode` | boolean | Pin-mode active |
| `pins` | Set | Locked cells for solver |
| `overrides` | Map | Manual cell edits |
| `diff` | object\|null | Active solver proposal |
| `dataMode` | `"empty" \| "demo" \| "custom"` | Whether schedule data is loaded |
| `locale` | `"en" \| "vi"` | UI language (i18n not yet wired) |
| `dbLoaded` | boolean | IndexedDB load complete |

**DB key:** `cw_state_v1` (IndexedDB). Saves: `dataMode`, `locale`, `overrides`.

### Sidebar nav

| Item | Action |
|------|--------|
| Board | `ADMIN_VIEW: "board"` |
| *(Proposal pending pill)* | `ADMIN_VIEW: "generate"` |
| Shift definitions | `ADMIN_VIEW: "config"` + `ADMIN_SECTION: "shifts"` |
| Scheduling rules | `ADMIN_VIEW: "config"` + `ADMIN_SECTION: "rules"` |
| Teams & structure | `ADMIN_VIEW: "config"` + `ADMIN_SECTION: "teams"` |
| Emp. preferences | `ADMIN_VIEW: "config"` + `ADMIN_SECTION: "prefs"` |
| Schedule priorities | `ADMIN_VIEW: "config"` + `ADMIN_SECTION: "weights"` |

Locale switcher (non-functional in prototype) lives in sidebar footer.

### Empty board state

When `dataMode === "empty"` and `adminView !== "config"`, the board area shows `<EmptyBoardState>` instead of the grid. This component offers:
- **Load demo data** → dispatches `LOAD_DEMO` (sets `dataMode: "demo"`, seeds SF.PINS, clears overrides)
- **Set up org** → disabled, tooltip "Onboarding wizard — planned for a future release"

Config sections are accessible in any dataMode.

---

## Combined board + generate view

`LeaderSurface` renders:
```
[ ScheduleBoard (flex-1) ] [ GeneratePanel (300px, collapsible) ]
```

Solver state (`phase`, `elapsed`, `relaxed`, `outcome`) is lifted into `LeaderSurface`.

`adminView` drives panel open/closed: `"board"` → closed, `"generate"` → open.

When `adminView === "config"`, full-screen `AdminSurface` replaces both.

### Board toolbar Generate button

| State | Label |
|-------|-------|
| Idle, no diff | `▸ Generate` |
| Solver running | `[spinner] Solving…` |
| Proposal pending | `◆ N proposed` |

---

## Schedule board

- **Rows** = employees (grouped by dept, collapsible, ~100 rows)
- **Columns** = 2-level header: Week range › Day of week
- **Pivots:** By employee (default) · By time (rows = shifts, cells = chips)
- Sticky first column (200px), sticky 2-row header
- Both horizontal + vertical scroll freely

### Status encoding
| Class | Meaning |
|-------|---------|
| `.sf-proposed` | violet dashed outline — solver diff |
| `.sf-viol` | solid red outline — rule violation |
| ◢ corner wedge | pinned for next generation |
| H6 badge (amber) | shift ineligible for this employee |

### Cell edit popover (EmpActionPopover)

Opened by clicking any cell. Shows all shifts:
- **Eligible shifts** — clickable, show H2/H3 violation warnings if applicable
- **Ineligible shifts** — shown at 40% opacity, `cursor-not-allowed`, amber `H6` badge, not clickable
- **Day off** option — always shown
- **Pin / Unpin** toggle at bottom

Eligibility is determined by `emp.eligibleShiftIds[]`. Defaults to all shifts.

---

## Design system

- **Aesthetic:** Dense modern product UI (Linear-like), neutral gray chrome
- **Typography:** IBM Plex Sans (UI), IBM Plex Mono (data/numbers)
- **Borders:** always `rounded-[2px]` — never rounded-md or pill
- **Shift colors:** `--sh-{N|E|M|A|L}-{bg|fg|bd}`
- **Dark theme** via `[data-theme="dark"]` on `<html>` — Tweak, not default
- **No emoji** — geometric Unicode only (▸ ▾ ◢ ◆ ⚠ ✓ ✕)

---

## Data model (SF)

### Shifts
```js
{ code, name, start, end, req, cap,
  byDow: [{min, max}, …]  // 7 entries Mon→Sun, per-day coverage requirements
}
```
`isNight` is **computed on the fly**: `SF.isNight(shift)` → `start < 8 || start >= 20`. Not a stored field.

`SF.coverageForDay(code, dow)` → `{min, max}` for a given shift and day-of-week (0=Mon).

### Employees
```js
{ i, id, name, dept, deptName, home,
  eligibleShiftIds: string[],  // H6 — shift codes this employee can work; defaults to all
  depts: string[],             // multi-dept support
  prefs: { nightPref, weekendPref, daysOff, maxShiftsWeek, notes }
}
```

### Hard constraints (H1–H6)
- H1: coverage (req headcount per shift per day — uses `byDow[dow]`)
- H2: max 48h/week
- H3: min 11h rest between shifts
- H4: one shift per day
- H5: approved absences respected
- H6: eligibility — only assign shifts in `emp.eligibleShiftIds`

### Soft constraints (S1–S5)
- S1: night-shift fairness (weight 8)
- S2: preference satisfaction (weight 6)
- S3: minimal changes (weight 4)
- S4: weekend rotation (weight 5)
- S5: sequence consistency (weight 3)

---

## Solver simulation

The solver is **simulated** — nothing is actually optimized.

| Function | Real? | Notes |
|----------|-------|-------|
| `SF.baseAssign(i, absDay)` | ✓ | Deterministic hash-based base schedule |
| `SF.checkViolations(i, absDay, code, getShift)` | ✓ | Real H2 + H3 + H6 checks |
| `SF.makeProposal(pinsSet)` | ✗ | Scripted: picks ~26 non-pinned cells, swaps shifts |
| `SF.INFEASIBLE` | ✗ | Scripted conflict core + 3 relaxations |
| `SF.SOLVER_LOG` | ✗ | Hardcoded log lines timed to ~3s run |

Horizon: absDay −14 to +13. absDay 0 = Mon Jun 15 2026.

**To connect a real solver:** replace `SF.makeProposal(pinsSet)` with a `fetch()`. Return shape:
```ts
{ id, changes[], fairness, prevFairness, penalty, prevPenalty, breakdown[] }
```

---

## Known design decisions (do not revisit unless asked)

- **No roles / no Member surface** — single planner, no employee self-service
- **No swap/request workflows** — planner edits cells directly
- **No tab strips** — navigation is sidebar-driven
- **No separate Generate screen** — collapsible right panel on the board
- **No permission config** — removed, single-user app
- **Empty board state by default** — app starts with `dataMode: "empty"`, shows placeholder until "Load demo" or future onboarding
- **Onboarding wizard** — not yet built; "Set up org" button is disabled with tooltip
- **Planning period config** — not yet supported; hardcoded 4-week horizon (absDay -14..+13)
- **i18n** — locale switcher UI present (EN / VI), translations not yet wired
- **Color is for meaning only** — shift colors and status tones only
- **Board does not use virtualization** — 100 rows × 7 cols renders fine in DOM
- **`rounded-[2px]`** everywhere
- **Dark theme** is a Tweak, not the default
- **CDN prototype stays** alongside Vite project — don't delete it

---

## How to run

**CDN prototype** (instant, no install):
```
Open Crewdoku.html in browser
```

**Vite project** (development):
```bash
npm install
npm run dev   # http://localhost:5173
```

**Test the solver flow:** Load demo → Board → `▸ Generate` → Run solver → watch scan overlay → review violet cells → Apply / Discard.

**Infeasible flow:** Toggle "Infeasible" in panel → Run solver → pick relaxation → Re-run.

**Seed mode:** Press `S` → click cells to pin → Run solver (pinned = locked).
