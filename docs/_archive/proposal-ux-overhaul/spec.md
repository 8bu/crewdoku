# Spec — Solver proposal UX overhaul + empty-schedule-first onboarding

Status: approved-draft
Scope owner: `app/src/crewdoku/*` (presentation + local store only)
Traces to: VISION.md §5 (principle 2 "One decision, not a hundred"), §6 (core loop),
§7 (current direction). Authoritative requirement sources:
`docs/design/prototype/project/CHANGELOG.md` and `.../SOLVER_INTEGRATION.md`,
mirrored against the prototype `app.jsx` / `board.jsx` / `generate.jsx` / `leader.jsx` / `data.js`.

---

## Problem

The ported live app (`app/src/crewdoku/`) still carries the pre-June-17 proposal-review UX:

- **Per-cell triage.** A proposal arrives, the board enters a `"review"` solver phase, and
  every changed cell shows a violet `DiffPopover` with Accept/Reject. The store tracks a
  per-cell `decided` Map; the diff banner and the GeneratePanel "Review proposal" section
  show `decidedCount`/`acceptedCount` progress, "Accept all / Reject all" bulk buttons, and
  an "Apply N accepted" button that only writes the cells the planner individually accepted.
  This contradicts VISION §5.2: reviewing a proposal must be *one* yes/no on the whole result.

- **Pre-solved board after onboarding.** Completing the onboarding wizard dispatches
  `LOAD_CUSTOM`, which leaves the board showing the deterministic `SF.baseAssign` schedule.
  The planner never experiences "set up the org, then run the solver to get the first
  schedule." This contradicts VISION §5.1 ("Solve first, edit second") and §6 (the empty
  board must be a prompt to Generate).

- **Latent bugs from the prototype.** The June-17 prototype CHANGELOG fixed 7 bugs. Some
  pre-date our port and may still be present in our ported files.

This change brings `app/src/crewdoku/` in line with the June-17 prototype: collapse N
decisions to 1 (an `Original | Solved` whole-board preview toggle + whole-proposal
Apply/Discard), and add an `emptySchedule` flag so onboarding lands on a blank board with a
Generate prompt.

---

## Scope / Non-goals

### In scope (presentation + store only, all inside `app/src/crewdoku/`)
1. Remove per-cell accept/reject UX; add `Original | Solved` board-preview toggle +
   whole-proposal Apply/Discard. `DIFF_APPLY` writes all `proposal.changes` unconditionally.
2. Add an `emptySchedule` app-state flag wired through the reducer, board rendering, the
   guidance banner, and IndexedDB persistence.
3. Port the applicable subset of the 7 prototype bug fixes (disposition table below).

### Non-goals (echo VISION §3 + the task's hard constraints)
- **No real-solver wiring.** The proposal source stays `SF.makeProposal` in
  `app/src/crewdoku/sf.ts` (simulated/deterministic). Wiring real HiGHS is explicitly OUT OF
  SCOPE — it would touch `app/src/adapters/` and `domains/`, which this change must not
  touch. This matches SOLVER_INTEGRATION.md, which names `SF.makeProposal` as the *sole*
  integration point. (Assumption A1.)
- **No `domains/` or `app/src/adapters/` edits.** No scheduling logic added to components —
  components call `SF`, never compute constraints/models/scores (VISION §5.4).
- **No accounts/roles/approvals/swap-workflows/multi-tenant/network** (VISION §3). A "swap"
  remains the planner editing two cells.
- **TweaksPanel "Empty schedule" toggle is OUT OF SCOPE.** The prototype adds a TweaksPanel
  `TweakToggle` (and a `SET_EMPTY_SCHEDULE` action) to flip the blank-start state manually.
  Our app has **no TweaksPanel** (`grep` for `TweaksPanel`/`TweakToggle` in `app/src` →
  none). Per the task, this is OPTIONAL/out-of-scope. Decision D1: omit both the TweaksPanel
  UI and the `SET_EMPTY_SCHEDULE` reducer case (nothing else dispatches it). The empty state
  is still fully reachable, clearable, and persisted via the in-scope wiring.
