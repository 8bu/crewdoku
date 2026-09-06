# Plan — Solver proposal UX overhaul + empty-schedule-first onboarding

Status: approved-draft
Spec: `docs/plans/proposal-ux-overhaul/spec.md` (27 acceptance criteria)
Scope: presentation + local store only, all under `app/src/crewdoku/`.
Test stack: Vitest + jsdom + RTL (app package). New tests go in `app/src/crewdoku/__tests__/`.
Verify: `pnpm lint` (tsc `--noEmit`) clean + `pnpm test` green.

## How to work this plan

Each step is strict **red → green → refactor**:
1. Write the failing test named in the step. Run it; confirm it fails for the stated reason.
2. Make the minimal change in the named files to go green.
3. Refactor only within the step's blast radius; keep the suite green.

Hard rules carried into every step:
- No edits outside `app/src/crewdoku/` (no `domains/`, no `app/src/adapters/`).
- Proposal source stays `SF.makeProposal` (simulated). No real-HiGHS wiring.
- No scheduling logic in components — they call `SF`, never compute constraints/models/scores.
- Preserve `rounded-[2px]`, geometric-Unicode-only (no emoji), `--sh-*`/`.sf-*` token names.

## Test infrastructure notes (verified)

- `app/vitest.config.ts`: jsdom env, `setupFiles: ['./src/test/setup.ts']`. Setup wires `@testing-library/jest-dom/vitest` + RTL `cleanup()` in `afterEach`. RTL (`@testing-library/react` ^16) and `jsdom` ^25 are installed.
- The reducer (`reducer`) and `initialState` in `app.tsx` are module-private (not exported). **Step 1 exports them** so reducer unit tests can import them. This is the single deliberate test-seam addition; it adds no behavior.
- `SF.SHIFTS`/`SF.EMPLOYEES` are live module arrays. The existing `sf.test.ts` mutates+restores them; new SF-touching tests must do the same or avoid mutation. RTL board tests render against the demo roster as-is (no mutation needed).
- Component tests render `ScheduleBoard` / `GeneratePanel` directly with hand-built `app`/`dispatch` props (a jest `vi.fn()` dispatch + plain state object), not the whole `App` tree, to keep them fast and deterministic. `solverState`/timers in `leader.tsx` are tested by asserting initial state, not by driving the simulated timer.

---

## Phase A — Reducer / state (app.tsx)

These steps are first because every UI change depends on the new state shape. Doing them first means the UI steps build on a green reducer.

### Step 1 — Export reducer + initialState; add `emptySchedule` to initial state and DB_LOAD/autosave

**Files:** `app/src/crewdoku/app.tsx`, new `app/src/crewdoku/__tests__/reducer.test.ts`

**Red — write `reducer.test.ts`:**
- `import { reducer, initialState } from '../app'` (fails to compile first: not exported).
- Assert `initialState.emptySchedule === false`. **(AC 15)**
- Assert `reducer(state, { type: 'DB_LOAD', data: { emptySchedule: true } }).emptySchedule === true`.
- Assert `reducer({...state, emptySchedule: true}, { type: 'DB_LOAD', data: {} }).emptySchedule === true` (undefined → keep current, the `!== undefined` guard). **(AC 22, R5)**

**Green:**
- Add `export` to `const initialState` and `function reducer`.
- Add `emptySchedule: false` to `initialState`.
- In `DB_LOAD`, add `emptySchedule: a.data.emptySchedule !== undefined ? a.data.emptySchedule : state.emptySchedule`.
- Autosave `useEffect`: add `emptySchedule: app.emptySchedule` to the `DB.set` payload object and add `app.emptySchedule` to the dependency array.

**Satisfies:** AC 15, 22 (persistence half), R5.

### Step 2 — Empty-flag transitions: SET_CELL / LOAD_CUSTOM / LOAD_DEMO

**Files:** `app/src/crewdoku/app.tsx`, `reducer.test.ts`

