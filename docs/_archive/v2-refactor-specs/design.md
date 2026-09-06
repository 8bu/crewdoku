# Crewdoku v2 — Monorepo & Domain Refactor (Design)

**Date:** 2026-06-16
**Status:** Draft for review
**Supersedes:** the in-place `src/` architecture (Vite single-package app)

---

## 1. Problem

The current app is both **functionally broken** and **unmaintainable**. Root causes:

- **Two solvers.** `src/data/sf.js` `makeProposal()` produces a fake random diff while `src/solver/*` is a real HiGHS MILP. Duplicate sources of truth; unclear which path runs.
- **Index identity.** Employees are identified by array position `i`. `REMOVE_EMPLOYEE` re-indexes everyone, but cell keys are `i|day`, so deleting an employee silently re-points overrides/pins/swaps at the wrong people — data corruption.
- **Backwards dependencies.** Domain code is patched defensively to satisfy the UI's unguarded reads (e.g. "AdminSurface reads `e.depts` UNGUARDED so we must…"). The business logic bends to the view layer.
- **Domain mixed with demo + UI.** `sf.js` holds 100 fake employees, the solver sim, and helpers all together. `AdminSurface.jsx` is 1796 lines.
- **Map/Set in store**, hardcoded `2026` calendar, no real version/changelog.

## 2. Product definition (locked)

**Crewdoku = an offline-first, single-user, desktop-class app to build and manage one company's multi-week team schedule.** It is an app, not a platform.

- Auto-solve the schedule with a real HiGHS MILP.
- Review solver output as a cell-by-cell diff proposal; accept/reject; apply.
- Export the whole team schedule, or any single member's schedule, to CSV.
- **No** roles, auth, approval workflows, consent flows, or request/ripple system. Swaps are direct edits.

This deletes dead domain: `REQUESTS`, ripple text, pending/consent swaps, approval workflow.

## 3. Decisions (locked)

| Topic | Decision |
|---|---|
| Repo shape | pnpm workspaces + **Turborepo** |
| Language | **TypeScript everywhere** (domain `.ts`, app `.tsx`) |
| Identity | **Stable `nanoid` IDs** on every entity; no array indices in domain. Solver maps IDs → dense ints internally only |
| Schedule | **Single assignment list** as the one source of truth. No `baseAssign()` hash baseline. Demo seeds real assignments |
| Solver split | **Pure model in `/domain`**, WASM+Worker **runtime adapter in `/app`** behind a `SolverPort` |
| User model | Single-user, view modes (not roles) |
| Planning horizon | **Multi-week period** solved as one block |
| Coverage | Per shift × **day-of-week**, plus **specific-date overrides** |
| Coverage scope | Company-wide shift defs; **per-team minimums** |
| Eligibility | Two-level: **team** staffs a shift set; **employee** eligibility defaults to team's, can narrow |
| Constraints config | Hard limits editable, soft weights tunable, each rule toggle on/off |
| Employee attrs | Contract caps + time-off + recurring unavailability + soft prefs |
| Export | **CSV only**. Team = grid (rows=employees × cols=dates, shift code per cell). Member = list (one row per scheduled date: `date, dow, shiftCode, start, end, hours`). UTF-8, quoted fields |
| Design tokens | **Reuse `tokens.css` verbatim** — no visual redesign |
| Version badge | Kill hardcoded `v4`; sync to `app/package.json` version |
| Changelog | **Changesets** (`@changesets/cli`) |

## 4. Target structure

```
crewdoku/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                  # root scripts: dev / build / test / lint
├── .changeset/                   # changesets config + pending change intents
├── CHANGELOG.md                  # generated per package (root aggregates)
├── packages/
│   └── domain/                   # @crewdoku/domain — pure TS, ZERO React/DOM/WASM
│       ├── src/
│       │   ├── entities/         # Org, Team, Shift, Employee, Assignment, Period, Coverage, Rules
│       │   ├── schedule/         # Schedule (single source of truth), queries, mutations
│       │   ├── calendar/         # ISO-date utils: dow, week, weekend, period iteration
│       │   ├── constraints/      # H1–H6 + S1–S5, each a pure check/score fn
│       │   ├── solver/           # buildModel, scoreTerms, mapSolution, deriveConflictCore (pure)
│       │   ├── export/           # schedule → CSV grid (team + per-member)
│       │   ├── ports/            # SolverPort, StoragePort (interfaces only)
│       │   └── index.ts
│       └── src/**/__tests__/     # vitest — bulk of the test suite
└── app/                          # @crewdoku/app — Vite + React + TS, PRESENTATION ONLY
    ├── package.json              # holds the canonical app version (badge source)
    ├── src/
    │   ├── adapters/             # HighsSolverAdapter (worker+wasm), IdbStorageAdapter
    │   ├── store/                # Zustand — domain state + view state; calls domain fns
    │   ├── ui/                   # design-system kit consuming tokens.css contract
    │   ├── features/             # board / config / solve-panel / onboarding / export
    │   ├── i18n/                 # Lingui EN/VI — chrome only
    │   └── main.tsx
    ├── tokens.css                # carried over verbatim from current repo
    └── index.html
```