- **No design-token / class renames** (`--sh-*`, `.sf-*`, `rounded-[2px]` unchanged).

---

## Acceptance criteria (numbered, testable — each becomes an e2e/unit case)

### A. Per-cell UX removed
1. `DiffPopover` no longer exists in `board.tsx`, and the board never opens a popover of
   `kind: 'diff'`. Clicking a changed (proposed) cell while a proposal is active opens the
   normal `EmpActionPopover` (`kind: 'emp'`) — never an Accept/Reject popover.
2. The store no longer has a per-cell decision concept: `app.diff` shape is
   `{ proposal }` only (no `decided` Map). The reducer no longer handles `DIFF_DECIDE` or
   `DIFF_ALL`, and no component dispatches them.
3. `acceptedCount` and `decidedCount` are absent from `board.tsx` and `generate.tsx`
   (a grep for these identifiers in `app/src/crewdoku/` returns nothing).
4. The GeneratePanel no longer renders a "Review proposal" panel section (no progress bar,
   no "Accept all"/"Reject all" buttons, no "Apply N accepted" button).
5. The `"review"` solver phase is gone: `leader.tsx` initializes `solverState.phase` to
   `'idle'` when a proposal already exists (not `'review'`), the `done`-detection in
   `generate.tsx` keys off `'done'` only, and no code reads or writes `phase === 'review'`.

### B. Original | Solved whole-board preview toggle
6. While `app.diff` is set, the board's diff banner renders a `Seg` toggle with exactly two
   options labelled `Original` and `Solved`, plus a `Discard` (ghost) and an `Apply`
   (primary) button. The banner shows `◆ {proposal.id} · {N} changes · fairness
   prev→now · penalty prev→now` and contains no per-cell progress text.
7. When the toggle is on **Solved** (default on proposal arrival), every changed cell renders
   its `ch.to` shift (or day-off), and changed cells carry the `sf-proposed` class.
8. When the toggle is flipped to **Original**, every cell renders its pre-solve value
   (`getShift` / `curCode`), i.e. the whole board reverts to the pre-solve preview. Flipping
   back to **Solved** restores the post-solve preview. Neither toggle state mutates
   `overrides` or persists anything (preview only, no commit).
9. On a new proposal arriving, the toggle resets to **Solved** (mirrors prototype
   `useEffect(() => { if (diff) setSolvedView(true) }, [!!diff])`).
10. "Changed" is computed as `ch.from !== ch.to` (prototype `isChanged`); the stale
    `isProposed` identifier is fully renamed to `isChanged` so no `onMouseEnter`/render guard
    references an undefined variable (prevents the ReferenceError → blank-page bug).

### C. Apply / Discard whole-proposal
11. Clicking **Apply** (banner or GeneratePanel result footer) dispatches `DIFF_APPLY`, which
    writes **every** `proposal.changes` entry: `overrides.set(c.key, { code: c.to, viol: [] })`
    for all changes unconditionally, sets `diff: null`, and sets `emptySchedule: false`.
12. After Apply, the board shows the solved schedule as committed overrides, the diff banner
    is gone, and (if it was empty) the empty-schedule guidance banner is gone.
13. Clicking **Discard** dispatches `DIFF_DISCARD`, which sets `diff: null` and leaves
    `overrides` and `emptySchedule` unchanged (board reverts to the pre-proposal state).
14. The GeneratePanel result section (when `done` + `app.diff`) renders a `Discard` (ghost) +
    `✓ Apply` (primary) button pair and nothing else for decisioning.

### D. Empty-schedule-first onboarding
15. `initialState.emptySchedule === false`.
16. Finishing onboarding (the `LOAD_CUSTOM` dispatch) sets `emptySchedule: true` (in addition
    to `dataMode: 'custom'` and clearing pins/overrides/diff).
17. `LOAD_DEMO` sets `emptySchedule: false` — demo data loads with a visible (non-empty)
    schedule.