**Red — add assertions:**
- `reducer({...initialState, emptySchedule:true}, { type:'SET_CELL', key:'0|0', code:'N', viol:[] }).emptySchedule === false` and the override was written. **(AC 21)**
- `reducer(initialState, { type:'LOAD_CUSTOM' })` → `dataMode==='custom'` AND `emptySchedule===true` AND `pins.size===0` AND `overrides.size===0` AND `diff===null`. **(AC 16)**
- `reducer({...initialState, emptySchedule:true}, { type:'LOAD_DEMO' })` → `dataMode==='demo'` AND `emptySchedule===false`. **(AC 17)**

**Green:**
- `SET_CELL`: return `{ ...state, overrides, emptySchedule: false }`.
- `LOAD_CUSTOM`: add `emptySchedule: true` to the returned object.
- `LOAD_DEMO`: add `emptySchedule: false` to the returned object.

**Satisfies:** AC 16, 17, 21.

### Step 3 — Simplify SET_PROPOSAL + DIFF_APPLY; remove DIFF_DECIDE / DIFF_ALL

**Files:** `app/src/crewdoku/app.tsx`, `reducer.test.ts`

**Red — add assertions:**
- After `SET_PROPOSAL` with a proposal, `result.diff` deep-equals `{ proposal }` — i.e. `result.diff.decided === undefined` (no `decided` Map). **(AC 2 — shape)**
- Build a state with a 3-change proposal in `diff` and one pre-existing override; dispatch `DIFF_APPLY`. Assert: all 3 `proposal.changes` are written to `overrides` as `{ code: c.to, viol: [] }` (unconditionally — even though no `decided` map exists), `diff === null`, and `emptySchedule === false`. **(AC 11)**
- Assert `reducer(state, { type:'DIFF_DECIDE', ... })` returns the state unchanged (default branch — case removed) and same for `DIFF_ALL`. **(AC 2 — cases removed)**
- Assert `DIFF_DISCARD` sets `diff:null` and leaves `overrides` + `emptySchedule` untouched. **(AC 13)**

**Green:**
- `SET_PROPOSAL`: return `{ ...state, diff: { proposal: a.proposal } }` (drop `decided: new Map()`).
- Delete the `DIFF_DECIDE` and `DIFF_ALL` reducer cases entirely.
- `DIFF_APPLY`: replace the `if (state.diff.decided.get(c.key) === 'accept')` guard with an unconditional `overrides.set(c.key, { code: c.to, viol: [] })` for every change; return `{ ...state, overrides, diff: null, emptySchedule: false }`.
- `DIFF_DISCARD`: unchanged (`{ ...state, diff: null }`) — already leaves overrides/emptySchedule alone; the test pins this.

**Satisfies:** AC 2, 11, 13. (Note: this is the reducer half of AC 20 — empty cleared on apply — which the e2e step verifies end-to-end.)
**Decision applied:** D1 — no `SET_EMPTY_SCHEDULE` case is added (no caller; our app has no TweaksPanel).

---

## Phase B — Leader phase machine (leader.tsx)

### Step 4 — Drop the `'review'` solver phase

**Files:** `app/src/crewdoku/leader.tsx`, new `app/src/crewdoku/__tests__/leader.test.tsx`

