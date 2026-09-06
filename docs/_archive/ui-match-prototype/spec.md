# SPEC — Crewdoku UI rebuild to match the ShiftForge prototype

Status: draft for orchestrator review
Branch: `ui/match-prototype`
Authoritative visual target: `docs/plans/ui-match-prototype/design-map.md`
Scope: PRESENTATION ONLY (`app/src/**`) + ONE flagged demo-DATA enrichment (`packages/domain/src/seed/demo.ts`).

---

## 1. Problem statement & context

Crewdoku's current `app/src` presentation is a functional-but-plain skeleton: a 3-item
sidebar, a bare board table (shift code only, no time ranges, team-grouped but not
collapsible, no weekly hours), a 300px solve rail without pre-flight/log/charts, and
five usable-but-unstyled config screens. The ShiftForge prototype defines a denser,
Linear-like target: a 192px sidebar shell with SCHEDULE/CONFIGURATION sections, a rich
board toolbar (week nav, By-employee/By-time pivot, dept filter, seed/pin count, generate,
export), a STATUS legend, a board grid with time-range cells + 2-level sticky header +
collapsible dept groups + per-employee weekly hours, a cell-assign popover, a By-time
coverage pivot, a richer Generate panel (pre-flight table, constraint inventory, solver log,
result banner + penalty bars + workload histogram), and a realistic ~100-person demo roster.
This spec rebuilds/extends the presentation to that target while preserving the domain
contract (`app → @crewdoku/domain`, components never compute constraints/build models/score),
keeping all existing tests green (updating those whose fixtures/labels legitimately change),
and keeping the real HiGHS MILP solve flow working end-to-end. Roles, the member surface,
swaps/requests, and the `pending` status are explicitly out of scope (dropped per user).

---

## 2. Architectural constraints (binding — restated from CLAUDE.md + design-map)

- **Dependency rule:** `app → @crewdoku/domain` only. Components call the zustand store /
  domain functions; they NEVER compute a constraint, build a model, or score a schedule.
  Any derived display value that is not already exposed by the store/domain must be either
  (a) a pure presentational transform of already-exposed data (formatting hours/time strings,
  grouping employees by team, summing assigned hours from the schedule Map + shift hours), or
  (b) added to the store as a thin selector that delegates to a domain fn. No business logic
  (no constraint evaluation, no model build, no objective scoring) moves into components.
- **Tokens are source of truth.** Do NOT rename `--sh-*` or `.sf-*`. `app/tokens.css` is a
  byte-identical copy of root `tokens.css`, guarded by a checksum test — neither file is
  edited by this work. All color comes from existing tokens (`--sh-{N,E,M,A,L}-{bg,fg,bd}`,
  `--st-pin`, `--st-prop`, `--st-crit`, `--sel-bg`, `--row-h`, `--ctl-h`, `--cell-fs`,
  `--border-strong`, `--grid-line`, anims `sf-spin`/`sf-scan(-glow)`/`sf-blink`).
- **i18n is chrome-only.** Section titles, button labels, legend words, table headers may be
  routed through `t()` (add keys to `app/src/i18n/messages.ts` EN + VI). User data — employee
  names, team names, shift codes/names, org name, notes — is NEVER wrapped in `t()`.
- **Geometric Unicode only, no emoji:** ▸ ▾ ◀ ▶ ◢ ◆ ⚠ ✓ ✕ ≡ § ◫ ◈ ≈ ↓.
- **Density:** `rounded-[2px]` everywhere; IBM Plex Sans (UI) / IBM Plex Mono (data); 24px
  controls; `--row-h`/`--cell-fs` board density.
- **Solver flow unchanged:** `store.solve()` → `HighsSolverAdapter` (worker+wasm) →
  `mapSolution(meta)` → `buildProposal` → per-cell accept → `applyProposal`. No fake/simulated
  proposal path. The proposal shape `{ id, changes[], fairness, prevFairness, penalty,
  prevPenalty, breakdown[] }` is consumed as-is. No solver/model/constraint code is touched.

---

## 3. In-scope components

For each: what it renders · store/domain data it reads · key props/state. All live under
`app/src/`. New files marked **(new)**; rebuilt/extended files marked **(modify)**.