18. While `emptySchedule === true`, the board grid is structurally visible (header, employee
    rows, day columns) but **all cells are blank**: `getShift` returns `null` for every cell
    regardless of `overrides`/`baseAssign`.
19. While `emptySchedule === true` and not in seed mode, the board shows a guidance banner:
    `▦  Schedule is empty — run the solver to generate your first schedule.` with a primary
    `▸ Generate` button that opens the GeneratePanel.
20. The first applied solve clears empty: after onboarding (empty) → run solver → Apply, the
    board is non-empty and the guidance banner is gone (covered by `DIFF_APPLY` → A.C.11).
21. The first manual edit clears empty: `SET_CELL` sets `emptySchedule: false`, so editing any
    cell on an empty board makes the board non-empty (the edited cell shows its value, other
    cells show their `baseAssign`/override values).
22. `emptySchedule` persists across reload: the autosave payload includes `emptySchedule`, and
    `DB_LOAD` restores it (`a.data.emptySchedule !== undefined ? a.data.emptySchedule :
    state.emptySchedule`). After onboarding → reload, the board is still empty with the
    guidance banner; after Apply → reload, the board is still non-empty.

### E. Ported bug fixes (only those applicable to our port — see disposition table)
23. `board.tsx` contains no reference to a `decided`/`dec`-derived render path that could throw
    (the `isProposed`→`isChanged` rename, A.B.10, also closes the original ReferenceError).
24. `app/src/crewdoku/__tests__/sf.test.ts` (custom-roster robustness) stays green:
    `SF.makeProposal`, `SF.workloadHistogram`, and `SF.baseAssign` do not crash for a roster
    smaller than the demo, and `SF.baseAssign(out-of-range)` returns `undefined`. (Our `sf.ts`
    already bounds these by `EMPLOYEES.length` and guards `baseAssign`; this criterion is a
    regression guard, confirming the prototype `data.js` fixes are present and stay present.)
25. Onboarding finish replaces shifts and then calls `SF.rebuildShiftIdx()` so `SHIFT_IDX` is
    consistent with custom shift codes (regression guard — our `onboarding.tsx` already calls
    `SF.rebuildShiftIdx?.()`; the call must remain).

### F. Cross-cutting / no-regression
26. `pnpm lint` (tsc `--noEmit`) is clean and `pnpm test` is green after the change.
27. No file outside `app/src/crewdoku/` is modified (no `domains/`, no `app/src/adapters/`).
    `SF.makeProposal` remains the proposal source; no real-solver call is introduced.

---

## Affected files (all under `app/src/crewdoku/`)

### `app.tsx` (store/reducer)
- `initialState`: add `emptySchedule: false`.
- `SET_CELL`: add `emptySchedule: false` to the returned state.
- `SET_PROPOSAL`: change `diff` from `{ proposal: a.proposal, decided: new Map() }` to
  `{ proposal: a.proposal }`.
- Remove reducer cases `DIFF_DECIDE` and `DIFF_ALL`.
- `DIFF_APPLY`: replace the per-cell `if (decided.get === 'accept')` loop with an
  unconditional loop over `proposal.changes` (`overrides.set(c.key, { code: c.to, viol: [] })`),
  and return `{ ...state, overrides, diff: null, emptySchedule: false }`.
- `LOAD_DEMO`: add `emptySchedule: false`.
- `LOAD_CUSTOM`: add `emptySchedule: true`.
- `DB_LOAD`: restore `emptySchedule` (`a.data.emptySchedule !== undefined ?
  a.data.emptySchedule : state.emptySchedule`).
- Autosave `useEffect`: add `emptySchedule: app.emptySchedule` to the `DB.set` payload and add
  `app.emptySchedule` to the effect dependency array.
- Do **not** add a `SET_EMPTY_SCHEDULE` case or a TweaksPanel (Decision D1).

### `board.tsx`
- `ScheduleBoard`: destructure `emptySchedule` from `app`.
- `getShift`: return `null` when `emptySchedule` is true (before consulting
  `overrides`/`baseAssign`); add `emptySchedule` to its `useCallback` deps.
