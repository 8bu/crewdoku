# Solver Integration Guide — Crewdoku

> **Who this is for:** A developer / coding agent wiring a real CP-SAT (or similar) solver into Crewdoku.
> The prototype uses a fully mocked solver. This document describes the exact touchpoints to replace.

---

## 1. User journey — end to end

```
[Empty board after onboarding]
        │
        ▼
Guidance banner: "Schedule is empty — ▸ Generate"
        │
        ▼
User clicks ▸ Generate  →  GeneratePanel slides open (right sidebar, 300px)
        │
        ▼
User optionally enters Seed mode (keyboard S or toolbar button)
  → clicks cells on the board to pin/unpin assignments
  → pinned cells get ◢ corner mark; stored in app.pins (Set<"empIdx|absDay">)
        │
        ▼
User clicks ▸ Run solver  (inside GeneratePanel)
        │
        ▼
Solver animation begins:
  • phase: "queued" (700ms) → "solving" (3100ms simulated)
  • progress bar fills
  • live log panel streams entries from SF.SOLVER_LOG (mocked)
        │
        ▼
phase = "done"  →  effect fires in leader.jsx:
  dispatch({ type: "SET_PROPOSAL", proposal: SF.makeProposal(app.pins) })
        │
        ▼  ← *** THIS IS THE SOLE INTEGRATION POINT ***
        │
app.diff is set  →  board enters diff mode
        │
        ▼
Diff banner appears on the board:
  ◆ P-001 · 26 changes · fairness 82→87 · penalty 189→142
  [Original] [Solved]  ← toggle to preview before/after
  [Discard]  [Apply]
        │
        ├── User toggles Original / Solved to compare
        │
        ├── User clicks Apply
        │     → DIFF_APPLY fires: all proposal.changes written to overrides
        │     → emptySchedule cleared to false
        │     → diff = null
        │
        └── User clicks Discard
              → diff = null, board returns to previous state
```

### Infeasible path (separate branch)

```
Solver detects infeasibility
        │
        ▼
phase = "infeasible"  (set by GeneratePanel's setSolverState)
        │
        ▼
GeneratePanel shows:
  Banner: "No feasible schedule"
  Conflict core: list of hard-constraint collisions (SF.INFEASIBLE.core)
  3 suggested relaxations (radio buttons)
        │
        ▼
User selects a relaxation → clicks ↻ Re-run with relaxation
        │
        ▼
Solver re-runs with relaxed constraints
        │
        ▼
(falls back to optimal path above)
```

---

## 2. The mock function to replace

**File:** `data.js`  
**Function:** `SF.makeProposal(pinsSet)`

```js
// Current mock — replace this entire function body with a real solver call
function makeProposal(pinsSet) {
  // pinsSet: Set<"empIdx|absDay"> — cells locked by the planner
  // Returns a proposal object (see §3 for shape)
  ...
}
```

### Replacement pattern (async fetch example)

The current call site is in `leader.jsx`:

```js
useEffect(() => {
  if (solverState.phase === "done") {
    dispatch({ type: "SET_PROPOSAL", proposal: SF.makeProposal(app.pins) });
  }
}, [solverState.phase]);
```

For a real async solver, change `leader.jsx` to:

```js
useEffect(() => {
  if (solverState.phase === "done") {
    fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employees:   SF.EMPLOYEES,
        shifts:      SF.SHIFTS,
        depts:       SF.DEPTS,
        horizon:     SF.HORIZON,         // [-14, 13] absDay range
        pins:        [...app.pins],      // locked cell keys
        overrides:   Object.fromEntries(app.overrides), // current manual edits
        rules:       SF.RULES,           // { maxWeek, minRest }
        weekOffset:  app.weekOffset,
      }),
    })
    .then(r => r.json())
    .then(proposal => dispatch({ type: "SET_PROPOSAL", proposal }))
    .catch(() => setSolverState(s => ({ ...s, phase: "infeasible" })));
  }
}, [solverState.phase]);
```