### 3.1 App shell — `App.tsx` (modify)
- Renders `[Sidebar 192px | Content flex-1]` over a 24px `StatusBar`.
- No structural store change; keeps `I18nProvider`, injected `store`, `ExportModal` mount.
- Drops the standalone `onboarding` nav item from the primary chrome list? — onboarding stays
  reachable (Load Demo + wizard) but is NOT a SCHEDULE/CONFIGURATION nav entry per the
  prototype; it is invoked from an empty-board state and/or a sidebar utility. (See decision D7.)

### 3.2 Sidebar shell — `features/shell/Sidebar.tsx` **(new)** (extracted from `App.tsx`)
- **Renders:** brand header (`SF` logo chip + "Crewdoku" + `VersionBadge`), a scrollable nav
  with two labeled sections:
  - **SCHEDULE** (`text-2xs uppercase tracking-widest text-faint` label): "Board" item; a
    violet "Proposal pending" pill on Board when a proposal exists.
  - **CONFIGURATION**: 5 items with glyphs — Shift definitions `≡`, Scheduling rules `§`,
    Teams & structure `◫`, Emp. preferences `◈`, Schedule priorities `≈`. Selecting one sets
    `view='config'` AND a config sub-section (see 3.10).
  - NO bottom ROLE switcher (dropped). Locale switcher + Load Demo remain as a small utility
    footer.
- **Reads:** `view`, `proposal` (for the pill), `setView`, config-section setter, `loadDemo`.
- **Props/state:** `store`; local none. Active item `bg-[var(--sel-bg)] text-ink font-semibold`,
  inactive `text-dim hover:bg-surface-2`.

### 3.3 StatusBar content — `features/shell/StatusLine.tsx` **(new)** (uses existing `ui` `StatusBar`)
- **Renders:** left `saved · N viol · M overrides · ◢ K pinned` (each segment conditional);
  right `<E> staff · <S> shifts · offline` + `? shortcuts`.
- **Reads:** `employees.length` (staff), `shifts.length`, `pins.size` (K pinned), proposal/solver
  phase for "saved" vs transient, coverage `dateOverrides` count (M overrides) summed across
  `coverages` (pure count, not a constraint computation), and a violation count.
- **Violation count source (decision D2):** read from a store selector
  `violationCount()` that delegates to the domain live checker (`runHardChecks(ctx, schedule,
  period).length`) — a thin store action, NOT inline component logic. If the orchestrator
  prefers zero new store surface, the segment may be omitted initially; flagged.

### 3.4 Board toolbar — `features/board/BoardToolbar.tsx` **(new)**
- **Renders** (left→right, all 24px controls, `rounded-[2px]`, hover `bg-surface-2`):
  "Schedule board" label · divider · `◀ ▶` week nav · `"Jun 15 — Jun 21, 2026"` mono range ·
  "Today" ghost · divider · pivot `Seg` "By employee | By time" · flex-space · dept filter
  dropdown "All departments" · `"◢ Seed · K"` pin-count pill (shown when `pins.size > 0`) ·
  Generate btn (`▸ Generate` idle / `Solving…` spinner / `◆ N proposed`) · `"↓ Export"`.
- **Reads:** `period`, `proposal`, `solverPhase`, `pins`, `teams` (dept filter options),
  view-state for visible-week index, pivot mode, dept filter.
- **New view-state (decision D3) added to store:** `boardWeekIndex: number` (which ISO-week of
  the period is shown), `boardPivot: 'emp' | 'time'`, `boardDeptFilter: string | 'all'`, plus
  setters. These are pure VIEW state (same category as the existing `view`, `selectedEmployeeId`,
  `pins`) — no domain logic.
- **Week nav semantics:** the period is multi-week; the board shows ONE ISO-week's 7 columns at a
  time. `◀ ▶` change `boardWeekIndex` within `[0, period.weeks-1]`; "Today" jumps to the week
  containing the current date if in range else clamps. Range label derived via
  `eachDate`/`isoWeekKey` (pure calendar utils). Generate/Export wired to existing
  `solve()` / ExportModal.

### 3.5 STATUS legend — `features/board/StatusLegend.tsx` **(new)**
- **Renders** a ~32px row: `STATUS` label · `◢ pinned` (--st-pin) · `◆ proposed` (--st-prop) ·
  `⚠ violation` (--st-crit) · shift chips. (NO pending swatch.) Each shift chip = a colored
  square code box (`--sh-{code}-{bg,fg,bd}`) + adjacent mono time span (e.g. `0100–0600`,
  colons stripped), 11px mono font-medium.
- **Reads:** `shifts` (code + startHour/endHour for the range). Time string is a pure format of
  `startHour`/`endHour` (`endHour % 24`, zero-padded `HHMM`).

