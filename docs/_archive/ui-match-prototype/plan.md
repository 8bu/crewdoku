# PLAN — Crewdoku UI rebuild to match the ShiftForge prototype (TDD)

Source of truth: `spec.md` (AC1–AC22) + `design-map.md`. Branch: `ui/match-prototype`.
Scope: PRESENTATION ONLY (`app/src/**`) + ONE flagged DATA-only reseed of
`packages/domain/src/seed/demo.ts` (approved).

## How to use this plan

- Each step is **red → green → refactor**: write/adjust the failing test FIRST, watch it
  fail, then implement the minimum to pass, then tidy.
- Run scope-narrowed tests during a step, e.g.
  `pnpm --filter @crewdoku/app test -- <file>` or
  `pnpm --filter @crewdoku/domain test -- seed`. Full `pnpm test` + `pnpm lint` are the
  final gate (Step 24).
- "Touches domain" is flagged per step. ONLY Step 1 may edit `packages/domain` (seed +
  its test). Every other step lives entirely under `app/src/**`. If any step tempts you to
  add constraint/model/scoring logic to a component, STOP — route it through a thin store
  selector that delegates to the domain (see Steps 2–3).
- **i18n keys are tested per-step, not deferred.** Every chrome-adding step
  (Sidebar/Step 6, StatusLine/Step 8, BoardToolbar/Step 10, StatusLegend/Step 9,
  SolvePanel/Steps 15–18, Config sub-labels/Step 7) asserts ITS OWN new chrome keys resolve
  in BOTH `en` and `vi` as part of that step's own test — so no key sits untested for ~17
  steps. Step 23 is then a final catalog-completeness sweep (no orphan/missing keys), not the
  first place keys are verified.
- Tokens are never opened. Consume only `var(--…)`. The `app/tokens.css` checksum test
  (`app/src/__tests__/tokens.test.ts`) must stay green (AC19) — it is not a step, it is a
  guard you must not trip.

---

## Group A — Foundations (seed + shared helpers + store view-state)

These come FIRST because the grid (Group C) and panel (Group E) depend on token-backed
shift codes, the time-format helper, and the week-grouping selector.

### Step 1 — Reseed demo to a realistic multi-dept roster *(AC15)* — **DOMAIN, data-only**

- **Red:** extend `packages/domain/src/seed/__tests__/demo.test.ts`. Keep ALL existing
  assertions (org/teams/shifts/employees non-empty, nanoid id, assignments non-empty;
  weeks ≥ 2; ≥1 `isNight` shift; ≥1 `shiftId: null` day-off; `runHardChecks(...) === []`).
  ADD:
  - `expect(new Set(d.teams.map(t => t.id)).size).toBe(5)` and assert the 5 dept names
    (`Production A`, `Production B`, `Quality`, `Maintenance`, `Logistics`).
  - `expect(d.employees.length).toBeGreaterThanOrEqual(60)` (AC15 minimum N=60; target ~100).
  - `expect(d.shifts.map(s => s.code).sort()).toEqual(['A','E','L','M','N'])`.
  - one assertion that an employee name looks realistic (e.g. contains a space, not
    `/^Sam \d/`).
  - one targeted H3 rest sanity check, sourced from the domain (not hand-math): assert no
    employee has two assignments closer than the rule's min-rest hours across the reseeded
    demo — e.g. derive each employee's assigned (date, shift) pairs and assert every
    consecutive pair's inter-shift gap `≥ rules.minRestHours` (compute the gap via the same
    domain helper H3 uses; do NOT hand-tabulate L→E/N→N spans in prose).
  Run → fails (current seed has 2 teams, codes `D/E/N`, `Sam N` names).
  - **Cardinality note (constraint):** the demo defines exactly **5 global shift
    definitions** (`N/E/M/A/L`) shared across ALL departments, and coverage is stored as
    **per team×shift rows** (NOT 5 shifts duplicated per dept — there is no 5×5 fan-out).
