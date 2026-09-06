# Plan — Real Engine End-to-End, Zero Demo (TDD)

Status: approved-draft
Owner stage: PLAN (task-loop)
Traces to: `docs/plans/real-engine/spec.md` (17 ACs), `VISION.md` §3/§4/§7.
Conventions: superpowers:writing-plans — small, ordered, independently-testable steps;
each strict red → green → refactor. Tests live in `app/src/crewdoku/__tests__/` and
`app/src/crewdoku/engine/__tests__/` (Vitest + jsdom + RTL). Gates: `pnpm test`, `pnpm lint`.

---

## Ground truth established by investigation (informs every step)

- **App→domain wiring already works.** `app/package.json` depends on `scheduling`,
  `constraints`, `solver`, `ports`, `calendar`, `export`, `seed` as `workspace:*` and
  the adapters already `import … from 'ports'`/`'scheduling'`/`'seed'`. Bare-name resolution
  works; **no path alias / tsconfig change is required** for the bridge to import the engine.
  P0 is therefore a tiny smoke step, not a wiring build-out.
- **`seed` is imported only by `app/src/adapters/storage/__tests__/idbStorageAdapter.test.ts`**
  (via `buildDemo`). That is an adapter test (out-of-scope dir), NOT product source. Removing
  the app `seed` dependency (spec §6) requires that test to stop importing `seed` OR be left as
  the single allowed `seed` user. **Decision D7 below.**
- **Calendar API confirmed:** `dow`, `isWeekend`, `addDays(date, n)`, `eachDate(period)`,
  `isoWeekKey(date)` (all `ISODate`-based, UTC).
- **`AppStateDTO`** = `{ org, teams, shifts, employees, coverages, rules, assignments, period }`.
  It has **no departments** and Employees lack `i`/`dept`/`home` — hence the §3.6 companion blob.
- **`IdbStorageAdapter`** stores ONE JSON string at store `crewdoku` / key `state` (db `crewdoku`).
  `db.ts` is a separate DB (`crewdokudb_v3` / store `kv`) holding the legacy `cw_state_v1` blob.
  They do not collide; both can coexist during migration.
- **Adapter `onLog` is constructor-fixed** (not per-call); `solve(lp, options)` does NOT forward
  `meta` to the worker, so the worker size-line prints `"? vars"` today (spec m2/m3).
- **`HighsSolverAdapter.solve` already accepts an `options` object** and posts
  `{ type:'solve', lp, options }`. The worker's `SolveMessage` already declares `meta`, but the
  adapter never sets it. See finding F1 (meta forwarding) below.
- **Reducer cell keys are `empIdx|absDay`** throughout (`SET_CELL`, `DIFF_APPLY`, `PIN_TOGGLE`,
  `overrides`, `pins`). The thin bridge translates only at solve/apply/persist boundaries.
- **Existing tests that WILL break and must be updated/deleted:** `sf.test.ts` (asserts
  `makeProposal`/`baseAssign`/`workloadHistogram`), `reducer.test.ts` (`LOAD_DEMO`, `dataMode:'demo'`,
  `emptySchedule`), `leader.test.tsx` (`Optimal · Proposal` from fake done), `generatePanel.test.tsx`
  (fake `outcome`, static panels), `fixtures.ts` (`dataMode:'demo'`, hardcoded `87/82/142/189`),
  `app/src/adapters/storage/__tests__/idbStorageAdapter.test.ts` (`buildDemo`).
- **`grepGuards.test.ts` scan is shallow** (`readdirSync(crewdokuDir)`) — it does NOT recurse into
  `engine/`. New demo-symbol guards must be added to it explicitly (Step P6.1).

---

## Findings to surface to REVIEW (flagged, not silently actioned)

- **F1 (authorized by spec m2) — adapter receives `meta` via the existing `options` arg, NO
  adapter edit.** `solve(lp, options)` already forwards `options` to the worker as
  `{type:'solve', lp, options}`. The worker reads `msg.meta` (top-level), not `msg.options.meta`.
  Two compliant choices that need **no edit to `app/src/adapters/`**:
  (a) the bridge calls `adapter.solve(lp, { meta:{varCount,rowCount}, ...solveOpts })` AND we change
  the worker to read `msg.options?.meta` — but `worker.ts` is under `adapters/`, edit-restricted; OR
  (b) **DROP the size line dependence on meta**: keep the worker as-is and accept `"? vars"` is wrong,
  so instead the **bridge emits its own size log line** (`building model — N vars, M rows`) into the
  panel's log buffer BEFORE calling `adapter.solve`, and we leave the worker's size line out of the
  panel (or the bridge owns the displayed log and simply doesn't show the worker's `?`-line).
  **PLAN decision D5:** take (b) — bridge owns the displayed log buffer (required anyway by m3 for
  per-run reset), prepends a real size line from `meta.varCount/rowCount`, and forwards the worker's
  real lines (`solving…`, `obj`, `status`, `Ns`). **No `adapters/` edit.** If REVIEW prefers the
  worker print the real number, that is a one-line `worker.ts` change (read `msg.options?.meta`) —
  flagged, not taken, because the spec says "DROP … or forward"; we drop the worker's `?`-line from
  the display rather than edit the restricted dir.
- **F2 — `seed` dependency removal vs the adapter test.** The only `seed` importer is an adapter
  test. **D7:** leave `app/package.json`'s `seed` dep in place IF removing it breaks that adapter
  test's resolution; the AC-8 "no demo in app" is about `app/src/crewdoku/` product source (which is
  what the grep guard scans). Removing the dep is desirable but secondary; do it in P6 only if the
  adapter test is also migrated off `buildDemo`. Flagged: this is a judgement the spec left to PLAN
  (§6 "REMOVE once buildDemo unused").