### 3.6 Board grid — `features/board/Board.tsx` (modify, substantial)
- **Renders:** a single visible ISO-week (7 day columns) × dept-grouped employee rows.
  - 2-level sticky header: row1 (26px) week-range right-aligned mono spanning the 7 cols;
    row2 (28px) `Mon`/`15` day-abbrev + date number centered mono.
  - Sticky left col (200px): employee `name` (`text-xs`, user data, NOT i18n) + weekly hours
    (mono `text-2xs`): red `>48`, amber `>40`, faint otherwise.
  - Dept group header row (24px, `bg-surface-2`): `"▾ PRODUCTION A   26"` — toggles collapse
    (`▾` expanded / `▸` collapsed); count = members in that dept. Collapsed depts hide their
    rows but keep the header.
  - Cell (min ~86px): filled shift = `--sh-{code}-bg` fill + mono time string `"0100–0600"`
    (11px, stripped colons) centered; explicit day-off / empty = faint. Pinned = `◢` corner
    wedge top-left + `sf-pinned`. Proposed = `.sf-proposed` (violet dashed). Violation =
    `.sf-viol` (solid red). Weekend column = 45° diagonal hatch bg. Row alternation: every 2nd
    row 30% surface-2 mix.
  - Col borders: week boundary 2px `--border-strong`; day boundary 1px `--border`/`--grid-line`.
  - Click/hover a cell → assign popover (3.7).
- **Reads:** `schedule`, `employees`, `teams`, `shifts`, `period`, `pins`, `proposal`, and the
  new `boardWeekIndex` / `boardDeptFilter` / collapsed-dept set.
- **Weekly hours per employee** = sum over that week's assigned cells of `(endHour-startHour)`
  for the assigned shift — a pure presentational sum of already-exposed data (schedule Map +
  shift hours), NOT a constraint computation. (decision D4)
- **Violation outline source (decision D2):** the set of `${employeeId}|${date}` cells that
  violate hard constraints comes from the same `runHardChecks`-backed store selector, mapped to
  cell keys; component only renders the class. If omitted initially, `.sf-viol` simply never
  applies — board still correct.
- **Props/state:** `store`; local collapsed-dept `Set<string>` MAY be component-local view state
  or lifted to the store (decision D3 lifts pivot/week/dept-filter to the store; collapse set is
  kept component-local unless the orchestrator wants persistence).

### 3.7 Cell-assign popover — `features/board/CellPopover.tsx` **(new)**
- **Renders:** a ~248px "Assign shift" popover anchored to the clicked cell: a list of the
  employee's eligible shifts (code chip + name + time range) plus an explicit "Day off" entry
  and a "Clear" entry; `⚠` inline marker on any option that would create a hard violation.
- **Reads:** the clicked `employee.eligibleShiftIds` ∩ team `shiftIds`, `shifts`, current
  assignment. **Writes** via existing `store.setAssignment(a)` (`shiftId: null` = day off;
  to clear, also `setAssignment` with `null`). Uses existing `useDismiss` for outside-click/Esc.
- **Violation preview (decision D2):** the `⚠` per-option requires evaluating the candidate
  assignment against hard checks — done via a store helper `wouldViolate(a)` delegating to the
  domain checker. If that helper is deemed out of scope, ship the popover WITHOUT inline `⚠`
  (still fully functional for assignment) and flag the marker as a follow-up.
- **Props:** `store`, `employeeId`, `date`, anchor rect, `onClose`.

### 3.8 By-time coverage pivot — `features/board/CoverageView.tsx` **(new)**
- **Renders:** rows = shifts, cols = the visible week's 7 days. Left col (116px) = shift time-
  range chip (`--sh-{code}` colored). Each cell = the set of employees assigned to that
  shift×day as chip badges (dept-colored dot + employee last name, `◢` if pinned), `flex-wrap`
  `gap-1`, multiple per cell.
- **Reads:** `schedule`, `shifts`, `employees`, `teams` (for dept dot color), `pins`, `period`,
  `boardWeekIndex`. Pure inversion of the schedule Map (group assignments by shiftId×date) — no
  domain logic. Dept dot color from a small fixed palette keyed by team index (presentational).
- **Shown when** `boardPivot === 'time'` (toolbar `Seg`), replacing the Board grid body.