- **Green:** rewrite `buildDemo()` in `packages/domain/src/seed/demo.ts` (DATA only — no
  types/factories/constraints/solver/schedule/calendar changes):
  - 5 shifts using token-backed codes: `N` Night 01–06 (`isNight:true`, startHour 1,
    endHour 6), `E` Early 05–11, `M` Mid 10–16, `A` Swing 15–21, `L` Late 20–26
    (`endHour:26`, crosses midnight). Keep ≥11h inter-shift rest WITHIN a pool so H3 holds:
    assign each employee exactly ONE eligible shift (single-shift pool), Mon–Fri, weekends
    off; pools never cross, so no Day-after-Night pairs. The H3 sanity assertion above (and
    `runHardChecks(...) === []`) is the feasibility gate here — don't hand-verify rest spans.
  - 5 depts with a realistic roster (real first/last names). Headcount per dept feasible
    against per-shift coverage. Reuse the existing `staffPool` pattern: coverage `byDow` set
    to EXACTLY the assigned weekday headcount per team×shift (equality band Mon–Fri, `{0,0}`
    weekends) so H1 holds as equality (R5 mitigation).
  - keep exactly one explicit `shiftId: null` day-off seeded (existing `dayOffSeeded` logic).
- **Refactor:** factor a `FIRST_NAMES`/`LAST_NAMES` array + a small deterministic name
  picker so names are stable across runs (no RNG → reproducible tests).
- **Green check:** `pnpm --filter @crewdoku/domain test -- seed` green (feasibility +
  new dept/headcount/code assertions). This is the ONLY domain edit in the whole plan.

### Step 2 — Shared cell time-format helper *(AC1, AC8 — review-tightening #4)* — app-only

- **Red:** new `app/src/features/board/__tests__/timeFormat.test.ts` asserting a pure
  helper `shiftTimeRange(shift)`:
  - Night `{startHour:1,endHour:6}` → `"0100–0600"`.
  - Late `{startHour:20,endHour:26}` → `"2000–0200"` (end wraps `26 % 24 = 2`).
  - `{startHour:5,endHour:11}` → `"0500–1100"`.
  - rule under test: `pad4(startHour*100) + "–" + pad4((endHour % 24)*100)`, colons
    stripped, en-dash `–` separator.
  Run → fails (no module).
- **Green:** new `app/src/features/board/timeFormat.ts` exporting `pad4(n)` and
  `shiftTimeRange(shift: { startHour: number; endHour: number }): string`. Pure, no React.
- **Green check:** `pnpm --filter @crewdoku/app test -- timeFormat` green. Reused by Board
  cells (Step 11), StatusLegend (Step 9), CellPopover (Step 13), CoverageView (Step 14).

### Step 3 — Store view-state: week index, pivot, dept filter *(AC3, AC4, AC5 — decision D3)* — app-only

