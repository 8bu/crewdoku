# Domain Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `packages/domain` (`@crewdoku/domain`) workspace package into **seven** unscoped TS-source workspace packages under `domains/` (`calendar`, `scheduling`, `constraints`, `solver`, `export`, `seed`, `ports`), with strict per-package app imports and an acyclic `app → domains` graph.

**Architecture:** This is a **pure mechanical refactor — zero behavior change, zero logic change**. Files move; relative cross-folder imports that cross a new package boundary become package-name imports; intra-package imports stay relative. The 204-test suite (85 domain — which INCLUDES the domain smoke test — + 119 app) is the safety net — moving a layer then running its tests is the red/green signal. No new feature tests are written; the only NEW test logic is the strengthened `no-app-import` walking guard (D5) which converts AC-4/AC-5 from a manual grep into CI and adds exactly one assertion → final expected total **205** (both smoke tests preserved, no test deleted).

**Tech Stack:** pnpm 9 + Turborepo monorepo, TypeScript 5.5 (strict, `noUncheckedIndexedAccess`, `moduleResolution: Bundler`), Vitest 2 (node env for domains, jsdom for app), Vite 5 (app bundler), Changesets. Packages ship raw `./src/index.ts` (no build/dist).

---

## Ground truth captured from the repo (do not re-derive)

**Root configs today:**
- `pnpm-workspace.yaml`: `packages: ["packages/*", "app"]`
- `turbo.json`: tasks `build` (`dependsOn ^build`, outputs `dist/**`), `test` (`dependsOn ^build`), `lint` (no deps)
- `vitest.workspace.ts`: `defineWorkspace(['packages/*', 'app'])`
- `tsconfig.base.json`: shared opts incl. `"declaration": true` (harmless under `--noEmit`); **leave unchanged**
- root `package.json` `clean` script references `packages/domain/dist`
- `.changeset/config.json` exists at repo root (depth check below)

**Current domain barrel** `packages/domain/src/index.ts` exports `VERSION_MARKER = 'crewdoku-domain'` plus `export *` from every module.

**`scheduling` absorbs `entities/` + `schedule/` + `ids.ts`.** If you PRESERVE these sub-folders inside `domains/scheduling/src/`, then ALL of `scheduling`'s internal source imports stay byte-identical (they already use `../entities/types`, `../ids`, `../schedule/schedule`). **This plan preserves the folder structure to minimize churn.** Same for `solver` (keeps `solver/`-relative imports like `../model`) and `constraints`.

**Intra-package relative imports that STAY unchanged (same package):**
- `scheduling`: `factories.ts → ../ids`; `schedule.ts`/`dto.ts → ../entities/types`
- `constraints`: `soft.ts`/`hard.ts → ../schedule/...`? **NO** — `schedule` is in `scheduling` now → these become cross-package (see below)
- `solver`: `mapSolution.ts → ../model` (`./model` after flatten — kept relative as `./model` / `../model` within `solver/src`); `proposal.ts`/`conflict.ts`/`model.ts` → `../constraints/context`? cross-package.

**Cross-package source-import rewrites required (authoritative, from grep of `packages/domain/src/**/*.ts` non-test):**

| File (new location) | Old import | New import |
|---|---|---|
| `domains/calendar/src/calendar.ts` | `import type { ISODate, Period } from '../entities/types'` | **DELETE** — replace with local type aliases (D2, see Task 3) |
| `domains/constraints/src/context.ts` | `from '../calendar/calendar'` (`dow`) | `from 'calendar'` |
| `domains/constraints/src/context.ts` | `from '../entities/factories'` (`makeRules`) | `from 'scheduling'` |
| `domains/constraints/src/context.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/constraints/src/hard.ts` | `from '../calendar/calendar'` (`dow, eachDate, isoWeekKey`) | `from 'calendar'` |
| `domains/constraints/src/hard.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/constraints/src/hard.ts` | `from '../schedule/schedule'` (`assignmentsFor, getAssignment`, `Schedule`) | `from 'scheduling'` |
| `domains/constraints/src/soft.ts` | `from '../calendar/calendar'` (`eachDate, isWeekend`) | `from 'calendar'` |
| `domains/constraints/src/soft.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/constraints/src/soft.ts` | `from '../schedule/schedule'` (`getAssignment`, `Schedule`) | `from 'scheduling'` |
| `domains/constraints/src/registry.ts` | `from '../entities/types'` (`Period, SoftId`) | `from 'scheduling'` |
| `domains/constraints/src/registry.ts` | `from '../schedule/schedule'` (`Schedule`, `makeSchedule`) | `from 'scheduling'` |
| `domains/ports/src/ports.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/export/src/csv.ts` | `from '../calendar/calendar'` (`dow, eachDate`) | `from 'calendar'` |
| `domains/export/src/csv.ts` | `from '../constraints/context'` (`SolveContext`) | `from 'constraints'` |
| `domains/export/src/csv.ts` | `from '../schedule/schedule'` (`getAssignment`, `Schedule`) | `from 'scheduling'` |
| `domains/export/src/csv.ts` | `from '../entities/types'` (`ID, Period`) | `from 'scheduling'` |
| `domains/seed/src/demo.ts` | `from '../calendar/calendar'` (`eachDate, dow`) | `from 'calendar'` |
| `domains/seed/src/demo.ts` | `from '../entities/factories'` (make*) | `from 'scheduling'` |
| `domains/seed/src/demo.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/seed/src/demo.ts` | `from '../ports/ports'` (`AppStateDTO`) | `from 'ports'` |
| `domains/solver/src/score.ts` | `from '../entities/types'` (`Period`) | `from 'scheduling'` |
| `domains/solver/src/score.ts` | `from '../schedule/schedule'` (`Schedule`) | `from 'scheduling'` |
| `domains/solver/src/score.ts` | `from '../constraints/registry'` (`scoreSoft`, `SoftBreakdown`) | `from 'constraints'` |
| `domains/solver/src/score.ts` | `from '../constraints/context'` (`SolveContext`) | `from 'constraints'` |
| `domains/solver/src/model.ts` | `from '../calendar/calendar'` (`dow, eachDate, isoWeekKey, isWeekend`) | `from 'calendar'` |
| `domains/solver/src/model.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/solver/src/model.ts` | `from '../schedule/schedule'` (`Schedule`, `getAssignment`) | `from 'scheduling'` |
| `domains/solver/src/model.ts` | `from '../constraints/context'` (`SolveContext`) | `from 'constraints'` |
| `domains/solver/src/mapSolution.ts` | `from '../entities/types'` (`Assignment`) | `from 'scheduling'` |
| `domains/solver/src/mapSolution.ts` | `from '../ports/ports'` (`Solution`) | `from 'ports'` |
| `domains/solver/src/proposal.ts` | `from '../calendar/calendar'` (`eachDate, isWeekend`) | `from 'calendar'` |
| `domains/solver/src/proposal.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/solver/src/proposal.ts` | `from '../schedule/schedule'` (`getAssignment, makeSchedule, setAssignment`, `Schedule`) | `from 'scheduling'` |
| `domains/solver/src/proposal.ts` | `from '../constraints/context'` (`SolveContext`) | `from 'constraints'` |
| `domains/solver/src/conflict.ts` | `from '../calendar/calendar'` (`dow, eachDate`) | `from 'calendar'` |
| `domains/solver/src/conflict.ts` | `from '../entities/types'` (types) | `from 'scheduling'` |
| `domains/solver/src/conflict.ts` | `from '../schedule/schedule'` (`getAssignment`, `Schedule`) | `from 'scheduling'` |
| `domains/solver/src/conflict.ts` | `from '../constraints/context'` (`SolveContext`) | `from 'constraints'` |

**Solver local imports (verified):** all five solver files become flat siblings in `domains/solver/src/`. Their solver-to-solver imports already use `'./'` (e.g. `mapSolution.ts` → `import type { ModelMeta } from './model'`; `conflict.ts` → `'./model'`; `proposal.ts` → `'./score'`). These stay unchanged — only cross-package `'../...'` imports are rewritten. (Solver TESTS in `__tests__/` reach local sources via `'../model'` etc. — one level up to `src/` — which is correct and also stays unchanged.)