### 3.9 Generate panel — `features/solve/SolvePanel.tsx` (modify, substantial) + subcomponents
- **Header (36px):** "Generate" · spinner + "Solving…"/elapsed · Cancel · `✕` (collapse).
  Progress bar 2px violet (`sf-scan`/animated) during solve.
- **Body:**
  1. **Pre-flight table** (`PreflightTable` **(new)**): Horizon (`<weeks*7>d`, Mon–Sun), Staff
     (`<E> · <D> depts`), Hard (`5 families · <N> inst`), Soft (`5 terms · weight <W>`), Pinned
     cells (`<K>`). (NO pending-swaps row.) All values are pure counts of exposed state
     (employees, teams, shifts, coverages, rules.weights, pins) — no model build.
  2. **Hard-constraint inventory** (`ConstraintInventory` **(new)**): 5 rows
     `[H1] Shift coverage · <inst>` mono right-aligned, for H1–H6 (or the enabled subset).
     The instance counts that require model knowledge come from a store selector that delegates
     to the domain (see decision D5); if unavailable, show family names + enabled/disabled only,
     and flag exact instance counts as a follow-up.
  3. **Run solver** primary lg button (`▸ Run solver`). Calls existing `store.solve()`.
  4. **Solver log** (`SolverLog` **(new)**, 112px, mono 10px, live-scroll) shown during solve:
     a phase trace (build → submit → status → map). Lines come from `solverPhase`/`elapsed`
     transitions the store already exposes (presentational log of known phases) — no new solver
     instrumentation required (decision D6).
  5. **Result:** banner "Optimal · Proposal P-…" + change count; a 3-col grid
     Fairness / Penalty / Changes with delta badges (now vs prev from the proposal); a
     `PenaltyBars` **(new)** chart (S1–S5: prev gridline vs now violet bar, from
     `proposal.breakdown`); a `WorkloadHistogram` **(new)** (0/24/48/72h bars per employee,
     crit `>48` / warn `40–48` / prop `<40`) computed as the same pure weekly-hours sum as 3.6.
     Per-cell accept/discard list + Apply/Discard (existing wiring preserved). Infeasible path
     (conflict core + relaxations re-running `applyRelaxation`) preserved.
- **Reads/writes:** identical store surface as today (`solve`, `applyProposal`,
  `discardProposal`, `applyRelaxation`, `proposal`, `conflict`, `solverPhase`, `solverElapsed`,
  `shifts`, `employees`, plus new pre-flight count selectors).

### 3.10 Config screens polish — `features/config/*` (modify)
- `Config.tsx`: section rail now driven by the sidebar CONFIGURATION items (Shift definitions,
  Scheduling rules, Teams & structure, Emp. preferences, Schedule priorities). Map prototype
  labels to existing editors: Shift definitions→`ShiftsConfig`, Scheduling rules + Schedule
  priorities→`RulesConfig` (hard limits/toggles vs soft weights, optionally split into two
  sub-screens), Teams & structure→`TeamsConfig` (+ `CoverageConfig` reachable), Emp.
  preferences→`EmployeesConfig`. (decision D8 covers the label↔editor mapping.)
- `ShiftsConfig`, `CoverageConfig`, `RulesConfig`, `TeamsConfig`, `EmployeesConfig`: visual
  polish to the dense token aesthetic (Panel headers, mono inputs, consistent 24px controls,
  shift color chips where a code is shown). NO change to their store wiring or domain calls.
  Each remains usable (add/edit/remove, toggles, sliders, coverage bands, overrides).

### 3.11 Realistic demo seed — `packages/domain/src/seed/demo.ts` (modify — DATA ONLY, FLAGGED)
- Enrich `buildDemo()` to a prototype-scale roster: **5 departments** (Production A,
  Production B, Quality, Maintenance, Logistics), **realistic first/last names**, and **5 shifts
  using the codes the tokens already define**: `N` Night 01–06, `E` Early 05–11, `M` Mid 10–16,
  `A` Swing 15–21, `L` Late 20–26 (crosses midnight). Target headcount ≈ prototype
  (Production A 26, Production B 24, Quality 16, Maintenance 14, Logistics 20 ≈ 100), or a smaller
  realistic subset if needed to keep the feasible-baseline construction tractable (decision D1).
- **MUST stay feasible:** `runHardChecks(buildContext, makeSchedule(assignments), period)` returns
  `[]` (the existing `demo.test.ts` "no hard-constraint violations" assertion), weeks ≥ 2, ≥1
  night shift, ≥1 explicit `shiftId: null` day-off. Coverage byDow must be constructed to exactly
  match the seeded assignment headcount (as the current seed does) so H1 holds as equality.