- **Red:** extend `app/src/store/__tests__/store.test.ts`:
  - defaults: `boardWeekIndex === 0`, `boardPivot === 'emp'`, `boardDeptFilter === 'all'`.
  - `setBoardWeekIndex(3)` then read back `3`; `setBoardWeekIndex(-1)` clamps to `0`;
    `setBoardWeekIndex(999)` clamps to `period.weeks - 1` (clamp uses `period.weeks`, the
    single calendar-derived count — review-tightening #2).
  - `setBoardPivot('time')` / `setBoardDeptFilter(id)` round-trip.
  Run → fails (no fields/actions).
- **Green:** add to `AppStore` interface + `createStore`: `boardWeekIndex: number`
  (default 0), `boardPivot: 'emp' | 'time'` (default `'emp'`), `boardDeptFilter: string`
  (default `'all'`), and setters `setBoardWeekIndex` (clamps to `[0, period.weeks-1]`),
  `setBoardPivot`, `setBoardDeptFilter`. Pure VIEW state — no domain logic.
- **Green check:** `pnpm --filter @crewdoku/app test -- store` green.

### Step 4 — Week-grouping selector (single calendar util) *(AC3 — review-tightening #2)* — app-only

- **Red:** new `app/src/features/board/__tests__/weekGroups.test.ts` asserting a pure
  selector `weekGroups(period)` returns one entry per ISO-week with
  `{ weekKey, dates: ISODate[] }`, ordered, where `dates` are the (possibly partial) days
  of that week within the period, AND `weekGroups(period).length === period.weeks`. It is
  derived from `eachDate` + `isoWeekKey` grouping (the ONE util the week-nav clamp in Step 3
  agrees with — prevents partial-week desync).
- **Green:** new `app/src/features/board/weekGroups.ts` exporting `weekGroups(period)`
  using domain `eachDate`/`isoWeekKey`. Pure presentational grouping (no domain logic).
- **Green check:** `pnpm --filter @crewdoku/app test -- weekGroups` green. Consumed by
  BoardToolbar (Step 8), Board grid (Step 10), CoverageView (Step 14).

---

## Group B — Shared UI-kit additions (built once, reused) *(decision: build-once)*

### Step 5 — UI-kit: Pill, LegendSwatch, Dropdown *(supports AC2, AC6, AC7, AC17)* — app-only

Build these in `app/src/ui/index.tsx` so toolbar/legend/sidebar/status reuse them. `Seg`
already exists (reuse for the pivot — no new toggle needed).

- **Red:** new `app/src/ui/__tests__/kit.test.tsx`:
  - `<Pill tone="prop">◢ Seed · 12</Pill>` renders its children and a `rounded-[2px]`
    bordered span (assert text present + role/title where given).
  - `<LegendSwatch code="N" />` renders a swatch element whose inline style references
    `var(--sh-N-bg)` (assert `style` contains the token; never hardcoded color).
  - `<Dropdown value="all" options={[...]} onChange={fn} ariaLabel="Departments" />`
    renders a `combobox`/`button` with the current label and fires `onChange` on select.
  Run → fails (no exports).
- **Green:** add `Pill`, `LegendSwatch`, `Dropdown` to `ui/index.tsx`. `Pill` = compact
  bordered span (tone-driven via existing `TONES`). `LegendSwatch` = small square using
  `--sh-{code}-{bg,fg,bd}`. `Dropdown` = a `<select>`-backed control styled to 24px
  `rounded-[2px]` (native select keeps a11y + RTL simple; chrome labels only).
- **Green check:** `pnpm --filter @crewdoku/app test -- kit` green.

---

## Group C — Shell (sidebar + status line)

### Step 6 — Sidebar sections (SCHEDULE / CONFIGURATION) *(AC17, AC20 — decisions D7, D8)* — app-only

- **Red:** new `app/src/features/shell/__tests__/sidebar.test.tsx` (+ update
  `app/src/__tests__/app-shell.test.tsx` where it asserts the old 3-item nav):
  - renders a "SCHEDULE" section label + a "Board" item.
  - renders a "CONFIGURATION" section label + 5 items (Shift definitions, Scheduling rules,
    Teams & structure, Emp. preferences, Schedule priorities) each with its glyph
    (`≡ § ◫ ◈ ≈`).
  - with a `proposal` set, a "Proposal pending" pill appears on Board; with none, absent.
  - clicking a CONFIGURATION item sets `view='config'` AND a config sub-section
    (assert via store: a new `configSection` view-state, see Step 7 mapping).
  - NO onboarding nav item, NO role switcher (assert absence).
  - VI locale translates the section labels but a seeded team name stays verbatim (AC20).
  - assert THIS step's new chrome keys (section labels + 5 config items) resolve in BOTH `en`
    and `vi` (keys tested here, not deferred to Step 23).
  Run → fails (no Sidebar module / old nav).
- **Green:** new `app/src/features/shell/Sidebar.tsx` (extracted from `App.tsx`): brand
  header (`SF` chip + "Crewdoku" + `VersionBadge`), the two labeled sections, the
  "Proposal pending" `Pill` (Step 5) on Board, a utility footer (LocaleSwitcher + Load
  Demo). Add the config-section setter wiring from Step 7. Add i18n keys (Step 23).
- **Green check:** `pnpm --filter @crewdoku/app test -- sidebar app-shell` green.

### Step 7 — Config sub-section view-state + Config rail mapping *(AC16, AC17 — decision D8)* — app-only

- **Red:** extend `app/src/store/__tests__/store.test.ts`: a `configSection` field
  (default e.g. `'shifts'`) + `setConfigSection(id)` round-trips over
  `'shifts' | 'rules' | 'priorities' | 'teams' | 'employees'`. Update
  `app/src/features/config/__tests__/config.test.tsx` to assert the rail reflects
  `configSection` and renders the mapped editor (Shift definitions→`ShiftsConfig`,
  Scheduling rules→`RulesConfig` hard side, Schedule priorities→`RulesConfig` soft side,
  Teams & structure→`TeamsConfig`, Emp. preferences→`EmployeesConfig`), and that the
  primary edit action still dispatches the existing store action. Also assert THIS step's new
  config sub-label chrome keys resolve in BOTH `en` and `vi` (not deferred to Step 23).
  Run → fails (no `configSection`).
- **Green:** add `configSection` + `setConfigSection` to the store (VIEW state). Update
  `features/config/Config.tsx` to drive its section rail from `configSection` and map the
  prototype labels to the 5 existing editors (D8). No store-wiring change inside the
  editors; this is rail mapping only.
- **Green check:** `pnpm --filter @crewdoku/app test -- config store` green.

### Step 8 — StatusLine content *(AC18, AC20)* — app-only

- **Red:** new `app/src/features/shell/__tests__/statusLine.test.tsx`:
  - left shows `saved` and `◢ K pinned` where K tracks `pins.size` (toggle a pin → count
    updates); right shows `<E> staff`, `<S> shifts`, `offline`.
  - chrome words translate under VI; counts/`offline` and any names are not mangled (AC20).
    Assert THIS step's new chrome keys resolve in BOTH `en` and `vi` (not deferred to Step 23).
  - the violation segment (`N viol`) is GATED on Step 19's selector — assert it is ABSENT
    when the selector is not yet wired (so this step passes standalone).
  Run → fails (no StatusLine).
- **Green:** new `app/src/features/shell/StatusLine.tsx` rendering into the existing `ui`
  `StatusBar` `left`/`right` slots. Reads `employees.length`, `shifts.length`, `pins.size`,
  `coverages` (overrides count = sum of `dateOverrides.length`, a pure count). i18n keys
  added in Step 23. Wire into `App.tsx` replacing the inline `Status`.
- **Green check:** `pnpm --filter @crewdoku/app test -- statusLine` green.

---

## Group D — Board toolbar + legend

### Step 9 — StatusLegend (3 states + shift chips) *(AC7, AC8)* — app-only

- **Red:** new `app/src/features/board/__tests__/statusLegend.test.tsx`:
  - renders exactly three status indicators: `◢ pinned`, `◆ proposed`, `⚠ violation`, and
    NO pending swatch (assert "pending" text absent).
  - renders one shift chip per shift; for the 5-shift demo, 5 chips, each a `LegendSwatch`
    (using `--sh-{code}-bg`) + the mono time range from `shiftTimeRange` (Step 2) — e.g.
    `0100–0600` for Night.
  - assert THIS step's new chrome keys (STATUS, pinned, proposed, violation) resolve in BOTH
    `en` and `vi` (not deferred to Step 23).
  Run → fails (no module).
- **Green:** new `app/src/features/board/StatusLegend.tsx` using `LegendSwatch` (Step 5),
  `shiftTimeRange` (Step 2), status tokens `--st-pin`/`--st-prop`/`--st-crit`.
- **Green check:** `pnpm --filter @crewdoku/app test -- statusLegend` green.

### Step 10 — BoardToolbar *(AC2, AC3, AC4, AC5, AC6)* — app-only

- **Red:** new `app/src/features/board/__tests__/boardToolbar.test.tsx`:
  - renders "Schedule board" label, `◀`/`▶` week-nav buttons, a mono date-range label, a
    "Today" button, a By-employee/By-time `Seg`, a dept-filter `Dropdown`, a Generate
    button, an Export button (AC2).
  - clicking `▶` calls `setBoardWeekIndex(prev+1)` and the range label updates to the next
    ISO-week's range (derived via `weekGroups`); `◀` reverses; both clamp to
    `[0, weeks-1]` (AC3).
  - selecting "By time" in the `Seg` calls `setBoardPivot('time')` (AC4).
  - choosing a dept in the `Dropdown` calls `setBoardDeptFilter(id)`; "All departments"
    restores `'all'` (AC5).
  - with `pins.size > 0`, a `◢ Seed · K` `Pill` is shown with K = `pins.size`; with 0 pins,
    absent (AC6).
  - assert THIS step's new toolbar chrome keys (Schedule board, Today, By employee, By time,
    All departments, Seed, Generate, Export) resolve in BOTH `en` and `vi` (not deferred to
    Step 23).
  Run → fails (no module).