- Remove the `DiffPopover` component entirely.
- Remove `decided`, `acceptedCount`, `decidedCount` and the `EMPTY_MAP` usage tied to
  `diff.decided` (in both `ScheduleBoard` and `CoverageView`).
- Add local `const [solvedView, setSolvedView] = useState(true)` and a
  `useEffect(() => { if (diff) setSolvedView(true) }, [!!diff])`.
- Diff banner: replace the per-cell progress text + Accept-all/Reject-all/"Apply N accepted"
  with `◆ {id} · changes · fairness · penalty` + `Seg[Original|Solved]` + `Discard` (ghost) +
  `Apply` (primary). Banner `id` prefix uses `◆` (drop the `PROPOSAL` Badge label per
  prototype; Decision D2).
- Empty-schedule guidance banner: add the `emptySchedule && !seedMode` banner block
  (▦ + "Schedule is empty — run the solver to generate your first schedule." + `▸ Generate`
  primary button calling `onGenerateToggle`).
- Cell render path (employee pivot): compute `const isChanged = !!(ch && ch.from !== ch.to)`;
  `const dispCode = (diff && solvedView && ch) ? (ch.to !== undefined ? ch.to : curCode) :
  curCode;`. Replace all `isProposed`/`dec`/`decided` references with `isChanged`/`dispCode`.
  Remove the `dec === 'accept'` override of `dispCode`. Keep `sf-proposed`/`sf-viol` classes
  driven by `isChanged`/`violated`. Update the cell tooltip to the prototype's
  `◆ {from} → {to}` form (no "Click to decide").
- `onCellClick`: remove the `if (ch && !dec) setPop({ kind: 'diff', ... })` branch — only seed
  pin-toggle and the `kind: 'emp'` popover remain. Its signature may keep the trailing
  `ch`/`dec` params unused or drop them; call sites pass `null` for the old `dec`.
- `CoverageView`: same removal of `decided`/`dec`/diff-popover path; chips reflect `solvedView`
  via the shared `getShift`/diff logic (mirror prototype `data.js`/`board.jsx` coverage path).
- Remove the `pop.kind === 'diff'` popover render block at the bottom.

### `generate.tsx`
- Remove `decided`, `acceptedCount`, `decidedCount` locals.
- Remove the entire `{app.diff && (<Panel title="Review proposal"> … </Panel>)}` block.
- In the `done && p` result section, add the prototype's footer when `app.diff`:
  `Discard` (ghost) + `✓ Apply` (primary) button pair dispatching `DIFF_DISCARD` /
  `DIFF_APPLY`.
- `done` should be `phase === 'done'` only (drop `|| phase === 'review'`).

### `leader.tsx`
- Initial `solverState.phase`: `app.diff ? 'done' : 'idle'` (was `'review'`) — mirror
  prototype, so an already-present proposal shows the result section, not a review phase.
- Remove the `setSolverState(... phase: 'review' ...)` write on new-proposal arrival; keep the
  `setGenOpen(true)` + `ADMIN_VIEW: 'generate'` behaviour.
- The diff-going-away branch that resets `phase: 'review' → 'idle'`: since `'review'` is gone,
  reset to `'idle'` when a proposal is cleared (or drop the now-dead conditional). No
  `'review'` string may remain.

### `__tests__/sf.test.ts`
- No change required for the existing custom-roster test (it already guards the `data.js`
  fixes). New unit tests for the reducer (`DIFF_APPLY` writes all changes + clears empty;
  `SET_CELL`/`LOAD_CUSTOM`/`LOAD_DEMO`/`DB_LOAD` empty-flag behaviour) and any RTL tests for
  the toggle/banner are added by the plan/implementation stage; this spec lists them as the
  acceptance criteria above.

### Not changed
- `sf.ts` — already carries the `data.js` bug fixes (`EMPLOYEES.length` bounds, `baseAssign`
  guard). No edit needed beyond keeping them. (If review finds any residual `i < 100` in a
  proposal/histogram loop it must be corrected, but current `sf.ts` has none in those loops.)