**Dependency rule:** `app` → `domain`. `domain` depends on nothing. One direction only. A component never computes a constraint or builds a model — it asks the domain.

## 5. Domain model

```ts
// Every entity carries a stable nanoid id. No array indices anywhere in domain.
type ID = string

interface Org      { id: ID; name: string }
interface Team     { id: ID; name: string; shiftIds: ID[] }            // shifts this team staffs
interface Shift    { id: ID; code: string; name: string; startHour: number; endHour: number; isNight: boolean } // end may exceed 24 (crosses midnight); isNight drives S1 (NOT a literal 'N' code)
interface Employee {
  id: ID; name: string; teamId: ID
  eligibleShiftIds: ID[]                                               // default = team.shiftIds; may narrow
  contract: { maxHoursPerWeek?: number; maxShiftsPerWeek?: number }    // optional per-person hard cap
  timeOff: DateRange[]                                                 // hard unavailable (replaces requests)
  recurring: RecurringRule[]                                           // e.g. { kind:'noDow', dow:1 } — hard
  prefs: { night: Pref; weekend: Pref; preferredShiftId?: ID; notes: string } // soft (S2)
}
interface Coverage {                                                   // per team × shift
  teamId: ID; shiftId: ID
  byDow: { min: number; max: number }[]                                // length 7, Mon..Sun
  dateOverrides: Record<ISODate, { min: number; max: number }>         // holidays/events
}                                                                      // effective(date) = dateOverrides[date] ?? byDow[dow]
interface Period   { startDate: ISODate; weeks: number }               // roster block being solved
interface Assignment { employeeId: ID; date: ISODate; shiftId: ID | null } // null = explicit day off
interface Schedule { assignments: Map<string, Assignment> }            // key `${employeeId}|${date}`. SINGLE source of truth
interface Rules {
  maxHoursPerWeek: number; minRestHours: number; maxConsecutiveDays: number
  enabled: Record<ConstraintId, boolean>                               // H1..S5 toggles
  weights: Record<SoftId, number>                                      // S1..S5
}
```

- Real ISO calendar dates (`YYYY-MM-DD`), not `absDay`. `calendar/` derives dow/week/weekend/period iteration.
- Demo data lives **outside** the domain core (a seed module that constructs valid entities), not inside it.

### 5a. Multi-week model rules (this is a model REWRITE, not a port)
The legacy `src/solver/model.js` is hard-wired to a single 7-day week (day idx 0–6, `H3` loops `d<6`, one `H2` row, single-week fairness counters). v2 must:
- **H2 per ISO-week bucket.** The period is bucketed into ISO weeks (Mon-anchored). H2 emits one hours-cap row **per (employee, week bucket)**. **Partial leading/trailing weeks: full cap applies** (no pro-rating) — simplest, predictable; revisit only if asked.
- **H3 spans week boundaries.** Rest checks run over **consecutive calendar dates** across the whole period, including Sun→Mon. The `d<6` skip is gone.
- **S1/S4 fairness aggregate over the whole period**, not per week. Night/weekend counters span all period dates.