- **Green:** new `app/src/features/board/BoardToolbar.tsx` reading `period`, `proposal`,
  `solverPhase`, `pins`, `teams`, and the Step 3 view-state; range label via `weekGroups`
  (Step 4). Generate → `store.solve()`; Export → opens ExportModal (lift `onExport` prop
  from `App`). i18n keys in Step 23.
- **Green check:** `pnpm --filter @crewdoku/app test -- boardToolbar` green.

---

## Group E — Board grid + popover + coverage pivot

### Step 11 — Board: single-week + time-range cells + weekend hatch *(AC1, AC3, AC9-partial)* — app-only

- **Red:** update `app/src/features/board/__tests__/board.test.tsx`:
  - the grid renders ONLY the visible ISO-week's 7 day columns (not all period dates) —
    assert day-header count for `boardWeekIndex` (use `weekGroups`).
  - a filled cell renders the mono time range (`shiftTimeRange`), e.g. `0100–0600`, NOT the
    raw shift code (AC1). Update the old "shows the shift code" assertion accordingly (D10).
  - the cell accessible-name format is updated (D10) — assert the new label shape.
  - changing `boardWeekIndex` re-renders the next week's columns (AC3 grid side).
  Run → fails (Board still renders all dates + code text).
- **Green:** modify `app/src/features/board/Board.tsx`: derive the visible week from
  `weekGroups(period)[boardWeekIndex]`; render its 7 columns; cells use `shiftTimeRange`
  (Step 2) for filled shifts; weekend columns get the 45° hatch bg; keep `--sh-{code}-*`
  fill, `sf-pinned`, `sf-proposed`, `◢` pin wedge. Row alternation (every 2nd row 30%
  surface-2 mix). Keep table-based sticky approach (R2).