- This is the ONLY change outside `app/src`. It is DATA/content, not logic: no entity types,
  factories, constraints, solver, schedule, or calendar code changes. **Recommendation
  (conservative): treat this as acceptable "content" and proceed, but the orchestrator must
  explicitly approve before the seed is edited** (see §7 Risks + decision D1). If the orchestrator
  declines, the UI still builds against the current small demo; only the "realistic roster" AC
  (AC15) is descoped.

---

## 4. Out-of-scope / non-goals

1. **Roles / admin-vs-member.** No ROLE switcher, no member surface, no view-as.
2. **Member/self-service surfaces** (member board, preferences-as-member, swaps).
3. **Swaps / requests / approvals / consent / ripple.** Swaps are direct edits only.
4. **`pending` status / amber-dashed swap-request swatch.** Legend is 3 states.
5. **Any domain business-logic change** — constraints (H1–H6/S1–S5), solver/model, scoring,
   schedule, entities, factories, calendar, ports, export. (Demo *data* enrichment is the sole,
   flagged exception.)
6. **New solver / new objective / new constraint families.** The HiGHS MILP is unchanged.
7. **Tokens:** no renaming/adding/removing `--sh-*`/`.sf-*`; no edit to `tokens.css` /
   `app/tokens.css`.
8. **i18n of user data.** Names/codes/notes are never translated.
9. **Board virtualization.** ~100 rows rendered plainly (single-week view bounds cost).
10. **Persistence-layer / adapter changes** beyond what new VIEW state requires (view state is
    not persisted unless trivially free).

---

## 5. Acceptance criteria (testable)

Each is verifiable via RTL (`jsdom`) and/or a browser check. "Browser" = manual/dev-server
verification (real HiGHS); "RTL" = `app/src/**/__tests__`.

- **AC1 — Time-range cells.** A filled board cell renders the assigned shift's time range as a
  mono `HHMM–HHMM` string with colons stripped and `endHour` wrapped mod 24 (e.g. Night 01–06 →
  `0100–0600`, Late 20–26 → `2000–0200`). (RTL)
- **AC2 — Toolbar present.** The board toolbar renders all controls: "Schedule board" label,
  `◀`/`▶` week nav, a mono date-range label, "Today", a By-employee/By-time pivot `Seg`, a dept
  filter dropdown, a Generate button, and an Export button. (RTL)
- **AC3 — Week nav changes range.** Clicking `▶` advances the visible week; the date-range label
  and the 7 day-column headers update to the next ISO-week within the period; `◀` reverses; nav
  is clamped to `[0, period.weeks-1]`. (RTL)
- **AC4 — Pivot toggles.** Selecting "By time" replaces the employee grid with the CoverageView
  (shift rows × day columns); "By employee" restores the grid. (RTL)
- **AC5 — Dept filter filters.** Choosing a department in the filter hides employee rows /
  dept-group headers not in that department; "All departments" restores all. (RTL)
- **AC6 — Seed/pin count pill.** With ≥1 pinned cell, the toolbar shows a `◢ Seed · K` pill where
  K equals `pins.size`; with 0 pins the pill is absent. (RTL)
- **AC7 — Legend states.** The STATUS legend shows exactly three status indicators — `◢ pinned`,
  `◆ proposed`, `⚠ violation` — and NO pending swatch. (RTL)
- **AC8 — Legend shift chips.** The legend renders one chip per shift: a colored code box using
  `--sh-{code}-bg` plus its mono time range; for the demo's 5 shifts, 5 chips appear. (RTL)
- **AC9 — Weekly hours + threshold color.** Each employee row shows weekly assigned hours (mono);
  the value's color class is red for `>48`, amber for `>40`, faint otherwise (assert the class
  for a constructed employee at each threshold). (RTL)
- **AC10 — Dept groups collapse with counts.** Each dept group header shows the dept name + member
  count and a `▾`/`▸` toggle; clicking collapses/expands that dept's rows. (RTL)
- **AC11 — By-time pivot renders shift rows.** In By-time mode, there is one row per shift and the
  cells contain employee chip badges for assigned employees on that shift×day. (RTL)
- **AC12 — Cell-assign popover.** Clicking a board cell opens an "Assign shift" popover listing the
  employee's eligible shifts + a day-off option; choosing one calls `store.setAssignment` and the
  cell updates; Esc/outside-click closes it. (RTL)
