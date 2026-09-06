# Engine port contract

The published surface the fresh `app/` consumes. The types are exported from
the packages — this document only points at them and records the facts the
app map must plan around.

## The three surfaces

1. **Solver port** (`@crewdoku/solver`):
   The calculation facade. `runSolve(input: ModelInput, solveLp: SolveLpFn):
   Promise<SolveOutcome>`. `SolveOutcome` is a discriminated union: either
   `{ status: 'solved'; schedule: Schedule }` (a complete person × date
   matrix; pinned cells carried verbatim) or `{ status: 'infeasible';
   conflictCore: ConflictCoreItem[]; relaxations: Relaxation[] }` (plain
   sentences; each relaxation is a pure `ModelInput` transform). `runSolve`
   builds the MILP, delegates the LP text to `solveLp`, and derives the
   conflict core itself when the solve is infeasible. Any solver status other
   than Optimal/Infeasible rejects with an Error naming the status — solver
   errors are bugs, not planner-facing states.

2. **Storage port** (`@crewdoku/persistence`):
   `WorkspaceStorage` (`load(): Promise<Workspace | null>` /
   `save(workspace)`), implemented by `IdbWorkspaceStorage` (raw IndexedDB,
   one versioned JSON snapshot; `load()` on an empty store returns null — the
   first-run signal). The workspace file layer is string-in/string-out:
   `exportWorkspaceFile` (pretty-printed JSON), `importWorkspaceFile` (full
   parse or a plain refusal: not-json / not-a-workspace / newer-schema),
   `workspaceFileName(date)` → `crewdoku-workspace-YYYY-MM-DD.json`.

3. **Domain** (`@crewdoku/domain`):
   Entities, calendar, the schedule shape, and the independent oracle:
   `checkSchedule` reports H1/H2/H3/H5 violations plus the eligibility
   capability flag (there is no H6 rule); `diffSchedules` is what the Ledger
   computes changes from.

## What the app wires where

- **The real app UI** wires `solveLp` to a `HighsSolverAdapter` instance
  (dedicated Web Worker running HiGHS WASM): the main thread never blocks,
  each `solve(lp, options?, onLog?)` streams its own log lines (per-solve
  callback — relaxation re-runs cannot bleed logs), and `adapter.cancel()`
  aborts an in-flight solve, leaving the adapter reusable.
- **Tests and the harness** wire `solveLp` to
  `toHighsSolve(await highsLoader())` — HiGHS in-process, no worker, no DOM.

## Solve-time reality (measured 2026-09-02, Apple M4 Pro, single run)

100 people × 42 days: WASM load 10.7 ms · model build 72.7 ms · LP 4.68 M
chars, 29,568 variables · **feasible solve 4.15 s wall** · infeasible
detected in 0.27 s · proposal + full check 24.5 ms.

Implications for the app:

1. The solve is real seconds — the flow is asynchronous with a visible
   solving state, streamed log lines, and a Cancel action.
2. Infeasibility answers fast (~0.3 s): the conflict screen can appear almost
   immediately when the rules cannot be met.
3. One relaxation is not always enough. The honest flow is iterative: derive
   core → planner picks a relaxation → re-solve → possibly a new core. The
   harness proves this loop converges on its fixtures.

## Graduation: keeps and throwaways

Keeps (from the prototype):
- The port mental model — request in, solved-or-infeasible out — carries from
  proto's `SolverPort` into `runSolve`/`SolveOutcome`.
- Pins-sacred semantics: a pinned cell is never moved by the solver, even
  when it breaks a rule (the checker flags it instead).
- The settings surface exactly (H1 band, H2 hours, H3 rest, H5 time off,
  S1–S5 drag-rank; no H6).
- The visual language (proto's tokens/`styles.css`) and the export matrix
  builders — as specification for the rebuild, owned by the app map.

Throwaways:
- `stubSolve` and its `SolveOptions.delayMs`/`forceInfeasible` knobs.
- The `mockBoard` generator and all mock seeding.
- Memory-only jotai state — the workspace is IndexedDB-backed from boot.

## Where the types live

- `@crewdoku/solver`: `runSolve`, `SolveOutcome`, `SolveLpFn`,
  `LpSolveResult`, `ModelInput`, `ModelMeta`, `SolvedProposal`,
  `ConflictCoreItem`, `Relaxation`, `HighsSolverAdapter`, `HighsOptions`,
  `CancelledError`, `toHighsSolve`, `HighsSolve`.
- `@crewdoku/domain`: `Workspace`, `emptyWorkspace`, `Schedule`,
  `Assignment`, `Person`, `Team`, `ShiftDef`, `Period`, `CoverageTable`,
  `SolveSettings`, `checkSchedule`, `diffSchedules`, `emptySchedule`,
  `getAssignment`, `assignmentKey`.
- `@crewdoku/persistence`: `WorkspaceStorage`, `IdbWorkspaceStorage`,
  `WorkspaceDTO`, `migrate`, `exportWorkspaceFile`, `importWorkspaceFile`,
  `workspaceFileName`.