**Cross-package TEST-import rewrites required (from grep of `**/__tests__/*.test.ts`):** the same package-boundary rule applies to test files. Tests inside a package that import a SIBLING package must use the package name. Captured set:
- `constraints/__tests__/*` (`context`, `hard`, `registry`, `soft`): `from '../../entities/factories'` → `from 'scheduling'`; `from '../../schedule/schedule'` → `from 'scheduling'`.
- `solver/__tests__/*` (`model`, `conflict`, `mapSolution`, `score`, `proposal`): `from '../../entities/factories'` → `scheduling`; `from '../../schedule/schedule'` → `scheduling`; `from '../../constraints/context'` → `constraints`; `from '../../constraints/registry'` → `constraints`; `from '../../calendar/calendar'` → `calendar`. (Keep `from '../model'` etc. — same package.)
- `export/__tests__/csv.test.ts`: `from '../../entities/factories'` → `scheduling`; `from '../../constraints/context'` → `constraints`; `from '../../schedule/schedule'` → `scheduling`.
- `seed/__tests__/demo.test.ts`: `from '../../constraints/context'` → `constraints`; `from '../../constraints/registry'` → `constraints`; `from '../../schedule/schedule'` → `scheduling`.

**App import rewrites:** 32 files match `grep -rl "@crewdoku/domain" app/src`. Use the spec §4 symbol→package map. A single `import { ... } from '@crewdoku/domain'` that pulls symbols from >1 package must be SPLIT into one statement per owning package.

**`.changeset` depth:** `packages/domain/src/__tests__/changeset-config.test.ts` resolves `../../../../.changeset/config.json` (4 levels up from `src/__tests__/`). New location `domains/<pkg>/src/__tests__/` is the SAME 4 levels deep, so the relative path is unchanged.

---

## File structure (target)

```
domains/
├── calendar/
│   ├── package.json · tsconfig.json · vitest.config.ts
│   └── src/
│       ├── index.ts                 (barrel)
│       ├── calendar.ts              (local ISODate/Period aliases; was calendar/calendar.ts)
│       └── __tests__/calendar.test.ts
├── scheduling/
│   ├── package.json (dep: nanoid) · tsconfig.json · vitest.config.ts
│   └── src/
│       ├── index.ts                 (barrel; exports VERSION_MARKER)
│       ├── ids.ts
│       ├── entities/types.ts · entities/factories.ts
│       ├── schedule/schedule.ts · schedule/dto.ts
│       └── __tests__/ids.test.ts · __tests__/purity.test.ts · __tests__/no-app-import.test.ts · __tests__/changeset-config.test.ts · __tests__/smoke.test.ts (relocated domain smoke)
│       └── entities/__tests__/{types,factories}.test.ts · schedule/__tests__/{schedule,dto}.test.ts
├── ports/        (dep: scheduling)        src/{index.ts, ports.ts, __tests__/ports.test.ts}
├── constraints/  (deps: calendar, scheduling)   src/{index.ts, context.ts, hard.ts, soft.ts, registry.ts, __tests__/*}
├── export/       (deps: calendar, scheduling, constraints)  src/{index.ts, csv.ts, __tests__/csv.test.ts}
├── solver/       (deps: calendar, scheduling, constraints, ports)  src/{index.ts, model.ts, score.ts, mapSolution.ts, proposal.ts, conflict.ts, __tests__/*}
└── seed/         (deps: calendar, scheduling, ports)  src/{index.ts, demo.ts, __tests__/demo.test.ts}
```

Topological build/move order (leaves first): **calendar, scheduling → ports → constraints → export, solver, seed.**

**Guard-test homes (D5):** `purity.test.ts`, the strengthened `no-app-import.test.ts`, `changeset-config.test.ts`, and `ids.test.ts` all live in `domains/scheduling/src/__tests__/`. The purity + no-app-import walkers are rewritten to walk **all of `domains/*`** (a sibling-relative walk from `scheduling/src/__tests__/` up to `domains/`), so they cover all 7 packages from one location.

**Two smoke tests (do not lose either):** the repo has TWO smoke tests today —
(a) `app/src/__tests__/smoke.test.ts` (an APP test; imports `VERSION_MARKER` from `@crewdoku/domain`) and
(b) `packages/domain/src/__tests__/smoke.test.ts` (a DOMAIN test, part of the 85; imports `VERSION_MARKER` from `'../index'`).
The app smoke (a) STAYS in `app/src/__tests__/` and re-points its import to `scheduling` (Task 14). The domain smoke (b) MUST be RELOCATED to `domains/scheduling/src/__tests__/smoke.test.ts` and re-pointed to scheduling's barrel (Task 13) — otherwise it is silently deleted with `packages/domain` (violating AC-3). Both smokes survive the refactor.

---

## TDD note for this refactor

There is **no new behavior**, so there are no new feature tests. The existing suite IS the test. The rhythm per layer is therefore inverted from classic TDD: **move the code + its tests, fix imports, run that package's tests, see them go green.** A red result means an import was missed or a boundary edge is wrong — fix and re-run before moving on. The only genuinely-new test code is the strengthened `no-app-import` walking guard (Task 13), which you should see FAIL if you deliberately plant a `@crewdoku/domain` import in a domain file, then PASS once removed.

---

## Task 1: Create branch-safe checkpoint baseline (record current green)

**Files:** none (read-only verification).

- [ ] **Step 1: Confirm the suite is green BEFORE touching anything**

Run: `corepack enable pnpm && pnpm install && pnpm test 2>&1 | tail -40`
Expected: turbo runs `@crewdoku/domain` (85 tests) and `@crewdoku/app` (119 tests) — **204 passed, 0 failed**. Record the exact per-package counts; they must not regress.

- [ ] **Step 2: Confirm baseline lint is green**

Run: `pnpm lint 2>&1 | tail -20`
Expected: exit 0, 0 type errors.

> Rollback note: everything is git-tracked on branch `ui/match-prototype`. Each task below is a committable checkpoint, but **do NOT commit** — committing is the user's call. If a task goes irrecoverably wrong, `git checkout -- .` / `git clean -fd domains` restores the pre-task state.

---

## Task 2: Scaffold the 7 package skeletons (dirs, package.json, tsconfig, vitest.config, empty barrels)

This keeps the repo "almost compilable": the new packages exist and link, but are empty barrels until files move in. `packages/domain` stays intact and authoritative until Task 12.

**Files (create all):**
- `domains/{calendar,scheduling,constraints,solver,export,seed,ports}/package.json`
- `domains/{...}/tsconfig.json`
- `domains/{...}/vitest.config.ts`
- `domains/{...}/src/index.ts` (empty barrel: `export {}`)

- [ ] **Step 1: Create directories**

```bash
cd /Users/8bu/Projects/shiftforge
for p in calendar scheduling constraints solver export seed ports; do
  mkdir -p "domains/$p/src/__tests__"
done
```

- [ ] **Step 2: Write each `package.json`** (per spec §6 / D3 — no `build` script, `lint` is project-mode `tsc`)