- **Green check:** `pnpm --filter @crewdoku/app test -- board` green.

### Step 12 — Board: dept groups (collapse) + weekly hours + 2-level sticky header *(AC9, AC10)* — app-only

- **Red:** extend `board.test.tsx`:
  - each dept group header shows the dept name + member count and a `▾`/`▸` toggle; clicking
    collapses/expands that dept's rows (AC10). Dept grouping respects `boardDeptFilter`
    (rows/headers outside the selected dept hidden; `'all'` shows all — AC5 grid side).
  - weekly-hours per employee renders (mono) and its color class is RED for `>48`, AMBER for
    `>40`, faint otherwise — construct three employees at thresholds and assert the class
    (AC9). Hours = pure sum over the visible week's assigned cells of
    `(shift.endHour - shift.startHour)` (decision D4 — NOT a domain call).
  - second sticky header level present (week-range row1 + day/date row2).
  Run → fails.
- **Green:** modify `Board.tsx`: collapsible dept group headers (component-local
  `Set<string>` collapse state — D3), weekly-hours cell (pure sum helper, can live in
  `timeFormat.ts` or a `hours.ts` sibling — keep it pure, app-only), threshold color
  classes, 2-level sticky header, `boardDeptFilter` filtering.
- **Green check:** `pnpm --filter @crewdoku/app test -- board` green.

### Step 13 — CellPopover (assign shift) *(AC12)* — app-only

- **Red:** new `app/src/features/board/__tests__/cellPopover.test.tsx`:
  - clicking a board cell opens an "Assign shift" popover listing the employee's eligible
    shifts (`eligibleShiftIds ∩ team.shiftIds`) each with code chip + name + time range,
    plus a "Day off" entry and a "Clear" entry.
  - choosing a shift calls `store.setAssignment({employeeId,date,shiftId})` and the cell
    updates; "Day off" passes `shiftId:null`.
  - Esc / outside-click closes (uses existing `useDismiss`).
  - inline `⚠` per-option is GATED on Step 19's `wouldViolate` selector — assert it is
    ABSENT here so this step passes standalone.
  Run → fails (no module).
- **Green:** new `app/src/features/board/CellPopover.tsx` (anchored, `useDismiss`), wired
  into `Board.tsx` cell click. Writes via `store.setAssignment`. Reuses `shiftTimeRange`
  + `LegendSwatch`.
- **Green check:** `pnpm --filter @crewdoku/app test -- cellPopover board` green.

### Step 14 — CoverageView (By-time pivot) *(AC4, AC11)* — app-only

- **Red:** new `app/src/features/board/__tests__/coverageView.test.tsx`:
  - renders one row per shift × the visible week's 7 day columns (AC11); left col = shift
    time-range chip (`--sh-{code}` colored, via `shiftTimeRange`).
  - each cell contains employee chip badges (dept-colored dot + last name, `◢` if pinned)
    for employees assigned to that shift×day — a pure inversion of the schedule Map.
  - integration: with `boardPivot==='time'`, the board surface renders CoverageView instead
    of the grid; `'emp'` restores the grid (AC4).
  Run → fails (no module).
- **Green:** new `app/src/features/board/CoverageView.tsx` (pure Map inversion grouped by
  shiftId×date; dept-dot color from a fixed palette keyed by team index — presentational).
  In `App.tsx`/board surface, switch grid vs CoverageView on `boardPivot`.
- **Green check:** `pnpm --filter @crewdoku/app test -- coverageView` green.

---

## Group F — Generate panel