- `db.ts` — generic key-value + Map↔obj helpers; persistence of the new flag rides on the
  `app.tsx` payload, so `db.ts` is untouched.
- `admin.tsx`, `onboarding.tsx`, `ui.tsx` — untouched, except onboarding's existing
  `SF.rebuildShiftIdx?.()` call must remain (criterion 25).

---

## Bug-fix disposition table (7 rows from CHANGELOG)

| # | Prototype file · bug | Applies to our port? | Disposition + reason |
|---|---|---|---|
| 1 | `board.jsx` · `isProposed` not renamed to `isChanged` in `onMouseEnter` guard → ReferenceError → blank page | **YES** | **Apply.** Our `board.tsx` still uses `isProposed` (line ~706, ~728, ~758). The overhaul renames it to `isChanged` everywhere (criterion 10/23). This fix is intrinsic to removing the per-cell path. |
| 2 | `onboarding.jsx` · `StepTeam` used `validDepts` (outer var) instead of its `depts` prop → ReferenceError on parsing employees | **SKIP (already fixed)** | Our `onboarding.tsx` `StepTeam({ depts, ... })` uses `depts` and is fed `validDepts` via prop at the call site (line 467). No `validDepts` leak inside `StepTeam`. Out of overhaul scope anyway (onboarding untouched). |
| 3 | `data.js` · `makeProposal` hardcoded `i < 100` → undefined `.home` for smaller rosters | **SKIP (already fixed)** | Our `sf.ts` `makeProposal` loops `for (let i = 0; i < n …)` with `n = EMPLOYEES.length`. Guarded by existing test. Keep as regression guard (criterion 24). |
| 4 | `data.js` · `workloadHistogram` hardcoded `i < 100` | **SKIP (already fixed)** | Our `sf.ts` `workloadHistogram` loops `i < EMPLOYEES.length`. Keep as regression guard (criterion 24). |
| 5 | `data.js` · `workloadHistogram` returned `n` but `CompactHist` read `b.count`; bucket thresholds misaligned to 48h cap | **SKIP (consistent, out of scope)** | Our `sf.ts` returns buckets keyed `n` AND our `generate.tsx` `CompactHist` reads `b.n` — internally consistent, bars render. Prototype standardized on `count`; we are NOT adopting that rename (it would be churn with no behavior change and risks divergence). Decision D3: keep `n`. Note: our bucket thresholds (`<24/24/30/36/>40`) differ from the prototype's 48h-aligned set; the histogram is a cosmetic prototype-only chart on the solver panel, so re-aligning thresholds is **out of scope** for this presentation overhaul. Flagged as a known cosmetic gap, not a regression. |
| 6 | `data.js` · `baseAssign(i, absDay)` accessed `.home` without an out-of-range guard | **SKIP (already fixed)** | Our `sf.ts` `baseAssign` has `if (!EMPLOYEES[i]) return undefined`. Guarded by existing test (criterion 24). |
| 7 | `onboarding.jsx` · `finish()` replaced `SF.SHIFTS` but never called `SF.rebuildShiftIdx()` → stale `SHIFT_IDX` | **SKIP (already fixed)** | Our `onboarding.tsx` `finish()` calls `SF.rebuildShiftIdx?.()` (line 442). Keep the call (criterion 25). |

