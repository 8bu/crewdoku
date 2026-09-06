# Crewdoku — UI Requirements Guide

**Audience:** the designer producing the new UI prototype.
**Status:** requirements only. This document says *what* the UI must do and *what data* it
has to work with — **not** how to lay it out, style it, or wire it. You own the visual and
interaction design; come back with a prototype (HTML/CSS/JS or design file). Engineering
converts your prototype into the React/TS app **without changing the behavior you specify**.

If a requirement here blocks a better design you have in mind, flag it — most are negotiable.
The ones marked **MUST** are not: they protect data integrity or accessibility.

---

## 0. What Crewdoku is

An **offline-first, single-user web app** for one company to build and manage a multi-week
team work schedule. One person (a planner) uses it on their own machine. It auto-solves the
schedule with a real optimization engine and exports to CSV.

It is an **app, not a platform**. There are explicitly **no**:
- user accounts, login, roles, or permissions
- approval / consent / request / "swap proposal" workflows between people
- multi-tenant or collaboration features
- network/server dependency — everything runs and saves locally (works offline)

A planner edits the schedule directly. A "swap" is just the planner editing two cells.

---

## 1. The mental model (read this before designing anything)

The whole app revolves around **one schedule grid**: rows are employees, columns are days.
Each grid cell holds at most one shift assignment for that employee on that day.

The planner's core loop:
1. Set up the org once (teams, shifts, coverage needs, rules, employees) — or load a demo.
2. Look at the schedule grid for a chosen week.
3. Edit cells by hand, **and/or** run the solver to auto-fill, review its proposal, accept/reject.
4. Fix any rule violations the app highlights.
5. Export to CSV.

**Primary surface = the grid.** Everything else is setup or assistance around it. The grid
must be fast to read and fast to edit. The previous UI made cell editing undiscoverable
(clicking a cell selected it instead of letting you change the shift) — see §5.4. Whatever
you design, **changing a cell's shift must be obvious and reachable in one direct gesture.**

---

## 2. The data (what exists to display and edit)

This is the real data model. Every screen is a view over some slice of it. IDs are opaque
stable strings — never show them; never rely on row position as identity.

### Entities

**Org** — `{ name }`. The single company. One exists.

**Shift** — a type of work block.
- `code` — short label, e.g. `N`, `E`, `M` (used in compact displays and CSV).
- `name` — full label, e.g. "Night".
- `startHour`, `endHour` — integer hours 0–24. May wrap past midnight (start 22 → end 6).
- `isNight` — boolean. Drives night-fairness logic. **Not** inferred from the code letter.

**Team** (a.k.a. department) — `{ name, shiftIds[] }`. A team staffs a specific set of shifts.
Employees belong to a team.

**Employee** —
- `name`, `teamId`.
- `eligibleShiftIds[]` — which shifts this person can work. Defaults to the team's shift set
  and may be **narrowed** (never widened beyond what the team staffs).
- `contract` — `{ maxHoursPerWeek?, maxShiftsPerWeek? }` (optional per-person caps).
- `timeOff[]` — date ranges the person is unavailable.
- `recurring[]` — recurring unavailability, e.g. "never works Sundays" (`noDow` + weekday).
- `prefs` — `{ night: prefer|willing|avoid, weekend: prefer|willing|avoid,
  preferredShiftId?, notes }`.

**Coverage** — per **team × shift**, how many people are needed.
- `byDow` — array of 7 `{ min, max }`, Monday→Sunday.
- `dateOverrides` — `{ [date]: { min, max } }` that beat the day-of-week value for specific dates.

**Period** — `{ startDate, weeks }`. The planning horizon. Weeks are ISO weeks (Monday-anchored).
The grid shows **one week at a time** out of this period.

**Assignment** — `{ employeeId, date, shiftId }`. One entry per filled cell.
- `shiftId = <a shift>` → working that shift.
- `shiftId = null` → **explicit day off** (planner deliberately marked it off).
- **no assignment at all** → cell is simply empty / unscheduled.
  (The day-off vs. empty distinction is real and must be visually distinguishable — see §5.2.)

**Rules** — global scheduling rules:
- `maxHoursPerWeek`, `minRestHours`, `maxConsecutiveDays`.
- `enabled` — on/off toggle per constraint (H1–H6, S1–S5).
- `weights` — relative importance per soft constraint (S1–S5).

### Constraints (what "a violation" means)

**Hard constraints (H)** — must never be violated; the app flags any cell that breaks one:
- H1 — coverage: each team×shift×day staffed within its min/max.
- H2 — max hours per week.
- H3 — minimum rest between shifts (aware of shifts crossing midnight and week boundaries).
- H4 — at most one shift per person per day.
- H5 — respect time-off and recurring unavailability.
- H6 — eligibility: a person only gets shifts they're eligible for.

**Soft constraints (S)** — preferences the solver optimizes; each has an on/off toggle and a
weight:
- S1 night fairness · S2 honor preferences · S3 stability (change as little as possible from
  the current schedule) · S4 weekend fairness · S5 shift-sequence smoothness.