- **F3 — `home` field for makeEmployee.** Domain `makeEmployee` has no `home`; `home` is board-only
  (drives `baseAssign`, which is being deleted). `home` is still used by `fillDemo`/seed only. After
  demo removal `home` is vestigial in `Emp`. **D6:** keep `Emp.home` (board reads it in a couple of
  places via persistence companion blob round-trip per spec §3.6) but it no longer feeds any solve.

---

## Decisions log (`decisions`)

- **D1 — Bridge in `app/src/crewdoku/engine/`** (`orgBridge.ts`, `solveBridge.ts`, `persist.ts`,
  `types.ts`). Why: spec §3.1/A1; isolates domain-facing wiring; preserves app→domain rule.
  Rejected: putting wiring in `sf.ts` (mixes presentation + engine, pollutes grep-guard scan).
- **D2 — Persistence = `AppStateDTO` (via `IdbStorageAdapter`) + a companion blob, both written/read
  atomically.** Companion stored as a **second key (`board`) in the SAME `crewdoku` IDB store** the
  adapter owns is impossible without editing the adapter (it only exposes `save(state)`), so the
  companion lives in a **separate store the bridge owns directly** OR in the legacy `db.ts` KV
  (`crewdokudb_v3`). **Chosen:** `persist.ts` opens its OWN IDB (db `crewdoku_board`, store `kv`,
  keys `board`, `view`) for the companion + view payloads, and delegates the domain payload to
  `IdbStorageAdapter` unchanged. Why: zero edits to `adapters/`; atomicity handled by awaiting both
  writes in `persist.save()`. Rejected: extending `IdbStorageAdapter` (edit-restricted dir);
  cramming board fields into `AppStateDTO` (lossy, violates ports contract).
- **D3 — Single persisted date anchor `{ startDate, absDayOrigin }`** computed once at first
  onboarding/solve, never recomputed from "today" on load (spec §3.6.1/B2). Why: prevents the v1
  mis-attribution bug. Rejected: recomputing `isoWeekKey(today)` each load (re-points cells).
- **D4 — Catch-all team + req/cap coverage + safe defaults** (spec §4). Why: VISION §7 MVP.
  Rejected: deriving teams from departments (needs workstream-6 UI).
- **D5 — solveBridge owns the displayed log buffer; emits a real size line from `meta`, forwards
  the worker's real lines, resets per run/relaxation.** Why: m2+m3 without editing `adapters/`.
  Rejected: editing `worker.ts` to read `msg.options?.meta` (edit-restricted; spec allows "drop").
- **D6 — Keep `Emp.home`/`dept`/`i`/`deptName` as board-only fields, round-tripped via companion
  blob; drop only demo *data* and demo-only fns.** Why: board renders from these (spec §3.6/B1).
- **D7 — Drop app `seed` dep only after migrating the adapter test off `buildDemo` (or leave it).**
  Why: AC-8 targets `app/src/crewdoku/` product source; the adapter test is out of that scope.
- **D8 — Period weeks = 4, anchored at this Monday (`weeks:4`, current+next 3).** Why: matches the
  board's 4-week horizon (spec A3). PLAN may narrow to 1 week if the AC-15 perf smoke is unusable —
  that is a tuning knob, surfaced as a finding, not a re-plan.
- **D9 — Collapse `dataMode`:** replace with a single derived `hasOrg` (is there a persisted org?).
  Keep `emptySchedule` semantics folded into "org exists but no overrides yet". Why: spec A5/AC-8.
  Rejected: keeping a constant `'custom'` mode (leaves dead discriminator); only fall back to that if
  removal proves to thrash >1 unrelated test.

---

## Phase P0 — Wiring smoke (confirm app can import the engine)