`domains/calendar/package.json`:
```json
{
  "name": "calendar",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`domains/scheduling/package.json` (adds `nanoid`):
```json
{
  "name": "scheduling",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "nanoid": "^5.0.0" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`domains/ports/package.json` (dep: scheduling):
```json
{
  "name": "ports",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "scheduling": "workspace:*" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`domains/constraints/package.json` (deps: calendar, scheduling):
```json
{
  "name": "constraints",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "calendar": "workspace:*", "scheduling": "workspace:*" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`domains/export/package.json` (deps: calendar, scheduling, constraints):
```json
{
  "name": "export",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "calendar": "workspace:*", "scheduling": "workspace:*", "constraints": "workspace:*" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`domains/solver/package.json` (deps: calendar, scheduling, constraints, ports):
```json
{
  "name": "solver",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "calendar": "workspace:*", "scheduling": "workspace:*", "constraints": "workspace:*", "ports": "workspace:*" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`domains/seed/package.json` (runtime deps: calendar, scheduling, ports; **test-only devDep: constraints**):
```json
{
  "name": "seed",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "calendar": "workspace:*", "scheduling": "workspace:*", "ports": "workspace:*" },
  "devDependencies": { "constraints": "workspace:*", "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```
> **Why `constraints` here (Blocker fix):** under strict pnpm isolation (no `shamefully-hoist`), an UNDECLARED `from 'constraints'` specifier fails Vitest module resolution at `pnpm --filter seed test` — not merely lint. `seed/__tests__/demo.test.ts` imports `buildContext`/`runHardChecks` from `'constraints'` to assert zero hard violations, so it MUST be declared. It lives in `devDependencies` because it is **test-only** — the runtime `demo.ts` does NOT import constraints. This does NOT add a runtime edge: spec §3.2's runtime edge list correctly omits seed→constraints, and AC-6 acyclicity is unaffected because `constraints` does not depend on `seed`.

- [ ] **Step 3: Write each `tsconfig.json`** (identical content for all 7 — `extends ../../tsconfig.base.json`, NO `outDir`/`rootDir` per D3)

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 4: Write each `vitest.config.ts`** (identical for all 7 — node env, mirrors old domain config)

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 5: Write each empty barrel** `domains/<pkg>/src/index.ts`

```ts
export {}
```

- [ ] **Step 6: Verify scaffold shape**

Run: `find domains -maxdepth 3 -type f | sort`
Expected: 7 × (`package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`) = 28 files.

> No install yet — `pnpm-workspace.yaml` still points at `packages/*`. Linking happens in Task 4.

---

## Task 3: Move `calendar` (leaf, no deps) + apply D2 local type aliases

**Files:**
- Move: `packages/domain/src/calendar/calendar.ts` → `domains/calendar/src/calendar.ts`
- Move: `packages/domain/src/calendar/__tests__/calendar.test.ts` → `domains/calendar/src/__tests__/calendar.test.ts`
- Modify: `domains/calendar/src/calendar.ts` (replace cross-package type import with local aliases)
- Write: `domains/calendar/src/index.ts` (barrel)

- [ ] **Step 1: Move the source + test files (git mv to preserve history)**

```bash
cd /Users/8bu/Projects/shiftforge
git mv packages/domain/src/calendar/calendar.ts domains/calendar/src/calendar.ts
git mv packages/domain/src/calendar/__tests__/calendar.test.ts domains/calendar/src/__tests__/calendar.test.ts
```

- [ ] **Step 2: Apply D2 — replace the cross-package type import with local aliases**

In `domains/calendar/src/calendar.ts`, the first line is:
```ts
import type { ISODate, Period } from '../entities/types'
```
The EXACT source definitions (verified from `entities/types.ts`) are:
```ts
export type ISODate = string // YYYY-MM-DD
export interface Period {
  startDate: ISODate
  weeks: number
}
```
Replace the import line with these local declarations verbatim (D2 — keep `calendar` a zero-dependency leaf):
```ts
// Local structural aliases (D2): keep `calendar` a zero-dependency leaf.
export type ISODate = string // YYYY-MM-DD
export interface Period {
  startDate: ISODate
  weeks: number
}
```
> These are structural types (string + `{startDate, weeks}`), so duplication is behavior-neutral. If `calendar.test.ts` imported `ISODate`/`Period` from the old `../entities/types` path, update it to import from `'../calendar'` (now local). Note: `calendar` now EXPORTS its own `ISODate`/`Period` via its barrel — the app must still import these two types from `scheduling` per §4 (do NOT switch app call sites to `calendar`); both packages expose structurally-identical aliases, and §4 is authoritative.

- [ ] **Step 3: Verify the test file's imports resolve locally**

Run: `grep -n "from '" domains/calendar/src/__tests__/calendar.test.ts`
Expected: only `vitest` and `../calendar` (or `from '../calendar'`). No `../entities`, no `'calendar'` self-import. Fix any stale path to `../calendar`.

- [ ] **Step 4: Write the barrel** `domains/calendar/src/index.ts`

```ts
export * from './calendar'
```

- [ ] **Step 5: Defer running — calendar tests run after install (Task 4 Step 3).**

> `pnpm` hasn't relinked workspaces yet; the standalone `vitest run` works but resolving `from 'calendar'` in later packages requires the symlink. Calendar itself has no cross-package imports, so you MAY smoke it now: `cd domains/calendar && npx vitest run 2>&1 | tail -15` → expect calendar tests pass. Then `cd /Users/8bu/Projects/shiftforge`.

---

## Task 4: Wire workspace globs + vitest workspace, then install to relink

Do this immediately after the first package moves so subsequent `from 'calendar'`/`from 'scheduling'` cross-package imports resolve via symlinks.

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.workspace.ts`

- [ ] **Step 1: Update `pnpm-workspace.yaml`**

Replace contents with:
```yaml
packages:
  - "domains/*"
  - "app"
```

- [ ] **Step 2: Update `vitest.workspace.ts`**

Replace contents with:
```ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'domains/*',
  'app',
])
```

- [ ] **Step 3: Install to create workspace symlinks**

Run: `corepack enable pnpm && pnpm install 2>&1 | tail -20`
Expected: install succeeds; `domains/*` packages are linked. **Note (resolvability):** this install removes `packages/domain` from the workspace (the glob now points at `domains/*`), so under strict pnpm the `node_modules/@crewdoku/domain` symlink is PRUNED here. From this point the app's `@crewdoku/domain` imports no longer resolve — this is intentional and accepted: the app is not linted/tested again until after Task 15. The packages/domain SOURCE still exists on disk (deleted in Task 12); do not depend on a stale symlink. See the resolvability note in Self-review.

Verify the 7 symlinks exist:
```bash
ls -la node_modules/calendar node_modules/scheduling node_modules/ports node_modules/constraints node_modules/export node_modules/solver node_modules/seed 2>&1
```
Expected: each is a symlink into `domains/<pkg>`.

- [ ] **Step 4: Verify calendar package tests pass under the workspace**

Run: `pnpm --filter calendar test 2>&1 | tail -15`
Expected: calendar's tests pass (count matches the old `calendar/__tests__/calendar.test.ts`).

---

## Task 5: Move `scheduling` (leaf) — entities + ids + schedule + VERSION_MARKER + guard-test homes

`scheduling` preserves sub-folders (`entities/`, `schedule/`, `ids.ts`) so its internal imports stay byte-identical. It also becomes the home of the relocated guard tests.

**Files:**
- Move: `packages/domain/src/ids.ts` → `domains/scheduling/src/ids.ts`
- Move: `packages/domain/src/entities/{types,factories}.ts` → `domains/scheduling/src/entities/`
- Move: `packages/domain/src/entities/__tests__/{types,factories}.test.ts` → `domains/scheduling/src/entities/__tests__/`
- Move: `packages/domain/src/schedule/{schedule,dto}.ts` → `domains/scheduling/src/schedule/`
- Move: `packages/domain/src/schedule/__tests__/{schedule,dto}.test.ts` → `domains/scheduling/src/schedule/__tests__/`
- Move: `packages/domain/src/__tests__/ids.test.ts` → `domains/scheduling/src/__tests__/ids.test.ts`
- Write: `domains/scheduling/src/index.ts` (barrel, exports `VERSION_MARKER`)

- [ ] **Step 1: Create sub-dirs and move files**

```bash
cd /Users/8bu/Projects/shiftforge
mkdir -p domains/scheduling/src/entities/__tests__ domains/scheduling/src/schedule/__tests__
git mv packages/domain/src/ids.ts domains/scheduling/src/ids.ts
git mv packages/domain/src/entities/types.ts domains/scheduling/src/entities/types.ts
git mv packages/domain/src/entities/factories.ts domains/scheduling/src/entities/factories.ts
git mv packages/domain/src/entities/__tests__/types.test.ts domains/scheduling/src/entities/__tests__/types.test.ts
git mv packages/domain/src/entities/__tests__/factories.test.ts domains/scheduling/src/entities/__tests__/factories.test.ts
git mv packages/domain/src/schedule/schedule.ts domains/scheduling/src/schedule/schedule.ts
git mv packages/domain/src/schedule/dto.ts domains/scheduling/src/schedule/dto.ts
git mv packages/domain/src/schedule/__tests__/schedule.test.ts domains/scheduling/src/schedule/__tests__/schedule.test.ts
git mv packages/domain/src/schedule/__tests__/dto.test.ts domains/scheduling/src/schedule/__tests__/dto.test.ts
git mv packages/domain/src/__tests__/ids.test.ts domains/scheduling/src/__tests__/ids.test.ts
```

- [ ] **Step 2: Verify NO import rewrites needed inside scheduling**

Run: `grep -rn "from '\.\." domains/scheduling/src` 
Expected: only intra-package relatives — `factories.ts → '../ids'`; `schedule.ts`/`dto.ts → '../entities/types'`; tests → `'../ids'`, `'../types'`/`'../factories'`, `'../schedule'`/`'../dto'`. NONE should reference `calendar`, `constraints`, etc. (entities/ids/schedule had no cross-folder deps except calendar→entities which moved with calendar in Task 3). If any line references a now-foreign path, STOP — re-check the move.

- [ ] **Step 3: Write the barrel** `domains/scheduling/src/index.ts` (carries `VERSION_MARKER`, D1)

```ts
export const VERSION_MARKER = 'crewdoku-domain'

export * from './ids'
export * from './entities/types'
export * from './entities/factories'
export * from './schedule/schedule'
export * from './schedule/dto'
```

- [ ] **Step 4: Run scheduling tests**

Run: `pnpm --filter scheduling test 2>&1 | tail -20`
Expected: ids + entities(types,factories) + schedule(schedule,dto) tests pass.
> The relocated purity/no-app-import/changeset guards are NOT yet here (Task 13). This run only covers the moved unit tests.

---

## Task 6: Move `ports` (← scheduling)

**Files:**
- Move: `packages/domain/src/ports/ports.ts` → `domains/ports/src/ports.ts`
- Move: `packages/domain/src/ports/__tests__/ports.test.ts` → `domains/ports/src/__tests__/ports.test.ts`
- Modify: `domains/ports/src/ports.ts` (entities/types import → `scheduling`)
- Write: `domains/ports/src/index.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/8bu/Projects/shiftforge
git mv packages/domain/src/ports/ports.ts domains/ports/src/ports.ts
git mv packages/domain/src/ports/__tests__/ports.test.ts domains/ports/src/__tests__/ports.test.ts
```

- [ ] **Step 2: Rewrite the cross-package import in `ports.ts`**

Change the multi-line type import that ends in `} from '../entities/types'` to `} from 'scheduling'`. (It imports `Assignment, Coverage, Employee, Org, Rules, Shift, Team` types.) Verify no other `../` import remains:
Run: `grep -n "from '\.\." domains/ports/src/ports.ts`
Expected: nothing.

- [ ] **Step 3: Check the test file's imports**

Run: `grep -n "from '" domains/ports/src/__tests__/ports.test.ts`
Expected: `vitest` + `../ports` (and possibly `scheduling` if it referenced entity types — rewrite any `../../entities/...` → `scheduling`).

- [ ] **Step 4: Write the barrel** `domains/ports/src/index.ts`

```ts
export * from './ports'
```

- [ ] **Step 5: Run ports tests**

Run: `pnpm --filter ports test 2>&1 | tail -15`
Expected: ports tests pass (cross-package `scheduling` resolves via symlink from Task 4).

---

## Task 7: Move `constraints` (← calendar, scheduling)

**Files:**
- Move: `packages/domain/src/constraints/{context,hard,soft,registry}.ts` → `domains/constraints/src/`
- Move: `packages/domain/src/constraints/__tests__/*` → `domains/constraints/src/__tests__/`
- Modify: all 4 source files + the 4 test files (cross-package import rewrites per the table above)
- Write: `domains/constraints/src/index.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/8bu/Projects/shiftforge
git mv packages/domain/src/constraints/context.ts domains/constraints/src/context.ts
git mv packages/domain/src/constraints/hard.ts domains/constraints/src/hard.ts
git mv packages/domain/src/constraints/soft.ts domains/constraints/src/soft.ts
git mv packages/domain/src/constraints/registry.ts domains/constraints/src/registry.ts
git mv packages/domain/src/constraints/__tests__/context.test.ts domains/constraints/src/__tests__/context.test.ts
git mv packages/domain/src/constraints/__tests__/hard.test.ts domains/constraints/src/__tests__/hard.test.ts
git mv packages/domain/src/constraints/__tests__/soft.test.ts domains/constraints/src/__tests__/soft.test.ts
git mv packages/domain/src/constraints/__tests__/registry.test.ts domains/constraints/src/__tests__/registry.test.ts
```

- [ ] **Step 2: Rewrite source imports** (apply each row of the table for `constraints/src/*`)

In `context.ts`: `'../calendar/calendar'` → `'calendar'`; `'../entities/factories'` → `'scheduling'`; `'../entities/types'` → `'scheduling'`.
In `hard.ts`: `'../calendar/calendar'` → `'calendar'`; `'../entities/types'` → `'scheduling'`; `'../schedule/schedule'` → `'scheduling'`.
In `soft.ts`: `'../calendar/calendar'` → `'calendar'`; `'../entities/types'` → `'scheduling'`; `'../schedule/schedule'` → `'scheduling'`.
In `registry.ts`: `'../entities/types'` → `'scheduling'`; `'../schedule/schedule'` → `'scheduling'`.

> Keep `import` vs `import type` exactly as-is per line; only the module specifier changes. Two lines from the same old file that map to the same new package (e.g. `soft.ts` had separate `getAssignment` value + `Schedule` type from `'../schedule/schedule'`) MAY both point to `'scheduling'` as-is (two statements to one package is fine; merging is optional and not required).

Verify no stale parent paths remain in sources:
Run: `grep -rn "from '\.\./\(calendar\|entities\|schedule\)" domains/constraints/src --include='*.ts' | grep -v __tests__`
Expected: nothing.

- [ ] **Step 3: Rewrite test imports** (sibling-package references)

In `__tests__/context.test.ts`: `'../../entities/factories'` → `'scheduling'`.
In `__tests__/hard.test.ts`: `'../../entities/factories'` → `'scheduling'`; `'../../schedule/schedule'` → `'scheduling'`.
In `__tests__/soft.test.ts`: `'../../entities/factories'` → `'scheduling'`; `'../../schedule/schedule'` → `'scheduling'`.
In `__tests__/registry.test.ts`: `'../../entities/factories'` → `'scheduling'`; `'../../schedule/schedule'` → `'scheduling'`.
> Keep `'../context'`, `'../hard'`, etc. (same package) as relative.

Verify:
Run: `grep -rn "from '\.\./\.\." domains/constraints/src` 
Expected: nothing (all `../../` cross-folder refs rewritten to package names).

- [ ] **Step 4: Write the barrel** `domains/constraints/src/index.ts`

```ts
export * from './context'
export * from './hard'
export * from './soft'
export * from './registry'
```

- [ ] **Step 5: Run constraints tests**

Run: `pnpm --filter constraints test 2>&1 | tail -25`
Expected: context + hard + soft + registry tests pass.

---

## Task 8: Move `export` (← calendar, scheduling, constraints)

**Files:**
- Move: `packages/domain/src/export/csv.ts` → `domains/export/src/csv.ts`
- Move: `packages/domain/src/export/__tests__/csv.test.ts` → `domains/export/src/__tests__/csv.test.ts`
- Modify: `csv.ts` + `csv.test.ts` (cross-package import rewrites)
- Write: `domains/export/src/index.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/8bu/Projects/shiftforge
git mv packages/domain/src/export/csv.ts domains/export/src/csv.ts
git mv packages/domain/src/export/__tests__/csv.test.ts domains/export/src/__tests__/csv.test.ts
```

- [ ] **Step 2: Rewrite source imports in `csv.ts`**

`'../calendar/calendar'` → `'calendar'`; `'../constraints/context'` → `'constraints'`; `'../schedule/schedule'` → `'scheduling'`; `'../entities/types'` → `'scheduling'`.
Verify: `grep -n "from '\.\." domains/export/src/csv.ts` → nothing.

- [ ] **Step 3: Rewrite test imports in `csv.test.ts`**

`'../../entities/factories'` → `'scheduling'`; `'../../constraints/context'` → `'constraints'`; `'../../schedule/schedule'` → `'scheduling'`. Keep `'../csv'` relative.
Verify: `grep -n "from '\.\./\.\." domains/export/src/__tests__/csv.test.ts` → nothing.

- [ ] **Step 4: Write the barrel** `domains/export/src/index.ts`

```ts
export * from './csv'
```

- [ ] **Step 5: Run export tests**

Run: `pnpm --filter export test 2>&1 | tail -15`
Expected: csv tests pass (CSV byte-output assertions still green — AC-12).

---

## Task 9: Move `solver` (← calendar, scheduling, constraints, ports)

**Files:**
- Move: `packages/domain/src/solver/{model,score,mapSolution,proposal,conflict}.ts` → `domains/solver/src/`
- Move: `packages/domain/src/solver/__tests__/*` → `domains/solver/src/__tests__/`
- Modify: all 5 source files + 5 test files (cross-package import rewrites; keep `./`/`../`-local solver imports relative)
- Write: `domains/solver/src/index.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/8bu/Projects/shiftforge
git mv packages/domain/src/solver/model.ts domains/solver/src/model.ts
git mv packages/domain/src/solver/score.ts domains/solver/src/score.ts
git mv packages/domain/src/solver/mapSolution.ts domains/solver/src/mapSolution.ts
git mv packages/domain/src/solver/proposal.ts domains/solver/src/proposal.ts
git mv packages/domain/src/solver/conflict.ts domains/solver/src/conflict.ts
git mv packages/domain/src/solver/__tests__/model.test.ts domains/solver/src/__tests__/model.test.ts
git mv packages/domain/src/solver/__tests__/score.test.ts domains/solver/src/__tests__/score.test.ts
git mv packages/domain/src/solver/__tests__/mapSolution.test.ts domains/solver/src/__tests__/mapSolution.test.ts
git mv packages/domain/src/solver/__tests__/proposal.test.ts domains/solver/src/__tests__/proposal.test.ts
git mv packages/domain/src/solver/__tests__/conflict.test.ts domains/solver/src/__tests__/conflict.test.ts
```

- [ ] **Step 2: Confirm local intra-solver imports stay relative (no rewrite)**

The solver files reference each other locally: `mapSolution.ts` imports `import type { ModelMeta } from './model'` (verified — already `'./model'`, correct since all five files are flat siblings in `domains/solver/src/`); `proposal.ts` imports local `'./score'`; `conflict.ts` imports local `'./model'`. **Leave all `'./'`-prefixed solver-to-solver imports unchanged** — they are intra-package. Only the cross-package `'../calendar/...'`, `'../entities/...'`, `'../schedule/...'`, `'../constraints/...'`, `'../ports/...'` imports are rewritten (Step 3).
Verify the local ones are intact after Step 3: `grep -rn "from '\./" domains/solver/src --include='*.ts' | grep -v __tests__` → should show the `./model` / `./score` local imports unchanged.

- [ ] **Step 3: Rewrite source imports** (cross-package only)

`model.ts`: `'../calendar/calendar'` → `'calendar'`; `'../entities/types'` → `'scheduling'`; `'../schedule/schedule'` → `'scheduling'`; `'../constraints/context'` → `'constraints'`.
`score.ts`: `'../entities/types'` → `'scheduling'`; `'../schedule/schedule'` → `'scheduling'`; `'../constraints/registry'` → `'constraints'`; `'../constraints/context'` → `'constraints'`.
`mapSolution.ts`: `'../entities/types'` → `'scheduling'`; `'../ports/ports'` → `'ports'`; keep local `model` import relative (`'./model'`).
`proposal.ts`: `'../calendar/calendar'` → `'calendar'`; `'../entities/types'` → `'scheduling'`; `'../schedule/schedule'` → `'scheduling'`; `'../constraints/context'` → `'constraints'`. Keep local `'./score'`.
`conflict.ts`: `'../calendar/calendar'` → `'calendar'`; `'../entities/types'` → `'scheduling'`; `'../schedule/schedule'` → `'scheduling'`; `'../constraints/context'` → `'constraints'`. Keep local `'./model'`.

Verify no cross-folder parent paths remain in sources:
Run: `grep -rn "from '\.\./\(calendar\|entities\|schedule\|constraints\|ports\)" domains/solver/src --include='*.ts' | grep -v __tests__`
Expected: nothing.

- [ ] **Step 4: Rewrite test imports** (sibling packages → package names; keep `'../model'` etc. relative)

For each of `model/score/mapSolution/proposal/conflict.test.ts`:
`'../../entities/factories'` → `'scheduling'`; `'../../schedule/schedule'` → `'scheduling'`; `'../../constraints/context'` → `'constraints'`; `'../../constraints/registry'` → `'constraints'`; `'../../calendar/calendar'` → `'calendar'`.
Verify: `grep -rn "from '\.\./\.\." domains/solver/src` → nothing.

- [ ] **Step 5: Write the barrel** `domains/solver/src/index.ts`

```ts
export * from './model'
export * from './score'
export * from './mapSolution'
export * from './proposal'
export * from './conflict'
```

- [ ] **Step 6: Run solver tests**

Run: `pnpm --filter solver test 2>&1 | tail -30`
Expected: model + score + mapSolution + proposal + conflict tests pass (LP/proposal-score assertions green — AC-12).

---

## Task 10: Move `seed` (← calendar, scheduling, ports)

**Files:**
- Move: `packages/domain/src/seed/demo.ts` → `domains/seed/src/demo.ts`
- Move: `packages/domain/src/seed/__tests__/demo.test.ts` → `domains/seed/src/__tests__/demo.test.ts`
- Modify: `demo.ts` + `demo.test.ts` (cross-package import rewrites)
- Write: `domains/seed/src/index.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/8bu/Projects/shiftforge
git mv packages/domain/src/seed/demo.ts domains/seed/src/demo.ts
git mv packages/domain/src/seed/__tests__/demo.test.ts domains/seed/src/__tests__/demo.test.ts
```

- [ ] **Step 2: Rewrite source imports in `demo.ts`**

`'../calendar/calendar'` → `'calendar'`; `'../entities/factories'` → `'scheduling'`; `'../entities/types'` → `'scheduling'`; `'../ports/ports'` → `'ports'`.
Verify: `grep -n "from '\.\." domains/seed/src/demo.ts` → nothing.

- [ ] **Step 3: Rewrite test imports in `demo.test.ts`**

`'../../constraints/context'` → `'constraints'`; `'../../constraints/registry'` → `'constraints'`; `'../../schedule/schedule'` → `'scheduling'`. Keep `'../demo'` relative.
> Note: `demo.test.ts` imports `buildContext`/`runHardChecks` from `'constraints'` to assert zero hard violations. `seed/package.json` ALREADY declares `"constraints": "workspace:*"` in `devDependencies` (added in the Task 2 scaffold). This is REQUIRED, not optional: under strict pnpm isolation an undeclared `'constraints'` specifier fails Vitest resolution at `pnpm --filter seed test` (and `tsc` lint). It is a TEST-only dep — `demo.ts` (runtime) does not import constraints — so spec §3.2's runtime edge list still omits seed→constraints and AC-6 acyclicity is unaffected. Confirm the devDep is present before running Step 5; if missing, add it and re-install.

Verify: `grep -n "from '\.\./\.\." domains/seed/src/__tests__/demo.test.ts` → nothing.

- [ ] **Step 4: Write the barrel** `domains/seed/src/index.ts`

```ts
export * from './demo'
```

- [ ] **Step 5: Run seed tests**

Run: `pnpm --filter seed test 2>&1 | tail -15`
Expected: demo tests pass (feasible demo, zero hard violations — AC-12).

---

## Task 11: Checkpoint — run all domain package tests together

**Files:** none.

- [ ] **Step 1: Run the whole suite via turbo (not a fragile glob)**

Run: `pnpm test 2>&1 | tail -40`
> Use `pnpm test` (turbo across the whole workspace), NOT `pnpm --filter './domains/*' test`: the `./domains/*` path-glob form is version-fragile across pnpm releases and can **false-green by matching zero packages** (a no-op exits 0). `pnpm test` runs every workspace package's `test` script and reports a real total.

Expected: calendar + scheduling + ports + constraints + export + solver + seed all pass, PLUS the app (whose tests are not asserted in this window — its `@crewdoku/domain` resolution is intentionally broken between Task 4 and Task 15; if the app `test` task errors here, that is the expected, accepted dip, not a regression — see the resolvability note in Self-review).

**Concrete interim count (domain side):** at this point the 4 guard files still under `packages/domain/src/__tests__/` (purity=2 it-blocks, no-app-import=1, changeset=1) AND the domain `smoke.test.ts` (1) are **UNRUN** — `packages/domain` left the workspace glob in Task 4, and they have not yet been relocated (Task 13). So the domain packages run **85 − (2+1+1) − 1 = 80** tests (the 4 pending guard it-blocks + the 1 pending domain smoke are the gap). Record the exact per-package numbers; the sum of domain-package tests here MUST equal **80**. If it is higher, a guard/smoke was relocated early (fine, adjust); if lower, a real test was lost — STOP and find it.

> This is the expected interim dip; it is corrected in Task 13 (guards + domain smoke relocate to scheduling), bringing the domain side to 85 and the strengthened guard to 86 → grand total 205 at Task 16.

---

## Task 12: Delete the now-empty `packages/domain` and its barrel

After Tasks 3–10, only `packages/domain/src/index.ts`, the 3 guard tests, the domain `smoke.test.ts`, and `packages/domain/{package.json,tsconfig.json,vitest.config.ts}` remain (everything else moved). The 3 guards AND the domain smoke move in Task 13 FIRST, then this delete. **Reorder note: do Task 13 before the final delete of `__tests__`.**

**Files:**
- Delete: `packages/domain/src/index.ts`
- Delete: `packages/domain/{package.json,tsconfig.json,vitest.config.ts}`
- Delete: `packages/domain/` (whole dir) once empty
- Delete: `packages/` if empty

- [ ] **Step 1: Confirm only the barrel + guards + package files remain**

Run: `find packages/domain -type f -not -path '*/.turbo/*' | sort`
Expected: `src/index.ts`, `src/__tests__/{purity,no-app-import,changeset-config,smoke}.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`. If any SOURCE `.ts` remains, a move was missed — go back. (The domain `smoke.test.ts` is relocated in Task 13; it must NOT be left behind to be deleted.)

- [ ] **Step 2: Proceed to Task 13 to relocate the 3 guard tests, THEN return here.**

- [ ] **Step 3 (after Task 13): Delete the old package**

> Precondition: Task 13 has already `git mv`-ed the 3 guards AND the domain `smoke.test.ts` out of `packages/domain/src/__tests__/`, so that dir is now empty. If any `.test.ts` still sits there, STOP — relocate it first (do not let `rm -rf` silently destroy a test, which would drop the count).

```bash
cd /Users/8bu/Projects/shiftforge
git rm packages/domain/src/index.ts
git rm packages/domain/package.json packages/domain/tsconfig.json packages/domain/vitest.config.ts
rm -rf packages/domain/.turbo
rmdir packages/domain/src/__tests__ packages/domain/src packages/domain 2>/dev/null || rm -rf packages/domain
rmdir packages 2>/dev/null || true
```

- [ ] **Step 4: Verify removal**

Run: `ls packages 2>&1; grep -rl "@crewdoku/domain" . --include='package.json' 2>/dev/null`
Expected: `packages` does not exist (or is empty/removed); no `package.json` references `@crewdoku/domain` (AC-5).

---

## Task 13: Relocate + strengthen guard tests into `scheduling`

Per D5: purity (incl. `baseAssign` grep), strengthened no-app-import, and changeset-config all move to `domains/scheduling/src/__tests__/`. The two walkers are rewritten to walk **all of `domains/*`** from this location. `ids.test.ts` already moved in Task 5. This task ALSO relocates the DOMAIN `smoke.test.ts` (Blocker fix — otherwise it dies with `packages/domain`).

**Files:**
- Create: `domains/scheduling/src/__tests__/purity.test.ts`
- Create: `domains/scheduling/src/__tests__/no-app-import.test.ts`
- Create: `domains/scheduling/src/__tests__/changeset-config.test.ts`
- Move: `packages/domain/src/__tests__/smoke.test.ts` → `domains/scheduling/src/__tests__/smoke.test.ts` (re-point its `VERSION_MARKER` import to scheduling's barrel)
- Then delete the originals under `packages/domain/src/__tests__/` (handled in Task 12 Step 3).

- [ ] **Step 1: Write the relocated `purity.test.ts` (walks all `domains/*`)**

`domains/scheduling/src/__tests__/purity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// from domains/scheduling/src/__tests__/ → up 3 to domains/
const DOMAINS_ROOT = resolve(__dirname, '../../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) {
      if (f !== '__tests__' && f !== 'node_modules' && f !== '.turbo') walk(p, out)
    } else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

const FORBIDDEN =
  /\b(from\s+['"]react|react-dom|highs)|(\bdocument\b|\bwindow\b|\bWorker\b|indexedDB|navigator)/

describe('domain purity (all domains/*)', () => {
  it('no react/dom/wasm/worker/indexeddb refs in any domain src', () => {
    const offenders = walk(DOMAINS_ROOT).filter((p) => FORBIDDEN.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
  it('no baseAssign hash baseline exists', () => {
    const offenders = walk(DOMAINS_ROOT).filter((p) => /baseAssign/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Write the strengthened `no-app-import.test.ts` (walks all `domains/*`, forbids app AND dead barrel)**

`domains/scheduling/src/__tests__/no-app-import.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DOMAINS_ROOT = resolve(__dirname, '../../..')

function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.turbo') walk(p, out)
    } else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('dependency direction (AC-4/AC-5/AC-6)', () => {
  // SOURCE files only. Test files are excluded from BOTH checks: this guard's own
  // source contains the literal strings `@crewdoku/app` and `@crewdoku/domain`
  // inside its regexes, and (post-relocation) the domain smoke test's prose may too.
  // Source files are what must never import app or the dead barrel; test files
  // merely mentioning the tokens in code/strings are harmless.
  const sources = walk(DOMAINS_ROOT).filter((p) => !p.endsWith('.test.ts'))
  it('no domain source imports @crewdoku/app or ../app', () => {
    const off = sources.filter((p) =>
      /@crewdoku\/app|['"]\.\.\/app/.test(readFileSync(p, 'utf8')),
    )
    expect(off).toEqual([])
  })
  it('no domain source imports the deleted @crewdoku/domain barrel', () => {
    const off = sources.filter((p) => /@crewdoku\/domain/.test(readFileSync(p, 'utf8')))
    expect(off).toEqual([])
  })
})
```
> **Self-match fix (Blocker):** BOTH checks run over `sources` (the `.test.ts`-filtered list), not the raw `files` walk. The earlier draft ran the app-import regex over every `.ts` including this guard file itself — whose source literally contains `@crewdoku/app` inside the regex — causing a guaranteed self-fail. (The claim "no test legitimately contains `@crewdoku/app`" was wrong: this test file does.) Filtering to source files closes both holes in one place. The `walk` helper still keeps all `.ts` so the filter is applied here, at use; do not weaken `walk`.

- [ ] **Step 3: Write the relocated `changeset-config.test.ts`** (path depth identical — 4 levels up)

`domains/scheduling/src/__tests__/changeset-config.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('changesets configured', () => {
  it('config.json exists and is valid JSON', () => {
    const p = resolve(__dirname, '../../../../.changeset/config.json')
    expect(existsSync(p)).toBe(true)
    expect(() => JSON.parse(readFileSync(p, 'utf8'))).not.toThrow()
  })
})
```

- [ ] **Step 4: Relocate the DOMAIN smoke test into scheduling (Blocker fix)**

```bash
cd /Users/8bu/Projects/shiftforge
git mv packages/domain/src/__tests__/smoke.test.ts domains/scheduling/src/__tests__/smoke.test.ts
```
Then re-point its import. The old file is:
```ts
import { describe, it, expect } from 'vitest'
import { VERSION_MARKER } from '../index'

describe('domain smoke', () => {
  it('exports a marker', () => {
    expect(VERSION_MARKER).toBe('crewdoku-domain')
  })
})
```
The relative `'../index'` (from `packages/domain/src/__tests__/`) pointed at the old domain barrel; from `domains/scheduling/src/__tests__/` the equivalent barrel is two levels up. Change the import to scheduling's own barrel:
```ts
import { VERSION_MARKER } from '../../index'
```
> Why `'../../index'`: from `domains/scheduling/src/__tests__/` → `..` = `src/` → `../..` = `domains/scheduling/`, whose `index.ts` IS scheduling's barrel (which exports `VERSION_MARKER`, written in Task 5 Step 3). Equivalently `from 'scheduling'` (the bare specifier) works since scheduling self-resolves via the workspace symlink; prefer the relative `'../../index'` to match the existing intra-package test convention (e.g. `ids.test.ts` uses relative paths). This domain smoke is DISTINCT from the app smoke (`app/src/__tests__/smoke.test.ts`, re-pointed to `scheduling` in Task 14) — both must exist after the refactor.
Verify: `grep -n "from '" domains/scheduling/src/__tests__/smoke.test.ts` → only `vitest` + `'../../index'` (or `'scheduling'`); NO `'../index'`, NO `@crewdoku/domain`.

- [ ] **Step 5: Plant-and-prove the strengthened guard (red), then revert (green)**

Temporarily add a real import of the dead barrel to one domain SOURCE file (not a test — the guard only scans sources), e.g. prepend to `domains/calendar/src/calendar.ts`:
```ts
import { VERSION_MARKER } from '@crewdoku/domain'
```
Run: `pnpm --filter scheduling test 2>&1 | tail -20`
Expected: the "no domain source imports the deleted @crewdoku/domain barrel" test FAILS (proving the guard works). Then REMOVE that line.
Re-run: `pnpm --filter scheduling test 2>&1 | tail -20`
Expected: all scheduling tests (incl. relocated guards + the relocated domain smoke) PASS.

- [ ] **Step 6: Now return to Task 12 Step 3** to delete the original `packages/domain` package files and the (now-empty) `__tests__` dir.

---

## Task 14: Rewrite all 32 app imports (`@crewdoku/domain` → specific packages)

Use the spec §4 symbol→package map. Split any single import statement that pulls from >1 package.

**Files:** all 32 files from `grep -rl "@crewdoku/domain" app/src` (includes `app/src/__tests__/smoke.test.ts`).

- [ ] **Step 1: Regenerate the authoritative file list**

Run: `grep -rl "@crewdoku/domain" app/src | sort`
Expected: 32 files. Work through each.

- [ ] **Step 2: For each file, rewrite its domain import(s)**

Rule: for every `import ... from '@crewdoku/domain'`, group the named symbols by owning package (spec §4 map below) and emit one `import` per package, preserving `type`-modifiers and aliases (`setAssignment as domainSetAssignment`, `removeEmployee as domainRemoveEmployee`).

Owning-package map (memorize / keep open):
- **calendar**: `dow`, `isWeekend`, `eachDate`, `isoWeekKey`
- **scheduling**: `ISODate`, `Period`, `Assignment`, `Coverage`, `Employee`, `Org`, `Team`, `Shift`, `Rules`, `Pref`, `ConstraintId`, `SoftId`, `Schedule`, `keyOf`, `makeSchedule`, `setAssignment`, `removeEmployee`, `toScheduleDTO`, `fromScheduleDTO`, `makeOrg`, `makeTeam`, `makeShift`, `makeEmployee`, `makeCoverage`, `makeRules`, `VERSION_MARKER`
- **constraints**: `SolveContext`, `buildContext`, `runHardChecks`
- **solver**: `buildModel`, `BuildModelOptions`, `ModelMeta`, `mapSolution`, `buildProposal`, `Proposal`, `ProposalChange`, `deriveConflictCore`, `ConflictResult`
- **ports**: `Solution`, `SolverPort`, `StoragePort`, `AppStateDTO`
- **export**: `exportTeamCSV`, `exportMemberCSV`
- **seed**: `buildDemo`

Worked example — `app/src/store/store.ts` (illustrative; use the file's ACTUAL symbol set):
```ts
// BEFORE
import {
  buildDemo, makeSchedule, setAssignment as domainSetAssignment,
  buildModel, mapSolution, buildProposal,
  type AppStateDTO, type Proposal, type SolveContext,
} from '@crewdoku/domain'

// AFTER (one statement per owning package; type-modifiers preserved)
import { buildDemo } from 'seed'
import { makeSchedule, setAssignment as domainSetAssignment } from 'scheduling'
import { buildModel, mapSolution, buildProposal, type Proposal } from 'solver'
import type { AppStateDTO } from 'ports'
import type { SolveContext } from 'constraints'
```
> Mechanical aid (optional, per file): inspect the symbols with `grep -n "@crewdoku/domain" -A20 <file>` then hand-split. Do NOT script a blind sed — the grouping is per-symbol. The `smoke.test.ts` becomes `import { VERSION_MARKER } from 'scheduling'` (D1/AC-8).

- [ ] **Step 3: Verify zero `@crewdoku/domain` remains in app**

Run: `grep -rn "@crewdoku/domain" app/src`
Expected: nothing (AC-4).

---

## Task 15: Update `app/package.json` deps + root scripts + verify no stale config

**Files:**
- Modify: `app/package.json` (drop `@crewdoku/domain`, add 7 packages)
- Modify: root `package.json` (`clean` script — drop `packages/domain/dist`)
- Verify: `app/tsconfig.json`, `app/vite.config.ts` (no stale `@crewdoku/domain` paths/aliases)
- Verify: `turbo.json`, `tsconfig.base.json` (unchanged)

- [ ] **Step 1: Edit `app/package.json` dependencies**

Remove `"@crewdoku/domain": "workspace:*"`. Add (alphabetical, all `workspace:*`):
```json
    "calendar": "workspace:*",
    "constraints": "workspace:*",
    "export": "workspace:*",
    "ports": "workspace:*",
    "scheduling": "workspace:*",
    "seed": "workspace:*",
    "solver": "workspace:*",
```
(Place these in the `"dependencies"` block alongside the existing `@lingui/*`, `highs`, `react`, etc.)

- [ ] **Step 2: Edit root `package.json` `clean` script**

Change:
```json
"clean": "rm -rf .turbo app/dist packages/domain/dist app/node_modules/.vite node_modules/.cache",
```
to (drop the `packages/domain/dist` token only):
```json
"clean": "rm -rf .turbo app/dist app/node_modules/.vite node_modules/.cache",
```

- [ ] **Step 3: Verify no stale `@crewdoku/domain` references in app build config**

Run: `grep -rn "@crewdoku/domain" app/tsconfig.json app/vite.config.ts 2>/dev/null; grep -rn "paths" app/tsconfig.json`
Expected: no `@crewdoku/domain`; if a `paths` alias for it exists, remove it (spec §6 says verify none is stale). `vite.config.ts` should have no `optimizeDeps`/`alias` mentioning the old name.

- [ ] **Step 4: Re-install to link app→new packages**

Run: `pnpm install 2>&1 | tail -20`
Expected: install succeeds; app now depends on the 7 packages.

---

## Task 16: Full verification (the green gate)

**Files:** none (verification only). Maps to AC-1..AC-12.

- [ ] **Step 1: Install clean (AC-1)**

Run: `pnpm install 2>&1 | tail -10`
Expected: exit 0. Then:
```bash
for p in calendar scheduling constraints solver export seed ports; do
  test -L "node_modules/$p" && echo "OK $p" || echo "MISSING $p"
done
```
Expected: 7 × `OK`. (AC-1)

- [ ] **Step 2: Lint — 0 type errors (AC-2)**

Run: `pnpm lint 2>&1 | tail -30`
Expected: turbo runs `lint` for all 7 domains + app; exit 0, 0 errors.
> If `seed`'s `demo.test.ts` cross-import to `constraints` causes a "cannot find module" under project-mode `tsc`, add `"constraints": "workspace:*"` to `domains/seed/package.json` and re-run `pnpm install` then re-lint (see Task 10 Step 3 note).

- [ ] **Step 3: Test — 205 pass, 0 fail (AC-3, AC-8, AC-12)**

Run: `pnpm test 2>&1 | tail -50`
Expected: total **205 passed, 0 failed**, distributed across the 7 domain packages + app. Under `scheduling` now run: purity (2), no-app-import (**2** — app-import + dead-barrel), changeset (1), ids (1), and the **relocated DOMAIN smoke (1)**.
> **Count reconciliation (authoritative).** Baseline = **204** = 85 domain + 119 app. The 85 domain tests INCLUDE the domain smoke (1) — it is NOT an app test. There are TWO smoke tests at baseline: the domain smoke (1, in the 85) and the app smoke (1, in the 119); BOTH are preserved by this plan (domain smoke → scheduling in Task 13 Step 4; app smoke stays in app, re-pointed in Task 14). The ONLY count change is the strengthened `no-app-import` guard, which goes from 1 it-block to 2 (adds the dead-barrel assertion). So: **204 + 1 = 205**, with no test deleted and both smokes intact. Document in the report: "204 → 205, +1 from the strengthened no-app-import dead-barrel assertion (D5); both smoke tests preserved; nothing lost." If review demands exactly 204, fold the two no-app-import assertions into one `it`. Default: keep two it-blocks, report **205**.

- [ ] **Step 4: No `@crewdoku/domain` anywhere (AC-4, AC-5)**

Run: `grep -rl "@crewdoku/domain" . --include='*.ts' --include='*.tsx' --include='*.json' 2>/dev/null | grep -v node_modules | grep -v pnpm-lock.yaml`
Expected: nothing. (The strengthened guard test enforces this in CI too.) Also: `ls packages 2>&1` → no such directory / empty.

- [ ] **Step 5: Acyclic, one-directional graph (AC-6)**

The strengthened `no-app-import` guard already asserts no domain→app and no domain→dead-barrel edges. For an explicit cycle check across the 7 packages:
```bash
npx madge --circular --extensions ts domains/*/src 2>&1 | tail -20
```
Expected: "No circular dependency found" (or madge unavailable → rely on the guard test + the fact that every cross-package edge in the rewrite table flows strictly down the layer order calendar/scheduling → ports → constraints → export/solver/seed). If madge isn't installed, skip the network install and note that the dependency edges were verified by inspection against spec §3.2.

- [ ] **Step 6: Spot-check symbol ownership (AC-7)**

Run:
```bash
grep -rhn "from 'ports'" app/src | grep -E "Solution|SolverPort|StoragePort"
grep -rhn "from 'solver'" app/src | grep -E "buildModel|mapSolution|buildProposal"
grep -rhn "from 'calendar'" app/src | grep -E "dow|eachDate"
grep -rhn "from 'scheduling'" app/src | grep -E "keyOf|makeSchedule"
grep -rhn "from 'export'" app/src | grep -E "exportTeamCSV|exportMemberCSV"
grep -rhn "from 'seed'" app/src | grep buildDemo
grep -rhn "from 'constraints'" app/src | grep -E "buildContext|runHardChecks"
```
Expected: each returns at least one match in the correct package; none of these symbols imported from the wrong package.

- [ ] **Step 7: Build the whole workspace (AC-11)**

Run: `pnpm build 2>&1 | tail -30`
Expected: exit 0. Turbo skips the 7 domain packages (no `build` task) and builds `app` (Vite consumes TS source directly). The app artifact appears in `app/dist`.
Verify: `test -d app/dist && echo "app/dist OK"`.

- [ ] **Step 8: Browser smoke of the board (AC-9) — orchestrator-driven**

> The orchestrator drives chrome-devtools-mcp for this step; it is not a shell command.
Run the dev server: `pnpm dev` (note the port, default 5173). Then via chrome-devtools: navigate to `http://localhost:5173`, **LOAD THE DEMO** (click Load Demo / run the onboarding demo path), and confirm the board grid renders (employees × dates).

**Critically, exercise the Web Worker path (AC-9's only runtime check that the new packages resolve through the worker module graph).** `app/src/adapters/highs/worker.ts` is a DISTINCT Vite worker entry — instantiated by `highsSolverAdapter.ts` via `new Worker(new URL('./worker.ts', import.meta.url), …)` — i.e. a SEPARATE Vite module graph from the main bundle. A clean main-thread render therefore does NOT prove the worker (or the solve flow's domain imports) resolve. The solve flow pulls the new bare specifiers (the adapter imports `Solution`/`SolverPort` from `ports`; `store.solve()` calls `buildModel`/`mapSolution` from `solver`, which transitively pull `scheduling`/`constraints`/`calendar`). After loading the demo, **trigger a solve** (open SolvePanel → Run solver) so the worker actually boots and the whole solve path resolves the new packages end-to-end.

Confirm via `list_console_messages` (main thread AND worker):
- **no module-resolution errors** anywhere — no "Failed to resolve module specifier", no "Cannot find package", no worker `error` events about a missing bare import,
- the solve runs (a proposal appears OR a clean infeasible→conflict result) — i.e. the worker booted and the solve path consumed the new packages, not just the main bundle.
Expected: app boots, grid renders, solve completes, console (incl. worker) clean of import/resolution errors. (AC-9) Stop the dev server when done.

- [ ] **Step 9: Final AC reconciliation**

Confirm in the report each AC is satisfied (see AC→Task map below). Record final test count (205 expected with the strengthened guard) and the per-package distribution.

---

## Acceptance-criteria → task coverage map

| AC | Satisfied by |
|----|--------------|
| **AC-1** (install links 7 pkgs) | Task 2 (scaffold), Task 4 (workspace glob + install), Task 15 Step 4, **Task 16 Step 1** |
| **AC-2** (`pnpm lint` 0 errors) | per-package `tsconfig` Task 2 Step 3; import rewrites Tasks 3,6–10,14; **Task 16 Step 2** |
| **AC-3** (205 tests pass; both smokes preserved) | test moves Tasks 3,5–10; domain smoke + guard relocation Task 13; **Task 11** (interim), **Task 16 Step 3** |
| **AC-4** (no `@crewdoku/domain` in app/src) | Task 14 Step 3; strengthened guard Task 13 Step 2; **Task 16 Step 4** |
| **AC-5** (barrel & pkg gone everywhere) | Task 12 (delete pkg); guard Task 13 Step 2; **Task 16 Step 4** |
| **AC-6** (acyclic one-directional) | edge-correct rewrites Tasks 6–10; walking guard Task 13 Step 2; **Task 16 Step 5** |
| **AC-7** (symbol→package resolution) | Task 14 Step 2 (§4 map); **Task 16 Step 6** |
| **AC-8** (`VERSION_MARKER==='crewdoku-domain'`) | barrel D1 Task 5 Step 3; smoke rewrite Task 14 Step 2; **Task 16 Step 3** |
| **AC-9** (app boots, board renders, WORKER resolves new pkgs) | app deps Task 15; **Task 16 Step 8** (chrome-devtools: load demo + trigger solve → worker module graph resolves bare specifiers, console clean) |
| **AC-10** (domain purity preserved) | relocated walking purity guard Task 13 Step 1; **Task 16 Step 3** |
| **AC-11** (`turbo build` completes) | no `build` script D3 Task 2 Step 2; turbo unchanged Task 15; **Task 16 Step 7** |
| **AC-12** (behavior parity) | pure moves only (no logic edits); existing assertions green Tasks 8,9,10; **Task 16 Step 3** |

All 12 ACs are mapped.

---

## Self-review notes (resolved during authoring)

- **App resolution is intentionally broken between Task 4 and Task 15 — do NOT rely on a stale symlink.** The workspace glob flips to `domains/*` in Task 4, and the `pnpm install` in that same task (Step 3) re-resolves the workspace; under strict pnpm (no `shamefully-hoist`) that install PRUNES the now-orphaned `node_modules/@crewdoku/domain` symlink. So from Task 4 onward, the app's `from '@crewdoku/domain'` imports do NOT resolve. This is fine and expected: the app is NOT linted or tested in this window (the only assertions in Tasks 4–13 are per-DOMAIN-package). The packages/domain SOURCE still physically exists until Task 12 (it just isn't a workspace member and isn't symlinked), and the app import rewrite (Task 14) + re-install (Task 15) restore app resolution against the 7 new packages. Earlier drafts wrongly claimed the `@crewdoku/domain` symlink "persists until Task 15"; that is inaccurate under strict pnpm — treat app resolution as down from Task 4 to Task 15.
- **Guard relocation before delete:** Task 12 explicitly defers its `__tests__` delete to after Task 13, so guards never vanish.
- **Test-count honesty:** baseline 204 = 85 domain (incl. the domain smoke) + 119 app. The strengthened no-app-import guard legitimately adds one assertion → expected total **205**, documented as a +1 delta, not a regression (AC-3 says "count must not drop"; it rises by 1 by design). BOTH smoke tests are preserved — the domain smoke is relocated to scheduling in Task 13 Step 4 (not deleted with `packages/domain`), the app smoke stays in app and is re-pointed in Task 14.
- **D2 type duplication** is the only non-mechanical edit and is behavior-neutral (structural string/object aliases) — Task 3 Step 2 with a hard instruction to copy the real shapes.
- **No placeholders:** every config file and guard test is shown in full; import rewrites are enumerated per file in the ground-truth table.

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. Natural fit: each Task is independently verifiable by running that package's tests.
2. **Inline Execution** — execute tasks in this session with checkpoints (Tasks 4, 11, 16).

Recommended: Subagent-Driven, with the orchestrator handling Task 16 Step 8 (chrome-devtools board smoke).