- **AC13 — Generate panel runs real solve.** In the dev server with the HiGHS adapter, "Run solver"
  on the demo produces a proposal: result banner with `P-…` id + change count, the penalty bars
  (S1–S5) and workload histogram render, and Apply/Discard work (Apply writes accepted cells,
  Discard clears). (Browser, + RTL with a stub solver for the non-wasm parts.)
- **AC14 — Pre-flight + inventory.** The Generate panel shows a pre-flight table (Horizon, Staff,
  Hard, Soft, Pinned — NO pending-swaps row) and a hard-constraint inventory listing H-family rows.
  (RTL)
- **AC15 — Realistic demo roster.** `buildDemo()` returns ≥ N employees (target ≈100; minimum
  **N=60**) across **5 departments** with realistic first/last names and the 5 token-backed shift
  codes (`N/E/M/A/L`); `runHardChecks` on the seeded schedule returns `[]` (feasible), weeks ≥ 2,
  ≥1 night shift, ≥1 explicit day-off. (Domain test) — *gated on decision D1 approval.*
- **AC16 — Config screens usable.** Each config screen (shifts, rules/priorities, teams,
  coverage, employees) renders and its primary edit action still dispatches the existing store
  action (add shift, toggle constraint, set weight, edit coverage band, add/remove employee).
  (RTL)
- **AC17 — Sidebar sections.** The sidebar shows a SCHEDULE section (Board item) and a
  CONFIGURATION section (5 items with glyphs); a "Proposal pending" pill appears on Board when a
  proposal exists; selecting a CONFIGURATION item switches the main surface to that config
  sub-screen. (RTL)
- **AC18 — StatusBar content.** The status bar shows staff count, shift count, "offline", and a
  pinned count that tracks `pins.size`; chrome strings are translated by the locale switcher while
  no user data is. (RTL)
- **AC19 — Tokens intact.** The `app/tokens.css` checksum test stays green and no `--sh-*`/`.sf-*`
  name changed. (existing test)
- **AC20 — i18n chrome-only.** Switching to VI translates chrome (nav, toolbar, legend, panel
  labels) but leaves every employee/team/shift name verbatim. (RTL)
- **AC21 — Tests green.** `pnpm test` and `pnpm lint` pass across both packages (existing tests
  updated where labels/fixtures legitimately changed, e.g. board accessible-name format and demo
  names). (CI)
- **AC22 — Real HiGHS end-to-end.** On the dev server, Load Demo → Generate → Apply yields a board
  reflecting accepted changes with no console errors and a non-trivial solve time displayed.
  (Browser)

---

## 6. Affected files

### New (`app/src/`)
- `features/shell/Sidebar.tsx` — sidebar shell (extracted from `App.tsx`).
- `features/shell/StatusLine.tsx` — status-bar left/right content.
- `features/board/BoardToolbar.tsx` — toolbar.
- `features/board/StatusLegend.tsx` — STATUS legend row.
- `features/board/CellPopover.tsx` — assign-shift popover.
- `features/board/CoverageView.tsx` — By-time pivot.
- `features/solve/PreflightTable.tsx` — pre-flight counts.
- `features/solve/ConstraintInventory.tsx` — hard-constraint inventory rows.
- `features/solve/SolverLog.tsx` — live phase log.
- `features/solve/PenaltyBars.tsx` — S1–S5 prev-vs-now bars (may replace inline `BreakdownBars`).
- `features/solve/WorkloadHistogram.tsx` — per-employee hours histogram.
- Corresponding `__tests__/*.test.tsx` for each new component (and updates to existing ones).

### Modified (`app/src/`)
- `App.tsx` — compose new shell; drop onboarding from primary nav (still reachable).
- `store/store.ts` — add VIEW state: `boardWeekIndex`, `boardPivot`, `boardDeptFilter` (+ setters);
  optional thin selectors `violationCount()` / `wouldViolate(a)` / pre-flight count helpers that
  DELEGATE to domain (`runHardChecks`, etc.). No new business logic.
- `features/board/Board.tsx` — single-week view, time-range cells, collapsible dept groups,
  weekly hours, sticky 2-level header, popover hook, weekend hatch, row alternation.
- `features/solve/SolvePanel.tsx` — restructured into header + pre-flight + inventory + run + log
  + result (bars/histogram) + accept/discard; existing solve wiring preserved.