The UI surfaces hard violations as cell highlights and a running count. Soft constraints
surface in the solver's score breakdown, not as per-cell errors.

---

## 3. Global shell

Persistent around every screen:

- **Brand** — app name + version badge (small).
- **Primary navigation** between top-level views: **Board** (the grid), **Configuration**
  (with sub-sections: Shifts, Rules, Priorities, Teams, Employees), **Onboarding** wizard.
  Solve and Export are actions/panels reachable from the Board, not separate nav destinations.
- **Status line** (persistent, ambient) showing at least: save state (e.g. "saved"),
  current hard-violation count, roster size (employees), shift count, online/offline.

Requirements:
- Navigation state is obvious (which view you're in).
- The shell never blocks the grid; setup lives beside it, not on top of it.

---

## 4. Onboarding wizard

First-run / empty-state path to populate the org. Linear, step-by-step:
**Org → Teams → Shifts → Coverage → Employees → Rules.** Plus a one-click **Load demo** that
fills a complete, valid example org so the planner can explore immediately.

Requirements:
- Each step collects exactly the data in §2 for that entity.
- A planner can finish onboarding and land on a non-empty Board.
- Empty Board state must offer both "start onboarding" and "load demo".

---

## 5. The Board — the schedule grid (most important surface)

### 5.1 Layout & structure

- **Rows = employees, grouped by team.** Each team group has a header row (team name +
  member count) and is collapsible.
- **Columns = the 7 days** of the currently-viewed week (Mon→Sun). Weekend columns are
  visually distinct.
- **First column = employee name** + that employee's total scheduled hours for the visible
  week. It stays visible while scrolling horizontally; the header row stays visible while
  scrolling vertically (both axes pinned).
- The grid should **use the available width** and remain readable with a large roster
  (100+ employees, real case). It must scroll, not overflow off-screen or crush columns.

### 5.2 What each cell shows

A cell represents one employee on one day. Visual states it must distinguish:
- **Has a shift** — show the shift (its code/time, color-coded per shift).
- **Explicit day off** (`shiftId: null`) — a distinct "off" marker, *different from empty*.
- **Empty** (no assignment) — blank/neutral.
- **Pinned** — locked before solving (the solver won't change it). Needs a marker.
- **Proposed change** — when a solver proposal is open, cells the solver wants to change are
  marked as a pending diff (distinct from committed values).
- **Violation** — cell participates in a hard-rule violation; clearly flagged (e.g. error
  treatment).

These states can combine (e.g. a pinned cell with a shift). Design a system that stacks them
legibly. Color is not the only signal for violation/off (accessibility — §11).

### 5.3 Reading aids

- Per-employee weekly hours, with a tone hint when over/under target.
- Week navigation: move between weeks of the period, jump to "today", and a label showing the
  visible week's date range.
- Pivot/secondary view: besides the employee×day grid, a **by-time / coverage view** that
  shows, per shift×day, how staffed vs. required it is (compare assigned count to coverage
  min/max). Treat this as a second way to look at the same week.
- Department filter: narrow the grid to one team.
- A status legend explaining the cell markers (pinned / proposed / violation / shift colors).

### 5.4 Editing — the core interaction (DO NOT repeat the prior mistake)

**MUST:** changing a single cell's shift must be a direct, discoverable gesture on that cell.
In the failed prototype, a plain click *selected* the cell and the editor was hidden behind a
keyboard shortcut — the planner couldn't tell how to change a shift. Avoid that. A planner who
has never seen the app must be able to click a cell and change its shift.

Per-cell edit must allow setting: a specific shift (eligible shifts only), an explicit day
off, or clearing the cell. When picking a shift, ineligible shifts must not be selectable
(or must be clearly disabled) — the app enforces eligibility (H6) regardless, but the UI
should make it obvious.

### 5.5 No spreadsheet behavior

Crewdoku does **not** support spreadsheet-style editing: no range/multi-cell selection, no
fill-down, no copy/paste of cells, no clipboard interop with Excel/Sheets, no selection-based
batch ops. Editing is **one cell at a time** (§5.4). (Pinning a selection is also out — pin
cells individually, §5.6.)

**MUST:** every edit participates in **undo/redo** (see §9).

### 5.6 Pinning

The planner can lock cells so the solver leaves them alone. Pin/unpin cells individually.
Pinned cells are visually marked and survive a solve unchanged.

---

## 6. Configuration

Five editors (sub-sections of Configuration). Each is CRUD over the matching entity in §2.
No solver logic here — just data entry with validation.

- **Shifts** — code, name, start/end hour, night flag. (Code may auto-derive from name but
  stay editable.) Deleting a shift must cascade safely (remove it from teams, eligibility,
  coverage).
- **Teams & structure** — team name + which shifts it staffs.
- **Employees** — all employee fields in §2: team, eligible shifts (constrained to the team's
  set), contract caps, time-off ranges, recurring unavailability, preferences, notes.
  Deleting an employee must remove only that person's data and never re-point anyone else's.
- **Scheduling rules** — max hours/week, min rest, max consecutive days.
- **Schedule priorities** — the soft-constraint controls: toggle each H/S constraint on/off,
  and set weights for the soft constraints (S1–S5). Make the effect of weight legible
  (relative importance), not just a raw number if you can.

Requirement: edits here take effect on the Board immediately (violation highlights, coverage
view, hours all reflect new config/rules).

---

## 7. Solve flow (auto-scheduling)

Reachable from the Board as a side panel (it must not replace the grid — the planner watches
the grid update). Stages:

1. **Pre-flight** — before running: show the horizon (period), roster size, team/shift counts,
   pinned-cell count, and which constraints are enabled. Lets the planner confirm what they're
   about to solve.
2. **Run** — a clear action. While solving, show a busy state (it's async; a few hundred ms to
   seconds). Pinned cells are held fixed.
3. **Result — proposal.** The solver returns a set of proposed cell changes (a diff vs. the
   current schedule), plus a score breakdown:
   - Per-cell diff shown **on the grid** (proposed state, §5.2) and/or listed in the panel.
   - Fairness and penalty scores, before vs. after, and a per-constraint breakdown so the
     planner sees *why* this schedule scored as it did.
   - The planner **accepts or rejects per cell** (or all), then applies. Only accepted cells
     are written. Applying is one undo step.
4. **Infeasible path** — if no valid schedule exists, don't just say "failed". Show a
   **conflict explanation** (which constraints clash — the conflict core) and offer
   **relaxations** (e.g. loosen a specific limit) that can be applied to re-run the solve.

Supporting displays the data supports: a workload histogram (distribution of hours across
people), a penalty-bars breakdown, a constraint inventory, and a solver log/elapsed time.

---

## 8. Export

Download the schedule as CSV. Two shapes:
- **Team grid CSV** — the grid as a table (employees × days).
- **Member list CSV** — a per-person list of assignments.

A small modal/dialog to choose shape and trigger the download. No server — generated and
downloaded locally.

---

## 9. Cross-cutting behaviors (apply everywhere relevant)

- **Undo / redo** — schedule edits are undoable (history depth is bounded). Single edits, bulk
  ops, paste/fill, and applying a solver proposal each form one undo step. Pin changes are not
  undoable. Provide discoverable undo/redo (and standard keyboard shortcuts).
- **Autosave / persistence** — all state saves locally and automatically; the planner never
  presses "save". The status line reflects save state. Reopening the app restores everything.
- **Offline** — fully functional with no network. Reflect offline status ambiently.
- **Transient notices** — short, non-blocking messages (e.g. bulk-fill results) announced and
  auto-dismissed; they must be accessible to screen readers.

---

## 10. Internationalization

- UI chrome (labels, buttons, headings, menus) is translatable — **English and Vietnamese**,
  with a language switcher. Browser language auto-detected on first run.
- **MUST NOT** translate user-entered data — employee names, team names, shift names, notes
  are shown verbatim, never run through translation.

---

## 11. Accessibility (non-negotiable baseline)

- Full keyboard operability of the grid (navigate, select, edit) and all dialogs/menus.
- Color is never the only carrier of meaning — violations, day-off, pinned, weekend, and shift
  identity each need a non-color cue (icon/shape/text/pattern) in addition to color.
- Proper roles/labels: the grid is a grid (cells labeled with employee + date + shift),
  selection count and transient notices are announced (live region), dialogs trap focus.
- Visible focus state on the active cell and controls.

---

## 12. Design system constraints (only the hard ones — the rest is yours)

You bring the look. These few are fixed because the codebase and tokens depend on them:
- **No emoji.** Use geometric/Unicode glyphs only (e.g. ▸ ▾ ◢ ◆ ⚠ ✓ ✕) for icon-like marks.
- Corners are square-ish (2px radius), not pills/large rounding — a dense, modern product feel
  (Linear-like), neutral gray chrome.
- Data/numbers in a monosped face; UI text in a sans face. (Specific families are flexible.)
- Shift colors are theme tokens keyed by shift code; the status markers (pinned / proposed /
  violation) are named tokens. Keep "shift color", "pinned", "proposed", "violation",
  "selection" as distinct, nameable visual roles so they map to tokens.
- A dark theme is a nice-to-have variant, not the default.

---

## 13. Explicit non-goals (do not design these)

- No login / accounts / roles / permissions.
- No approval, request, consent, or notification-to-other-people workflows.
- No real-time collaboration or multi-user presence.
- No server-side anything; no "share a link".
- No manual save button (autosave only).

---

## 14. What to hand back

A prototype (HTML/CSS/JS preferred, or a design file) covering at least: the Board grid with
its cell states and the single-cell + bulk editing gestures (§5), the solve panel with the
proposal/diff and infeasible/relaxation states (§7), the five config editors (§6), onboarding
(§4), and export (§8). Engineering will map your markup/styles onto the existing component
structure and data interface above **without altering the behaviors specified here** — so the
closer your prototype's structure reflects these surfaces and states, the cleaner the port.