### Step 15 — PreflightTable + ConstraintInventory *(AC14 — decision D5 fallback)* — app-only

- **Red:** new `app/src/features/solve/__tests__/preflight.test.tsx`:
  - `PreflightTable` shows Horizon (`<weeks*7>d`, Mon–Sun), Staff (`<E> · <D> depts`), Hard
    (`5 families`), Soft (`5 terms`), Pinned cells (`<K>`) — and NO pending-swaps row. All
    are pure counts of exposed state.
  - `ConstraintInventory` lists the H-family rows (H1–H6 or the enabled subset) with family
    names; exact instance counts use the Step 19 selector when present, else family-name +
    enabled-state only (D5 fallback) — assert the family rows render regardless.
  - assert THIS step's new panel chrome keys (Horizon, Staff, Hard, Soft, Pinned cells, etc.)
    resolve in BOTH `en` and `vi` (not deferred to Step 23).
  Run → fails (no modules).
- **Green:** new `app/src/features/solve/PreflightTable.tsx` +
  `app/src/features/solve/ConstraintInventory.tsx`. Pure counts from
  `employees`/`teams`/`shifts`/`coverages`/`rules`/`pins`. i18n keys in Step 23.
- **Green check:** `pnpm --filter @crewdoku/app test -- preflight` green.

### Step 16 — PenaltyBars + WorkloadHistogram from a FIXTURE proposal *(AC13-RTL — review-tightening #1)* — app-only

- **Red:** new `app/src/features/solve/__tests__/charts.test.tsx`:
  - construct a FIXTURE `proposal` object (no wasm) matching the real shape
    `{ id, changes[], fairness, prevFairness, penalty, prevPenalty, breakdown[] }`.
  - `PenaltyBars` renders one bar per S-term in `breakdown` (S1–S5) with a prev gridline +
    a now violet (`--st-prop`) bar (assert 5 bar elements + the prev/now values).
  - `WorkloadHistogram` renders a bar per employee with 0/24/48/72h banding and the class
    crit `>48` / warn `40–48` / prop `<40` (construct employees at each band; hours use the
    SAME pure weekly-hours sum as Step 12, decision D4).
  Run → fails (no modules).
- **Green:** new `app/src/features/solve/PenaltyBars.tsx` (may replace inline
  `BreakdownBars`) + `app/src/features/solve/WorkloadHistogram.tsx`. Both pure-render from
  props/store; no solver call.
- **Green check:** `pnpm --filter @crewdoku/app test -- charts` green.

### Step 17 — SolverLog (phase trace) *(AC13 panel chrome — decision D6)* — app-only

- **Red:** new `app/src/features/solve/__tests__/solverLog.test.tsx`: given store
  `solverPhase` transitioning `idle→solving→done`, `SolverLog` shows a mono phase trace
  (build → submit → status → map) sourced ONLY from `solverPhase`/`solverElapsed` (no new
  solver instrumentation, D6). Assert lines appear for the current/elapsed phases.
  Run → fails (no module).
- **Green:** new `app/src/features/solve/SolverLog.tsx` (112px, mono 10px, live-scroll),
  derived purely from `solverPhase` + `solverElapsed`.
- **Green check:** `pnpm --filter @crewdoku/app test -- solverLog` green.

### Step 18 — SolvePanel restructure (header + preflight + inventory + run + log + result) *(AC13-RTL, AC14)* — app-only

- **Red:** update `app/src/features/solve/__tests__/solvePanel.test.tsx`:
  - panel header shows "Generate", run button, spinner/elapsed, collapse `✕`. Assert THIS
    step's new panel/header chrome keys (Run solver, Cancel, Optimal, etc.) resolve in BOTH
    `en` and `vi` (not deferred to Step 23).
  - body composes PreflightTable + ConstraintInventory + Run button + (during solve)
    SolverLog + (on result) banner with `P-…` id + change count + PenaltyBars +
    WorkloadHistogram + the per-cell accept/discard list + Apply/Discard.
  - CRITICAL (R4): assert the existing solve wiring is byte-identical — `Run solver` calls
    `store.solve()`, Apply calls `applyProposal(acceptedKeys)`, Discard calls
    `discardProposal()`, and the infeasible path still renders conflict core + relaxations
    calling `applyRelaxation`. Drive with the existing stub-solver pattern from
    `store/__tests__/solve.test.ts`.
  Run → fails (panel not yet restructured).