- `features/config/Config.tsx` + the 5 config editors — section mapping + visual polish.
- `i18n/messages.ts` — add EN + VI keys for new chrome strings (toolbar, legend, panel, sidebar
  sections, status segments).
- Existing tests whose fixtures/labels change: `features/board/__tests__/board.test.tsx`
  (cell accessible-name now includes/relies on time range + new demo names), `__tests__/app-shell.test.tsx`
  (sidebar sections, status text), `store/__tests__/*` (new view-state actions),
  `features/config/__tests__/config.test.tsx` (section labels).

### Modified (`packages/domain/`) — FLAGGED, data-only
- `seed/demo.ts` — realistic roster (5 depts, real names, 5 token codes), still feasible.
- `seed/__tests__/demo.test.ts` — relax/extend assertions only if names change (the feasibility,
  weeks≥2, night, day-off assertions stay; add a dept-count / headcount assertion for AC15).

### NOT touched
- `tokens.css`, `app/tokens.css` (checksum-guarded).
- Any `packages/domain` code except `seed/demo.ts` (+ its test).
- `adapters/highs/*`, `adapters/storage/*` (solver + storage unchanged).

---

## 7. Risks & mitigations

- **R1 — ~100-row grid perf.** Rendering 100 rows × time-range cells with sticky header/col +
  hatch + alternation could jank. *Mitigation:* the board shows ONE ISO-week (7 cols) at a time
  (week nav), collapsible dept groups reduce visible rows, and cells are cheap (no per-cell
  effects). No virtualization (design decision); revisit only if a profiler shows >16ms frames.
- **R2 — Sticky header/col layering.** 2-level sticky header + sticky left col + week-boundary
  borders are z-index/`position: sticky` sensitive in `table`. *Mitigation:* keep the existing
  table-based sticky approach (already working in current Board), add the second visual layer with
  explicit `z` ordering and test header/row counts in RTL.
- **R3 — Token checksum.** Any accidental edit to `tokens.css`/`app/tokens.css` breaks the
  checksum test. *Mitigation:* consume tokens only via `var(--…)`; never open the token files.
- **R4 — Solver-wiring regression.** Restructuring `SolvePanel` could break the
  `solve → proposal → applyProposal` flow or the infeasible path. *Mitigation:* keep all store
  calls byte-identical; cover with the existing `solvePanel.test.tsx` + `store/solve.test.ts`
  (stub solver) and a browser AC22 run with real HiGHS before merge.
- **R5 — Seed feasibility.** A larger roster with 5 shifts + 24h coverage and rest/hours caps is
  easy to make infeasible. *Mitigation:* construct coverage byDow to exactly equal the seeded
  weekday headcount per shift (as the current seed does), assign each employee a single eligible
  shift with adequate inter-shift rest, and gate on `runHardChecks === []` in `demo.test.ts`
  BEFORE relying on it. If a full 100-person feasible build proves fiddly, fall back to the AC15
  minimum (N=60) realistic subset. **This file is outside `app/src` — orchestrator must approve
  (decision D1) before editing.**
- **R6 — "Violation"/inline-⚠ scope creep.** The violation outline (3.6), status-bar viol count
  (3.3), and popover `⚠` (3.7) all need a hard-check evaluation. *Mitigation:* expose ONE thin
  store selector delegating to `runHardChecks`/the live checker; if the orchestrator wants to
  keep the store surface frozen, ship these three markers as a clearly-flagged follow-up and the
  rest of the UI is unaffected.
- **R7 — Existing-test churn.** Board/app-shell/config tests assert current labels and demo names
  ("Sam 1", cell accessible names). *Mitigation:* update those assertions in the same change set;
  AC21 requires the full suite green.

---

## 8. Decisions log

Format: `{ decision · why · alternatives-rejected }`.

- **D1 — Demo seed enrichment is treated as "content", recommended conservative, and GATED on
  orchestrator approval.** *Why:* `design-map.md §7` and the task both flag this as the one debated
  domain touch; it changes only DATA in `seed/demo.ts` (no types/constraints/solver/schedule
  logic), and the prototype's realism depends on it. *Alternatives rejected:* (a) silently edit the
  seed — violates the "presentation only" guardrail without sign-off; (b) never touch the seed and
  fake a roster in the app layer — would duplicate org data outside the domain and break the
  single-source-of-truth rule. *Conservative fallback:* if declined, descope AC15 only; the UI is
  built against the current small demo.