---

## 3. Proposal shape (contract)

`dispatch({ type: "SET_PROPOSAL", proposal })` expects:

```ts
interface Proposal {
  id:           string;       // e.g. "P-001" — shown in the banner
  changes:      Change[];
  fairness:     number;       // 0–100 score after solve
  prevFairness: number;       // score before solve (for delta display)
  penalty:      number;       // total soft-constraint penalty after
  prevPenalty:  number;       // penalty before
  breakdown:    PenaltyTerm[]; // per soft-constraint breakdown
}

interface Change {
  key:    string;   // "empIdx|absDay"  e.g. "12|3"
  empIdx: number;   // employee index (SF.EMPLOYEES[empIdx])
  absDay: number;   // absDay relative to Jun 15 2026 (absDay 0 = Mon Jun 15)
  from:   string | null;  // shift code before, or null = was day off
  to:     string | null;  // shift code after,  or null = becomes day off
  note:   string;   // human-readable reason, shown in tooltip
}

interface PenaltyTerm {
  id:   string;  // "S1"–"S5"
  name: string;
  now:  number;
  prev: number;
}
```

### Apply behaviour

When the user clicks **Apply**, all changes are written unconditionally:

```js
case "DIFF_APPLY": {
  const overrides = new Map(state.overrides);
  state.diff.proposal.changes.forEach(c => {
    overrides.set(c.key, { code: c.to, viol: [] });
  });
  return { ...state, overrides, diff: null, emptySchedule: false };
}
```

There is no per-cell accept/reject anymore. The user previews with the **Original / Solved** toggle, then applies or discards the whole proposal.

---

## 4. Input data available to the solver

| Field | Location | Description |
|---|---|---|
| Employees | `SF.EMPLOYEES[]` | `{ i, id, name, dept, deptName, home, eligibleShiftIds[], prefs }` |
| Shifts | `SF.SHIFTS[]` | `{ code, name, start, end, req, cap, byDow[] }` |
| Departments | `SF.DEPTS[]` | `{ id, name, from, to }` (row ranges into EMPLOYEES) |
| Horizon | `SF.HORIZON` | `[-14, 13]` absDay range. absDay 0 = Mon Jun 15 2026 |
| Hard rules | `SF.RULES` | `{ maxWeek: 48, minRest: 11 }` |
| Pins | `app.pins` | `Set<"empIdx|absDay">` — locked cells |
| Overrides | `app.overrides` | `Map<key, { code, viol[] }>` — current manual edits |
| absDay helper | `SF.dateOf(absDay)` | Returns `Date` for any absDay |
| Base schedule | `SF.baseAssign(i, absDay)` | Deterministic fallback — what the board shows before any solve |

---

## 5. Solver phase state machine

Managed in `leader.jsx` via `solverState`:

```
idle  →  queued (700ms delay)  →  solving (real/simulated work)
                                        │
                          ┌─────────────┼──────────────────┐
                          ▼             ▼                  ▼
                        done      infeasible            (error)
                          │
                    SET_PROPOSAL dispatched
                          │
                       app.diff set  →  board shows diff banner
```

**To trigger infeasible:** `setSolverState(s => ({ ...s, phase: "infeasible" }))` from the solver callback.

---

## 6. Files to touch for a real solver

| File | What to change |
|---|---|
| `leader.jsx` | Replace the `useEffect` that calls `SF.makeProposal` with a `fetch()` call |
| `data.js` | Keep `SF.makeProposal` as a fallback/offline mock; add real endpoint |
| `generate.jsx` | Update `SF.SOLVER_LOG` streaming if you want real solver logs via SSE |
| `app.jsx` | `DIFF_APPLY` already applies all changes — no changes needed |

Everything else (board rendering, Original/Solved toggle, Apply/Discard, pin state, violation overlays) is **already implemented** and solver-agnostic.