### 5b. StoragePort serialization contract (data-loss class — make it explicit)
`Schedule.assignments` is a `Map` in-domain but **serializes as `Assignment[]`** (Maps don't JSON-serialize); the Map is rebuilt on load. `StoragePort` exchanges **plain-JSON DTOs only** — domain emits/accepts DTOs, adapter owns no schema. Round-trip must be lossless: `save(state)` then `load()` yields a deep-equal domain state (Map keys, ISODate fields, `Rules.enabled`/`weights` all intact). No `Map`/`Set` degrading to `{}` (the historical bug).

## 6. Constraints

Each constraint is one pure function in `domain/constraints/`, consumed by **both** the live violation-checker (manual edits) and the solver model build — one definition, two callers. This is what kills the two-solvers duplication.

**Hard**

| ID | Meaning |
|---|---|
| H1 | For each `(team, shift, date)`: `min ≤ Σ(that team's employees assigned to that shift that date) ≤ max`. Counts **only** the team's own employees. `dateOverrides[date]` precedes `byDow[dow]` |
| H2 | ≤ maxHoursPerWeek (global or per-employee contract), per week within period |
| H3 | ≥ minRestHours between consecutive shifts |
| H4 | One shift per day |
| H5 | Time-off + recurring unavailability respected |
| H6 | Only eligible shifts assigned |

**Soft** (weighted, tunable, toggleable), scored across the whole period:

| ID | Goal |
|---|---|
| S1 | Night-shift fairness |
| S2 | Preference satisfaction |
| S3 | Stability (minimal change vs current schedule) |
| S4 | Weekend fairness |
| S5 | Sequence smoothness |

Exact vs approximate (carried from current solver knowledge): S1/S4 fairness are min–max-spread linearizations; S5 is curated/omittable.

## 7. Solver (hexagonal)

- `domain/solver/` pure: `buildModel(...) → { lp, meta }`, `scoreTerms`, `mapSolution(solution, meta) → Assignment[]`, `deriveConflictCore(model) → relaxations[]`. No WASM; fully unit-testable.
- **Shared index map (kills the mis-attribution bug class).** `buildModel` returns `meta` carrying the bidirectional maps `employeeId↔denseInt`, `ISODate↔denseInt`, `shiftId↔code`. `mapSolution` **consumes the same `meta`** and never re-derives ordering. This is the structural guarantee that solver output is attributed to the correct employee/date.
- **Truthful infeasible only.** Port the *real* infeasible diagnostic (generalized `realInfeasibleDiagnostic`) operating on actual coverage/forced cells. The legacy **demo-injected infeasibility** (`buildInfeasibleReqOverride`, fabricated "Night requires N" core, hardcoded `'N'`) is **deleted / out of scope**. Surviving relaxations: lower a team's coverage min for a date, drop an H3 pair for volunteers, unpin cells.
- **`scoreTerms` parity.** HiGHS drops the LP objective constant, so `penalty`/`prevPenalty` are recomputed via `scoreTerms`. The proposal contract `{ id, changes[], fairness, prevFairness, penalty, prevPenalty, breakdown[] }` is preserved.
- `domain/ports/SolverPort`: `solve(lp) → Solution | Infeasible`.
- `app/adapters/HighsSolverAdapter`: owns the Web Worker + highs-wasm, implements `SolverPort`.
- **Flow:** user clicks Solve → store calls `buildModel` (domain) → `SolverPort.solve` (adapter/worker) → `mapSolution` (domain) → diff vs current `Schedule` → proposal → user accepts/rejects cells → apply writes assignments.
- `makeProposal()` fake path is **deleted**.
- Cell pinning before solve is **kept** (pinned cells locked as fixed vars).

## 8. Design tokens, version, changelog

### 8a. Tokens — reuse verbatim
`tokens.css` (`--sf-*`, `--sh-{N|E|M|A|L}-*` shift colors, scan-line animation, dark-theme vars) carried into `app/` unchanged. Rebuild is structure + domain, **not** a visual redesign. The new `app/src/ui/` kit consumes the same token contract; Tailwind maps to the same custom properties. No token renames.

### 8b. Version badge — sync, don't hardcode
- Delete hardcoded `v4` in `Sidebar.jsx`.
- Single source of version = `app/package.json` `version`.
- Vite injects `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`; badge renders `v<version>`. Declare the global in `app/src/vite-env.d.ts` (`declare const __APP_VERSION__: string`) so `.tsx` compiles.
- Bumping the version (via Changesets) updates the badge automatically. No drift.

### 8c. Changelog — Changesets
- `@changesets/cli`, configured for the pnpm monorepo.
- `pnpm changeset` records a change intent (`.changeset/*.md`); `pnpm changeset version` bumps `package.json` and writes `CHANGELOG.md` per package.
- Version badge (8b) and CHANGELOG stay in lockstep.

## 9. Migration approach

Greenfield monorepo scaffold; port logic across in dependency order — **not** in-place edits to the rotten tree. Old `src/` stays runnable until the new app reaches parity.

1. **Scaffold** pnpm + turbo; empty `packages/domain` + `app`; wire vitest/CI; add Changesets.
2. **Domain bottom-up (TDD):** entities → calendar → schedule → constraints → export → solver model. Port real logic from `src/solver/*` and `checkViolations`; rewrite the rest. Each layer ships green before the next.
3. **App adapters:** `HighsSolverAdapter` (worker+wasm), `IdbStorageAdapter` (IndexedDB) against domain ports.
4. **Rebuild UI** feature-by-feature on the typed domain: board → config → solve panel → onboarding → export. Carry `tokens.css`, port i18n/a11y baseline.
5. **Cut over:** reach parity, delete old `src/`.

## 10. Onboarding (locked for v2)

Minimal wizard, ordered: **org → teams → shifts (with `isNight`) → coverage (per team×shift, byDow) → employees (team, eligibility, contract) → rules**. Plus **Load Demo** which seeds a complete, **feasible/solvable** org (fastest end-to-end smoke test). "Parity" in §9 step 5 = onboarding can produce a usable state AND Load Demo solves.

Remaining open minors (non-blocking): fairness carry-in from a prior period (lean: within-period only, YAGNI); version badge shown vs hidden by default (wired either way).

## 11. Out of scope

Roles/auth, request & approval workflows, consent-based swaps, ripple analysis, multi-company/tenanting, server/backend, xlsx/PDF export (CSV only for v2).

## 12. Acceptance criteria (testable)

```
AC-1   Monorepo: `pnpm install && pnpm -w build` and `pnpm -w test` exit 0;
       turbo builds domain before app (dependency order honored).
AC-2   Domain purity: packages/domain/src imports zero react/react-dom/DOM/
       window/IndexedDB/highs/wasm/Worker. Enforced by lint rule or grep test.
AC-3   Dependency direction: app imports @crewdoku/domain; domain imports nothing
       from app. Verified by an import-boundary check.
AC-4   Identity: every entity carries a stable nanoid id; no domain fn takes or
       returns an array index as identity.
AC-5   Safe delete: removing a middle employee leaves all other employees'
       assignments/prefs/time-off/pins intact and correctly attributed.
AC-6   Single source of truth: exactly one schedule (Assignment list/Map); no
       baseAssign() hash baseline (grep test); scratch employees resolve empty.
AC-7   Multi-week solve: Period{weeks>=2} builds ONE model over all dates; H2 is
       enforced per ISO-week bucket; partial-week = full cap.
AC-8   H3 across week boundary: a Sun->Mon pair violating minRestHours is flagged
       by the live checker AND made infeasible by the model.
AC-9   Coverage per team: H1 enforces min<=count<=max per (team,shift,date)
       counting only that team's employees; dateOverride precedes byDow.
AC-10  Two-level eligibility: employee.eligibleShiftIds defaults to team.shiftIds,
       may narrow; H6 never assigns an ineligible shift.
AC-11  Constraints toggleable: H1-H6 + S1-S5 each a pure fn; enabled[id]=false
       removes it from model+checker; weights[Sx] changes the objective term.
AC-12  Night fairness keys off Shift.isNight (not literal 'N'); S1 works for an
       org whose night shift code is not "N".
AC-13  scoreTerms parity: penalty/prevPenalty recomputed via scoreTerms; proposal
       shape {id,changes[],fairness,prevFairness,penalty,prevPenalty,breakdown[]}
       preserved.
AC-14  Solver round-trip: buildModel returns meta; mapSolution consumes the SAME
       meta and attributes a known HiGHS column set to the correct
       employeeId+date.
AC-15  Solver split: domain/solver is pure (unit-runs in vitest/node, no WASM);
       HighsSolverAdapter in app is the only home of Worker+wasm.
AC-16  Proposal diff: solve -> diff vs current Schedule -> per-cell accept/reject
       -> apply writes only accepted cells; makeProposal path does not exist.
AC-17  Infeasible flow: a genuinely infeasible input yields a truthful conflict
       core + >=1 applicable relaxation; applying it then re-solving is feasible.
AC-18  CSV team export: grid rows=employees x cols=dates, shift code per cell;
       UTF-8, quoted fields.
AC-19  CSV member export: one row per scheduled date [date,dow,shiftCode,start,
       end,hours] for a single employee id.
AC-20  Tokens verbatim: app/tokens.css byte-identical to source tokens.css; no
       --sf-*/--sh-* renames (checksum/diff test).
AC-21  Version badge: rendered text equals "v"+app/package.json version; no
       hardcoded "v4" (grep test).
AC-22  Changesets wired: .changeset/config.json exists; `pnpm changeset version`
       bumps app/package.json and writes CHANGELOG.md.
AC-23  Persistence round-trip: StoragePort save(state) then load() deep-equals
       domain state (Map keys, ISODate fields, Rules.enabled/weights); no Map/Set
       -> {} degradation.
AC-24  Old app guard: legacy src/ still boots via dev until cutover; src/ deleted
       only after AC-1..23 green and Load-Demo solves.
```