**Tally: 1 apply (#1), 6 skip** (5 already-present-in-our-port regression guards: #2,#3,#4,#6,#7;
1 deliberate non-adoption: #5). The single net-new fix (#1) is folded into the per-cell removal.

---

## Risks

- **R1 — Coverage ("By time") pivot parity.** `CoverageView` has its own diff/decided code
  path. If the per-cell removal is applied only to the employee pivot, the coverage pivot
  could keep a dead `decided`/`dec` reference or fail to honor `solvedView`. Mitigation:
  mirror the prototype's coverage path; e2e must exercise the "By time" pivot with an active
  proposal.
- **R2 — `solvedView` is component-local, not in the store.** It is intentionally not
  persisted (preview-only, criterion 8). Risk: a test asserting persistence would be wrong.
  Mitigation: spec states preview-only; tests assert no `overrides`/DB change on toggle.
- **R3 — `emptySchedule` vs `dataMode: 'empty'`.** Two near-orthogonal "empty" concepts:
  `dataMode === 'empty'` gates the whole-screen `EmptyBoardState`/onboarding (no org loaded);
  `emptySchedule` is "org loaded but schedule blank, go Generate." After `LOAD_CUSTOM`,
  `dataMode` is `'custom'` (board shows) and `emptySchedule` is `true` (cells blank). Risk of
  conflating them. Mitigation: spec keeps them distinct; criteria 16–19 test the `'custom'` +
  `emptySchedule:true` combination specifically.
- **R4 — Hidden `'review'`/`decided` references.** A missed reference compiles under `any` but
  throws at runtime (the original blank-page class of bug). Mitigation: grep-clean for
  `decided`, `DIFF_DECIDE`, `DIFF_ALL`, `acceptedCount`, `decidedCount`, `isProposed`,
  `'review'`, `DiffPopover` across `app/src/crewdoku/`; `pnpm lint` + e2e board render.
- **R5 — DB forward-compat.** Existing IndexedDB blobs lack `emptySchedule`. `DB_LOAD` must
  treat `undefined` as "keep current" (→ stays `false` for legacy demo/custom states), so a
  prior user is not unexpectedly blanked. Covered by criterion 22's `!== undefined` guard.

---

## Assumptions / decisions log

- **A1 (assumption, in-vision).** The proposal source stays `SF.makeProposal` (simulated,
  deterministic) in `app/src/crewdoku/sf.ts`. Real HiGHS wiring is OUT OF SCOPE (touches
  adapters/domain). This is a known in-vision detail (VISION §7 closing paragraph;
  SOLVER_INTEGRATION.md §2 names `SF.makeProposal` as the sole swap-point) — not a pivot.
- **A2 (assumption).** `app.tsx` reducer state stays `any`-typed as ported; the change adds
  `emptySchedule` without introducing a strict state type (consistent with existing style).
- **D1 (decision).** Omit the TweaksPanel "Empty schedule" `TweakToggle` and the
  `SET_EMPTY_SCHEDULE` reducer case. Why: our app has no TweaksPanel; the task marks it
  OPTIONAL/out-of-scope; the empty state is fully reachable/clearable/persisted without it.
  Alternatives rejected: (a) build a TweaksPanel — scope creep, no vision mandate; (b) add
  `SET_EMPTY_SCHEDULE` with no caller — dead code.
- **D2 (decision).** Diff-banner header mirrors the prototype: `◆ {proposal.id} · …` (drop the
  `PROPOSAL {id}` Badge wording). Why: exact prototype parity (the task says "mirror exact
  behaviour"). Alternative rejected: keep old `PROPOSAL` Badge — diverges from prototype.
- **D3 (decision).** Keep `workloadHistogram` bucket property name `n` (not rename to `count`)
  and keep current bucket thresholds. Why: our `sf.ts`+`CompactHist` already agree on `n` and
  render correctly; the rename + 48h re-threshold is a prototype-internal cosmetic change on
  an out-of-scope chart, with churn risk and no behavior gain for the proposal-UX overhaul.
  Alternative rejected: adopt `count` + re-threshold — out of scope, no user-visible win here.
- **D4 (decision).** `onCellClick` keeps its trailing parameters for minimal call-site churn,
  but the `kind: 'diff'` branch is deleted; callers pass `null` where `dec` used to flow. Why:
  smallest diff that removes the per-cell decision while preserving seed/emp-popover paths.
  Alternative rejected: re-signature `onCellClick` across both pivots — larger blast radius.
- **D5 (decision).** `solvedView` lives as component-local state in `board.tsx` (not in the
  store, not persisted). Why: it is a transient preview toggle, valid only while a proposal is
  open, and VISION §5.2 frames it as a comparison aid, not committed state. Alternative
  rejected: store it in `app.diff` — needless persistence + reducer surface.