**Red — write `leader.test.tsx`:**
- Render `<LeaderSurface app={appWithDiff} dispatch={vi.fn()} onExport={vi.fn()} />` where `appWithDiff` has a `diff` set and `adminView:'generate'`. Because `phase` initializes to `'done'` (not `'review'`), the GeneratePanel result section renders the proposal — assert the result Banner text `Optimal · Proposal {id}` is in the document. **(AC 5 — init phase)**
- **Mount-guard assertion (MUST be RED first):** render `<LeaderSurface app={appWithDiff} dispatch={spy} ... />` with `appWithDiff.diff` set (init phase resolves to `'done'`). Assert `spy` is called **zero** times with `{ type:'SET_PROPOSAL' }` on mount. This pins the regression below: with the naive change, the done-effect (lines 42–47, keyed on `solverState.phase`) fires on mount whenever init phase is `'done'`, regenerating a fresh `SF.makeProposal(app.pins)` and silently overwriting the live `app.diff` proposal. (Repros on any in-session remount of `LeaderSurface`; not on reload, since `diff` isn't persisted.)
- Static guard (grep-style) test: read `leader.tsx` source via `fs.readFileSync` and assert it contains no `'review'` substring. **(AC 5, R4)**

  (A source-string assertion is acceptable here because `'review'` is a magic string with no other place to observe its absence; it mirrors the spec's grep-clean mitigation R4.)

**Green:**
- Initial `solverState.phase`: `app.diff ? 'done' : 'idle'` (was `'review'`).
- **Guard the done-effect against a mount that starts at `'done'`.** The existing done-effect (`useEffect(() => { if (solverState.phase === 'done') dispatch({ type:'SET_PROPOSAL', proposal: SF.makeProposal(app.pins) }) }, [solverState.phase])`) is keyed only on `solverState.phase`, so with init phase `'done'` it fires on **mount** and clobbers the live `app.diff`. Add a one-shot guard so it only dispatches on a genuine `idle/solving → done` transition, not the initial render. Concretely: `const didInitialDone = useRef(app.diff ? true : false)` and in the effect, early-return when `didInitialDone.current` is already set for the mount case — e.g. `if (didInitialDone.current) { didInitialDone.current = false; return }` before the dispatch (seed it `true` only when init phase was `'done'`). Equivalent: seed a `prevPhase` ref so the dispatch only runs on a real phase change away from idle/solving. Either way: **no SET_PROPOSAL dispatch on a mount that initializes to `'done'`.**
- In the diff-arrival effect, remove the `setSolverState((s) => ({ ...s, phase: 'review' }))` line; keep `setGenOpen(true)` + `dispatch({ type:'ADMIN_VIEW', view:'generate' })`.
- In the diff-cleared branch, replace `s.phase === 'review' ? {...s, phase:'idle'} : s` with a reset to `'idle'` (e.g. `{ ...s, phase: 'idle' }`), so no `'review'` literal remains.

**Satisfies:** AC 5 (init + done-keying half), and the no-`'review'` guard of R4.
**Watch:** the diff-arrival effect dispatches `ADMIN_VIEW` — keep that so the panel still opens on proposal arrival (parity with prototype).
**Watch (regression):** do NOT leave the done-effect (lines ~42–47) keyed solely on `solverState.phase` without the mount guard above — otherwise a pre-existing `app.diff` at init phase `'done'` regenerates and overwrites the live proposal on every remount.

---

## Phase C — GeneratePanel (generate.tsx)

### Step 5 — `done` keys off `'done'` only; remove decided/accepted/decided counts

**Files:** `app/src/crewdoku/generate.tsx`, new `app/src/crewdoku/__tests__/generatePanel.test.tsx`

**Red — write `generatePanel.test.tsx`:**
- Render `<GeneratePanel>` with `solverState.phase:'done'` and an `app.diff` proposal; assert the `Optimal · Proposal` banner shows. Then render with `phase:'review'` (legacy) and assert the banner does **not** show (proves `done` no longer accepts `'review'`). **(AC 5)**
- Grep-style guard: assert `generate.tsx` source contains neither `acceptedCount` nor `decidedCount`. **(AC 3 for generate.tsx)**

**Green:**
- `const done = phase === 'done'` (drop `|| phase === 'review'`).
- Remove the `decided`, `acceptedCount`, `decidedCount` locals.

**Satisfies:** AC 3 (generate.tsx half), AC 5 (done-keying half).

### Step 6 — Remove "Review proposal" panel; add Discard / ✓ Apply footer

**Files:** `app/src/crewdoku/generate.tsx`, `generatePanel.test.tsx`

**Red — add assertions:**
- With `phase:'done'` + `app.diff`: assert there is **no** element with text matching `/Review proposal/i`, no `/Accept all/i`, no `/Reject all/i`, no `/Apply \d+ accepted/i`. **(AC 4)**
- Assert a `Discard` button and an `✓ Apply` button are present. Click `✓ Apply` → `dispatch` called with `{ type:'DIFF_APPLY' }`; click `Discard` → `dispatch` called with `{ type:'DIFF_DISCARD' }`. **(AC 14, AC 11 dispatch)**

**Green:**
- Delete the entire `{app.diff && (<Panel title="Review proposal"> … </Panel>)}` block.
- Inside the `done && p` result section, after the workload panel, add (guarded by `app.diff`):
  ```tsx
  {app.diff && (
    <div className="flex gap-1.5 pt-1">
      <Btn variant="ghost" className="flex-1 justify-center" onClick={() => dispatch({ type: 'DIFF_DISCARD' })}>Discard</Btn>
      <Btn variant="primary" className="flex-1 justify-center" onClick={() => dispatch({ type: 'DIFF_APPLY' })}>✓ Apply</Btn>
    </div>
  )}
  ```
  (mirrors `generate.jsx` lines 244–255.)

**Satisfies:** AC 4, 14, and the GeneratePanel-side dispatch of AC 11.

---

## Phase D — Board (board.tsx)

The board is the largest change. Split into focused steps so each is independently testable.

**Sequencing note (Steps 7–11 are one continuous unit):** the `solvedView` local state is introduced in Step 7 and first *consumed* by `CoverageView` in Step 11 — a 4-step gap. Steps 7 through 11 MUST land in one continuous session / single PR, in order, so `solvedView` is never referenced before it exists (no half-applied state where the "By time" pivot reads an undefined binding). Both the `solvedView` declaration (Step 7) and the `CoverageView` call site that receives it (Step 11) live in the **same** `board.tsx` file — entirely in scope; no cross-file or out-of-`crewdoku/` edit is implied by threading the prop. Do not split this range across separate PRs.

### Step 7 — `solvedView` toggle state + reset-on-new-proposal; Original|Solved banner

**Files:** `app/src/crewdoku/board.tsx`, new `app/src/crewdoku/__tests__/board.test.tsx`

**Red — write `board.test.tsx`:**
- Render `<ScheduleBoard app={appWithDiff} dispatch={vi.fn()} ... />` with a small proposal (a couple of `changes` whose `from !== to` for an in-horizon employee/day in the current week). Assert the diff banner contains:
  - a `Seg` with two options labelled exactly `Original` and `Solved`,
  - a `Discard` button and an `Apply` button,
  - **element-scoped header assertions** (the id and the changes/fairness/penalty render in two SEPARATE sibling elements — `proposal.id` sits inside a `<Badge tone="prop">◆ {id}</Badge>`, while "N changes · fairness prev→now · penalty prev→now" sits in a separate `<span>`). Do **not** assert a single concatenated `textContent` "starts with" across the element boundary (brittle). Instead: (a) find the `Badge` element and assert its text contains `◆` and `proposal.id`; (b) separately query the changes/fairness/penalty span and assert it contains `{N} changes`, `prevFairness→fairness`, and `prevPenalty→penalty`.
  - **no** per-cell progress text (no `/decided/i`, no `/Accept all/i`, no `/Apply \d+ accepted/i`). **(AC 6)**
- Assert default selection is `Solved` (the `Solved` segment is the active one on first render). **(AC 9 — default)**

**Green:**
- Destructure `emptySchedule` from `app` (used later; harmless now).
- Add `const [solvedView, setSolvedView] = useState(true)` and `useEffect(() => { if (diff) setSolvedView(true) }, [!!diff])`.
- Replace the diff-banner JSX with the prototype form (`board.jsx` lines 423–436): `<Badge tone="prop">◆ {diff.proposal.id}</Badge>` + the `N changes · fairness prev→now · penalty prev→now` span + `<Seg value={solvedView?'solved':'original'} onChange={v=>setSolvedView(v==='solved')} options={[{v:'original',label:'Original'},{v:'solved',label:'Solved'}]} />` + ghost `Discard` (`DIFF_DISCARD`) + primary `Apply` (`DIFF_APPLY`). Remove the old `Accept all` / `Reject all` / `Apply N accepted` / `decided` progress markup.

**Satisfies:** AC 6, AC 9 (default-Solved half). 
**Decision applied:** D2 — banner header uses `◆ {id}` (prototype parity), drops the `PROPOSAL {id}` Badge wording.
**Note (R1):** the `Seg`'s active-option detection in tests should key off the `pressed`/`aria` state the `ui.tsx` `Seg` renders; the test will read `ui.tsx` `Seg` markup to pick a robust selector (e.g. the active option's class/`aria-pressed`). No `ui.tsx` change.

### Step 8 — `isProposed` → `isChanged`; `dispCode` from `solvedView`; cell render + tooltip + classes

**Files:** `app/src/crewdoku/board.tsx`, `board.test.tsx`

**Red — add assertions:**
- With `solvedView` default (Solved) and a proposal change `from:'N' → to:'E'` on a visible in-horizon cell: assert that cell renders the **`to`** shift's time label (the `E` shift hours) and the cell `<td>` carries `sf-proposed`. **(AC 7)**
- Flip the toggle to `Original` (click the `Original` segment): assert the same cell now renders the **pre-solve** value (`from`/`curCode`) — i.e. the `N` hours, not `E`. Flip back to `Solved`: it shows `E` again. **(AC 8)**
- Source guard: assert `board.tsx` contains no `isProposed` identifier and no `dec === 'accept'`. **(AC 10, 23)**

**Green (employee-pivot cell block, `board.jsx` lines 579–651):**
- `const isChanged = !!(ch && ch.from !== ch.to)`.
- `const dispCode = (diff && solvedView && ch) ? (ch.to !== undefined ? ch.to : curCode) : curCode`.
- Remove `const dec = ...` and the `if (dec === 'accept') dispCode = ch.to` override.
- Replace every `isProposed` reference (className `sf-proposed`, the `onMouseEnter` guard `if (!dispCode && !isChanged) return`, the tooltip block) with `isChanged`.
- Tooltip change row: `{isChanged && <p ... >◆ {ch.from || 'off'} → {ch.to || 'off'}</p>}` (drop "Click to decide").
- Remove the `{isProposed && !dispCode && ch.to && (<span>{ch.to}</span>)}` raw-code overlay (no longer needed — `dispCode` already reflects `to` under Solved).

**Satisfies:** AC 7, 8, 10, 23.

### Step 9 — `onCellClick`: drop the `kind:'diff'` branch; remove DiffPopover + its render block

**Files:** `app/src/crewdoku/board.tsx`, `board.test.tsx`

**Red — add assertions:**
- With a proposal active (not seed mode), click a **changed** cell. Assert: `dispatch` is **not** called with any `DIFF_DECIDE`; and the opened popover is the employee popover (`kind:'emp'`) — assert the `Assign shift` header text appears, and `Accept`/`Reject` buttons do **not**. **(AC 1)**
- Source guard: assert `board.tsx` contains no `DiffPopover` and no `kind: 'diff'` / `kind === 'diff'`. **(AC 1)**

**Green:**
- In `onCellClick`, delete the `if (ch && !dec) { setPop({ kind:'diff', ... }); return }` branch. Keep the seed pin-toggle path and the `kind:'emp'` path. (D4: leave the trailing `ch`/`dec` params in the signature; call sites pass `null` for `dec`.)
- Delete the `DiffPopover` function component.
- Delete the bottom `{pop && pop.kind === 'diff' && (<Popover>…<DiffPopover/></Popover>)}` render block.
- Remove the now-unused `Badge` import only if no other use remains (the banner still uses `Badge tone="prop"`, so keep it).

**Satisfies:** AC 1.

### Step 10 — Board-level decided/accepted/decided-count removal (employee pivot + state)

**Files:** `app/src/crewdoku/board.tsx`, `board.test.tsx`

**Red — add assertion:**
- Source guard: assert `board.tsx` contains none of `acceptedCount`, `decidedCount`, or a `decided` binding derived from `diff.decided`. **(AC 3 for board.tsx, R4)**

**Green:**
- Remove the `const decided = diff ? diff.decided : EMPTY_MAP`, `const acceptedCount = ...`, `const decidedCount = ...` locals in `ScheduleBoard`.
- Remove the `EMPTY_MAP` constant if no remaining reference (CoverageView still references it until Step 11 — sequence Step 11 to remove it there; remove `EMPTY_MAP` only after both pivots are clean, i.e. at the end of Step 11).

**Satisfies:** AC 3 (board.tsx half), R4 (board decided cleanup).

### Step 11 — CoverageView ("By time") parity: remove decided/dec, honor solvedView

**Files:** `app/src/crewdoku/board.tsx`, `board.test.tsx`

**Red — add assertions:**
- Render `ScheduleBoard` with a proposal, switch pivot to "By time" (click the `By time` segment in the toolbar `Seg`). With Solved (default): a changed chip whose `to===s.code` renders under that shift row with `sf-proposed`. Flip to `Original`: that same employee's chip appears under the `from` shift row instead (preview reflects toggle, mirroring the employee pivot). **(AC 8 coverage parity, R1)**
- Source guard already in Step 10 covers `decided`; here assert CoverageView no longer reads `diff.decided` (covered by the same grep) and no `kind:'diff'` path is reachable from coverage chips. **(R1)**

**Green (CoverageView, `board.jsx` lines 119–243):**
- Remove `const decided = diff ? diff.decided : EMPTY_MAP` and the `const dec = ch ? decided.get(ch.key) : null`.
- Compute the displayed code through the shared `getShift` plus `solvedView`/`diffMap` so chips land in the right shift row per toggle state. Concretely: thread `solvedView` into `CoverageView` (new prop) and, when building `grid`, use the proposal's `to` (Solved) or `from`/`curCode` (Original) for changed cells — mirror the prototype's coverage path (`board.jsx` coverage `propArr = ch && ch.to === s.code && ch.from !== s.code`, with `dec` removed). The "proposed" chip class is `propArr && 'sf-proposed'`.
- Update the chip `onClick` to `onCellClick(e, emp, d, s.code, true, ch, null)` (drop `dec`).
- Pass `solvedView` from `ScheduleBoard` into `<CoverageView ... solvedView={solvedView} />`.
- Now remove the `EMPTY_MAP` constant (last reference gone).

**Satisfies:** AC 8 (coverage parity), R1.
**Altitude check:** the grid/displayed-code computation is pure presentation of an already-computed proposal (no constraint logic) — stays in the component, calls `getShift`/reads `diffMap` only. No domain logic added.

### Step 12 — `getShift` returns null when `emptySchedule`; empty-schedule guidance banner

**Files:** `app/src/crewdoku/board.tsx`, `board.test.tsx`

**Red — add assertions:**
- Render `ScheduleBoard` with `app.emptySchedule:true`, `seedMode:false`, no diff. Assert:
  - the grid structure renders (employee names / day headers present), **and**
  - no cell shows a shift time label (every cell blank) — i.e. `getShift` returns null for all. **(AC 18)**
  - the guidance banner is present: text `Schedule is empty — run the solver to generate your first schedule.` with a `▸ Generate` button; clicking it calls `onGenerateToggle`. **(AC 19)**
- Render with `app.emptySchedule:true` AND `seedMode:true`: assert the guidance banner is **not** shown (only `!seedMode`). **(AC 19 condition)**
- Render with `app.emptySchedule:false`: the banner is absent and cells show their baseAssign/override values. (guards over-blanking)

**Green:**
- `getShift`: `if (emptySchedule) return null` as the first line; add `emptySchedule` to the `useCallback` deps.
- Add the guidance banner block (above the legend, mirroring `board.jsx` lines 398–411) gated on `emptySchedule && !seedMode`, with the `▸ Generate` primary `Btn onClick={onGenerateToggle}`.

**Satisfies:** AC 18, 19. (AC 20 — first applied solve clears empty — is the reducer's `DIFF_APPLY` from Step 3 plus this `getShift` behavior; verified end-to-end in the e2e step.)

---

## Phase E — Bug-fix regression guards (mostly already-present)

### Step 13 — Regression guards: sf custom-roster + rebuildShiftIdx call

**Files:** `app/src/crewdoku/__tests__/sf.test.ts` (existing — keep/extend), no source change expected

**Red/Green (these should pass as-is; they are guards, not new behavior):**
- The existing `sf.test.ts` custom-roster test already covers AC 24 (`makeProposal`/`workloadHistogram`/`baseAssign` don't crash on a small roster; `baseAssign(out-of-range)` → `undefined`). Confirm it still passes after all changes. **(AC 24, bug-table #3/#4/#6)**
- Add a guard for AC 25: a test (or extend `sf.test.ts`) asserting `typeof SF.rebuildShiftIdx === 'function'` and that calling it after replacing `SF.SHIFTS` makes a custom code resolvable via `SF.shift`/index (mirrors the existing test's `rebuildShiftIdx()` usage). The onboarding `finish()` call to `SF.rebuildShiftIdx?.()` must remain — add a source guard test reading `onboarding.tsx` asserting it contains `rebuildShiftIdx`. **(AC 25, bug-table #7)**
- No code change for bug-table #1 (`isProposed`→`isChanged`) — already handled in Step 8; the board source-guard in Step 8 (no `isProposed`) is its regression guard. **(AC 23, bug-table #1)**

**Satisfies:** AC 23, 24, 25. (Decision D3: `workloadHistogram` keeps property `n` — no rename; no test asserts `count`.)

---

## Phase F — Verification

### Step 14 — Full green + lint + cross-cutting grep guards

**Files:** none (verification only); may add one consolidated grep-guard test.

**Steps:**
1. Run `pnpm lint` (tsc `--noEmit` across domain + app) — must be clean. **(AC 26)**
2. Run `pnpm test` — all suites green. **(AC 26)**
3. Cross-cutting grep guard (a single test or a shell check the implementer runs): assert `app/src/crewdoku/` contains **no** occurrence of `decided`, `DIFF_DECIDE`, `DIFF_ALL`, `acceptedCount`, `decidedCount`, `isProposed`, `'review'`, `DiffPopover`. **(AC 1,2,3,5,10,23; R4)**
4. Confirm no file outside `app/src/crewdoku/` changed (`git status`/diff scope) and `SF.makeProposal` remains the only proposal source (no `fetch`/adapter import added). **(AC 27)**

**Satisfies:** AC 26, 27, R4.

### Step 15 — Manual browser-flow checks (handed to the e2e/LOOP stage)

The e2e stage runs the real app and verifies these journeys (each maps to ACs):

1. **Empty-first onboarding:** complete onboarding wizard → board renders with all cells blank + guidance banner + `▸ Generate`. **(AC 16, 18, 19)**
2. **Generate → preview → Apply (first solve clears empty):** click `▸ Generate` → Run solver → proposal arrives, banner shows `◆ P-xxx · N changes · fairness prev→now · penalty prev→now`, toggle defaults to **Solved**, changed cells violet (`sf-proposed`) showing `to`. **(AC 6, 7, 9)**
3. **Original|Solved toggle:** flip to **Original** → whole board shows pre-solve values; flip to **Solved** → post-solve; neither flip persists (no override/DB write). **(AC 8, R2)**
4. **Apply whole proposal:** click **Apply** (banner) and separately **✓ Apply** (GeneratePanel) → all changes committed, banner gone, empty banner gone, board non-empty. **(AC 11, 12, 14, 20)**
5. **Discard:** new proposal → **Discard** → board reverts to pre-proposal; `emptySchedule` unchanged. **(AC 13)**
6. **No per-cell triage:** with a proposal active, click a changed cell → normal employee popover opens (Assign shift), never Accept/Reject. **(AC 1)**
7. **By time pivot under proposal:** switch to "By time" → chips honor Original/Solved toggle, changed chips violet. **(AC 8 coverage, R1)**
8. **Manual edit clears empty:** onboarding (empty) → edit one cell → board non-empty, banner gone, that cell shows its value. **(AC 21)**
9. **Reload persistence:** onboarding → reload → still empty + banner; Apply → reload → still non-empty. **(AC 22, R5)**
10. **Demo loads non-empty:** Load Demo → board shows schedule, no empty banner. **(AC 17)**

---

## Step → acceptance-criteria coverage map

| AC | Step(s) |
|---|---|
| 1 (no diff popover, emp popover on changed cell) | 9 (+ e2e 6) |
| 2 (diff shape `{proposal}`, no DIFF_DECIDE/DIFF_ALL) | 3 |
| 3 (no acceptedCount/decidedCount) | 5 (generate), 10 (board) |
| 4 (no Review-proposal panel) | 6 |
| 5 (no `'review'` phase) | 4 (leader), 5 (generate) |
| 6 (Original|Solved banner shape) | 7 (+ e2e 2) |
| 7 (Solved renders `to`, sf-proposed) | 8 (+ e2e 2) |
| 8 (Original reverts; no mutate/persist) | 8 (emp), 11 (coverage) (+ e2e 3,7) |
| 9 (reset to Solved on new proposal) | 7 |
| 10 (isChanged rename) | 8 |
| 11 (DIFF_APPLY writes all + clears empty) | 3 (reducer), 6 (generate dispatch), 7 (banner dispatch) |
| 12 (after Apply board committed, banners gone) | 3 + 12 (+ e2e 4) |
| 13 (Discard) | 3 (+ e2e 5) |
| 14 (GeneratePanel Discard/✓ Apply footer) | 6 |
| 15 (initial emptySchedule false) | 1 |
| 16 (LOAD_CUSTOM → emptySchedule true) | 2 |
| 17 (LOAD_DEMO → false) | 2 |
| 18 (empty board blanks all cells) | 12 |
| 19 (guidance banner + Generate) | 12 |
| 20 (first solve clears empty) | 3 + 12 (+ e2e 2/4) |
| 21 (first manual edit clears empty) | 2 (+ e2e 8) |
| 22 (persist across reload) | 1 (+ e2e 9) |
| 23 (no decided render path / isProposed) | 8, 13 |
| 24 (sf custom-roster guard) | 13 |
| 25 (rebuildShiftIdx call remains) | 13 |
| 26 (lint clean + tests green) | 14 |
| 27 (no out-of-scope file edits; SF source) | 14 |

All 27 criteria covered.

## Tests to UPDATE or DELETE (test removed UX)

- **No existing test deletes required.** The only existing crewdoku test is `sf.test.ts`, which tests retained behavior (Step 13 keeps it). It must stay green throughout.
- New test files added: `reducer.test.ts`, `leader.test.tsx`, `generatePanel.test.tsx`, `board.test.tsx` (+ optional consolidated grep-guard test in Step 14). All live in `app/src/crewdoku/__tests__/`.

## Risks carried from spec (mitigations baked into steps)

- **R1 (coverage parity):** Step 11 explicitly mirrors the prototype coverage path and asserts toggle behavior in the By-time pivot.
- **R2 (`solvedView` is local, not persisted):** Step 8 asserts toggling does not call `dispatch` / write overrides; e2e 3 confirms no DB write.
- **R3 (`emptySchedule` vs `dataMode:'empty'`):** distinct flags preserved; Steps 2/12 test the `dataMode:'custom'` + `emptySchedule:true` combination.
- **R4 (hidden `'review'`/`decided` refs):** Step 14 grep-guard + per-step source guards (Steps 4,5,8,9,10).
- **R5 (DB forward-compat):** Step 1 tests the `!== undefined` guard (undefined → keep current).