- **D2 — Hard-violation markers (board `.sf-viol` outline, status-bar viol count, popover inline
  `⚠`) are sourced from ONE thin store selector delegating to the domain live checker
  (`runHardChecks`), not inline component logic; and are individually descopable.** *Why:* keeps the
  "no business logic in components" rule intact while still showing violations; isolating them
  behind one selector lets the orchestrator drop them without affecting the rest. *Alternatives
  rejected:* computing violations in the component (breaks dependency rule); adding bespoke
  per-marker domain functions (unnecessary surface — the existing checker suffices).
- **D3 — Board pivot mode, visible-week index, and dept filter are lifted into the zustand store
  as VIEW state; per-dept collapse stays component-local.** *Why:* the toolbar (owner of these
  controls) and the board (consumer) are siblings, so shared view state belongs in the store
  alongside the existing `view`/`selectedEmployeeId`/`pins`; collapse is purely local cosmetic.
  *Alternatives rejected:* prop-drilling through `App`→`BoardSurface`→both (brittle); React context
  (redundant with the store already in scope).
- **D4 — Weekly hours and the workload histogram are PURE presentational sums of already-exposed
  state (schedule Map + `shift.endHour-startHour`), not domain calls.** *Why:* summing assigned
  hours is arithmetic over data the store already exposes — it is display formatting, not a
  constraint/score computation, so it does not violate the dependency rule. *Alternatives rejected:*
  adding a domain `weeklyHours()` fn (over-engineering for a display sum); reusing the H2 checker
  (that returns violations, not totals).
- **D5 — Hard-constraint instance counts in the Generate inventory come from a store selector that
  delegates to the domain (model/context), with a graceful fallback to family-name + enabled-state
  only.** *Why:* exact instance counts (e.g. "H1 · 35 inst") require model knowledge that lives in
  the domain; a delegating selector keeps logic out of the component, and the fallback avoids
  blocking the panel on it. *Alternatives rejected:* recomputing counts in the component (breaks the
  rule); hardcoding numbers (wrong as soon as config changes).
- **D6 — The solver log is a presentational trace of the store's existing `solverPhase`/`elapsed`
  transitions, not new solver instrumentation.** *Why:* the adapter/worker are out of scope and the
  store already exposes phase + elapsed; a phase-derived log meets the prototype's intent without
  touching `adapters/highs/*`. *Alternatives rejected:* threading real solver stdout through the
  worker (out-of-scope adapter change); a fake animated log unrelated to actual phase (misleading).
- **D7 — Onboarding stays reachable (empty-board state + Load Demo) but is removed from the primary
  SCHEDULE/CONFIGURATION nav, matching the prototype's two-section sidebar.** *Why:* the prototype
  sidebar has no Onboarding nav entry; the wizard is a first-run flow, not a standing destination.
  *Alternatives rejected:* deleting onboarding (loses the org-setup flow the domain supports);
  keeping it as a third nav section (diverges from the design-map sidebar).
- **D8 — Config label↔editor mapping:** Shift definitions→`ShiftsConfig`; Scheduling rules→
  `RulesConfig` hard-limits+toggles; Schedule priorities→`RulesConfig` soft-weights (same editor,
  scrolled/sub-tabbed to weights, or a thin split); Teams & structure→`TeamsConfig` (+ Coverage
  accessible from there); Emp. preferences→`EmployeesConfig`. *Why:* reuses the five existing,
  tested editors behind the prototype's labels with no domain change. *Alternatives rejected:*
  building five brand-new editors (throws away working/tested wiring); collapsing rules+priorities
  into one undifferentiated screen (loses the prototype's separation of hard rules vs soft
  priorities).
- **D9 — Cell time string uses `endHour % 24` zero-padded to 4 digits with the colon stripped
  (`01:00`→`0100`, end `26:00`→`0200`).** *Why:* matches the design-map's `0100–0600`/cross-midnight
  examples and the domain's `endHour` convention (can exceed 24 for night shifts). *Alternatives
  rejected:* showing raw `26:00` (confusing); showing the shift code only (the current behavior the
  prototype explicitly replaces).
- **D10 — Existing component tests that assert current labels/demo names are updated in this change
  set rather than preserved verbatim.** *Why:* the reskin legitimately changes cell accessible-name
  format, demo employee names (D1), and sidebar/config labels; AC21 requires the suite green against
  the new UI. *Alternatives rejected:* keeping old assertions (would force the UI to keep legacy
  strings, defeating the rebuild); deleting the tests (loses coverage).
