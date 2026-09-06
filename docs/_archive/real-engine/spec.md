# Spec — Real Engine End-to-End, Zero Demo

Status: approved-draft
Owner stage: SPECS (task-loop)
Traces to: `VISION.md` §3 (non-goals), §4 (principles), §6 (core loop), §7 (real engine, workstreams 1–5).

---

## 1. Problem & goal

The prototype ships a faithful UI driven by **simulated** data and a **simulated** solver
(`SF.makeProposal`, fake `setTimeout` timers, hardcoded `SF.SOLVER_LOG`, hardcoded
`SF.INFEASIBLE`, and a deterministic `baseAssign` demo roster). The product must become
real (VISION §7):

- The user's **onboarded org** drives a **real HiGHS MILP** solve.
- **No fabricated schedule data** exists anywhere in the app.
- The org **persists** across reload so a refresh keeps the user's roster.

Goal: wire the existing pure `domains/` engine and `app/src/adapters/` into the app via a
thin bridge at the solve boundary, and delete every demo/sample code path. The single
proposal source becomes the real HiGHS solve. The existing Original/Solved + Apply/Discard
UI, live constraint checks, and CSV/print export are preserved.

### Why a thin bridge (not a full identity refactor)

The board/reducer working model is `empIdx | absDay | shiftCode` (integer employee index,
integer day-offset from a fixed base, single-char code). See `board.tsx` cell keys
`emp.i + '|' + d` (e.g. `board.tsx:691`, `:437`) and `sf.ts:99` `dateOf(absDay)`. The
domain uses `employeeId (nanoid) | ISODate | shiftId (nanoid)`
(`domains/scheduling/src/entities/types.ts:64-68`). A full identity refactor of the board is
**out of scope and unnecessary**: within one solve→apply round-trip the roster is a fixed
snapshot where `SF.EMPLOYEES[i].i === i` and shift codes are unique, so a deterministic,
reversible translation at the boundary is sufficient (VISION §7: "thin bridge … translate to/from
domain … only when solving and when applying results"). Investigation confirmed this is feasible
(see §10 Assumptions). **No pivot.**

---

## 2. Scope / Non-goals

### In scope (VISION §7 workstreams 1–5)

1. Persist the real org (employees, shifts, teams, coverage, rules, period) in store state
   + IndexedDB; stop relying solely on mutating module-global demo arrays for solve input.
2. Bridge UI ↔ domain entities at the solve boundary.
3. Wire the real solver pipeline: `buildContext → buildModel → HighsSolverAdapter.solve`
   (real streamed log + cancel) `→ mapSolution → buildProposal`.
4. Real infeasible path: `deriveConflictCore` → conflict core + relaxations → re-solve with
   the chosen relaxation merged into `BuildModelOptions`.
5. Delete demo entirely (`baseAssign`, demo roster + name pools, seeded `PINS`, fake `HARD`
   instance counts, `SOLVER_LOG`, `INFEASIBLE`, `makeProposal`, the "Demo scenario"
   Optimal/Infeasible toggle, `LOAD_DEMO`, `fillDemo`, every `dataMode === 'demo'` branch).

### Keep (VISION §7 "Keep")

- Live constraint checks `SF.checkViolations` / `SF.weekHours` (the per-cell ⚠ flags and
  the weekly-hours column). They are real, deterministic logic. They MAY later be backed by
  `domains/constraints/hard.ts`, but re-implementing them is **not required** this pass —
  keep them working as-is over the real (custom) assignments. **However (M1):** both functions
  currently read `SF.RULES = { maxWeek: 48, minRest: 11 }` (sf.ts:155,170,176,186 / 280) — a
  **demo literal**. After demo removal the solver uses the **onboarded** rules; the live ⚠
  checker MUST read the **same** onboarded thresholds, or the badges disagree with the solver
  (breaks VISION §4 "always legal or always flagged"). This pass MUST repopulate `SF.RULES`
  from onboarding/persistence (so `SF.RULES.maxWeek`/`.minRest` reflect the onboarded
  `maxHours`/`minRest`), or pass the rules into `checkViolations`/`weekHours` explicitly. Note
  `SF.RULES`'s **source** changes from a demo literal to the onboarded org (it is **kept**,
  not deleted — see §7).
- CSV/print export over real assignments (`app.tsx` exportTeamCSV/exportPersonCSV/printSchedule,
  `board.tsx` exportEmpCSV).

### Non-goals (echo VISION §3 + §7 deferred)

- No accounts/login/roles/permissions; no approval/consent/request/swap workflows; no
  multi-tenant/collaboration/sharing; no network/server dependency. (VISION §3 — permanent.)
- **Deferred to workstream 6 (NOT this pass):** dedicated UI to capture time-off,
  per-employee preferences, soft-constraint weights, and multi-team coverage. These are
  **defaulted safely** so the solve runs honestly (see §4 Defaults), not built as new UI.
- No per-cell proposal triage. Review stays a single Original/Solved toggle + Apply/Discard
  (VISION §5 principle 2; enforced by `grepGuards.test.ts:15`).
- No dark-theme work, no design-token changes, no new constraints beyond H1–H6/S1–S5.

---

## 3. Architecture

### 3.1 Bridge modules (new files, all under `app/src/crewdoku/` — never in `domains/`)

The dependency rule holds: app → domain, one direction (CLAUDE.md). The bridge lives in the
app and *calls* the pure domain. Proposed files:

| New file | Responsibility |
|---|---|
| `app/src/crewdoku/engine/orgBridge.ts` | Translate the onboarded org (SF globals snapshot) → domain entities (`Org, Team[], Shift[], Employee[], Coverage[], Rules, Period`) i.e. an `AppStateDTO`-shaped value. Builds the index↔id maps used to decode results. |
| `app/src/crewdoku/engine/solveBridge.ts` | Orchestrate one solve: `buildContext → buildModel → adapter.solve → mapSolution → buildProposal`, then translate the domain `Proposal` → the UI proposal (`empIdx|absDay` change keys). Owns onLog streaming + cancel. Handles infeasible → `deriveConflictCore` and relaxation re-solve. **onLog per-run reset (m3):** the adapter's `onLog` callback is fixed at construction (highsSolverAdapter.ts:62,66) — it is NOT per-call. The solveBridge therefore owns the log buffer and MUST clear/reset its log state at the **start of each solve**, including each **relaxation re-run** (which calls `adapter.solve` again), and route the single `onLog` callback to the currently-active solve phase so lines from a prior run do not bleed into the next. (The adapter's `t0`/`elapsedMs` already resets per `solve()` call, highsSolverAdapter.ts:78; the bridge resets the *displayed* log.) |
| `app/src/crewdoku/engine/persist.ts` | Map store/SF org ↔ `AppStateDTO`; save/load via `IdbStorageAdapter`. (May be folded into orgBridge if small; named here for clarity.) |
| `app/src/crewdoku/engine/types.ts` (optional) | Shared bridge types (`IndexMaps`, UI-proposal shape if not reusing `sf.ts`'s `Proposal`). |

Rationale for a dedicated `engine/` subfolder: keeps the new domain-facing wiring isolated
from the verbatim-ported presentation files, and keeps `grepGuards.test.ts`'s
whole-directory scan (`crewdoku/*.tsx?`) meaningful — note that scan is shallow
(`readdirSync(crewdokuDir)`, `grepGuards.test.ts:11`), so files in `engine/` are NOT scanned
by it; that is acceptable because the forbidden tokens are per-cell-review symbols, and the
demo-removal ACs below assert deletions explicitly.

### 3.2 Identity bridge (the core translation)

Built once per solve from a roster snapshot:

```
empById:    Map<number /*emp.i*/, ID /*nanoid*/>      // SF.EMPLOYEES[i] -> domain Employee.id
empByIdRev: Map<ID, number>
shiftByCode: Map<string /*'N'*/, ID>                  // SF.SHIFTS[k].code -> domain Shift.id
shiftByIdRev: Map<ID, string>
dateByAbs:  (absDay:number) => ISODate                // period.startDate + absDay (UTC)
absByDate:  (iso:ISODate) => number
```

- `period.startDate` = **current week's Monday** (VISION §7 / brainstorm decision 3), computed
  from today via `calendar.isoWeekKey(todayISO)`; `period.weeks` = the horizon the board shows
  (current board horizon is 4 weeks, `sf.ts:109` `HORIZON=[-14,13]`; the period covers the
  generated window — see §10 Assumption A3 for exact weeks). `absDay` maps to an ISO date by
  `addDays(startDate, absDay - absDayOfStart)`; the bridge owns this offset so the board's
  literal `new Date(2026,5,15)` base is no longer load-bearing for solving.
- LP-safety (nanoid `-` vs CPLEX operator) is already handled inside `model.ts` via `lpSafe()` +
  `meta.shiftTokenToId`; the bridge passes nanoid IDs through unchanged and lets the domain
  handle encoding (CLAUDE.md "LP names must be LP-safe"). The bridge must NOT emit raw IDs into
  LP names itself.

### 3.3 Data flow (solve)

```
Onboarded org (SF.SHIFTS/DEPTS/EMPLOYEES + onboarding rules)   ── orgBridge ─▶
  AppStateDTO-shaped domain value { org, teams:[catch-all], shifts, employees, coverages, rules, period }
      │
      ├─ buildContext({org,teams,shifts,employees,coverages,rules})  → SolveContext
      │     (domains/constraints/src/context.ts:48)
      │
      ├─ currentSchedule = fromScheduleDTO(assignmentsFromOverrides)  (Schedule Map)
      │     (domains/scheduling/src/schedule/dto.ts:12)
      │
      ├─ buildModel(ctx, period, currentSchedule, { pins, ...relaxationOpts })  → { lp, meta }
      │     pins: Set<`${employeeId}|${date}`> translated from app.pins (`empIdx|absDay`)
      │     (domains/solver/src/model.ts:109)
      │
      ├─ HighsSolverAdapter.solve(lp, opts)  → Solution     (real worker + highs.wasm)
      │     onLog(line, elapsedMs) streams to the panel; adapter.cancel() aborts
      │     (app/src/adapters/highs/highsSolverAdapter.ts:58-110)
      │     SIZE-LOG (m2): worker.ts:59 prints "building model — {meta.varCount} vars,
      │     {meta.rowCount} rows", but the worker only receives `meta` if solve() forwards it.
      │     Today `adapter.solve(lp, options)` posts `{type:'solve', lp, options}` (no `meta`),
      │     so the line prints "? vars". FIX: pass buildModel's `meta` counts into the solve
      │     options so the worker can read them — i.e. call
      │     `adapter.solve(lp, { ...solveOpts, meta: { varCount, rowCount } })` (the worker's
      │     SolveMessage already declares `meta`, worker.ts:14) and have the adapter forward it.
      │     If forwarding is undesirable, DROP the size line in worker.ts instead. Either way the
      │     streamed lines must be the real ones (AC-6).
      │
      ├─ mapSolution(solution, meta)  → Assignment[]        (domains/solver/src/mapSolution.ts:24)
      │
      └─ buildProposal(ctx, currentSchedule, solvedAssignments, period)  → domain Proposal
            { id, changes[{employeeId,date,from,to,note}], fairness, prevFairness,
              penalty, prevPenalty, breakdown[{id,name,now,prev}] }
            (domains/solver/src/proposal.ts:87, :23, :8, :16)
      │
      └─ solveBridge: domain Proposal ── translate ─▶ UI Proposal (sf.ts Proposal shape)
            changes[].key = `${empByIdRev.get(employeeId)}|${absByDate(date)}`
            changes[].empIdx, .absDay, .from/.to = shiftByIdRev (or null)
            fairness/penalty/prev*/breakdown carried through verbatim
      │
      └─ dispatch({ type:'SET_PROPOSAL', proposal })   (app.tsx:144)
```

### 3.4 Data flow (apply) — identity round-trip

`DIFF_APPLY` (app.tsx:146) already writes each `change.key` into `overrides` with `change.to`.
Because the UI proposal keys are produced by the **inverse** of the same maps used to build the
model, **apply writes exactly the cells the proposal proposed** (AC-12). No reducer change is
required for apply; the reducer stays index/absDay-keyed.

### 3.5 Data flow (infeasible)

```
Solution.status === 'Infeasible'  (ports.ts Solution.status)
   └─ deriveConflictCore(ctx, currentSchedule, period)  → { core[], relaxations[] }
         (domains/solver/src/conflict.ts:56)
   └─ panel renders real core (cid,text) + relaxations (id,text,detail)
   └─ user picks a relaxation; re-solve calls buildModel with
        opts merged via relaxation.apply(prevOpts)  (conflict.ts:18 Relaxation.apply)
   └─ adapter.solve(lp,...) again → mapSolution → buildProposal (optimal path)
```

### 3.6 Persistence

Persistence has **two payloads**, because the domain `AppStateDTO` cannot, by itself,
rebuild the board's grouped org model. The board renders from `SF.DEPTS` (departments with
index ranges `from/to`, sf.ts:25-30,65-71) + `SF.EMPLOYEES` whose `Emp` carries
**app-only** fields the domain `Employee` lacks: `i` (the integer index that IS the cell-key
identity, `empIdx|absDay`), `dept`/`deptName` (board grouping), `home`, and the dept
`from/to` ranges (sf.ts:31-41,82-94). `AppStateDTO` (ports.ts:38-47) has **no departments**
and none of these fields. Persisting only `AppStateDTO` therefore **cannot** reconstruct the
grouped board on reload (BLOCKER B1).