### Step 0.1 — Import smoke test
- **Files:** `app/src/crewdoku/engine/__tests__/wiring.test.ts` (new).
- **Red:** assert the engine packages import + key fns are functions:
  ```ts
  import { buildContext } from 'constraints'
  import { buildModel } from 'solver'      // re-exported by solver index
  import { mapSolution, buildProposal, deriveConflictCore } from 'solver'
  import { makeOrg, makeTeam, makeShift, makeEmployee, makeCoverage, makeRules, makeSchedule } from 'scheduling'
  import { isoWeekKey, addDays, eachDate } from 'calendar'
  it('domain engine is importable from app', () => {
    expect(typeof buildContext).toBe('function')
    expect(typeof buildModel).toBe('function')
    expect(typeof deriveConflictCore).toBe('function')
  })
  ```
  (First confirm each symbol's real export path from the package index; adjust imports to match.)
- **Green:** none needed if wiring already resolves; if a symbol isn't re-exported at the package
  root, import from its subpath. No production change.
- **AC:** prerequisite for AC-2/3/4 (not itself an AC).

---

## Phase P1 — orgBridge (SF org snapshot ↔ domain entities + reversible identity maps)

### Step 1.1 — Identity maps round-trip (`decode(encode(x)) === x`)
- **Files:** `app/src/crewdoku/engine/orgBridge.ts` (new), `engine/types.ts` (new, `IndexMaps`),
  `engine/__tests__/orgBridge.test.ts` (new).
- **Red:** build a small SF-shaped snapshot (2 emps, 2 shifts `D`/`N`, 1 dept) → call
  `buildOrgModel(snapshot, anchor)`; assert the returned `maps`:
  - `empByIdRev.get(empById.get(0)) === 0` for every emp index;
  - `shiftByIdRev.get(shiftByCode.get('N')) === 'N'`;
  - `absByDate(dateByAbs(absDay)) === absDay` for several absDays incl. negatives (using anchor
    `{ startDate, absDayOrigin }`), and `dateByAbs(absDayOrigin) === startDate`.
  - **Display-axis agreement (BLOCKER fix — finding 1):** assert across a range incl. negatives that
    `dow(dateByAbs(d)) === SF.mod(d, 7)` AND `SF.isWeekend(d) === isWeekend(dateByAbs(d))` for ALL
    tested `d`. This is the load-bearing invariant: the board renders weekday/date labels via
    `SF.DOW[mod(d,7)]` + `SF.dateOf(d)` (board.tsx:216,602,625; sf.ts:99,108), so if the display axis
    and the solve axis disagree by even a phase offset, an absDay's *shown* weekday/date contradicts
    the ISO date it solves into — the exact B2 mis-attribution bug relocated to the display layer.
- **Approach (state explicitly):** PIN `anchor.startDate` to a **Monday** (`isoWeekKey(today)` is
  Mon-anchored) and choose `absDayOrigin` so that `mod(absDay, 7) === dow(dateByAbs(absDay))` holds
  for every absDay (i.e. `absDayOrigin ≡ dow(startDate) (mod 7) = 0` since startDate is Monday and
  `SF.DOW` is Mon-first). With startDate on Monday and origin chosen so `dateByAbs(0)` lands on a
  Monday, the existing `mod`-arithmetic display path is PROVEN correct and need not be replaced — the
  invariant test above is the proof. (P6.4 then redefines `SF.dateOf` in terms of the anchor so the
  literal `2026-06-15` no longer drives display; see finding-2/finding-3 notes there.)
- **Green:** implement `buildOrgModel`: maps shift codes→`makeShift` ids (isNight via `start<8||start>=20`),
  emps→`makeEmployee` (catch-all `teamId`, `eligibleShiftIds` = codes→ids, `contract.maxHoursPerWeek`
  = rules.maxHours, timeOff/recurring `[]`, prefs willing), `dateByAbs = (a)=>addDays(startDate, a-absDayOrigin)`,
  `absByDate` inverse via `eachDate`-style day diff (UTC; reuse `addDays`/date arithmetic — never
  `new Date(2026,5,15)`).
- **AC:** AC-12 (identity round-trip), partial AC-2 (model inputs).

### Step 1.2 — Full AppStateDTO-shaped value from the onboarded org
- **Files:** `orgBridge.ts`, `orgBridge.test.ts`.
- **Red:** from the snapshot assert the produced `{ org, teams, shifts, employees, coverages, rules,
  period }`: org name = snapshot orgName; exactly ONE team staffing all shift ids; every employee
  `teamId` = that team; one `Coverage` per shift with `byDow` length 7 derived from `req`/`cap`
  (fallback when `s.byDow` absent: `{min:req,max:cap}` for all 7; when present, use it); rules map
  `maxHours→maxHoursPerWeek`, `minRest→minRestHours`, `enabled.H4=onePerDay`, `enabled.H6=eligibility`,
  weights = defaults; `period = { startDate: anchor.startDate, weeks: 4 }`.
- **Green:** implement the mapping using factories + `makeCoverage`. Coverage `byDow` robustly built
  per spec §8 risk 6 (derive when absent).
- **AC:** AC-2 inputs, AC-3 (numbers will flow from these), AC-11 thresholds source.

### Step 1.3 — pins translation `empIdx|absDay` → `employeeId|ISO`
- **Files:** `orgBridge.ts`, `orgBridge.test.ts`.
- **Red:** given `pins = Set(['0|0','1|2'])` assert `translatePins(pins, maps)` returns
  `Set([`${empId0}|${dateByAbs(0)}`, `${empId1}|${dateByAbs(2)}`])`; an out-of-range index is dropped.
- **Green:** implement `translatePins` (never string-split to recover ids — look up via maps).
- **AC:** AC-2 (pins fixed), AC-17 (pins drive solve).

---

## Phase P2 — persist (two-payload persistence + reconcile with cw_state_v1)

### Step 2.1 — Domain + companion + view save/load round-trip (IDB)
- **Files:** `app/src/crewdoku/engine/persist.ts` (new), `engine/__tests__/persist.test.ts` (new,
  uses `fake-indexeddb/auto`).
- **Red:** construct an `AppStateDTO` + companion `{ departments:[{id,name,from,to}],
  employeesMeta:[{id,i,dept,home}], anchor:{startDate,absDayOrigin} }` + view `{ pins:[…],
  weekOffset }`. Call `persist.save(domain, companion, view)`; new `persist.load()` returns all three
  byte-equal (pins as array round-trips to identical Set membership; departments `from/to` survive;
  anchor survives).
- **Green:** implement `persist.save/load`: domain payload via `new IdbStorageAdapter()`; companion
  + view via the bridge-owned IDB (db `crewdoku_board`, store `kv`, keys `board`,`view`); `save`
  awaits all writes; `load` reads all and returns `{ domain, companion, view } | null`.
- **AC:** AC-1 (org+departments survive), AC-16 (anchor), AC-17 (pins).

### Step 2.2 — Rehydrate SF globals from persisted payloads
- **Files:** `persist.ts` (add `rehydrateSF(domain, companion)`), `persist.test.ts`.
- **Red:** after `load()`, call `rehydrateSF`; assert `SF.SHIFTS` repopulated (code/name/start/end/
  req/cap + `byDow`), `SF.rebuildShiftIdx` indices correct, `SF.DEPTS` = companion departments with
  `from/to`, `SF.EMPLOYEES` reconstructed (each emp `i`/`dept`/`deptName`(joined)/`home`/
  `eligibleShiftIds` from domain+companion). Department grouping (`SF.EMPLOYEES.slice(from,to+1)`)
  matches companion.
- **Green:** implement `rehydrateSF` (mutates the SF containers in place, mirroring `finish()`'s
  shape; never re-derives ids by index).
- **Torn-write tolerance (MINOR fix — finding 8):** the companion blob (`crewdoku_board` IDB) and the
  domain payload (`crewdoku` IDB) are TWO independent stores with no rollback (D2) — `persist.save()`
  awaits both but a crash between writes can leave domain present + companion missing. `rehydrateSF`
  must tolerate `domain` present / `companion` null gracefully: rebuild a DEFAULT single-department
  grouping (one `Dept` spanning all employees, `from:0,to:EMPLOYEES.length-1`) and synthesize
  `i`/`dept`/`deptName`/`home` defaults from the domain employees, rather than throwing (the board
  needs *some* grouping to render). Add an edge-case assertion: `load()` returns domain-only (companion
  `null`) → `rehydrateSF` produces a renderable single-group board, no crash.
- **AC:** AC-1 (grouped board renders after reload).

### Step 2.3 — Anchor stability across a simulated reload on a different "today"
- **Files:** `persist.test.ts`.
- **Red:** save with anchor computed for "Monday A". Simulate reload with a stubbed "today" = a
  different week; `load()` + rebuild maps from the STORED anchor; assert `dateByAbs(absDay)` is the
  SAME ISO before and after, and an override at `empIdx|absDay` resolves to the identical calendar
  date (no mis-attribution).
- **Green:** ensure `buildOrgModel` consumes the stored anchor and never calls `isoWeekKey(today)`
  when an anchor exists; only compute a fresh anchor when none is persisted.
- **AC:** AC-16.

---

## Phase P3 — solveBridge + wire leader/generate to the real pipeline

### Step 3.1 — solveBridge happy path: pipeline order + domain→UI proposal translation
- **Files:** `app/src/crewdoku/engine/solveBridge.ts` (new), `engine/__tests__/solveBridge.test.ts`
  (new). Fake the adapter via `workerFactory` (mirror `adapter.test.ts:45`) returning a scripted
  `result` for a couple of `x_*` columns.
- **Red:** call `solveBridge.solve({ snapshot, pins, currentOverrides, anchor, adapter })`; assert
  it invokes (spy/order) `buildContext → buildModel → adapter.solve → mapSolution → buildProposal`,
  and returns a **UI proposal** whose `changes[].key === `${empIdx}|${absDay}``,
  `.empIdx`/`.absDay`/`.from`/`.to` decoded via the reverse maps (codes, not ids), and
  `fairness/penalty/prevFairness/prevPenalty/breakdown` carried through verbatim from the domain
  `Proposal`.
- **Green:** implement `solve()`: build model value (P1) → `buildContext` → `currentSchedule =
  fromScheduleDTO(overrides→Assignment[])` (empIdx→id, absDay→ISO, code→shiftId) → `buildModel(ctx,
  period, currentSchedule, { pins: translatePins(...) })` → `adapter.solve(lp, { meta:{varCount,
  rowCount} })` → `mapSolution(sol, meta)` → `buildProposal(ctx, currentSchedule, solved, period)` →
  translate to UI proposal.
- **AC:** AC-2 (real HiGHS path, no makeProposal), AC-3 (real numbers), AC-12 (apply round-trip basis).

### Step 3.2 — Cancel
- **Files:** `solveBridge.ts`, `solveBridge.test.ts`.
- **Red:** start a solve against a fake adapter that never resolves; call `solveBridge.cancel()`;
  assert `adapter.cancel()` was called and the solve promise rejects/aborts WITHOUT producing a
  proposal (no `SET_PROPOSAL`).
- **Green:** `cancel()` delegates to `adapter.cancel()` and marks the in-flight run stale (generation
  guard) so a late resolve is ignored.
- **AC:** AC-5.

### Step 3.3 — Real streamed log buffer (reset per run + per relaxation)
- **Files:** `solveBridge.ts`, `solveBridge.test.ts`.
- **Red:** construct solveBridge with an `onLog` sink; run a fake solve that emits worker lines
  (including the worker's always-present first line `building model — ? vars, ? rows`, then
  `solving…`,`obj 1`,`status Optimal`,`0.10s`); assert the bridge's displayed log buffer (a) contains
  a real size line `building model — N vars, M rows` from `meta.varCount/rowCount` AND the literal
  `? vars` line is NOT present in the buffer; (b) contains the forwarded worker lines (`solving…`,
  `obj`, `status`, the `Ns` time line); (c) is CLEARED at the start of a second `solve()` (no bleed
  from run 1), and likewise cleared on a relaxation re-run.
- **Size-line filter mechanism (MAJOR fix — finding 5):** `worker.ts:57-60` ALWAYS emits a first
  `building model — ${meta.varCount ?? '?'} vars, ${meta.rowCount ?? '?'} rows` line, with no suppress
  flag, and the adapter's only `onLog` is the constructor callback — so the bridge cannot stop that
  line at the source, only content-filter it. The bridge's `onLog` sink therefore DROPS (or replaces)
  any incoming line matching `/^building model/` and substitutes its OWN real size line built from
  `buildModel`'s `meta.varCount`/`meta.rowCount` (model.ts:61-62). The red test asserts both: the
  `? vars` line is absent from the displayed buffer AND a real `N vars, M rows` line is present.
- **Green:** bridge owns `logLines: string[]`; resets in `solve()`; emits its own size line from
  `meta` (varCount/rowCount); routes the adapter `onLog` (constructor-fixed) through a filter that
  drops `/^building model/` lines and appends the rest; exposes lines to the panel.
  (D5 — no `worker.ts`/adapter edit.)
- **AC:** AC-6, AC-7 (no fake timers — phases now driven by promise+onLog).

### Step 3.4 — Wire leader.tsx to solveBridge (replace fake state machine)
- **Files:** `app/src/crewdoku/leader.tsx`, `app/src/crewdoku/__tests__/leader.test.tsx` (update).
- **Red (update test):** rewrite leader test: when `run()` is triggered, leader calls the (injected
  or store-provided) solveBridge and on resolve dispatches `SET_PROPOSAL` with the bridge's UI
  proposal; on `status:'Infeasible'` it routes to the infeasible view; no `setTimeout(…,700)`/
  `setInterval(…,90)` remain (source assertion: `leader.tsx` contains no `700`/`3100`/`setInterval`).
  Keep the existing "does NOT dispatch SET_PROPOSAL on mount when diff exists" regression guard.
- **Green:** replace the timer effects + `SF.makeProposal(app.pins)` call with: a `solving` state
  driven by the solveBridge promise; `done` on resolve (dispatch real proposal); `infeasible` on
  infeasible status (carry the conflict result into generate panel state).
- **`outcome` removal is ATOMIC across leader+generate (MAJOR fix — finding 4):** `outcome`/
  `setOutcome` live in `LeaderSurface` (leader.tsx:13) and are passed to + consumed by `GeneratePanel`
  (leader.tsx:92; generate.tsx:163 Demo-scenario `Seg`, :253 `setOutcome('optimal')` in the relaxation
  re-run). Removing `outcome` from leader in THIS step while generate still reads the prop leaves tsc
  RED at the P3.4/P3.5 boundary. Therefore: do the `outcome`/`setOutcome` removal in a SINGLE step
  spanning BOTH files — remove the `outcome` state + the `outcome`/`setOutcome` props from leader.tsx
  AND delete every `outcome`/`setOutcome` reference in generate.tsx (the Demo-scenario `Seg` and the
  `setOutcome('optimal')` call) together in P3.4's green so tsc stays green; P3.5 then only touches the
  remaining (non-`outcome`) demo scaffolding. Apply the same care to any shared `solverState`/
  `setSolverState` shape change — alter the shape in both files in the same step, never one side first.
- **AC:** AC-2, AC-7. (Banner text "Optimal · Proposal …" stays for the optimal branch.)

### Step 3.5 — Wire generate.tsx panel to real proposal + real log + drop demo scaffolding
- **Files:** `app/src/crewdoku/generate.tsx`, `__tests__/generatePanel.test.tsx` (update).
- **Red (update test):** with a real-shaped UI proposal fixture, assert: rendered Fairness/Penalty/
  changes equal the proposal values (not `87/82/142/189`); the "Changes … of {N}" denominator =
  `SF.EMPLOYEES.length` (not `700`); panel pre-flight title derives from `period` (not "Jun 15 week");
  solver-log title says **HiGHS** (not "CP-SAT"); the "Demo scenario" Optimal/Infeasible `Seg` is
  gone; the log renders the bridge's streamed lines (not `SF.SOLVER_LOG`).
  (NOTE: the Demo-scenario `Seg` + `outcome`/`setOutcome` were already deleted in P3.4 per finding 4 —
  this step's "Demo scenario gone" assertion just confirms it stays gone; do NOT re-touch `outcome`.)
- **Green:** replace `SF.SOLVER_LOG` filtering with the bridge log buffer; replace `SF.HARD`
  preflight instance counts with a real constraint summary (H1–H6 names, or drop counts); delete the
  Demo scenario `Seg`; rename log title to HiGHS; replace `'of 700'` with `of {SF.EMPLOYEES.length}`;
  derive preflight title from `period`; drive PenaltyBars/CompactHist from real `breakdown`
  (CompactHist over real `weekHours` or dropped if demo-only).
- **AC:** AC-3, AC-6, AC-7, plus the non-grep string reconciliations (spec §7 note).

---

## Phase P4 — Real infeasible path (deriveConflictCore + relaxation re-solve)

### Step 4.1 — solveBridge infeasible → conflict core + relaxations
- **Files:** `solveBridge.ts`, `solveBridge.test.ts`.
- **Red:** fake adapter returns `status:'Infeasible'`; assert solveBridge returns a result carrying
  `deriveConflictCore(ctx, currentSchedule, period)`'s `{ core[], relaxations[] }` (real, not
  `SF.INFEASIBLE`), and NO proposal.
- **Green:** branch on `status:'Infeasible'` → call `deriveConflictCore`, return `{ infeasible:true,
  core, relaxations }`.
- **AC:** AC-4.

### Step 4.2 — Relaxation re-solve merges `relaxation.apply()` into BuildModelOptions
- **Files:** `solveBridge.ts`, `solveBridge.test.ts`.
- **Red:** call `solveBridge.resolveWithRelaxation(relaxation, prevOpts)`; assert the next
  `buildModel` is called with `relaxation.apply(prevOpts)` (e.g. a `coverageMinOverride` patch
  present), log buffer reset, and a proposal (or another infeasible) is produced.
- **Green:** implement `resolveWithRelaxation`: `const opts = relaxation.apply(prevOpts)` →
  rebuild model with opts → solve → map → proposal; reset log per D5.
- **AC:** AC-4.

### Step 4.3 — generate.tsx infeasible UI uses real core/relaxations; delete SF.INFEASIBLE usage
- **Files:** `generate.tsx`, `generatePanel.test.tsx` (update).
- **Red:** render the panel in infeasible state with a real `{core,relaxations}` fixture; assert core
  rows + relaxation radios render from it; selecting one + "Re-run" calls the relaxation re-solve
  path; assert `generate.tsx` source no longer references `SF.INFEASIBLE`.
- **Green:** swap `SF.INFEASIBLE.*` for the bridge's conflict result; wire re-run to
  `resolveWithRelaxation`.
- **AC:** AC-4.

---

## Phase P5 — Live checker reads onboarded rules (M1)

### Step 5.1 — `checkViolations`/`weekHours` honor onboarded thresholds
- **Files:** `app/src/crewdoku/sf.ts` (make `RULES` mutable + a `setRules`/populate path, OR thread
  rules through), `app/src/crewdoku/__tests__/sf.test.ts` (update/replace).
- **Red:** set the onboarded values by MUTATING the existing `RULES` object (`SF.RULES.maxWeek = …`,
  `SF.RULES.minRest = …`) — i.e. through the same object reference the checker closes over; assert
  that changing `maxWeek` changes whether `checkViolations` flags an over-hours cell, and changing
  `minRest` changes the rest flag (i.e. the live checker and solver agree on thresholds).
- **MUTATE, do NOT reassign (MINOR fix — finding 7):** `checkViolations`/`weekHours` close over the
  module-const `RULES` (sf.ts:155, read at :170/:176/:186), and `SF.RULES` is the SAME object reference
  (sf.ts:314). Reassigning `SF.RULES = {…}` on rehydrate would point the export at a fresh object while
  the closures keep reading the old one — desync. The rehydrate/`finish()` populate path MUST mutate
  the existing object in place (`RULES.maxWeek = rules.maxHoursPerWeek`, `RULES.minRest =
  rules.minRestHours`), never reassign. The red test sets values via that same object.
- **Green:** keep `RULES` and populate it (in place) from the onboarded rules on rehydrate/finish
  (source change per spec M1); ensure `checkViolations`/`weekHours` read it. Pre-onboarding empty org:
  functions tolerate empty SHIFTS/EMPLOYEES without throwing (carry the existing robustness; add a
  guard test for an empty org).
- **AC:** AC-11.

---

## Phase P6 — Delete demo entirely

> Ordered AFTER P3–P5 so real code paths already replace each demo symbol before deletion.

### Step 6.1 — Grep-guard the deleted symbols (write the guard FIRST)
- **Files:** `app/src/crewdoku/__tests__/grepGuards.test.ts` (extend FORBIDDEN + widen scan).
- **Red:** add to `FORBIDDEN` (will fail until P6.2–6.5 land), DE-DUPED list (finding 6 — `baseAssign`
  appeared twice in the prior draft; list it ONCE):
  `baseAssign`, `makeProposal`, `INFEASIBLE`, `SOLVER_LOG`, `'of 700'`, `'CP-SAT'`,
  `'Demo scenario'`, `LOAD_DEMO`, `fillDemo`, `DemoLink`, `DEMO_LABELS`, `FIRST`, `LAST`,
  `"dataMode === 'demo'"`, `setProposalSolver`, `solverBridge`. (Confirm each token is
  truly demo-only before adding — e.g. ensure `'review'` style false-positives aren't introduced.)
- **Scan scope extension (MINOR fix — finding 6):** `grepGuards.test.ts:10-12` `readSources()` uses
  `readdirSync(crewdokuDir)` (shallow) — it does NOT descend into the new `engine/` dir, so demo
  symbols reintroduced in the bridge (`engine/*.ts`) would be invisible to AC-8. Add a one-line
  extension to `readSources()` to ALSO read `engine/*.ts` (e.g. `readdirSync(join(crewdokuDir,'engine'))`
  filtered to `.tsx?`, guarded for the dir's existence), concatenated into the same source string, so
  AC-8 covers the bridge.
- **Green:** the deletions in 6.2–6.5 make this pass.
- **AC:** AC-8, AC-9 (baseAssign), AC-10 (no Load-Demo).

### Step 6.2 — Strip sf.ts demo data + symbols
- **Files:** `sf.ts`.
- **Change:** delete `baseAssign`, `PINS`, `HARD`, `SOFT`, `makeProposal`, `CHANGE_NOTES`,
  `INFEASIBLE`, `SOLVER_LOG`, `FIRST`/`LAST`, the 100-emp loop, demo `DEPTS`/`EMPLOYEES` seed values,
  `workloadHistogram` if demo-only, `hash` if now unused, the stale header comment +
  `setProposalSolver`/`solverBridge.ts` references. KEEP `checkViolations`, `weekHours` (now
  rule-driven), `shift`/`shiftTime`/`shiftHours`/`hh`/`isNight`/`coverageForDay`, date helpers
  (`DOW`/`dateOf`/`dayLabel`/`dayLong`/`isWeekend`/`HORIZON`/`inHorizon`), `mod`, `rebuildShiftIdx`,
  the empty `SHIFTS`/`DEPTS`/`EMPLOYEES` containers, and `RULES` (now populated from onboarding).
  Reconcile the fixed `BASE`/`dateOf` literal: it must no longer be the load-bearing anchor for solve
  OR display — the bridge owns `absDay↔ISO` via the persisted anchor. `dateOf` is REDEFINED in terms
  of that anchor in P6.4 (findings 1+2) so board labels + CSV/print dates derive from it; delete the
  `BASE`/`2026-06-15` literal here and route the helper through the anchor in 6.4 (or delete `dateOf`
  outright if board has no remaining reads — decided by board usage in 6.4).
- **Green:** update the SF export object; fix any type breaks.
- **AC:** AC-8, AC-9.

### Step 6.3 — app.tsx: drop demo branches, LOAD_DEMO, dataMode; switch persistence to persist.ts
- **Files:** `app.tsx`, `__tests__/reducer.test.ts` (rewrite the demo cases).
- **Red (rewrite reducer tests):** remove `LOAD_DEMO`/`dataMode:'demo'` assertions; assert the new
  `hasOrg`-derived empty-vs-loaded logic; `DIFF_APPLY`/`DIFF_DISCARD`/`SET_PROPOSAL` unchanged
  (those tests stay green). Add: persistence saves/loads via `persist.ts` (pins+weekOffset included).
- **`hasOrg` concrete contract (MAJOR fix — finding 3, D9):** name exactly what replaces the
  `dataMode` discriminator. `hasOrg` reads **whether a persisted domain org is present** — concretely
  `SF.EMPLOYEES.length > 0` after `rehydrateSF` (equivalently: `persist.load()` returned a non-null
  `domain` with employees). The three current consumers recompute as:
  - `isDataLoaded = hasOrg` (replaces `app.dataMode !== 'empty'`, app.tsx:359);
  - `showEmptyBoard = !hasOrg` (app.tsx:360,367-369) — gates EmptyBoardState vs LeaderSurface;
  - onboarding trigger fires while `!hasOrg`.
  `emptySchedule` semantics fold into "org exists but no overrides yet" (i.e. `hasOrg && overrides.size === 0`).
  **`LOAD_CUSTOM` is RENAMED, not left dangling:** rename the action to `ORG_LOADED` (app.tsx:161-162;
  onboarding `finish()` dispatch — see P6.5) and drop its `dataMode:'custom'` payload; it now just
  resets pins/overrides/diff and marks the org loaded. There is **no `'demo'` mode after demo
  removal** — so in `getShift` (board.tsx:355) the `dataMode !== 'demo'` base-fill branch is simply
  DELETED: no base fill EVER, overrides-only (this is finding-3's overrides-only rule; see P6.4 for the
  `getShift` simplification). The reducer-test rewrite must cover this `dataMode → hasOrg` transition
  (no `dataMode` field remains; `DB_LOAD` no longer reads `a.data.dataMode`).
- **Green:** remove `dataMode==='demo'` branches in exportTeamCSV/exportPersonCSV/printSchedule
  (code falls back to `null` only); delete `LOAD_DEMO` case; collapse `dataMode` per D9 (derive
  `hasOrg`); switch the `cw_state_v1` save/load effect to `persist.save/load` (domain + companion +
  view: pins, weekOffset); keep `DIFF_APPLY`/`SET_PROPOSAL`/`DIFF_DISCARD`. On mount: `persist.load()`
  → if domain org exists, `rehydrateSF` + render board; else render onboarding (no demo fallback).
- **CSV/print date routing (BLOCKER fix — finding 2, AC-13):** `exportTeamCSV`/`exportPersonCSV`/
  `printSchedule` (app.tsx ~37-38,55-56,65,86) and `exportEmpCSV` (board.tsx ~419-420) currently build
  calendar date strings via `SF.dateOf(d)`, which is hardcoded to `new Date(2026,5,15+absDay)`
  (sf.ts:99). After demo removal that literal is wrong — exported dates would stay pinned to June 2026
  regardless of the real anchor (fabricated dates). EXPLICITLY route every `SF.dateOf(d)` date
  computation in these export/print paths through the anchor-based date (bridge `dateByAbs(d)` OR
  `SF.dateOf` redefined in terms of the persisted anchor per P6.4). The reducer/export test must
  assert an exported row's date equals `dateByAbs(absDay)`'s ISO (not a June-2026 literal) under a
  non-June anchor.
- **AC:** AC-1, AC-8, AC-13, AC-16, AC-17.

### Step 6.4 — board.tsx: remove baseAssign fallback + demo export branch; reconcile today-anchor + display dates
- **Files:** `board.tsx`, `sf.ts` (redefine `dateOf` via anchor), `__tests__/board.test.tsx` (update
  where it relied on demo fill).
- **Red:** assert `getShift` returns `null` for any unset cell (no `baseAssign`, overrides-only —
  finding 3); `exportEmpCSV` has no `dataMode==='demo'` branch; the "today" marker (`d === -3`) and
  "Today" button (`WEEK set:-1`) derive from the persisted anchor / real current week, not the literal
  `-3`. **Display-date assertion (finding 1):** the weekday label (`SF.DOW[SF.mod(d,7)]`, board.tsx:
  216,625) and the date number (`SF.dateOf(d).getDate()`) for a given absDay agree with the anchor —
  i.e. they match `dow(dateByAbs(d))`/`dateByAbs(d)`, not the old `2026-06-15` literal.
- **Green:** simplify `getShift` to `overrides.get(...)?.code ?? null` (no base fill ever); drop the
  demo export branch; compute today-offset from the anchor (`absByDate(isoWeekKey(today))`-relative)
  and feed the marker + Today button.
- **`dateOf` no longer load-bearing on the literal (finding 1+2):** REDEFINE `SF.dateOf` (sf.ts:99) in
  terms of the persisted anchor (`dateOf(absDay) = UTC date for dateByAbs(absDay)`), so the board's
  date/weekday labels (board.tsx:216,602,610,625; week-group `fmt` labels, `rangeLabel` board.tsx:
  373-376) AND the CSV/print export strings (finding 2) all derive from the SAME anchor. Because P1.1
  pins startDate to a Monday with `absDayOrigin` chosen so `mod(d,7) === dow(dateByAbs(d))`, the
  existing `SF.mod(d,7)` weekday path stays correct unchanged — only the `dateOf` *value* moves off
  the literal. If `dateOf` ends up with no remaining board reads, delete it instead (decided here by
  actual board usage).
- **AC:** AC-9, AC-13, AC-16 (anchor consistency, display + solve + export all on one anchor).

### Step 6.5 — onboarding.tsx: finish() persists org; delete DemoLink/fillDemo/DEMO_LABELS
- **Files:** `onboarding.tsx`.
- **Red (extend a test):** assert `onboarding.tsx` source contains no `DemoLink`/`fillDemo`/
  `DEMO_LABELS`/`SF.DEPTS`-read; keep the existing `rebuildShiftIdx` source guard (sf.test.ts).
- **Green:** `finish()` builds the companion + domain payloads and calls `persist.save` (in addition
  to populating SF globals for immediate render), then dispatches the org-loaded action (replacing
  `LOAD_CUSTOM` semantics under D9). Compute + persist the first-run anchor here
  (`startDate=isoWeekKey(today)`, `absDayOrigin` = board origin offset). Delete `DemoLink`,
  `fillDemo`, `DEMO_LABELS`, and the demo-fill UI buttons.
- **AC:** AC-1, AC-8, AC-10, AC-16.

### Step 6.6 — fixtures.ts + adapter-test reconcile + optional seed dep removal
- **Files:** `__tests__/fixtures.ts`; (conditionally) `app/package.json` +
  `app/src/adapters/storage/__tests__/idbStorageAdapter.test.ts`.
- **Red/Green:** rewrite `fixtures.ts`: drop `dataMode:'demo'`; `makeProposalFixture` returns a
  real-shaped UI proposal (numbers passed in, not the demo literals embedded as defaults that AC-3
  forbids in source — keep them only in TEST fixtures, which the grep guard does not scan). Per D7:
  if removing the app `seed` dep is taken, migrate the adapter test to build a DTO without `buildDemo`
  first; otherwise leave both. (Adapter test edit is allowed — it's a test, not `adapters/` runtime;
  but only do it if pursuing the dep removal.)
- **AC:** AC-14 (tests green), AC-8 (no demo in product source).

---

## Phase P-final — Verification gates

### Step F.1 — `pnpm lint` clean + `pnpm test` green
- Run both; fix type/test breaks. Confirm grepGuards (extended) passes, all updated unit/RTL tests
  pass across both packages.
- **AC:** AC-14.

### Step F.2 — E2E real-solve smoke in the running Vite app (HIGHEST RISK)
- Manual/automated browser checks (map to ACs); run `pnpm --filter @crewdoku/app dev`:
  1. Onboard a small org (e.g. 6 emps, 2 shifts `D`/`N`, 1 dept, modest req) → board renders grouped.
     **(AC-1)**
  2. ▸ Run solver → **real HiGHS WASM loads in the worker** under Vite (`new Worker(url,{type:'module'})`,
     COOP/COEP ok) and a proposal arrives. **(AC-2, AC-15 — the highest-risk gate.)**
  3. Solver-log streams REAL lines incl. a real `building model — N vars, M rows` size line and HiGHS
     status; title says HiGHS. **(AC-6)** No fake timer progression. **(AC-7)**
  4. Fairness/Penalty/breakdown show real `buildProposal` numbers (not 87/82/142/189). **(AC-3)**
  5. Toggle Original/Solved; **Apply** writes exactly the proposed cells (spot-check a couple).
     **(AC-12, AC-13 via export of applied board.)**
  6. Cancel mid-solve returns to idle, no proposal. **(AC-5)**
  7. Enter a deliberately infeasible org (req > headcount) → conflict core + relaxations from
     `deriveConflictCore`; pick one + re-run → proposal or honest infeasible. **(AC-4)**
  8. Change a rule (lower max hours) → live ⚠ flags shift accordingly. **(AC-11)**
  9. Reload the page → org + department grouping + overrides + pins survive on the SAME calendar
     dates; no demo, no "Load Demo" affordance. **(AC-1, AC-10, AC-16, AC-17.)**
  10. CSV/print export over the applied board. **(AC-13.)**
  - **Perf note (D8):** record vars/rows + solve time at the smoke size. If unusably slow, narrow
    `period.weeks` to 1 (knob, not re-plan) and re-measure; surface as a finding.
  - **WASM load failure = blocking finding → potential PIVOT** (main-thread or alternate load
    strategy), surfaced immediately per spec Risk 1.
- **AC:** AC-15 (and confirms AC-1/2/3/4/5/6/7/11/12/13/16/17 end-to-end).

---

## AC coverage map (all 17)

| AC | Covered by |
|---|---|
| AC-1 org+departments persist | P2.1, P2.2, P6.3, P6.5, F.2(1,9) |
| AC-2 real HiGHS | P1.1–1.3, P3.1, P3.4, F.2(2) |
| AC-3 real proposal numbers | P1.2, P3.1, P3.5, F.2(4) |
| AC-4 infeasible/relaxation | P4.1, P4.2, P4.3, F.2(7) |
| AC-5 cancel | P3.2, F.2(6) |
| AC-6 real log | P3.3, P3.5, F.2(3) |
| AC-7 no fake timers | P3.3, P3.4, P3.5 |
| AC-8 demo symbols deleted | P6.1, P6.2, P6.3, P6.5, P6.6 |
| AC-9 baseAssign removed | P6.2, P6.4 |
| AC-10 no Load-Demo | P6.1, P6.5, F.2(9) |
| AC-11 checker uses onboarded rules | P5.1, F.2(8) |
| AC-12 identity round-trip | P1.1, P3.1, F.2(5) |
| AC-13 CSV/print unchanged | P6.3 (export date strings routed through the anchor, not the 2026-06-15 `dateOf` literal — finding 2), P6.4, F.2(10) |
| AC-14 lint+test green | F.1 (+ all updated tests) |
| AC-15 e2e real solve | F.2(2) |
| AC-16 date anchor round-trips | P1.1 (incl. display-axis invariant `dow(dateByAbs(d))===mod(d,7)` & isWeekend agreement — finding 1), P2.1, P2.3, P6.4 (display dates + `dateOf` re-anchored), F.2(9) |
| AC-17 pins persist | P1.3, P2.1, P6.3, F.2(9) |

All 17 ACs covered.

---

## Tests to UPDATE / DELETE (explicit)

- **UPDATE:** `sf.test.ts` (drop makeProposal/baseAssign/workloadHistogram assertions → add
  rule-driven checkViolations + empty-org tolerance, P5.1; keep rebuildShiftIdx guards).
- **UPDATE:** `reducer.test.ts` (remove LOAD_DEMO/`dataMode:'demo'`/`emptySchedule`-as-demo cases →
  hasOrg + persist via persist.ts; keep DIFF_APPLY/DISCARD/SET_PROPOSAL).
- **UPDATE:** `leader.test.tsx` (replace fake-timer "done" path with solveBridge wiring; keep the
  no-SET_PROPOSAL-on-mount regression guard).
- **UPDATE:** `generatePanel.test.tsx` (real proposal numbers, HiGHS title, no Demo scenario Seg, real
  log, of {N}).
- **UPDATE:** `fixtures.ts` (real-shaped proposal; drop `dataMode:'demo'`).
- **EXTEND:** `grepGuards.test.ts` (new FORBIDDEN demo tokens — P6.1).
- **CONDITIONAL (D7):** `app/src/adapters/storage/__tests__/idbStorageAdapter.test.ts` (migrate off
  `buildDemo`) only if removing the app `seed` dep.

## Infeasible-org handling note (per PLAN requirement)

Wherever the entered org may not form a solvable model (small roster, req>headcount, rest-blocked
rotations), the expected behavior is the **real infeasible path** (P4: `deriveConflictCore` →
core + relaxations → re-solve), NOT a crash. P5.1 also guards empty pre-onboarding org so the live
checker tolerates empty SHIFTS/EMPLOYEES. The smoke (F.2 step 7) exercises this deliberately.