- **Green:** rewrite `app/src/features/solve/SolvePanel.tsx` to compose Steps 15–17 +
  charts; preserve every store call exactly. Keep proposal shape consumed as-is.
- **Green check:** `pnpm --filter @crewdoku/app test -- solvePanel solve` green.

---

## Group G — OPTIONAL named sub-deliverable: hard-violation markers *(decision D2 — review-tightening #3)*

This whole group is OPTIONAL and individually descopable. It has its own pass/fail gate.
If the orchestrator freezes the store surface, SKIP Group G entirely — every prior step was
written to pass with these markers ABSENT (Steps 8, 13, 15 explicitly gate on them).

### Step 19 — Store selectors delegating to domain `runHardChecks` *(D2)* — app-only (delegates to domain)

- **Red:** extend `app/src/store/__tests__/store.test.ts`:
  - `violationCount()` returns `runHardChecks(ctx, schedule, period).length` for the current
    state (0 on the feasible demo; >0 after forcing an over-coverage assignment).
  - `violatingCells()` returns a `Set<string>` of `${employeeId}|${date}` keys derived from
    the same checker result.
  - `wouldViolate(a)` returns whether applying candidate assignment `a` introduces a NEW
    hard violation (clone schedule, `setAssignment`, re-run checker, compare counts).
  Run → fails (no selectors).
- **Green:** add `violationCount()`, `violatingCells()`, `wouldViolate(a)` to the store —
  each a THIN selector that calls `get().context()` + domain `runHardChecks`. NO constraint
  logic in the store; it only delegates and maps results to cell keys.
- **Green check:** `pnpm --filter @crewdoku/app test -- store` green.

### Step 20 — Wire markers into Board / StatusLine / CellPopover *(D2)* — app-only

- **Red:** extend `board.test.tsx` (a `.sf-viol` cell appears for a violating cell from
  `violatingCells()`), `statusLine.test.tsx` (the `N viol` segment now shows
  `violationCount()`), `cellPopover.test.tsx` (an option whose `wouldViolate(a)` is true
  renders an inline `⚠`). Run → fails (markers absent).
- **Green:** consume the Step 19 selectors in Board (`.sf-viol` class), StatusLine (viol
  segment), CellPopover (`⚠` per option). Components only render classes/glyphs — zero
  computation.
- **Green check:** `pnpm --filter @crewdoku/app test -- board statusLine cellPopover` green.

---

## Group H — Compose shell + i18n + integration

### Step 21 — App.tsx compose new shell *(AC17, AC2, AC4 wiring)* — app-only

- **Red:** update `app/src/__tests__/app-shell.test.tsx`: App renders the new `Sidebar`
  (Step 6) + StatusLine (Step 8); the board surface shows BoardToolbar (Step 10) +
  StatusLegend (Step 9) + (Board grid | CoverageView by `boardPivot`) + collapsible
  SolvePanel; onboarding is NOT a nav item but stays reachable from an empty-board state /
  Load Demo (D7). Run → fails (old composition).
- **Green:** rewrite `App.tsx` to compose the new shell. Drop the inline `Sidebar`/`Status`
  (now extracted), keep `I18nProvider` + injected store + `ExportModal` mount; lift the
  Export trigger to BoardToolbar. Keep onboarding reachable per D7.
- **Green check:** `pnpm --filter @crewdoku/app test -- app-shell` green.

### Step 22 — Config screens visual polish *(AC16)* — app-only

- **Red:** ensure `config.test.tsx` still asserts each editor (shifts, rules/priorities,
  teams, coverage, employees) renders and its primary edit action dispatches the existing
  store action (add shift, toggle constraint, set weight, edit coverage band, add/remove
  employee). Add an assertion that a shift-code cell shows a `LegendSwatch`-style color chip.
  Run → adjust as needed.
- **Green:** polish `ShiftsConfig`/`CoverageConfig`/`RulesConfig`/`TeamsConfig`/
  `EmployeesConfig` to the dense token aesthetic (Panel headers, mono inputs, 24px controls,
  shift color chips). NO store-wiring/domain-call changes.
- **Green check:** `pnpm --filter @crewdoku/app test -- config` green.

### Step 23 — i18n catalog-completeness sweep (EN + VI) *(AC20)* — app-only

- **Note:** individual chrome keys are ALREADY asserted to resolve in both EN and VI by their
  own steps (Sidebar/6, StatusLine/8, BoardToolbar/10, StatusLegend/9, SolvePanel/15–18,
  Config sub-labels/7). This step is the FINAL catalog sweep — completeness + parity, not the
  first verification of any key.