- **Payload 1 — domain state:** the domain `AppStateDTO`
  (`domains/ports/src/ports.ts:38-47`): `{ org, teams, shifts, employees, coverages, rules,
  assignments, period }`. `assignments` = the user's current board (overrides) as
  `Assignment[]` via `toScheduleDTO` / direct mapping (empIdx→id, absDay→ISO, code→shiftId;
  `shiftId:null` = explicit day off). Saved via `IdbStorageAdapter`
  (`app/src/adapters/storage/idbStorageAdapter.ts`), single JSON blob, db/store `'crewdoku'`,
  key `'state'`. Plain JSON only (no Map/Set).
- **Payload 2 — app companion blob:** an app-side record that captures everything the board
  needs but the domain drops:
  - `departments: { id, name, from, to }[]` — the `SF.DEPTS` array. (Ranges MAY be persisted
    verbatim, OR recomputed on load from the per-employee `dept` + `i` ordering; persisting
    them verbatim is simpler and avoids ordering assumptions — PLAN's choice.)
  - `employeesMeta: { id, i, dept, home }[]` — keyed by the domain `Employee.id` (nanoid) so
    each domain employee can be re-decorated with its board index `i`, department, and `home`.
    (`deptName` is recovered by joining `dept`→`departments[].name`.)
  - the persisted **anchor** required by B2 (see §3.6.1): `{ startDate, absDayOrigin }`.

  This companion blob lives alongside the domain state — either as a sibling key in the same
  `'crewdoku'` store (e.g. key `'board'`), or merged into the same JSON object that wraps the
  `AppStateDTO`. PLAN picks one; both stores/keys must be written and read atomically as part
  of save/load.
- **View state** (weekOffset, seedMode, **pins**, locale, adminView). **Correction (M2):**
  the prototype does **not** persist pins or weekOffset today — `app.tsx:322` saves only
  `{ dataMode, locale, overrides, emptySchedule }` and `DB_LOAD` rehydrates only those, so
  pins and weekOffset are lost on reload. Because **pins drive the solve** (they become fixed
  cells in `buildModel`), losing them on reload is a real gap. This pass MUST persist `pins`
  and SHOULD persist `weekOffset` — either by extending the existing `cw_state_v1` blob
  (add `pins`, `weekOffset`) or by folding them into the companion blob (§10 Assumption A4).
- **Load:** on mount, read **both** payloads. If a domain org exists → rebuild
  `SF.DEPTS`/`SF.EMPLOYEES` by combining the `AppStateDTO` (names, eligibility, rules) with
  the companion blob (`departments`, per-employee `{ i, dept, home }`), repopulate
  `SF.SHIFTS` + `rebuildShiftIdx()`, restore the B2 anchor, then render the board. If the
  domain state is `null` → render onboarding (empty state). There is **no demo fallback**.

#### 3.6.1 Date anchor — single persisted origin (B2)

The board's `d` (absDay) is anchored to a **fixed** `BASE = new Date(2026,5,15)` in `sf.ts`
(`dateOf(absDay) = new Date(2026, 5, 15 + absDay)`, sf.ts:97-99,109). `absDay` spans negative
values (`HORIZON = [-14, 13]`, sf.ts:109), and overrides/pins are keyed `empIdx|absDay`. §3.2
proposes mapping `absDay → ISO` via `period.startDate = isoWeekKey(today)`. **Hazard:** if
`startDate` (or the `absDay→ISO` offset) is recomputed from a *different* "today" on a later
load, every override/pin maps to the **wrong calendar cell** — the v1 mis-attribution bug
class (CLAUDE.md "Deleting an employee must never re-point another's data").

**Decision:** the anchor is **persisted once and never recomputed from "today" on load.**
Saved state stores `period.startDate` (ISO) **and** the `absDayOrigin` — the integer `absDay`
that corresponds to `startDate` (i.e. the `absDay` value such that
`dateByAbs(absDayOrigin) === startDate`). On the **first** onboarding/solve these are computed
from today (`isoWeekKey(today)` = this Monday, with `absDayOrigin` = the board's display origin
for that Monday). On **every subsequent load** the bridge maps `ISO↔absDay` relative to the
**stored** `startDate`/`absDayOrigin`, never the current date.

Board display origin vs `period.startDate`: the board's current "today" marker is `d === -3`
(board.tsx:208,602) and the "Today" button jumps to `WEEK set:-1` (board.tsx:458) — i.e. the
visible window is anchored such that today is not `d=0`. The bridge MUST therefore record the
explicit offset rather than assume `d=0 === startDate`. Concretely: pick `startDate` =
`isoWeekKey(today)` (this Monday) and persist `absDayOrigin` = the `absDay` of that Monday under
the board's BASE arithmetic at onboarding time; thereafter `dateByAbs(absDay) =
addDays(startDate, absDay - absDayOrigin)` (UTC). Past/negative `absDay` map to earlier calendar
dates the same way; they are not solved (only the period window is) but they still round-trip to
a stable calendar date. PLAN must reconcile this with the m1 demo-removal of the literal `d===-3`
"today" anchor and fixed `BASE` (see §7) so a single source of truth for the anchor remains.

### 3.7 Onboarding → store (workstream 1)

`onboarding.tsx finish()` currently mutates `SF.SHIFTS/DEPTS/EMPLOYEES` then dispatches
`LOAD_CUSTOM` (`onboarding.tsx:436-447`). This pass: `finish()` additionally (or instead)
writes the org into store state and persists it via `persist.ts` so the roster survives reload.
Keeping the SF globals populated is acceptable for the board's verbatim rendering as long as
they are **rehydrated from persisted state on reload** (today they are re-created empty on
reload, losing the roster — that is the bug workstream 1 fixes).

### 3.8 admin.tsx scope note (investigation finding — affects bridge inputs)

`admin.tsx` only writes back to globals for **shifts** (`ShiftConfig.apply`, admin.tsx:72-85
mutates `SF.SHIFTS` + `rebuildShiftIdx`). **Rules, teams/employees, prefs, and weights edits
are LOCAL component state** (`AdminSurface` seeds `employees` from `SF.EMPLOYEES` at
admin.tsx:1194 and never commits back; `RulesConfig`/`WeightsConfig`/`PreferencesConfig` hold
their own `useState` and never persist). Therefore, for the MVP solve input, the bridge reads:
shifts + rules (from onboarding) + employees (from onboarding/SF) — NOT admin's uncommitted
edits. Wiring admin edits back into the solve is **deferred** (it is a pre-existing gap, part of
workstream 6, not regressed by this change). This spec does not require fixing admin commit-back;
it only requires the solve to use the persisted onboarded org. (Called out so REVIEW/PLAN don't
assume admin already feeds the solver.)

---

## 4. Defaults for deferred inputs (workstream 6 — default, do not build UI)

The bridge supplies safe domain defaults so the solve runs honestly:

| Domain input | Source / default |
|---|---|
| `Org` | `makeOrg({ name: onboarding orgName })` |
| `Team[]` | **single catch-all team** `makeTeam({ name:'All', shiftIds: allShiftIds })` (VISION §7). Every employee `teamId` = this team. |
| `Shift[]` | from `SF.SHIFTS`: `makeShift({ code, name, startHour:start, endHour:end, isNight: SF.isNight(s) })`. `isNight` from existing `sf.ts:55` rule (start<8 ‖ start≥20) — never a literal `'N'` (CLAUDE.md). |
| `Employee[]` | from `SF.EMPLOYEES`: `makeEmployee({ name, teamId:catchAll, eligibleShiftIds: codes→ids, contract:{maxHoursPerWeek:rules.maxHours}, timeOff:[], recurring:[], prefs:{night:'willing',weekend:'willing',notes:''} })`. timeOff/prefs defaulted (deferred). |
| `Coverage[]` | per shift, single team: `byDow` derived from per-shift `req`/`cap` → `{min:req,max:cap}` for each of 7 days (or use `SF.coverageForDay`/`byDow` if present, `sf.ts:304`). `dateOverrides:{}`. (VISION §7 "coverage derived from the entered per-shift requirement".) |
| `Rules` | `makeRules({ maxHoursPerWeek:rules.maxHours, minRestHours:rules.minRest, maxConsecutiveDays: default, enabled: H1–H6 on (H4 from onePerDay, H6 from eligibility), weights: S1–S5 defaults })`. Soft weights defaulted (deferred). |
| `Period` | `{ startDate: thisMonday, weeks: N }` (§3.2, §10 A3). |
| `pins` | translated from `app.pins` (already a real user input via Seed mode). |

These defaults must produce a model `buildModel` accepts and `HighsSolverAdapter` can solve
(AC-2). If the entered org is genuinely infeasible, the **real** infeasible path handles it
(AC-4) — that is correct behavior, not a bug.

---

## 5. Acceptance criteria (numbered, testable)

1. **Org persists across reload, including departments + board grouping.** After onboarding an
   org and reloading the page, the same employees/shifts/rules **and the department grouping**
   render on the board (no re-onboarding, no empty state). Specifically (B1): `SF.DEPTS`
   (departments with their `from/to` ranges) and each employee's board-only fields
   (`i`, `dept`/`deptName`, `home`) are reconstructed from the persisted `AppStateDTO` **plus**
   the app companion blob (§3.6), so the grouped board (employees bucketed by department) looks
   identical after reload. Verified by an IndexedDB round-trip test on `persist.ts` (asserting
   departments + per-employee board fields survive, not just employees/shifts/rules) + an e2e
   reload check that the department grouping renders.
2. **Solving uses real HiGHS.** Running the solver invokes
   `HighsSolverAdapter.solve` with an LP from `buildModel`; there is **no** call to
   `SF.makeProposal` anywhere (symbol deleted). Unit test asserts `solveBridge` calls
   `buildModel`/adapter.solve/`mapSolution`/`buildProposal` in order (adapter faked via
   `workerFactory`, mirroring `adapter.test.ts:45`).
3. **Proposal numbers come from `buildProposal`.** The panel's fairness, penalty, prevFairness,
   prevPenalty, and breakdown rows are the values from the domain `Proposal` (computed via
   `buildProposal`/`scoreTerms`), NOT the hardcoded `87/82/142/189` literals (those literals are
   deleted). Test asserts the rendered numbers equal the bridge's translated proposal.
4. **Infeasible uses `deriveConflictCore` + relaxation re-solve.** When the adapter returns
   `status:'Infeasible'`, the panel shows the core/relaxations from `deriveConflictCore` (not
   `SF.INFEASIBLE`); selecting a relaxation and re-running calls `buildModel` with the merged
   `BuildModelOptions` from `relaxation.apply(...)` and produces a proposal (or another
   infeasible result). `SF.INFEASIBLE` symbol deleted.
5. **Cancel works.** Cancelling an in-flight solve calls `HighsSolverAdapter.cancel()`
   (terminates worker, bumps generation) and the panel returns to idle without producing a
   proposal. Test asserts `cancel` is invoked and no `SET_PROPOSAL` fires.
6. **Real solver log streams.** The solver-log panel renders the lines actually emitted by the
   adapter's `onLog(line, elapsedMs)` callback during the real solve, not entries filtered from
   the static `SF.SOLVER_LOG`. `SF.SOLVER_LOG` symbol deleted. The streamed lines are the real
   ones produced by `worker.ts` (`handleSolve`): the size line ("building model — N vars, M
   rows"), "solving…", "obj X", "status S", "Ys" (worker.ts:57-66). The size line MUST show
   real `varCount`/`rowCount` (m2: forward `meta` from `buildModel` into `solve()` options) OR
   be dropped — it must NOT print "? vars". The "Solver log" panel title says **HiGHS**, not
   "CP-SAT" (m1, generate.tsx:173).
7. **No fake timers.** The 700ms queued delay and 90ms/3100ms `setInterval` progression in
   `leader.tsx:26-37` and `generate.tsx` (`elapsed/3100`, `start`/fake phase ticking) are
   removed; phase transitions are driven by real adapter promise resolution + onLog.
8. **All demo symbols deleted.** None of the following appear in `app/src/crewdoku/` non-test
   source (grep guard test): `baseAssign`, `makeProposal`, `INFEASIBLE`, `SOLVER_LOG`,
   demo `HARD` instance-count array, `PINS` seed array, the demo first/last name pools
   (`FIRST`/`LAST` in sf.ts), `LOAD_DEMO`, `fillDemo`, `DemoLink`, the "Demo scenario"
   Optimal/Infeasible `outcome` toggle, and every `dataMode === 'demo'` branch (and ideally the
   `dataMode` discriminator itself, since only the custom path remains — see §10 A5).
9. **`baseAssign` baseline fully removed.** The board's `getShift` no longer falls back to
   `SF.baseAssign` (board.tsx:352-357); an unset cell is empty (null). Matches the existing
   custom-mode behavior, now the ONLY behavior.
10. **No Load-Demo path.** There is no UI affordance to load sample data; the app shows only the
    user's onboarded org or the onboarding wizard (VISION §7). Empty board guidance ("Schedule is
    empty — ▸ Generate", board.tsx:491) is preserved.
11. **`checkViolations` / `weekHours` still work, using onboarded thresholds.** Per-cell ⚠ flags
    and the weekly-hours column still compute over real (custom) assignments; existing board
    tests for violations pass. **(M1)** They read the **onboarded** rules, not the demo literal:
    `SF.RULES.maxWeek`/`.minRest` (or the values passed in) reflect the onboarded
    `maxHours`/`minRest`, so the live ⚠ checker and the solver agree on the same thresholds.
    Test asserts that changing the onboarded rules changes which cells the live checker flags.
12. **Identity mapping round-trips.** For a built proposal, applying it writes the same employee×date
    cells (`overrides`) that the proposal proposed: `applyProposal(changes)` then reading
    `overrides` yields, for each change, `overrides.get(empIdx|absDay).code === change.to`. Unit
    test on the index↔id maps proves `decode(encode(x)) === x` for employees, shifts, and dates.
13. **CSV / print export unchanged.** Team CSV, person CSV, and print/PDF still emit the real
    board assignments (no `dataMode==='demo'` branch remains; export reads overrides only).
14. **Lint + test green.** `pnpm lint` (tsc --noEmit) clean and `pnpm test` green across both
    packages, including updated `sf.test.ts`, `reducer.test.ts`, `generatePanel.test.tsx`,
    `board.test.tsx`, `leader.test.tsx`, `fixtures.ts` (which currently reference deleted demo
    symbols and must be updated to the real path).
15. **E2E real solve in the browser (VISION §8).** In the running Vite app: onboard a small org →
    ▸ Run solver → a real HiGHS proposal arrives (real log streamed) → toggle Original/Solved →
    Apply writes the cells → reload preserves them. The HiGHS WASM actually loads and solves in
    the live worker context (smoke gate, see §8 Risks).
16. **Date anchor round-trips across reload (B2).** Save→reload preserves which **calendar
    date** each override and pin sits on. The anchor (`period.startDate` + `absDayOrigin`) is
    persisted and, on load, `absDay↔ISO` is mapped relative to the **stored** anchor — never
    recomputed from the current "today". Unit test: with a stored anchor, `dateByAbs(absDay)`
    yields the same ISO date before and after a simulated reload on a different "today"; an
    override at `empIdx|absDay` resolves to the identical calendar date post-reload (no
    mis-attribution). §3.6.1.
17. **Pins persist across reload (M2).** Pinned cells (`pins`, keyed `empIdx|absDay`) survive a
    reload and are re-applied as fixed cells in the next `buildModel`. Test asserts that after
    saving with pins set and reloading, the rehydrated `pins` set is identical and the next
    solve treats them as fixed. (`weekOffset` SHOULD also persist; assert if implemented.)

---

## 6. Affected files (+ new)

### New

- `app/src/crewdoku/engine/orgBridge.ts` — SF org snapshot ↔ domain entities + index/id maps.
- `app/src/crewdoku/engine/solveBridge.ts` — solve orchestration, onLog/cancel, infeasible,
  domain→UI proposal translation.
- `app/src/crewdoku/engine/persist.ts` — `AppStateDTO` ↔ store, save/load via `IdbStorageAdapter`.
- `app/src/crewdoku/engine/__tests__/orgBridge.test.ts` — mapping + round-trip (AC-12).
- `app/src/crewdoku/engine/__tests__/solveBridge.test.ts` — pipeline order, cancel, infeasible,
  proposal numbers (AC-2,3,4,5,6) with a faked worker.
- `app/src/crewdoku/engine/__tests__/persist.test.ts` — IDB round-trip of the domain state +
  app companion blob: departments + per-employee `{i,dept,home}` + the B2 anchor + pins
  (AC-1, AC-16, AC-17).

### Changed

| File | Change |
|---|---|
| `app/src/crewdoku/sf.ts` | Delete `baseAssign`, `PINS`, `HARD`, `SOFT` (or repurpose), `makeProposal`, `INFEASIBLE`, `SOLVER_LOG`, `FIRST`/`LAST` name pools, the 100-emp demo loop, `DEPTS`/`EMPLOYEES` demo seeds, `workloadHistogram` if demo-only. **Keep** `checkViolations`, `weekHours`, `shift`/`shiftTime`/`shiftHours`/`hh`/`isNight`/`coverageForDay`, `dateOf`/`dayLabel`/`DOW`/`isWeekend`/`HORIZON`/`inHorizon`, `mod`, `rebuildShiftIdx`, and the `SHIFTS`/`DEPTS`/`EMPLOYEES` containers (now populated from onboarding/persistence, not demo data). **Keep `RULES` but change its source (M1):** it is no longer the literal `{maxWeek:48,minRest:11}` — it is repopulated from the onboarded rules so `checkViolations`/`weekHours` use the same thresholds as the solver. The fixed `BASE`/`dateOf` literal (sf.ts:97,99,111) must stop being the load-bearing solve anchor (B2/§3.6.1). Update the misleading header comment + delete the dead `solverBridge.ts`/`setProposalSolver` references (sf.ts:5,216). |
| `app/src/crewdoku/leader.tsx` | Replace the fake `setTimeout`/`setInterval` solver state machine + `SF.makeProposal` call (leader.tsx:23-54) with calls into `solveBridge` (queued→solving driven by the real promise + onLog; done on resolve; infeasible on `status:'Infeasible'`). Remove `outcome` state. |
| `app/src/crewdoku/generate.tsx` | Replace `SF.SOLVER_LOG` filtering (generate.tsx:33) with real streamed log lines; replace `SF.HARD` preflight/list (generate.tsx:9,150-158) with real constraint summary (or drop instance counts); delete the "Demo scenario" `outcome` Seg (generate.tsx:161-166); replace `SF.INFEASIBLE` core/relaxation rendering (generate.tsx:222-259) with the bridge's real `deriveConflictCore` result + relaxation re-solve; remove `elapsed/3100` progress math (use real elapsed from onLog or indeterminate). Keep PenaltyBars/CompactHist driven by real proposal `breakdown`. |
| `app/src/crewdoku/board.tsx` | Remove `SF.baseAssign` fallback in `getShift` (board.tsx:352-357 → always null when unset); remove `dataMode === 'demo'` branch in `exportEmpCSV` (board.tsx:416). Cell keys + pins stay `empIdx|absDay`. Replace the fixed `d === -3` "today" marker (board.tsx:208,602) and `WEEK set:-1` "Today" button (board.tsx:458) with values derived from the persisted B2 anchor (§3.6.1), not the literal `-3`/BASE arithmetic. |
| `app/src/crewdoku/app.tsx` | Remove `dataMode === 'demo'` branches in exportTeamCSV/exportPersonCSV/printSchedule (app.tsx:34,52,72); remove `LOAD_DEMO` reducer case (app.tsx:159) and likely the `dataMode` discriminator (collapse to a single real mode, §10 A5); switch persistence (app.tsx:312-325) from the ad-hoc `cw_state_v1` blob to (or augment with) `persist.ts` saving the `AppStateDTO` **and the app companion blob** (departments + per-employee `{i,dept,home}` + B2 anchor; §3.6). The current save payload (app.tsx:322) saves only `{dataMode,locale,overrides,emptySchedule}` and DB_LOAD rehydrates only those — it does **not** persist `pins`/`weekOffset` (M2); add `pins` (and `weekOffset`) to the persisted/rehydrated set. Wire `solve()`/apply through the bridge if the store is introduced. Keep `DIFF_APPLY` (writes accepted-as-whole changes), `SET_PROPOSAL`, `DIFF_DISCARD`. |
| `app/src/crewdoku/onboarding.tsx` | `finish()` writes org into persisted store/`AppStateDTO` (not only SF globals); delete `DemoLink`, `fillDemo`, `DEMO_LABELS`, and the `SF.DEPTS/SHIFTS/EMPLOYEES` demo reads in fillDemo (onboarding.tsx:37-44,381-393,472). |
| `app/src/crewdoku/db.ts` | Either keep for view-state KV, or retire in favor of `IdbStorageAdapter`. Decision in §10 A4. |
| `app/src/crewdoku/__tests__/{sf,reducer,generatePanel,board,leader}.test.ts(x)`, `fixtures.ts` | Update to the real pipeline; drop references to deleted demo symbols. |
| `app/package.json` | Already depends on `scheduling, constraints, solver, ports, calendar, export, seed` (`workspace:*`). **`seed` should be removed** as an app dependency once demo is gone (it exists only for `buildDemo`). No new deps needed; domain imports resolve by bare package name (no path alias). |

### Possibly deleted

- `domains/seed/` usage from the app (the package may remain in the monorepo but is no longer
  imported by the app; `buildDemo`/`demo.ts` is not shipped in the product path). Removing the
  app's `seed` dependency satisfies "no demo in the app".

---

## 7. Demo-removal checklist (every fake symbol → action)

| Symbol / path | Location | Action |
|---|---|---|
| `baseAssign` | sf.ts:113-129; board.tsx; app.tsx exports | DELETE fn; remove all fallbacks → unset cell = null. |
| `PINS` (seeded) | sf.ts:131-137 | DELETE. Pins come only from user Seed mode. |
| `HARD` (instance counts) | sf.ts:139-146; generate.tsx | DELETE counts; preflight shows real constraint set or nothing. |
| `SOFT` (blurbs/weights) | sf.ts:147-153; admin WeightsConfig | DELETE demo array; weights default in bridge (deferred UI). |
| `makeProposal` + `CHANGE_NOTES` | sf.ts:209-251; leader.tsx:51 | DELETE; replaced by `buildProposal` via solveBridge. |
| `INFEASIBLE` | sf.ts:253-265; generate.tsx | DELETE; replaced by `deriveConflictCore`. |
| `SOLVER_LOG` | sf.ts:267-275; generate.tsx:33 | DELETE; replaced by real `onLog`. |
| `FIRST` / `LAST` name pools + 100-emp loop | sf.ts:73-94 | DELETE; roster from onboarding/persistence. |
| demo `DEPTS`/`EMPLOYEES` seed values | sf.ts:65-94 | DELETE seed data; keep empty containers populated at runtime. |
| `workloadHistogram` (if demo-only) | sf.ts:285-296; generate.tsx:206 | Keep only if it runs over real assignments; otherwise DELETE. |
| `LOAD_DEMO` | app.tsx:159; reducer | DELETE case. |
| `fillDemo` / `DemoLink` / `DEMO_LABELS` | onboarding.tsx:37-44,381-393,472 | DELETE. |
| "Demo scenario" Optimal/Infeasible toggle (`outcome`) | generate.tsx:161-166; leader.tsx; reducer | DELETE; outcome is the real solve status. |
| `dataMode === 'demo'` branches | app.tsx:34,52,72; board.tsx:355,416 | DELETE all branches. |
| `dataMode: 'demo'` value | reducer initial/cases | Remove demo value (collapse modes, §10 A5). |
| dead `solverBridge.ts` / `setProposalSolver` comments | sf.ts:5,216 | DELETE stale references. |
| app `seed` dependency | app/package.json | REMOVE once `buildDemo` unused. |
| fake timers (700/90/3100ms) | leader.tsx:26-37; generate.tsx:104 (`elapsed/3100`) | DELETE; real promise/onLog drives phases. |
| `'of 700'` hardcoded denominator | generate.tsx:189 | REPLACE with real headcount (employee count), e.g. `of {SF.EMPLOYEES.length}`. |
| `'Pre-flight · Jun 15 week'` panel title | generate.tsx:145 | DERIVE from the real `period` (e.g. the period's start week), not the demo literal date. |
| `'Solver log · CP-SAT'` panel title | generate.tsx:173 | RENAME to HiGHS — "CP-SAT" is factually wrong; the real engine is HiGHS MILP. |
| `d === -3` "today" anchor | board.tsx:208,602 | RECONCILE with the persisted B2 anchor (§3.6.1); the today marker must derive from the stored anchor / real date, not a fixed `-3`. |
| `WEEK set:-1` "Today" button | board.tsx:458 | RECONCILE with §3.6.1 anchor; "Today" must jump to the real current week relative to the stored origin. |
| fixed `BASE = new Date(2026,5,15)` + `dateOf` literal | sf.ts:97,99,111 | RECONCILE with §3.6.1: the BASE date must no longer be the load-bearing solve anchor; the bridge owns `absDay↔ISO` via the persisted `startDate`/`absDayOrigin`. |

Demo-removal is asserted by AC-8 via a grep-guard test enumerating the symbol deletions.
**Note:** AC-8's grep guard catches deleted *symbols*; it will NOT catch the
string/anchor reconciliations above (`'of 700'`, `'Pre-flight · Jun 15 week'`,
`'Solver log · CP-SAT'`, `d === -3`, `set:-1`, fixed `BASE`) — those are enumerated here
explicitly and covered by AC-6/AC-1's date round-trip + manual review, not the symbol grep.

---

## 8. Risks

1. **HiGHS WASM in live Vite/worker context is unproven (HIGHEST).** Unit tests fake the worker
   (`workerFactory`, adapter.test.ts). The real worker loads `highs/runtime?url` via
   `import.meta.url` + `new Worker(..., {type:'module'})` (highsLoader.ts:11-13,
   highsSolverAdapter.ts:44-50; vite worker `format:'es'`). This has never run in the live app.
   **Mitigation:** AC-15 requires a real-browser e2e smoke (VISION §8) — onboard → solve →
   proposal — before the change is "done". If WASM fails to load/solve in the worker, that is a
   blocking finding to surface immediately (potential PIVOT to a main-thread or different load
   strategy).
2. **Identity-bridge round-trip correctness.** A wrong empIdx↔id or absDay↔ISO mapping would
   mis-attribute assignments (the v1 index bug class, CLAUDE.md). **Mitigation:** AC-12 unit test
   proves `decode(encode(x)) === x` for employees/shifts/dates; solveBridge test asserts
   apply writes exactly the proposed cells. Never string-split keys to recover IDs; carry maps
   explicitly. Reuse `meta` from `buildModel` in `mapSolution` (never re-derive ordering).
3. **Perf at real size.** The demo had 100 staff × 28 days; a real org could be larger. MILP
   solve time/var count may be high. **Mitigation:** measure in the e2e smoke; period weeks kept
   modest (§10 A3); cancel works (AC-5). Perf tuning is out of scope unless the smoke is
   unusably slow (then surface as a finding).
4. **Entered org may be infeasible.** Coverage `req` may exceed workforce, rest windows may block
   rotations. This is **correct** behavior routed through the real infeasible path (AC-4), not a
   bug — but a demo-er expecting an instant optimal may be surprised. **Mitigation:** the
   onboarding/admin feasibility banners already warn (admin.tsx:207-221); the real conflict
   core explains *why*. No code mitigation required; called out so REVIEW doesn't treat an
   infeasible smoke org as a failure.
5. **Test fixtures coupled to demo.** `fixtures.ts` and several tests import demo symbols; they
   must be rewritten to the real path or they block AC-14. **Mitigation:** treat fixture rewrite
   as in-scope (listed in §6).
6. **`coverageForDay`/`byDow` shape mismatch.** Onboarding writes `byDow` arrays
   (onboarding.tsx:440) but admin/shift defaults sometimes omit them; the bridge must derive
   `Coverage.byDow` (length-7) robustly from `req`/`cap` when `byDow` is absent.

---

## 9. Out-of-scope confirmations (do not do)

- Do not build time-off / prefs / weights / multi-team coverage capture UI (workstream 6).
- Do not refactor the board/reducer to nanoid identity (thin bridge only).
- Do not re-implement `checkViolations`/`weekHours` on top of `hard.ts` (keep them working).
- Do not change design tokens, `--sh-*`, `.sf-*`, or `rounded-[2px]`.
- Do not add per-cell proposal triage (single Apply/Discard).

---

## 10. Assumptions / decisions log

- **A1 — Bridge location.** New wiring lives in `app/src/crewdoku/engine/`. Rationale: app owns
  domain-facing wiring; isolates it from verbatim-ported presentation. (Allowed: VISION §7 says
  this crosses the presentation boundary by necessity; dependency rule app→domain preserved.)
- **A2 — Catch-all team + req/cap coverage.** Single team staffing all shifts; `Coverage.byDow =
  {min:req,max:cap}` per day. Brainstorm decision 2 + VISION §7. Alternative rejected: deriving
  multiple teams from departments (departments are a board grouping, not an eligibility/coverage
  unit in this MVP; would need workstream-6 coverage UI).
- **A3 — Period.** `startDate = isoWeekKey(today)` (this Monday). `weeks` = the window the board
  generates over. **Decision:** match the board's visible/generated horizon. The current board
  shows 4 weeks (`HORIZON=[-14,13]`); past weeks are not solved. **Proposed:** solve the current
  + next 3 weeks (`weeks: 4`) anchored at this Monday, mapping `absDay 0 = startDate`. PLAN may
  narrow to a single week if perf demands (the panel header already says "Jun 15 week" implying a
  single-week solve was the prototype's framing). Flagged for PLAN; not a blocker.
- **A4 — Persistence store.** Persist the org/assignments as `AppStateDTO` via `IdbStorageAdapter`
  (new `'crewdoku'` db), **plus** the app companion blob (departments + per-employee
  `{ i, dept, home }` + the B2 anchor; §3.6, required by AC-1/AC-16). View state
  (weekOffset/seedMode/pins/locale) MAY stay in the existing `db.ts` `cw_state_v1` blob, OR be
  merged into the companion blob — but `pins` (and ideally `weekOffset`) MUST now be persisted
  (M2; AC-17), since the prototype does not persist them today and pins drive the solve. Where
  exactly the companion + view state live (sibling key vs merged object) is deferred to PLAN;
  AC-1 requires the **org + departments/board grouping** to survive reload, AC-16 the **date
  anchor**, AC-17 the **pins**.
- **A5 — Drop `dataMode`.** With demo gone there is exactly one mode (the user's org). Prefer
  removing the `dataMode` discriminator and `emptySchedule`/`dataMode==='empty'` can be replaced
  by "is there a persisted org?". If removal proves invasive to many tests, keeping a single
  constant mode is acceptable as long as no `'demo'` branch remains (AC-8). Flagged for PLAN.
- **A6 — Adapter instantiation.** One `HighsSolverAdapter` instance owned by the bridge/store,
  constructed with `{ onLog }`; `cancel()` on user cancel. Worker is lazy (spawned on first
  solve, adapter.ts:76). No change to the adapter needed.
- **A7 — admin edits not wired to solve (this pass).** Per §3.8, only onboarding-sourced org +
  shift edits reach the solver; admin rules/teams/prefs/weights remain local (pre-existing gap,
  workstream 6). Not a regression. Flagged so it is not mistaken for a bug in REVIEW/E2E.
- **A8 — No pivot.** Investigation confirmed the onboarded org (org/depts/shifts/rules/employees,
  all committed to SF globals by `finish()`) maps to a valid domain model with the §4 defaults,
  and the index/absDay/code working model translates reversibly at the boundary. Neither the
  "thin bridge infeasible" nor the "org can't model without new UI" fork triggered.
