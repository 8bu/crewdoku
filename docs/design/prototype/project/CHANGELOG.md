# Crewdoku — Changelog

## Session — June 17 2026

### Solver proposal UX overhaul

**Problem:** The proposal review phase had per-cell accept/reject (violet popover on each changed cell), a progress bar tracking individual decisions, and bulk "Accept all / Reject all" buttons. This added unnecessary friction — the planner just wants to see what changed and decide yes or no on the whole proposal.

**Changes across `board.jsx`, `generate.jsx`, `app.jsx`, `leader.jsx`:**

- **Removed** `DiffPopover` component (per-cell accept/reject popover)
- **Removed** `decided` map, `acceptedCount`, `decidedCount` from board and generate panel
- **Removed** "Review proposal" panel section from `GeneratePanel`
- **Removed** `"review"` solver phase — proposal arrival no longer transitions to a separate state
- **Added** `Original | Solved` segmented toggle in the diff banner — lets the planner flip the entire board between the pre- and post-solve states for comparison
- **Simplified** diff banner to: `◆ P-001 · N changes · stats` + `[Original|Solved]` + `[Discard]` + `[Apply]`
- **Added** `Discard / ✓ Apply` buttons at the bottom of the GeneratePanel result section
- **Simplified** `DIFF_APPLY` reducer: applies **all** proposed changes unconditionally (no per-cell decisions)
- **Fixed** stale variable reference: `isProposed` renamed to `isChanged` throughout cell rendering (had been missed in one `onMouseEnter` guard → `ReferenceError` → blank page)

---

### Empty schedule start after onboarding

**Problem:** After completing the onboarding wizard, the board showed a fully pre-solved schedule (from `SF.baseAssign`). The intended UX is: planner sets up the org, then **runs the solver** to generate the first schedule — experiencing the full generate → review → apply flow.

**Changes across `app.jsx`, `board.jsx`:**

- **Added** `emptySchedule: boolean` to app state (default `false`)
- **`LOAD_CUSTOM`** (dispatched when onboarding completes) sets `emptySchedule: true`
- **`DIFF_APPLY`** clears `emptySchedule: false` (first solve applied = board is no longer blank)
- **`SET_CELL`** also clears `emptySchedule: false` (manual edit = planner is working the board)
- **`LOAD_DEMO`** sets `emptySchedule: false` (demo data loads with a pre-existing schedule)
- **`DB_LOAD`** restores `emptySchedule` from IndexedDB so a page refresh respects the current state
- **Board `getShift`** returns `null` for all cells when `emptySchedule` is true — grid structure visible but all cells blank
- **Guidance banner** added to the board: *"Schedule is empty — run the solver to generate your first schedule"* with a direct **▸ Generate** button
- **TweaksPanel** wired into `App` with a `TweakToggle` for "Empty schedule" — lets the planner toggle the blank-start state manually without resetting

---

### Bug fixes

| File | Bug | Fix |
|---|---|---|
| `board.jsx` | `isProposed` reference in `onMouseEnter` guard not renamed when the variable was changed to `isChanged` → `ReferenceError` → blank page on any board render | Renamed to `isChanged` |
| `onboarding.jsx` | `StepTeam` component referenced `validDepts` (a local variable inside `OnboardingWizard`) instead of its own `depts` prop → `ReferenceError: validDepts is not defined` the moment any employees were parsed (including via "⤓ demo team") → crash | Changed both `validDepts` references to `depts` |
| `data.js` | `makeProposal` hardcoded `i < 100` — after custom onboarding with fewer employees, `EMPLOYEES[i]` is `undefined` and `.home` throws | Changed to `i < EMPLOYEES.length` |
| `data.js` | `workloadHistogram` hardcoded `i < 100` — same crash path as above | Changed to `i < EMPLOYEES.length` |
| `data.js` | `workloadHistogram` returned buckets with property `n` but `CompactHist` read `b.count` → all bars rendered at zero height | Renamed property to `count`; aligned bucket thresholds to 48h cap |
| `data.js` | `baseAssign(i, absDay)` accessed `EMPLOYEES[i].home` without a guard — could throw if called with an out-of-range index | Added `if (!EMPLOYEES[i]) return null` guard |
| `onboarding.jsx` | `finish()` replaced `SF.SHIFTS` but never called `SF.rebuildShiftIdx()` — `SHIFT_IDX` stayed stale if custom shift codes differed from the originals | Added `SF.rebuildShiftIdx()` call after replacing shifts |

---

### New files

| File | Purpose |
|---|---|
| `SOLVER_INTEGRATION.md` | Full integration guide for a coding agent wiring a real solver: user journey, mock→real replacement pattern, proposal shape contract, input data reference, phase state machine, files to touch |
| `CHANGELOG.md` | This file |