- **Red:** add an i18n test (or extend an existing one) asserting catalog completeness and
  parity: every chrome key used by Sidebar/StatusLine/BoardToolbar/StatusLegend/SolvePanel/
  Config sub-labels exists in BOTH `en` and `vi` (no missing keys, no `en`-only/`vi`-only
  orphans), and that a seeded employee/team/shift name is NEVER passed through `t()`
  (spot-check: switching to VI leaves a known seeded name verbatim).
  Run → fails for missing/orphaned keys.
- **Green:** add the new keys to `app/src/i18n/messages.ts` (EN + VI): section labels
  (SCHEDULE, CONFIGURATION + 5 config items), toolbar (Schedule board, Today, By employee,
  By time, All departments, Seed, Generate, Export), legend (STATUS, pinned, proposed,
  violation), status segments (saved, staff, shifts, offline, viol, overrides, pinned),
  panel (Horizon, Staff, Hard, Soft, Pinned cells, Run solver, Cancel, Optimal, etc.).
  Do NOT wrap user data.
- **Green check:** `pnpm --filter @crewdoku/app test -- i18n` (and the suites touching
  chrome) green.

### Step 24 — Full gate + manual browser verify *(AC13, AC19, AC21, AC22)*

- **Automated:** run `pnpm lint` (tsc --noEmit both packages) and `pnpm test` (vitest across
  both, via turbo). Both green = AC21. Confirm `app/tokens.css` checksum test green = AC19.
- **Manual browser-verify (real HiGHS, AC13 + AC22) — checklist:**
  1. `pnpm --filter @crewdoku/app dev`, open the served URL.
  2. Load Demo → board shows ~5 depts, realistic names, 5 token-colored shifts, time-range
     cells (`0100–0600` etc.), weekly hours with threshold colors.
  3. Toolbar: `◀ ▶` change the visible week + range label; "Today" jumps in-range; By time
     shows CoverageView; dept filter narrows; Generate enabled.
  4. Pin ≥1 cell → `◢ Seed · K` pill appears; STATUS legend shows 3 states + shift chips.
  5. Generate → SolverLog traces phases → real proposal: banner `P-…` + change count,
     PenaltyBars (S1–S5) + WorkloadHistogram render.
  6. Toggle a per-cell accept off, Apply → board reflects ONLY accepted changes; Discard on
     a fresh solve clears the proposal. No console errors; a non-trivial solve time shows.
  7. (If Group G shipped) force an over-coverage edit → `.sf-viol` outline + status viol
     count + popover `⚠` appear; revert → they clear.

---

## Step→AC coverage map

| AC | Steps |
|----|-------|
| AC1 time-range cells | 2, 11 |
| AC2 toolbar present | 5, 10, 21 |
| AC3 week nav | 3, 4, 10, 11 |
| AC4 pivot toggles | 3, 14, 21 |
| AC5 dept filter | 3, 10, 12 |
| AC6 seed/pin pill | 5, 10 |
| AC7 legend 3 states | 9 |
| AC8 legend shift chips | 2, 5, 9 |
| AC9 weekly hours + color | 12 |
| AC10 dept collapse + counts | 12 |
| AC11 by-time shift rows | 14 |
| AC12 cell popover | 13 |
| AC13 generate real solve (RTL parts) | 16, 17, 18, 24 |
| AC14 preflight + inventory | 15, 18 |
| AC15 realistic demo roster | 1 |
| AC16 config usable | 7, 22 |
| AC17 sidebar sections | 5, 6, 7, 21 |
| AC18 status bar content | 8 |
| AC19 tokens intact | (guard, Step 24) |
| AC20 i18n chrome-only | 6, 8, 23 |
| AC21 tests green | 24 |
| AC22 real HiGHS e2e | 24 (browser) |
| (opt) violation markers | 19, 20 |

## Domain-touch flags

- **ONLY Step 1** edits `packages/domain` (`seed/demo.ts` + `seed/__tests__/demo.test.ts`),
  DATA-only, gated on the (approved) reseed decision.
- **Step 19** delegates to domain `runHardChecks` from a store selector but adds NO domain
  code — it lives entirely in `app/src/store/store.ts`. If it ever tempts re-implementing a
  check in the store, STOP and call the existing domain fn.
- Every other step is `app/src/**` presentation only. No edits to `tokens.css`,
  `app/tokens.css`, `adapters/highs/*`, `adapters/storage/*`, or any other domain file.
